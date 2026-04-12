const { readJsonFile, writeJsonFile, randomHex, token } = require("./lib/githubContent");

const PATH = "published-reviews.json";
const MAX_ITEMS = 150;
const MAX_NAME = 100;
const MAX_LOC = 160;
const MAX_TEXT = 2000;

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    if (typeof req.body === "string" && req.body.trim()) {
      try {
        resolve(JSON.parse(req.body));
      } catch (e) {
        reject(e);
      }
      return;
    }
    const chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) resolve({});
        else resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sanitizeReview(body) {
  const website = body && typeof body.website === "string" ? body.website : "";
  if (website.trim()) return { error: "spam" };

  const name = String((body && body.name) || "")
    .trim()
    .slice(0, MAX_NAME);
  const location = String((body && body.location) || "")
    .trim()
    .slice(0, MAX_LOC);
  const text = String((body && body.text) || "")
    .trim()
    .slice(0, MAX_TEXT);
  const starsNum = parseInt(body && body.stars, 10);
  if (!Number.isFinite(starsNum) || starsNum < 1 || starsNum > 5) {
    return { error: "Válassz 1–5 csillagot." };
  }
  const stars = starsNum;

  if (!name || !text) return { error: "A név és a vélemény szövege kötelező." };

  return {
    review: {
      id: "r_" + randomHex(8),
      name,
      location,
      text,
      stars,
      createdAt: new Date().toISOString(),
    },
  };
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

  if (!token()) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "Hiányzik a KMMK_GITHUB_TOKEN (vagy GITHUB_TOKEN) a szerveren." }));
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

  const check = sanitizeReview(body);
  if (check.error) {
    res.statusCode = check.error === "spam" ? 400 : 400;
    res.end(JSON.stringify({ error: typeof check.error === "string" ? check.error : "Hibás adat." }));
    return;
  }

  const got = await readJsonFile(PATH);
  let base = { version: 1, usePublishedReviews: true, updatedAt: null, items: [] };
  let sha = null;
  if (got.ok) {
    base = got.json && typeof got.json === "object" ? got.json : base;
    sha = got.sha;
    if (!Array.isArray(base.items)) base.items = [];
  } else if (!got.notFound) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "GitHub olvasás sikertelen.", detail: got.detail || "" }));
    return;
  }

  const items = base.items.slice();
  items.unshift(check.review);
  while (items.length > MAX_ITEMS) items.pop();

  const next = {
    version: 1,
    usePublishedReviews: true,
    updatedAt: new Date().toISOString(),
    items,
  };

  const put = await writeJsonFile(PATH, next, `chore: review submit ${check.review.id}`, sha);
  if (!put.ok) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Mentés sikertelen (GitHub).", detail: put.detail || "" }));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, review: check.review }));
};
