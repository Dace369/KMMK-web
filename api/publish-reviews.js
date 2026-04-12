const crypto = require("crypto");
const { readJsonFile, writeJsonFile } = require("./lib/githubContent");

const PATH = "published-reviews.json";

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

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(function (r) {
      if (!r || typeof r !== "object") return null;
      const name = String(r.name || "")
        .trim()
        .slice(0, 120);
      const location = String(r.location != null ? r.location : r.loc || "")
        .trim()
        .slice(0, 160);
      const text = String(r.text != null ? r.text : r.quote || "")
        .trim()
        .replace(/^"|"$/g, "")
        .slice(0, 2000);
      const stars = Math.max(1, Math.min(5, parseInt(r.stars, 10) || 5));
      const id = String(r.id || "")
        .trim()
        .slice(0, 64);
      if (!text && !name) return null;
      return {
        id: id || "r_" + crypto.randomBytes(6).toString("hex"),
        name,
        location,
        text,
        stars,
        createdAt: r.createdAt && String(r.createdAt).slice(0, 40) ? String(r.createdAt).slice(0, 40) : new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .slice(0, 200);
}

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

  const expectedSecret = String(process.env.KMMK_PUBLISH_SECRET || "").trim();
  if (!expectedSecret) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Hiányzik a KMMK_PUBLISH_SECRET Vercel környezeti változó." }));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Érvénytelen JSON törzs." }));
    return;
  }

  const incomingSecret = body && body.secret != null ? String(body.secret).trim() : "";
  if (incomingSecret !== expectedSecret) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Érvénytelen közzétételi kulcs (ellenőrizd a Vercel KMMK_PUBLISH_SECRET értékét)." }));
    return;
  }

  if (!Array.isArray(body.items)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Az items tömb kötelező (vélemények JSON listája)." }));
    return;
  }

  const items = sanitizeItems(body.items);
  const payload = {
    version: 1,
    usePublishedReviews: true,
    updatedAt: new Date().toISOString(),
    items,
  };

  const got = await readJsonFile(PATH);
  let sha = null;
  if (got.ok) sha = got.sha;
  else if (!got.notFound) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "GitHub olvasás sikertelen.", detail: got.detail || "" }));
    return;
  }

  const put = await writeJsonFile(
    PATH,
    payload,
    `chore: reviews publish ${crypto.randomBytes(4).toString("hex")}`,
    sha
  );
  if (!put.ok) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "GitHub mentés sikertelen.", detail: put.detail || "" }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true }));
};
