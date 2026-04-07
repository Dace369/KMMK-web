const crypto = require("crypto");

const randomString = () => crypto.randomBytes(16).toString("hex");

module.exports = async (req, res) => {
  const host = req.headers.host;
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

  const redirectUri = `https://${host}/api/callback?provider=${provider}`;
  const state = randomString();

  const authorizationUri =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent("repo,user")}` +
    `&state=${encodeURIComponent(state)}`;

  res.statusCode = 302;
  res.setHeader("Location", authorizationUri);
  res.end();
};

