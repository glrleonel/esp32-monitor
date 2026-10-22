const crypto = require("crypto");

const FOXESS_BASE_URL = "https://www.foxesscloud.com";
const INMET_STATION = "A514";
const DEFAULT_MODULE_POWER_W = 610;

const FOXESS_VARIABLES = [
  "pvPower",
  "pv1Volt","pv1Current","pv1Power",
  "pv2Volt","pv2Current","pv2Power",
  "pv3Volt","pv3Current","pv3Power",
  "pv4Volt","pv4Current","pv4Power",
  "RVolt","RCurrent","RFreq","RPower",
  "generationPower","invTemperation",
  "PVEnergyTotal","generation"
];

function makeFoxessHeaders(path, token) {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHash("md5")
    .update(path + "\r\n" + token + "\r\n" + timestamp, "utf8")
    .digest("hex");

  return {
    "Content-Type": "application/json",
    token,
    signature,
    timestamp,
    lang: "en",
    timezone: "America/Sao_Paulo",
    "User-Agent": "Solarneo-UFSJ-PV-Monitor/1.0",
  };
}

async function foxessPost(path, token, body) {
  const response = await fetch(FOXESS_BASE_URL + path, {
    method: "POST",
    headers: makeFoxessHeaders(path, token),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

function normalizeFoxTime(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 100000000000 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }

  const text = String(value).trim();
  const n = Number(text);
  if (Number.isFinite(n) && text !== "") {
    return n < 100000000000 ? n * 1000 : n;
  }

  // FoxESS history usually returns local device time like "YYYY-MM-DD HH:mm:ss".
  // Treat bare timestamps as America/Sao_Paulo (-03:00) instead of Vercel UTC.
  const bare = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (bare) {
    const parsed = Date.parse(bare[1] + "T" + bare[2] + "-03:00");
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Also accept strings like "2026-10-14 08:53:30 BRT-0300".
  const cleaned = text
    .replace(" BRT", "")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(" ", "T");
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFoxPoint(point) {
  if (Array.isArray(point)) {
    const timestamp = normalizeFoxTime(point[0]);
    const value = Number(point[1]);
    return timestamp && Number.isFinite(value)
      ? { timestamp, time: new Date(timestamp).toISOString(), value }
      : null;
  }

  if (!point || typeof point !== "object") return null;

  const rawTime =
    point.time ?? point.timestamp ?? point.ts ?? point.dateTime ??
    point.datetime ?? point.date ?? point.x;
  const rawValue = point.value ?? point.val ?? point.y ?? point.data;

  const timestamp = normalizeFoxTime(rawTime);
  const value = Number(rawValue);
  return timestamp && Number.isFinite(value)
    ? { timestamp, time: new Date(timestamp).toISOString(), value }
    : null;
}

function normalizeFoxHistory(result) {
  const device = Array.isArray(result) ? result[0] : result;
  const datas = Array.isArray(device?.datas)
    ? device.datas
    : Array.isArray(result?.datas)
      ? result.datas
      : Array.isArray(result)
        ? result.filter((item) => item && (item.variable || item.name))
        : [];

  const series = {};

  datas.forEach((entry) => {
    const variable = entry.variable || entry.name;
    if (!variable) return;
    const rawPoints = Array.isArray(entry.data)
      ? entry.data
      : Array.isArray(entry.points)
        ? entry.points
        : [];

    const points = rawPoints
      .map(normalizeFoxPoint)
      .filter(Boolean)
      .sort((a,b) => a.timestamp - b.timestamp);

    series[variable] = {
      variable,
      name: entry.name || variable,
      unit: entry.unit || "",
      points,
    };
  });

  return {
    deviceSN: device?.deviceSN || device?.sn || null,
    series,
    pointCount: Object.values(series).reduce((sum, item) => sum + item.points.length, 0),
    returnedVariables: Object.keys(series),
  };
}

function brazilDayRange(date, startTime = "00:00", endTime = "23:59") {
  const begin = new Date(date + "T" + startTime + ":00-03:00").getTime();
  const end = new Date(date + "T" + endTime + ":59-03:00").getTime();
  return { begin, end };
}

async function handleFoxessRealtime(res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;

  if (!token || !sn) {
    return res.status(500).json({
      ok: false,
      error: "FOXESS_TOKEN ou FOXESS_DEVICE_SN não configurado na Vercel.",
    });
  }

  let endpoint = "/op/v1/device/real/query";
  let fox = await foxessPost(endpoint, token, { sns: [sn], variables: FOXESS_VARIABLES });

  if (!fox.ok || (fox.data && fox.data.errno && fox.data.errno !== 0)) {
    endpoint = "/op/v0/device/real/query";
    fox = await foxessPost(endpoint, token, { sns: [sn], variables: FOXESS_VARIABLES });
  }

  const result = fox.data?.result ?? null;
  const device = Array.isArray(result)
    ? result.find((item) => item?.deviceSN === sn || item?.sn === sn) || result[0] || null
    : result;

  const variables = Array.isArray(device?.datas)
    ? device.datas.map((item) => ({
        variable: item.variable,
        name: item.name,
        unit: item.unit,
        value: item.value,
      }))
    : [];

  return res.status(fox.ok ? 200 : 502).json({
    ok: fox.ok && (!fox.data?.errno || fox.data.errno === 0),
    endpoint,
    deviceSN: sn,
    errno: fox.data?.errno ?? null,
    message: fox.data?.msg ?? null,
    time: device?.time || null,
    variableCount: variables.length,
    variables,
  });
}

async function handleFoxessHistory(req, res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;
  const date = req.query.date;

  if (!token || !sn) {
    return res.status(500).json({ ok: false, error: "FoxESS não configurado." });
  }
  if (!date) {
    return res.status(400).json({ ok: false, error: "Informe date=AAAA-MM-DD." });
  }

  const startTime = req.query.startTime || "05:00";
  const endTime = req.query.endTime || "19:30";
  const requested = brazilDayRange(date, startTime, endTime);
  const now = Date.now();
  const begin = requested.begin;
  const end = Math.min(requested.end, now);
  const path = "/op/v0/device/history/query";

  if (end <= begin) {
    return res.status(200).json({
      ok: true,
      endpoint: path,
      date,
      startTime,
      endTime,
      deviceSN: sn,
      series: {},
      pointCount: 0,
      returnedVariables: [],
      note: "O intervalo solicitado ainda não possui dados concluídos.",
    });
  }

  // variables is intentionally omitted. FoxESS OpenAPI returns all variables available
  // for this device and avoids one unsupported key invalidating a historical query.
  const fox = await foxessPost(path, token, { sn, begin, end });

  if (!fox.ok || (fox.data?.errno !== undefined && fox.data.errno !== 0)) {
    return res.status(502).json({
      ok: false,
      error: "foxess_history_failed",
      errno: fox.data?.errno ?? null,
      message: fox.data?.msg ?? null,
      detail: fox.data?.result ?? null,
    });
  }

  const normalized = normalizeFoxHistory(fox.data?.result ?? null);

  return res.status(200).json({
    ok: true,
    endpoint: path,
    date,
    startTime,
    endTime,
    deviceSN: normalized.deviceSN || sn,
    pointCount: normalized.pointCount,
    returnedVariables: normalized.returnedVariables,
    powerSource: "foxess_reported_power",
    series: normalized.series,
  });
}


function localDateTimeMs(date, hhmm) {
  return new Date(date + "T" + hhmm + ":00-03:00").getTime();
}

function interpolateValue(a, b, timestamp) {
  if (b.timestamp === a.timestamp) return Number(a.value);
  const ratio = (timestamp - a.timestamp) / (b.timestamp - a.timestamp);
  return Number(a.value) + (Number(b.value) - Number(a.value)) * ratio;
}

function integrateSeriesWindow(points, rangeStart, rangeEnd, maxGapMinutes = 30) {
  const src = [...(points || [])]
    .filter((p) => Number.isFinite(Number(p.timestamp)) && Number.isFinite(Number(p.value)))
    .sort((a,b) => a.timestamp - b.timestamp);

  let energy = 0;
  let coveredMs = 0;

  for (let i = 1; i < src.length; i += 1) {
    const a = src[i - 1];
    const b = src[i];
    const gap = b.timestamp - a.timestamp;
    if (gap <= 0 || gap > maxGapMinutes * 60000) continue;

    const segStart = Math.max(a.timestamp, rangeStart);
    const segEnd = Math.min(b.timestamp, rangeEnd);
    if (segEnd <= segStart) continue;

    const vStart = interpolateValue(a, b, segStart);
    const vEnd = interpolateValue(a, b, segEnd);
    const hours = (segEnd - segStart) / 3600000;
    energy += ((vStart + vEnd) / 2) * hours;
    coveredMs += segEnd - segStart;
  }

  return { energy, coveredMinutes: coveredMs / 60000 };
}

async function handleFoxessEnergyDay(req, res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;
  const date = req.query.date;
  const startTime = req.query.startTime || "05:30";
  const endTime = req.query.endTime || "18:30";

  if (!token || !sn) {
    return res.status(500).json({ ok: false, error: "FoxESS não configurado." });
  }
  if (!date) {
    return res.status(400).json({ ok: false, error: "Informe date=AAAA-MM-DD." });
  }

  const selectedStart = localDateTimeMs(date, startTime);
  const selectedRequestedEnd = localDateTimeMs(date, endTime);
  const fullDayStart = localDateTimeMs(date, "00:00");
  const fullDayRequestedEnd = localDateTimeMs(date, "23:59");
  const now = Date.now();
  const fullDayEnd = Math.min(fullDayRequestedEnd, now);
  const selectedEnd = Math.min(selectedRequestedEnd, fullDayEnd);

  if (
    !Number.isFinite(selectedStart) ||
    !Number.isFinite(selectedEnd) ||
    selectedEnd <= selectedStart ||
    fullDayEnd <= fullDayStart
  ) {
    return res.status(200).json({
      ok: true,
      date,
      startTime,
      endTime,
      totals: { pv1Power: 0, pv2Power: 0, pv3Power: 0, pv4Power: 0 },
      hourly: [],
      pointCount: 0,
      note: "Intervalo sem dados concluídos."
    });
  }

  const path = "/op/v0/device/history/query";
  const variables = [
    "pv1Power","pv2Power","pv3Power","pv4Power",
    "PVEnergyTotal","generation","todayYield"
  ];

  const fox = await foxessPost(path, token, {
    sn,
    variables,
    begin: fullDayStart,
    end: fullDayEnd,
  });

  if (!fox.ok || (fox.data?.errno !== undefined && fox.data.errno !== 0)) {
    return res.status(502).json({
      ok: false,
      error: "foxess_energy_day_failed",
      errno: fox.data?.errno ?? null,
      message: fox.data?.msg ?? null,
    });
  }

  const normalized = normalizeFoxHistory(fox.data?.result ?? null);
  const keys = ["pv1Power","pv2Power","pv3Power","pv4Power"];

  const rawFullDayTotals = {};
  const rawSelectedTotals = {};
  keys.forEach((key) => {
    const points = normalized.series[key]?.points || [];
    rawFullDayTotals[key] = integrateSeriesWindow(points, fullDayStart, fullDayEnd, 30).energy;
    rawSelectedTotals[key] = integrateSeriesWindow(points, selectedStart, selectedEnd, 30).energy;
  });

  const rawFullDaySum = keys.reduce((sum, key) => sum + Number(rawFullDayTotals[key] || 0), 0);
  const rawSelectedSum = keys.reduce((sum, key) => sum + Number(rawSelectedTotals[key] || 0), 0);

  const todayYieldPoints = [...(normalized.series.todayYield?.points || [])]
    .filter((p) => Number.isFinite(Number(p.value)))
    .sort((a,b) => a.timestamp - b.timestamp);
  const todayYieldLast = todayYieldPoints.length
    ? Number(todayYieldPoints[todayYieldPoints.length - 1].value)
    : null;

  const pvCounterDelta = cumulativeDelta(normalized.series.PVEnergyTotal?.points || []);
  const generationCounterDelta = cumulativeDelta(normalized.series.generation?.points || []);

  // todayYield is the preferred daily reference because it is the value shown by FoxESS
  // for the day. Some FoxESS models label its unit inconsistently, but semantically it is
  // the accumulated daily yield. If absent, fall back to cumulative energy counters.
  const officialDailyEnergy = Number.isFinite(todayYieldLast) && todayYieldLast >= 0
    ? todayYieldLast
    : Number.isFinite(generationCounterDelta) && generationCounterDelta >= 0
      ? generationCounterDelta
      : Number.isFinite(pvCounterDelta) && pvCounterDelta >= 0
        ? pvCounterDelta
        : null;

  const dailyScale = officialDailyEnergy !== null && rawFullDaySum > 0
    ? officialDailyEnergy / rawFullDaySum
    : 1;

  const totals = {};
  keys.forEach((key) => {
    totals[key] = Number(rawSelectedTotals[key] || 0) * dailyScale;
  });

  const hourly = [];
  let cursor = selectedStart;
  while (cursor < selectedEnd) {
    const local = new Date(cursor - 3 * 3600000);
    const nextHourLocalUtc = Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      local.getUTCHours() + 1,
      0, 0, 0
    );
    const nextHour = nextHourLocalUtc + 3 * 3600000;
    const bucketEnd = Math.min(nextHour, selectedEnd);

    const row = {
      start: cursor,
      end: bucketEnd,
      label: String(local.getUTCHours()).padStart(2, "0") + ":00",
    };

    keys.forEach((key) => {
      const raw = integrateSeriesWindow(
        normalized.series[key]?.points || [],
        cursor,
        bucketEnd,
        30
      ).energy;
      row[key] = raw * dailyScale;
    });

    hourly.push(row);
    cursor = bucketEnd;
  }

  return res.status(200).json({
    ok: true,
    date,
    startTime,
    endTime,
    deviceSN: normalized.deviceSN || sn,
    pointCount: normalized.pointCount,
    totals,
    hourly,
    correction: {
      method: officialDailyEnergy !== null
        ? (Number.isFinite(todayYieldLast) ? "foxess_todayYield_daily_reference" : "foxess_cumulative_counter_fallback")
        : "raw_power_integration_fallback",
      officialDailyEnergyKWh: officialDailyEnergy,
      todayYieldLast: todayYieldLast,
      todayYieldUnit: normalized.series.todayYield?.unit || null,
      pvCounterDeltaKWh: pvCounterDelta,
      generationCounterDeltaKWh: generationCounterDelta,
      powerSource: "foxess_reported_power",
      rawFullDayModuleSumKWh: rawFullDaySum,
      rawSelectedModuleSumKWh: rawSelectedSum,
      selectedShareOfRawDay: rawFullDaySum > 0 ? rawSelectedSum / rawFullDaySum : null,
      factor: dailyScale,
    },
  });
}

function calculatePvPowerFromVI(series, index) {
  const vPoints = [...(series["pv" + index + "Volt"]?.points || [])].sort((a,b) => a.timestamp - b.timestamp);
  const iPoints = [...(series["pv" + index + "Current"]?.points || [])].sort((a,b) => a.timestamp - b.timestamp);

  if (!vPoints.length || !iPoints.length) return [];

  const iMap = new Map(iPoints.map((p) => [p.timestamp, p]));
  const calculated = [];

  for (const v of vPoints) {
    let ip = iMap.get(v.timestamp);

    if (!ip) {
      let best = null;
      let bestGap = Infinity;
      for (const candidate of iPoints) {
        const gap = Math.abs(candidate.timestamp - v.timestamp);
        if (gap < bestGap) {
          best = candidate;
          bestGap = gap;
        }
      }

      // Voltage and current must represent practically the same acquisition instant.
      // A loose match (minutes apart) creates false power peaks during fast shading changes.
      if (bestGap <= 10000) ip = best;
    }

    if (!ip) continue;

    const volts = Number(v.value);
    const amps = Number(ip.value);
    if (!Number.isFinite(volts) || !Number.isFinite(amps)) continue;

    calculated.push({
      timestamp: v.timestamp,
      time: v.time,
      value: (volts * amps) / 1000,
    });
  }

  return calculated;
}

function applyCalculatedPvPower(series) {
  const output = { ...series };

  for (let i = 1; i <= 4; i += 1) {
    const key = "pv" + i + "Power";
    const original = output[key];
    const calculated = calculatePvPowerFromVI(output, i);

    if (calculated.length) {
      output[key + "Reported"] = original || {
        variable: key + "Reported",
        name: key + "Reported",
        unit: "kW",
        points: [],
      };

      output[key] = {
        variable: key,
        name: "PV" + i + " Power calculated from V x I",
        unit: "kW",
        source: "calculated_vi",
        points: calculated,
      };
    }
  }

  const pvKeys = ["pv1Power","pv2Power","pv3Power","pv4Power"];
  const timeline = [...new Set(
    pvKeys.flatMap((key) => (output[key]?.points || []).map((p) => p.timestamp))
  )].sort((a,b) => a-b);

  const totalPoints = timeline.map((timestamp) => {
    let total = 0;
    let count = 0;

    for (const key of pvKeys) {
      const p = (output[key]?.points || []).find((item) => item.timestamp === timestamp);
      if (p && Number.isFinite(Number(p.value))) {
        total += Number(p.value);
        count += 1;
      }
    }

    if (!count) return null;
    return {
      timestamp,
      time: new Date(timestamp).toISOString(),
      value: total,
    };
  }).filter(Boolean);

  if (totalPoints.length) {
    if (output.pvPower) output.pvPowerReported = output.pvPower;
    output.pvPower = {
      variable: "pvPower",
      name: "PV total power calculated from V x I",
      unit: "kW",
      source: "calculated_vi_sum",
      points: totalPoints,
    };
  }

  return output;
}

function cumulativeDelta(points) {
  const src = [...(points || [])]
    .filter((p) => Number.isFinite(Number(p.timestamp)) && Number.isFinite(Number(p.value)))
    .sort((a,b) => a.timestamp - b.timestamp);
  if (src.length < 2) return null;
  return Number(src[src.length - 1].value) - Number(src[0].value);
}

async function handleFoxessEnergyCheck(req, res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;
  const date = req.query.date;
  const startTime = req.query.startTime || "05:30";
  const endTime = req.query.endTime || "18:30";

  if (!token || !sn) return res.status(500).json({ ok:false, error:"FoxESS não configurado." });
  if (!date) return res.status(400).json({ ok:false, error:"Informe date=AAAA-MM-DD." });

  const begin = localDateTimeMs(date, startTime);
  const requestedEnd = localDateTimeMs(date, endTime);
  const end = Math.min(requestedEnd, Date.now());
  if (end <= begin) return res.status(200).json({ ok:true, date, note:"Intervalo sem dados concluídos." });

  const path = "/op/v0/device/history/query";
  const variables = [
    "pv1Power","pv2Power","pv3Power","pv4Power",
    "pvPower","generationPower","PVEnergyTotal","generation"
  ];

  const fox = await foxessPost(path, token, { sn, variables, begin, end });

  if (!fox.ok || (fox.data?.errno !== undefined && fox.data.errno !== 0)) {
    return res.status(502).json({
      ok:false,
      error:"foxess_energy_check_failed",
      errno:fox.data?.errno ?? null,
      message:fox.data?.msg ?? null
    });
  }

  const normalized = normalizeFoxHistory(fox.data?.result ?? null);
  const s = normalized.series;
  const pvKeys = ["pv1Power","pv2Power","pv3Power","pv4Power"];
  const moduleEnergy = {};
  pvKeys.forEach((key) => {
    moduleEnergy[key] = integrateSeriesWindow(s[key]?.points || [], begin, end, 30).energy;
  });

  const moduleSum = pvKeys.reduce((sum,key) => sum + Number(moduleEnergy[key] || 0), 0);
  const pvPowerIntegrated = integrateSeriesWindow(s.pvPower?.points || [], begin, end, 30).energy;
  const acPowerIntegrated = integrateSeriesWindow(s.generationPower?.points || [], begin, end, 30).energy;
  const pvCounterDelta = cumulativeDelta(s.PVEnergyTotal?.points || []);
  const acCounterDelta = cumulativeDelta(s.generation?.points || []);

  const units = {};
  variables.forEach((key) => {
    units[key] = s[key]?.unit || null;
  });

  return res.status(200).json({
    ok:true,
    date,
    startTime,
    endTime,
    pointCount:normalized.pointCount,
    returnedVariables:normalized.returnedVariables,
    units,
    energyKWh:{
      modules:moduleEnergy,
      moduleSum,
      pvPowerIntegrated,
      acPowerIntegrated,
      pvCounterDelta,
      acCounterDelta
    },
    ratios:{
      moduleSum_to_acIntegrated: acPowerIntegrated > 0 ? moduleSum / acPowerIntegrated : null,
      pvPower_to_acIntegrated: acPowerIntegrated > 0 ? pvPowerIntegrated / acPowerIntegrated : null,
      moduleSum_to_pvPower: pvPowerIntegrated > 0 ? moduleSum / pvPowerIntegrated : null
    },
    samples:Object.fromEntries(
      variables.map((key) => [key, {
        unit:s[key]?.unit || null,
        count:s[key]?.points?.length || 0,
        first:s[key]?.points?.[0] || null,
        last:s[key]?.points?.[s[key]?.points?.length - 1] || null
      }])
    )
  });
}


async function handleFoxessPowerCheck(req, res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;
  const date = req.query.date;
  const startTime = req.query.startTime || "05:30";
  const endTime = req.query.endTime || "18:30";

  if (!token || !sn) return res.status(500).json({ok:false,error:"FoxESS não configurado."});
  if (!date) return res.status(400).json({ok:false,error:"Informe date=AAAA-MM-DD."});

  const begin = localDateTimeMs(date,startTime);
  const end = Math.min(localDateTimeMs(date,endTime),Date.now());
  const path="/op/v0/device/history/query";
  const variables=[
    "pv1Volt","pv1Current","pv1Power",
    "pv2Volt","pv2Current","pv2Power",
    "pv3Volt","pv3Current","pv3Power",
    "pv4Volt","pv4Current","pv4Power",
    "pvPower"
  ];

  const fox=await foxessPost(path,token,{sn,variables,begin,end});
  if(!fox.ok || (fox.data?.errno!==undefined && fox.data.errno!==0)){
    return res.status(502).json({ok:false,error:"foxess_power_check_failed",errno:fox.data?.errno??null,message:fox.data?.msg??null});
  }

  const n=normalizeFoxHistory(fox.data?.result??null);
  const s=n.series;

  function intervalStats(points){
    const src=[...(points||[])].sort((a,b)=>a.timestamp-b.timestamp);
    const diffs=[];
    for(let i=1;i<src.length;i++){
      const d=(src[i].timestamp-src[i-1].timestamp)/60000;
      if(d>0) diffs.push(d);
    }
    diffs.sort((a,b)=>a-b);
    if(!diffs.length) return null;
    const avg=diffs.reduce((a,b)=>a+b,0)/diffs.length;
    const median=diffs[Math.floor(diffs.length/2)];
    return {count:src.length,avgMinutes:avg,medianMinutes:median,minMinutes:diffs[0],maxMinutes:diffs[diffs.length-1]};
  }

  function compareModule(i){
    const vp=s["pv"+i+"Volt"]?.points||[];
    const cp=s["pv"+i+"Current"]?.points||[];
    const pp=s["pv"+i+"Power"]?.points||[];
    const samples=[];
    for(const p of pp){
      const v=nearestValue(vp,p.timestamp,2);
      const a=nearestValue(cp,p.timestamp,2);
      if(!Number.isFinite(v)||!Number.isFinite(a)) continue;
      const calcKw=(v*a)/1000;
      if(calcKw<=0) continue;
      samples.push({
        time:p.time,
        reportedKw:Number(p.value),
        calcKw,
        ratio:Number(p.value)/calcKw
      });
    }
    const ratios=samples.map(x=>x.ratio).filter(Number.isFinite).sort((a,b)=>a-b);
    const avg=ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:null;
    const median=ratios.length?ratios[Math.floor(ratios.length/2)]:null;
    return {
      unitPower:s["pv"+i+"Power"]?.unit||null,
      unitVolt:s["pv"+i+"Volt"]?.unit||null,
      unitCurrent:s["pv"+i+"Current"]?.unit||null,
      interval:intervalStats(pp),
      ratioReportedToVI:{avg,median,count:ratios.length},
      examples:samples.filter((_,idx)=>idx%Math.max(1,Math.floor(samples.length/8))===0).slice(0,8)
    };
  }

  const modules={};
  for(let i=1;i<=4;i++) modules["pv"+i]=compareModule(i);

  return res.status(200).json({
    ok:true,
    date,startTime,endTime,
    modules,
    pvPowerInterval:intervalStats(s.pvPower?.points||[]),
    units:Object.fromEntries(variables.map(k=>[k,s[k]?.unit||null]))
  });
}


async function handleFoxessIntegrationAudit(req, res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;
  const date = req.query.date;
  const startTime = req.query.startTime || "05:30";
  const endTime = req.query.endTime || "18:30";

  if (!token || !sn) return res.status(500).json({ok:false,error:"FoxESS não configurado."});
  if (!date) return res.status(400).json({ok:false,error:"Informe date=AAAA-MM-DD."});

  const begin = localDateTimeMs(date,startTime);
  const end = Math.min(localDateTimeMs(date,endTime),Date.now());
  const path="/op/v0/device/history/query";
  const variables=["pvPower","generationPower","PVEnergyTotal","generation","todayYield"];

  const fox=await foxessPost(path,token,{sn,variables,begin,end});
  if(!fox.ok || (fox.data?.errno!==undefined && fox.data.errno!==0)){
    return res.status(502).json({ok:false,error:"foxess_integration_audit_failed",errno:fox.data?.errno??null,message:fox.data?.msg??null});
  }

  const n=normalizeFoxHistory(fox.data?.result??null);
  const pv=[...(n.series.pvPower?.points||[])].sort((a,b)=>a.timestamp-b.timestamp);

  let integrated=0;
  const segments=[];
  const gaps=[];

  for(let i=1;i<pv.length;i++){
    const a=pv[i-1];
    const b=pv[i];
    const dtMinutes=(b.timestamp-a.timestamp)/60000;
    const dtHours=dtMinutes/60;
    const avgPower=(Number(a.value)+Number(b.value))/2;
    const energy=avgPower*dtHours;

    if(dtMinutes>0){
      segments.push({
        i,
        start:a.time,
        end:b.time,
        dtMinutes,
        pStartKw:Number(a.value),
        pEndKw:Number(b.value),
        avgPowerKw:avgPower,
        energyKWh:energy
      });
      integrated+=energy;
      if(dtMinutes>10) gaps.push({start:a.time,end:b.time,dtMinutes});
    }
  }

  const intervals=segments.map(s=>s.dtMinutes).sort((a,b)=>a-b);
  const intervalStats=intervals.length ? {
    count:intervals.length,
    min:intervals[0],
    median:intervals[Math.floor(intervals.length/2)],
    avg:intervals.reduce((a,b)=>a+b,0)/intervals.length,
    max:intervals[intervals.length-1]
  } : null;

  const pvDelta=cumulativeDelta(n.series.PVEnergyTotal?.points||[]);
  const genDelta=cumulativeDelta(n.series.generation?.points||[]);
  const genIntegrated=integrateSeriesWindow(n.series.generationPower?.points||[],begin,end,30).energy;

  const todayYieldPoints=[...(n.series.todayYield?.points||[])]
    .filter((p)=>Number.isFinite(Number(p.value)))
    .sort((a,b)=>a.timestamp-b.timestamp);
  const todayYieldFirst=todayYieldPoints.length?Number(todayYieldPoints[0].value):null;
  const todayYieldLast=todayYieldPoints.length?Number(todayYieldPoints[todayYieldPoints.length-1].value):null;
  const todayYieldMax=todayYieldPoints.length?Math.max(...todayYieldPoints.map((p)=>Number(p.value))):null;

  const topSegments=[...segments].sort((a,b)=>b.energyKWh-a.energyKWh).slice(0,20);
  const sampleStep=Math.max(1,Math.floor(segments.length/20));
  const sampled=segments.filter((_,idx)=>idx%sampleStep===0).slice(0,25);

  return res.status(200).json({
    ok:true,
    date,startTime,endTime,
    units:{
      pvPower:n.series.pvPower?.unit||null,
      generationPower:n.series.generationPower?.unit||null,
      PVEnergyTotal:n.series.PVEnergyTotal?.unit||null,
      generation:n.series.generation?.unit||null
    },
    points:pv.length,
    intervalStatsMinutes:intervalStats,
    integratedPvPowerKWh:integrated,
    integratedGenerationPowerKWh:genIntegrated,
    pvCounterDeltaKWh:pvDelta,
    generationCounterDeltaKWh:genDelta,
    todayYield:{
      unit:n.series.todayYield?.unit||null,
      points:todayYieldPoints.length,
      first:todayYieldFirst,
      last:todayYieldLast,
      max:todayYieldMax
    },
    ratioPvIntegralToCounter:Number.isFinite(pvDelta)&&pvDelta>0?integrated/pvDelta:null,
    ratioPvIntegralToTodayYield:Number.isFinite(todayYieldLast)&&todayYieldLast>0?integrated/todayYieldLast:null,
    longGaps:gaps,
    sampledSegments:sampled,
    topEnergySegments:topSegments
  });
}

function parseNumber(v) {
  if (v === null || v === undefined || v === "" || v === "9999") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function inmetUtcTimestamp(row) {
  const date = row.DT_MEDICAO || row.data || row.DATA || row.date;
  let hour = String(row.HR_MEDICAO ?? row.hora ?? row.HORA ?? "0000").replace(/[^0-9]/g, "");
  if (hour.length <= 2) hour = hour.padStart(2, "0") + "00";
  hour = hour.padStart(4, "0").slice(0, 4);
  const hh = hour.slice(0, 2);
  const mm = hour.slice(2, 4);
  const ts = Date.parse(date + "T" + hh + ":" + mm + ":00Z");
  return Number.isFinite(ts) ? ts : null;
}

async function fetchInmetDay(date) {
  const token = process.env.INMET_TOKEN;
  if (!token) {
    const error = new Error("O endpoint horário atual do INMET exige token de acesso.");
    error.code = "INMET_TOKEN_REQUIRED";
    throw error;
  }

  const url =
    "https://apitempo.inmet.gov.br/token/estacao/" +
    date + "/" + date + "/" + INMET_STATION + "/" + encodeURIComponent(token);

  const response = await fetch(url, {
    headers: { "User-Agent": "Solarneo-UFSJ-PV-Monitor/1.0" },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  if (!text || text.trim() === "") {
    throw new Error("Resposta vazia do INMET.");
  }
  if (text.includes("CHAVE INVÁLIDA")) {
    const error = new Error("Token INMET inválido.");
    error.code = "INMET_TOKEN_INVALID";
    throw error;
  }

  const json = JSON.parse(text);
  const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
  return rows.filter((row) =>
    !row.CD_ESTACAO || String(row.CD_ESTACAO).toUpperCase() === INMET_STATION
  );
}

async function handleInmet(req, res) {
  const date = req.query.date;
  const modulePowerW = Math.max(1, Number(req.query.modulePowerW || DEFAULT_MODULE_POWER_W));

  if (!date) {
    return res.status(400).json({ ok: false, error: "Informe date=AAAA-MM-DD." });
  }

  try {
    const rawRows = await fetchInmetDay(date);
    const rows = rawRows.map((row) => {
      const timestamp = inmetUtcTimestamp(row);
      const radiationKjM2 = parseNumber(
        row.RAD_GLO ?? row.RADIACAO_GLOBAL ?? row.radiacao_global ?? row.radiacao
      );
      const irradianceWm2 = radiationKjM2 === null ? null : radiationKjM2 / 3.6;
      const estimatedModulePowerKw = irradianceWm2 === null
        ? null
        : (modulePowerW / 1000) * (irradianceWm2 / 1000);

      return {
        timestamp,
        time: timestamp ? new Date(timestamp).toISOString() : null,
        radiationKjM2,
        irradianceWm2,
        estimatedModulePowerKw,
      };
    }).filter((row) => row.timestamp).sort((a,b) => a.timestamp - b.timestamp);

    return res.status(200).json({
      ok: true,
      station: INMET_STATION,
      date,
      modulePowerW,
      note: "Irradiância média horária estimada a partir da radiação global horizontal do INMET. A estimativa FV é referência simples e não corrige plano inclinado, temperatura, bifacialidade ou perdas.",
      rows,
    });
  } catch (error) {
    const tokenIssue = error.code === "INMET_TOKEN_REQUIRED" || error.code === "INMET_TOKEN_INVALID";
    return res.status(tokenIssue ? 424 : 502).json({
      ok: false,
      error: tokenIssue ? "inmet_token_required" : "inmet_failed",
      detail: error.message,
      station: INMET_STATION,
    });
  }
}

module.exports = async function handler(req, res) {
  try {
    const source = req.query.source || "temperatures";

    if (source === "foxess-test" || source === "foxess-realtime") {
      return await handleFoxessRealtime(res);
    }
    if (source === "foxess-history") {
      return await handleFoxessHistory(req, res);
    }
    if (source === "foxess-energy-day") {
      return await handleFoxessEnergyDay(req, res);
    }
    if (source === "foxess-energy-check") {
      return await handleFoxessEnergyCheck(req, res);
    }
    if (source === "foxess-power-check") {
      return await handleFoxessPowerCheck(req, res);
    }
    if (source === "foxess-integration-audit") {
      return await handleFoxessIntegrationAudit(req, res);
    }
    if (source === "inmet") {
      return await handleInmet(req, res);
    }

    const { start, end } = req.query;
    const requestedLimit = Number(req.query.limit || 5000);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 5000, 1), 10000);

    function nextDay(dateString) {
      const d = new Date(dateString + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    let filter = "";

    if (start && end) {
      filter =
        "&created_at=gte." + start + "T00:00:00-03:00" +
        "&created_at=lt." + nextDay(end) + "T00:00:00-03:00";
    }

    const url =
      process.env.SUPABASE_URL +
      "/rest/v1/heartbeats?order=created_at.desc&limit=" +
      limit +
      filter;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "history_failed",
        detail: data,
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};
