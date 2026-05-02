module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const { command_type } = req.body || {};

    if (!command_type) {
      return res.status(400).json({
        ok: false,
        error: "missing_command_type"
      });
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/commands`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          device_id: "esp32cam_ufsj_01",
          command_type,
          payload_json: {},
          status: "pending"
        })
      }
    );

    const text = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        ok: false,
        error: text
      });
    }

    return res.status(200).json({
      ok: true,
      command: JSON.parse(text)
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
