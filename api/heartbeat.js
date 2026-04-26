export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const data = req.body;

  console.log("Heartbeat recebido:", data);

  return res.status(200).json({ ok: true });
}
