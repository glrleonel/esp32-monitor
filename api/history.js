module.exports = async function handler(req, res) {

  const { start, end } = req.query;

  let filter = "";

  if (start && end) {
    filter = `&created_at=gte.${start}T00:00:00&created_at=lte.${end}T23:59:59`;
  }

  const url = `${process.env.SUPABASE_URL}/rest/v1/heartbeats?order=created_at.desc${filter}`;

  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  const data = await response.json();

  res.status(200).json({ ok: true, data });
};
