const crypto = require("crypto");

const FOXESS_BASE_URL = "https://www.foxesscloud.com";

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

async function handleFoxessTest(res) {
  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;

  if (!token || !sn) {
    return res.status(500).json({
      ok: false,
      error: "FOXESS_TOKEN ou FOXESS_DEVICE_SN não configurado na Vercel.",
    });
  }

  let endpoint = "/op/v1/device/real/query";
  let fox = await foxessPost(endpoint, token, { sns: [sn] });

  if (!fox.ok || (fox.data && fox.data.errno && fox.data.errno !== 0)) {
    endpoint = "/op/v0/device/real/query";
    fox = await foxessPost(endpoint, token, { sns: [sn] });
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
    variableCount: variables.length,
    variables,
    rawResult: result,
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.query.source === "foxess-test") {
      return await handleFoxessTest(res);
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
