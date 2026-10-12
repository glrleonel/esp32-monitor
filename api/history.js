module.exports = async function handler(req, res) {
  try {
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
      // Os seletores de data do dashboard representam dias locais em São Paulo.
      // Usar explicitamente -03:00 evita que o gráfico comece às 21h do dia anterior.
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
