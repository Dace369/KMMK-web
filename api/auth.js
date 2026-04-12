const crypto = require("crypto");

const randomString = () => crypto.randomBytes(16).toString("hex");

function publicHost(req) {
  const xf = (req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const h = (req.headers.host || "").split(",")[0].trim();
  return xf || h || "";
}

/** GitHub OAuth: redirect_uri must exactly match the URL registered on the OAuth App (no ?query). */
function callbackUrl(req) {
  const host = publicHost(req);
  return `https://${host}/api/callback`;
}

module.exports = async (req, res) => {
  const host = publicHost(req);
  if (!host) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Missing Host" }));
    return;
  }

  const url = new URL(`https://${host}${req.url}`);
  const provider = url.searchParams.get("provider") || "github";

  if (provider !== "github") {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Unsupported provider" }));
    return;
  }

  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Missing OAUTH_GITHUB_CLIENT_ID" }));
    return;
  }

  const redirectUri = callbackUrl(req);
  const state = randomString();
  const scopeRaw = (url.searchParams.get("scope") || "repo").trim();
  const githubScope = scopeRaw.replace(/,/g, " ").replace(/\s+/g, " ").trim() || "repo";

  const authorizationUri =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(githubScope)}` +
    `&state=${encodeURIComponent(state)}`;

  res.statusCode = 302;
  res.setHeader("Location", authorizationUri);
  res.end();
};

