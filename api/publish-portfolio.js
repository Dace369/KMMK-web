const crypto = require("crypto");

function sanitizeItems(items) {
  return items.map(function (item) {
    const out = {
      title: String(item.title || "").slice(0, 200),
      category: String(item.category || "").slice(0, 120),
      description: String(item.description || "").slice(0, 5000),
      material: String(item.material || "").slice(0, 500),
      duration: String(item.duration || "").slice(0, 120),
      images: [],
    };
    if (Array.isArray(item.images)) {
      out.images = item.images
        .map(function (u) {
          return String(u || "")
            .trim()
            .slice(0, 2000);
        })
        .filter(Boolean)
        .slice(0, 30);
    } else if (item.src) {
      const s = String(item.src).trim();
      if (s) out.images = [s.slice(0, 2000)];
    }
    return out;
  });
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

  const expectedSecret = process.env.KMMK_PUBLISH_SECRET;
  const token = process.env.KMMK_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repo = (process.env.KMMK_GITHUB_REPO || "Dace369/KMMK-web").trim();
  const branch = (process.env.KMMK_GITHUB_BRANCH || "main").trim();
  const path = "published-portfolio.json";

  if (!expectedSecret) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Hiányzik a KMMK_PUBLISH_SECRET Vercel környezeti változó." }));
    return;
  }
  if (!token) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Hiányzik a KMMK_GITHUB_TOKEN (vagy GITHUB_TOKEN) Vercel környezeti változó." }));
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

  if (body.secret !== expectedSecret) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Érvénytelen közzétételi kulcs." }));
    return;
  }

  const items = body.items;
  if (!Array.isArray(items)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Az items tömb kötelező." }));
    return;
  }
  if (items.length > 200) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Legfeljebb 200 elem engedélyezett." }));
    return;
  }

  const payload = {
    version: 1,
    useAdminPortfolio: true,
    updatedAt: new Date().toISOString(),
    items: sanitizeItems(items),
  };

  const content = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Érvénytelen KMMK_GITHUB_REPO (owner/repo)." }));
    return;
  }
  const [owner, repoName] = parts;
  const apiBase = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

  const headers = {
    accept: "application/vnd.github.v3+json",
    authorization: `Bearer ${token}`,
    "user-agent": "KMMK-web-publish",
  };

  let sha = null;
  const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  } else if (getRes.status !== 404) {
    const t = await getRes.text();
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        error: "GitHub olvasás sikertelen.",
        detail: t.slice(0, 240),
      })
    );
    return;
  }

  const putBody = {
    message: `chore: portfolio update ${crypto.randomBytes(4).toString("hex")}`,
    content,
    branch,
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    res.statusCode = 502;
    res.end(
      JSON.stringify({
        error: "GitHub mentés sikertelen (token jogosultság / branch?).",
        detail: t.slice(0, 320),
      })
    );
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true }));
};
