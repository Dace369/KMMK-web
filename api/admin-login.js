const {
  signToken,
  setCookieHeader,
  readJsonBody,
} = require("./admin-cookie");

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const adminPw = process.env.KMMK_ADMIN_PASSWORD;
  if (!adminPw) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        error: "A szerveren nincs beállítva a KMMK_ADMIN_PASSWORD (Vercel Environment Variables).",
      })
    );
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Érvénytelen JSON." }));
    return;
  }

  const pw = body && typeof body.password === "string" ? body.password.trim() : "";
  if (pw !== adminPw) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Hibás jelszó." }));
    return;
  }

  const token = signToken();
  if (!token) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Nem sikerült munkamenet létrehozása." }));
    return;
  }
  res.statusCode = 200;
  res.setHeader("Set-Cookie", setCookieHeader(token, req));
  res.end(JSON.stringify({ ok: true }));
};
