module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/heartbeats?order=created_at.desc&limit=1`,
      {
        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const data = await response.json();

    return res.status(200).json({
      ok: true,
      data: data[0] || null
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
};
 
  
