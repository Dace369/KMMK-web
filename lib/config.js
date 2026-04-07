const providers = ["github", "gitlab"];

function config(provider) {
  if (!providers.includes(provider)) {
    throw new Error(`Unsupported provider ${provider}`);
  }

  return {
    client: client[provider],
    auth: auth[provider],
  };
}

const auth = {
  github: {
    tokenHost: "https://github.com",
    tokenPath: "/login/oauth/access_token",
    authorizePath: "/login/oauth/authorize",
  },
  gitlab: {
    tokenHost: "https://gitlab.com",
    tokenPath: "/oauth/token",
    authorizePath: "/oauth/authorize",
  },
};

const client = {
  github: {
    id: process.env.OAUTH_GITHUB_CLIENT_ID,
    secret: process.env.OAUTH_GITHUB_CLIENT_SECRET,
  },
  gitlab: {
    id: process.env.OAUTH_GITLAB_CLIENT_ID,
    secret: process.env.OAUTH_GITLAB_CLIENT_SECRET,
  },
};

module.exports = { config };

