module.exports = async function handler(req, res) {
  try {
    const { id, status, result } = req.query;

    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "missing_id"
      });
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/commands?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          status: status || "done",
          result: result || null,
          executed_at: new Date().toISOString()
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
      ok: true
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
