module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const data = req.body || {};

    const payload = {
      device_id: data.device_id || null,
      ip: data.ip || null,
      last_capture: data.last_capture || null,
      status: data.status || "ok",
      temperatura: data.temperatura ?? null,
      error: data.error || null
    };

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/heartbeats`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify(payload)
      }
    );

    const resultText = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        ok: false,
        error: "supabase_insert_failed",
        detail: resultText
      });
    }

    return res.status(200).json({
      ok: true,
      saved: true,
      result: JSON.parse(resultText)
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
