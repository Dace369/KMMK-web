const { setClearCookieHeader } = require("./admin-cookie");

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("Set-Cookie", setClearCookieHeader(req));
  res.end(JSON.stringify({ ok: true }));
};
