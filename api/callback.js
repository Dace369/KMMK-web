function publicHost(req) {
  const xf = (req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const h = (req.headers.host || "").split(",")[0].trim();
  return xf || h || "";
}

module.exports = async (req, res) => {
  const host = publicHost(req);
  const url = new URL(`https://${host || "localhost"}${req.url}`);
  const code = url.searchParams.get("code");
  const provider = "github";

  try {
    if (!host) throw new Error("Missing Host");
    if (!code) throw new Error("Missing code");

    const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
    const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;
    if (!clientId) throw new Error("Missing OAUTH_GITHUB_CLIENT_ID");
    if (!clientSecret) throw new Error("Missing OAUTH_GITHUB_CLIENT_SECRET");

    const redirectUri = `https://${host}/api/callback`;

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
    <div id="fallback" style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
      <h2 style="margin: 0 0 8px;">Bejelentkezés feldolgozása…</h2>
      <p style="margin: 0 0 12px;">
        Ezt az oldalt az admin felület popupként nyitja meg. Ha ezt külön tabban látod, nyisd meg az admint, és onnan
        indítsd a belépést:
        <a href="/admin/">/admin/</a>
      </p>
      <p style="margin: 0; opacity: 0.7;">Most már nyugodtan bezárhatod ezt a lapot.</p>
    </div>
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

