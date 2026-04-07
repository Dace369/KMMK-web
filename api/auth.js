const crypto = require("crypto");
const { AuthorizationCode } = require("simple-oauth2");

const { config } = require("../lib/config.js");
const { scopes } = require("../lib/scopes.js");

const randomString = () => crypto.randomBytes(16).toString("hex");

module.exports = async (req, res) => {
  const host = req.headers.host;
  const url = new URL(`https://${host}${req.url}`);
  const provider = url.searchParams.get("provider");

  const client = new AuthorizationCode(config(provider));

  const authorizationUri = client.authorizeURL({
    redirect_uri: `https://${host}/api/callback?provider=${provider}`,
    scope: scopes[provider],
    state: randomString(),
  });

  res.statusCode = 302;
  res.setHeader("Location", authorizationUri);
  res.end();
};

