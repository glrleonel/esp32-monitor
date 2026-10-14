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
  const n = Number(value);
  if (Number.isFinite(n) && String(value).trim() !== "") {
    const ms = n < 100000000000 ? n * 1000 : n;
    return ms;
  }
  const parsed = Date.parse(value);
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
  const datas = Array.isArray(device?.datas) ? device.datas : [];
  const series = {};

  datas.forEach((entry) => {
    const variable = entry.variable || entry.name;
    if (!variable) return;
    const points = Array.isArray(entry.data)
      ? entry.data.map(normalizeFoxPoint).filter(Boolean).sort((a,b) => a.timestamp - b.timestamp)
      : [];
    series[variable] = {
      variable,
      name: entry.name || variable,
      unit: entry.unit || "",
      points,
    };
  });

  return { deviceSN: device?.deviceSN || null, series };
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
  const { begin, end } = brazilDayRange(date, startTime, endTime);
  const path = "/op/v0/device/history/query";
  const fox = await foxessPost(path, token, {
    sn,
    variables: FOXESS_VARIABLES,
    begin,
    end,
  });

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
    series: normalized.series,
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
  const urls = [
    "https://apitempo.inmet.gov.br/estacao/" + date + "/" + date + "/" + INMET_STATION,
    "https://apitempo.inmet.gov.br/estacao/dados/" + date,
  ];

  let lastError = null;

  for (let index = 0; index < urls.length; index += 1) {
    try {
      const response = await fetch(urls[index], {
        headers: { "User-Agent": "Solarneo-UFSJ-PV-Monitor/1.0" },
        cache: "no-store",
      });
      if (!response.ok) {
        lastError = "HTTP " + response.status;
        continue;
      }
      const text = await response.text();
      if (!text) {
        lastError = "Resposta vazia";
        continue;
      }
      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
      const filtered = index === 1
        ? rows.filter((row) => String(row.CD_ESTACAO || row.codigo || "").toUpperCase() === INMET_STATION)
        : rows;
      if (filtered.length) return filtered;
      lastError = "Sem registros da estação " + INMET_STATION;
    } catch (error) {
      lastError = error.message;
    }
  }

  throw new Error(lastError || "Falha ao consultar INMET.");
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
    return res.status(502).json({
      ok: false,
      error: "inmet_failed",
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
