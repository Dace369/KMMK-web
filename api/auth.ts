import { IncomingMessage, ServerResponse } from "http";
import { randomBytes } from "crypto";
import { AuthorizationCode } from "simple-oauth2";
import { config, Provider } from "../lib/config";
import { scopes } from "../lib/scopes";

const randomString = () => randomBytes(16).toString("hex");

export default async (req: IncomingMessage, res: ServerResponse) => {
  const { host } = req.headers;
  const url = new URL(`https://${host}${req.url}`);
  const provider = url.searchParams.get("provider") as Provider;

  const client = new AuthorizationCode(config(provider));

  const authorizationUri = client.authorizeURL({
    redirect_uri: `https://${host}/callback?provider=${provider}`,
    scope: scopes[provider],
    state: randomString(),
  });

  res.writeHead(302, { Location: authorizationUri });
  res.end();
};

