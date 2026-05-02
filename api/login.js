export default function handler(req, res) {
  const { user, pass } = req.body;

  if (
    user === process.env.ADMIN_USER &&
    pass === process.env.ADMIN_PASS
  ) {
    res.setHeader("Set-Cookie", "role=admin; Path=/");
    return res.json({ ok: true, role: "admin" });
  }

  if (
    user === process.env.VIEW_USER &&
    pass === process.env.VIEW_PASS
  ) {
    res.setHeader("Set-Cookie", "role=view; Path=/");
    return res.json({ ok: true, role: "view" });
  }

  return res.json({ ok: false });
}
