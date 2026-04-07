import { IncomingMessage, ServerResponse } from "http";
import { AuthorizationCode } from "simple-oauth2";
import { config, Provider } from "../lib/config";

export default async (req: IncomingMessage, res: ServerResponse) => {
  const { host } = req.headers;
  const url = new URL(`https://${host}${req.url}`);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider") as Provider;

  try {
    if (!code) throw new Error("Missing code");

    const client = new AuthorizationCode(config(provider));
    const tokenParams = {
      code,
      redirect_uri: `https://${host}/callback?provider=${provider}`,
    };

    const accessToken = await client.getToken(tokenParams);
    const token = accessToken.token["access_token"] as string;

    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(renderBody(provider, "success", { token, provider }));
  } catch (e) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      renderBody(provider, "error", {
        token: "",
        provider: provider || "github",
        error: String(e),
      })
    );
  }
};

function renderBody(
  provider: string,
  status: "success" | "error",
  content: Record<string, unknown>
) {
  // Decap/Netlify CMS expects a JS page that postMessages the result to the opener.
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

