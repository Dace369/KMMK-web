module.exports = async (req, res) => {
  const host = req.headers.host;
  const url = new URL(`https://${host}${req.url}`);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider") || "github";

  try {
    if (!code) throw new Error("Missing code");
    if (provider !== "github") throw new Error("Unsupported provider");

    const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
    const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;
    if (!clientId) throw new Error("Missing OAUTH_GITHUB_CLIENT_ID");
    if (!clientSecret) throw new Error("Missing OAUTH_GITHUB_CLIENT_SECRET");

    const redirectUri = `https://${host}/api/callback?provider=${provider}`;

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(
        `Token exchange failed: ${tokenJson.error || tokenRes.status} ${tokenJson.error_description || ""}`.trim()
      );
    }

    const token = tokenJson.access_token;
    if (!token) throw new Error("Missing access_token in response");

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

