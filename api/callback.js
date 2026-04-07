const { AuthorizationCode } = require("simple-oauth2");
const { config } = require("../lib/config.js");

module.exports = async (req, res) => {
  const host = req.headers.host;
  const url = new URL(`https://${host}${req.url}`);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider") || "github";

  try {
    if (!code) throw new Error("Missing code");

    const client = new AuthorizationCode(config(provider));
    const tokenParams = {
      code,
      redirect_uri: `https://${host}/api/callback?provider=${provider}`,
    };

    const accessToken = await client.getToken(tokenParams);
    const token = accessToken.token.access_token;

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(renderBody(provider, "success", { token, provider }));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(renderBody(provider, "error", { error: String(e), provider }));
  }
};

function renderBody(provider, status, content) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      (function () {
        var provider = ${JSON.stringify(provider)};
        var status = ${JSON.stringify(status)};
        var content = ${JSON.stringify(content)};

        function receiveMessage(message) {
          try {
            window.opener.postMessage(
              "authorization:" + provider + ":" + status + ":" + JSON.stringify(content),
              message.origin
            );
          } catch (e) {}
          window.removeEventListener("message", receiveMessage, false);
        }

        window.addEventListener("message", receiveMessage, false);
        try {
          window.opener.postMessage("authorizing:" + provider, "*");
        } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}

