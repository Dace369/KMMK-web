const crypto = require("crypto");

const COOKIE_NAME = "kmmk_admin";

function getSigningSecret() {
  return (
    process.env.KMMK_SESSION_SECRET ||
    process.env.KMMK_ADMIN_PASSWORD ||
    ""
  );
}

function signToken() {
  const secret = getSigningSecret();
  if (!secret) return null;
  const exp = Date.now() + 7 * 86400000;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const secret = getSigningSecret();
  if (!secret) return false;
  const i = token.lastIndexOf(".");
  if (i <= 0) return false;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    const bufs = Buffer.from(sig, "utf8");
    const bufe = Buffer.from(expected, "utf8");
    if (bufs.length !== bufe.length) return false;
    if (!crypto.timingSafeEqual(bufs, bufe)) return false;
  } catch (e) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return false;
    return true;
  } catch (e2) {
    return false;
  }
}

function parseCookies(req) {
  const h = req.headers.cookie;
  if (!h) return {};
  const out = {};
  h.split(";").forEach(function (part) {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch (e) {
      out[k] = v;
    }
  });
  return out;
}

function getAdminCookie(req) {
  const v = parseCookies(req)[COOKIE_NAME];
  return v != null ? String(v) : null;
}

function isSecureRequest(req) {
  const proto = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return process.env.VERCEL === "1" || proto === "https";
}

function setCookieHeader(token, req) {
  const secure = isSecureRequest(req);
  const attrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure ? "; Secure" : ""}`;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs}`;
}

function setClearCookieHeader(req) {
  const secure = isSecureRequest(req);
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

async function readJsonBody(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.trim()) {
    return JSON.parse(req.body);
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  getAdminCookie,
  setCookieHeader,
  setClearCookieHeader,
  readJsonBody,
};
