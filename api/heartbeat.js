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

      // Campos legados mantidos para compatibilidade com o histórico antigo.
      temperatura: data.temperatura ?? null,
      temp_sem_linha: data.temp_sem_linha ?? null,
      temp_vermelha: data.temp_vermelha ?? null,
      temp_rosa: data.temp_rosa ?? null,
      temp_verde: data.temp_verde ?? null,
      temp_preta: data.temp_preta ?? null,

      // Nova identificação fixa dos 9 sensores DS18B20.
      temp_sensor1: data.temp_sensor1 ?? null,
      temp_sensor2: data.temp_sensor2 ?? null,
      temp_sensor3: data.temp_sensor3 ?? null,
      temp_sensor4: data.temp_sensor4 ?? null,
      temp_sensor5: data.temp_sensor5 ?? null,
      temp_sensor6: data.temp_sensor6 ?? null,
      temp_sensor7: data.temp_sensor7 ?? null,
      temp_sensor8: data.temp_sensor8 ?? null,
      temp_sensor9: data.temp_sensor9 ?? null,

      cam_ok: data.cam_ok ?? null,
      sd_ok: data.sd_ok ?? null,
      cam_last_photo: data.cam_last_photo || null,
      cam_timestamp: data.cam_timestamp || null,

      error: data.error || null
    };

    // 1. SALVAR HEARTBEAT
    const hbResponse = await fetch(
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

    const hbText = await hbResponse.text();

    if (!hbResponse.ok) {
      return res.status(500).json({
        ok: false,
        error: "heartbeat_failed",
        detail: hbText
      });
    }

    const hbRows = JSON.parse(hbText);
    const hbData = hbRows[0];

    // 2. ATUALIZAR DEVICE
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/devices?device_id=eq.${data.device_id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          ip: data.ip,
          status: data.status,
          last_seen_at: new Date().toISOString()
        })
      }
    );

    // 3. ALERTAS AUTOMÁTICOS
    const alerts = [];

    if (data.status === "falha") {
      alerts.push({
        device_id: data.device_id,
        alert_type: "system",
        severity: "high",
        message: data.error || "Falha no sistema",
        heartbeat_id: hbData.id
      });
    }

    if (data.cam_ok === false) {
      alerts.push({
        device_id: data.device_id,
        alert_type: "camera",
        severity: "high",
        message: "ESP32-CAM offline",
        heartbeat_id: hbData.id
      });
    }

    if (data.sd_ok === false) {
      alerts.push({
        device_id: data.device_id,
        alert_type: "storage",
        severity: "high",
        message: "Cartão SD falhou",
        heartbeat_id: hbData.id
      });
    }

    // A antiga detecção de hotspot comparava temp_rosa com temperatura.
    // Ela foi desativada temporariamente porque os sensores agora são
    // identificados como Sensor 1...Sensor 9 e ainda serão mapeados fisicamente.

    if (alerts.length > 0) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(alerts)
      });
    }

    // 4. REGISTRAR FOTO
    if (data.cam_last_photo) {
      await fetch(`${process.env.SUPABASE_URL}/rest/v1/photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          device_id: data.device_id,
          local_path: data.cam_last_photo,
          captured_at: data.cam_timestamp || new Date().toISOString()
        })
      });
    }

    return res.status(200).json({
      ok: true,
      saved: true,
      heartbeat_id: hbData.id,
      alerts_created: alerts.length
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
