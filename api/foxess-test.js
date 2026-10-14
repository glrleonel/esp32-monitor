import crypto from "crypto";

const FOXESS_BASE_URL = "https://www.foxesscloud.com";

function makeHeaders(path, token) {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHash("md5")
    .update(`${path}\r\n${token}\r\n${timestamp}`, "utf8")
    .digest("hex");

  return {
    "Content-Type": "application/json",
    token,
    signature,
    timestamp,
    lang: "en",
    timezone: "America/Sao_Paulo",
    "User-Agent": "Solarneo-UFSJ-PV-Monitor/1.0"
  };
}

async function signedPost(path, token, body) {
  const response = await fetch(FOXESS_BASE_URL + path, {
    method: "POST",
    headers: makeHeaders(path, token),
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.FOXESS_TOKEN;
  const sn = process.env.FOXESS_DEVICE_SN;

  if (!token || !sn) {
    return res.status(500).json({
      ok: false,
      error: "FOXESS_TOKEN ou FOXESS_DEVICE_SN não configurado na Vercel."
    });
  }

  try {
    let endpoint = "/op/v1/device/real/query";
    let fox = await signedPost(endpoint, token, { sns: [sn] });

    // Fallback para contas/equipamentos que ainda respondem pela versão v0.
    if (!fox.ok || (fox.data && fox.data.errno && fox.data.errno !== 0)) {
      endpoint = "/op/v0/device/real/query";
      fox = await signedPost(endpoint, token, { sns: [sn] });
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
          value: item.value
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
      rawResult: result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
