const crypto = require("crypto");

function repoParts() {
  const repo = (process.env.KMMK_GITHUB_REPO || "Dace369/KMMK-web").trim();
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1], branch: (process.env.KMMK_GITHUB_BRANCH || "main").trim() };
}

function token() {
  return process.env.KMMK_GITHUB_TOKEN || process.env.GITHUB_TOKEN || null;
}

function headers() {
  return {
    accept: "application/vnd.github.v3+json",
    authorization: `Bearer ${token()}`,
    "user-agent": "KMMK-web",
  };
}

/**
 * @param {string} path - repo-relative path
 * @returns {Promise<{ ok: true, json: any, sha: string } | { ok: false, notFound?: boolean, status?: number, detail?: string }>}
 */
async function readJsonFile(path) {
  const p = repoParts();
  const t = token();
  if (!p || !t) return { ok: false, status: 500, detail: "Missing repo or token" };
  const url = `https://api.github.com/repos/${p.owner}/${p.name}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(p.branch)}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return { ok: false, notFound: true };
  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, status: res.status, detail: txt.slice(0, 400) };
  }
  const meta = await res.json();
  if (!meta || !meta.content) return { ok: false, status: 500, detail: "No content" };
  const b64 = String(meta.content).replace(/\s/g, "");
  const buf = Buffer.from(b64, "base64");
  let json;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    return { ok: false, status: 500, detail: "Invalid JSON in repo" };
  }
  return { ok: true, json, sha: meta.sha };
}

/**
 * @param {string} path
 * @param {object} obj — serialized as JSON UTF-8
 * @param {string} message — commit message
 * @param {string|null} sha — existing file sha, or null to create
 */
async function writeJsonFile(path, obj, message, sha) {
  const p = repoParts();
  const t = token();
  if (!p || !t) return { ok: false, error: "Missing repo or token" };
  const apiBase = `https://api.github.com/repos/${p.owner}/${p.name}/contents/${encodeURIComponent(path)}`;
  const content = Buffer.from(JSON.stringify(obj, null, 2), "utf8").toString("base64");
  const body = { message, content, branch: p.branch };
  if (sha) body.sha = sha;
  const putRes = await fetch(apiBase, {
    method: "PUT",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text();
    return { ok: false, status: putRes.status, detail: txt.slice(0, 400) };
  }
  return { ok: true };
}

function randomHex(n) {
  return crypto.randomBytes(n).toString("hex");
}

module.exports = { readJsonFile, writeJsonFile, repoParts, token, randomHex };

