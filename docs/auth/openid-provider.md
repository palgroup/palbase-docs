> The full documentation index: https://palbase.studio/llms.txt

# OpenID Provider

Every environment is an OAuth 2.0 authorization server and OpenID Connect provider for its own users. Another app (a partner's site, a CLI, a TV app, a tool of your own) signs a person in with their account in your app, the way apps offer "Sign in with Google", and gets an access token and an ID token for them. You register each such app as an **OAuth client** of the environment. This is not how your own app signs its users in: that is [Web Auth](https://palbase.studio/docs/web/auth).

The provider's issuer is the project's address, and everything about it is in its discovery document:

```text
https://<ref>.palbase.studio/.well-known/openid-configuration
```

| Endpoint | What it is |
|---|---|
| `GET /oauth/authorize` | The authorization endpoint: the browser leg of the authorization code flow, with PKCE (`S256`). |
| `POST /oauth/token` | Tokens for the grants `authorization_code`, `refresh_token`, `client_credentials` and `urn:ietf:params:oauth:grant-type:device_code`. |
| `POST /oauth/par` | Pushed authorization requests (RFC 9126). |
| `POST /oauth/device` | Device authorization (RFC 8628). |
| `GET /oauth/userinfo` | The claims of the token's scopes: `sub`, `email`, `email_verified`, `name`, `preferred_username`. |
| `POST /oauth/introspect` | Introspection (RFC 7662), for the secret key or a confidential client. |
| `POST /oauth/revoke` | Revocation (RFC 7009). |
| `GET /oauth/logout` | RP-initiated logout, with `id_token_hint` and a registered `post_logout_redirect_uri`. |
| `GET /.well-known/jwks.json` | The keys tokens are signed with ([Signing keys](https://palbase.studio/docs/auth/overview#signing-keys)). |

A client talks to these with its own credentials, never with a Palbase key. The scopes are `openid`, `profile`, `email` and `offline_access`.

## Registering a client

```sh
# A web app with a server: a confidential client, its secret printed once.
palbase auth:oauth-clients:create "Partner Portal" --redirect-uri https://partner.example.com/callback --grant authorization_code --grant refresh_token

# A CLI or a mobile app: a public client, with no secret, signing in with PKCE.
palbase auth:oauth-clients:create "Acme CLI" --public --redirect-uri http://127.0.0.1:8976/callback

palbase auth:oauth-clients:list
palbase auth:oauth-clients:delete oidc_7f3a…
```

| Flag | What it says |
|---|---|
| `--public` | A public client (a CLI, a mobile app, a single-page app) has no secret. Without it the client is confidential, and its secret is printed this once. |
| `--redirect-uri` | Where the browser may be sent back with the code; repeat it for several. `https`, or, for a public client, its own scheme or `http` on the loopback address. |
| `--grant` | `authorization_code` (the default), `refresh_token`, `client_credentials`, `urn:ietf:params:oauth:grant-type:device_code`. |
| `--scope` | What it may ask for; `openid`, `profile` and `email` by default. |
| `--client-id` | A `client_id` of your choosing, kept as it is; a random `oidc_…` one by default. |

The admin calls hold more: `POST /admin/oauth-clients` takes `token_endpoint_auth_method` (`client_secret_basic`, the default for a confidential client, `client_secret_post`, `private_key_jwt` with the client's `jwks`, or `none` for a public one), `post_logout_redirect_uris`, `id_token_lifetime_secs` (3600 by default) and `dpop_bound_access_tokens` (every token request proves a key, RFC 9449). `PATCH /admin/oauth-clients/{id}` changes any of them but whether the client is public. A secret client can move to `private_key_jwt`, giving up its secret, and never back.

## Its sign-in page

The provider has no sign-in page of its own: the person signs in on a page of yours, which you name in the auth settings.

```sh
palbase auth:settings:set oauth_login_url=https://app.example.com/oauth/login
```

Without it, `/oauth/authorize` refuses: there is nowhere to sign the person in. With it, the flow is:

1. The client sends the browser to `GET /oauth/authorize` with its `client_id`, `redirect_uri`, `scope`, `state` and PKCE challenge.
2. The provider sends the browser to your page with `?auth_request_id=…`.
3. Your page signs the person in with `POST /auth/login`, sending the `auth_request_id` with the email and password. The answer's `oidc_callback_url` is where the browser goes next.
4. From there, the provider sends the browser back to the client's `redirect_uri` with the `code`, the `state` and the issuer (`iss`). The client exchanges the code at `POST /oauth/token`.

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/oauth-login.ts
import { pb } from "./lib/palbase";

/** The form on https://app.example.com/oauth/login?auth_request_id=… */
export async function signInForClient(email: string, password: string): Promise<string> {
  const authRequestId = new URLSearchParams(window.location.search).get("auth_request_id") ?? "";
  const { data } = await pb.auth.api.login({ body: { email, password, auth_request_id: authRequestId } });
  if ("mfa_required" in data) return "This account signs in with a second factor, which this page does not complete.";
  if (data.oidc_callback_url) window.location.assign(data.oidc_callback_url);
  return "Signed in";
}
```

The request is completed by a password sign-in: a sign-in that answers `mfa_required` does not complete it.

## Signing in a device

A device with no keyboard, a TV or a terminal, signs in with the device flow, when its client has the `urn:ietf:params:oauth:grant-type:device_code` grant:

1. The device calls `POST /oauth/device` with its `client_id`, and shows the person the `user_code` it is answered.
2. The person opens a page of your app on their phone or computer, signed in, and enters the code. The page shows what asked (`GET /auth/device/requests/{user_code}`: the client's name, the address and user agent it asked from) and approves or denies it (`POST /auth/device/verify`).
3. The device polls `POST /oauth/token` with its `device_code` every `interval` seconds; until the person decides, the answer is `authorization_pending`.

Auth has no approval page to show: the `verification_uri` it answers is its own, and answers JSON. Show the person your page's address.

```ts
// src/device.ts
import { pb } from "./lib/palbase";

/** What the approval page shows before the person decides: a code someone else sent names a device they do not know. */
export async function describeDevice(userCode: string): Promise<string> {
  const { data } = await pb.auth.api.devicePendingRequest({ path: { user_code: userCode } });
  return `${data.client_name}, from ${data.ip ?? "an unknown address"} (${data.user_agent ?? "unknown device"})`;
}

export async function decideDevice(userCode: string, approve: boolean): Promise<void> {
  await pb.auth.api.deviceVerifySubmit({ body: { user_code: userCode, action: approve ? "approve" : "deny" } });
}
```

The [blocking hooks](https://palbase.studio/docs/auth/hooks) `before.device_grant.initiate` and `before.device_grant.authorize` can refuse either step.

## FAPI 2.0

```sh
palbase auth:settings:set fapi_enabled=true
```

`fapi_enabled` holds the provider to the FAPI 2.0 Security Profile, for clients that need it (open banking, payments): an authorization request is taken only as a push (`POST /oauth/par`) and names its `redirect_uri`, PKCE is `S256`, clients are confidential and authenticate with `private_key_jwt`, every token is DPoP-bound, access tokens live five minutes at most, refresh tokens are not rotated, and the device flow is off.

## Service accounts

A service account is a machine's identity in the environment: a `client_id` and a secret, for `grant_type=client_credentials` at `POST /oauth/token`. Its token has no user and no session behind it: a `palbase/backend` route refuses it, since its routes take users. It is for services of your own that verify it against the key set or with `POST /oauth/introspect`.

| Admin call | What it does |
|---|---|
| `POST /admin/service-accounts` | `{ name, scopes?, credential_ttl_days? }`: makes one, and answers its `client_secret` once. |
| `GET /admin/service-accounts`, `GET /admin/service-accounts/{id}` | Lists them, reads one; never the secret. |
| `POST /admin/service-accounts/{id}/rotate` | A new secret, answered once. The old one keeps working for 30 seconds, so a deployment can switch. |
| `DELETE /admin/service-accounts/{id}` | Revokes it at once: its secrets stop working and no token is issued to it again. |

`credential_ttl_days` (1 to 3650) is how long a secret lives before the account must be rotated; without it a secret does not expire.

## Signing in with your own server

When your server decides who a person is in a way of its own (an employee directory, a game console's account, a sign-in your company already has), it can sign them in to the environment as one of its users. The user must exist: make them first with `POST /admin/users`, or [import](https://palbase.studio/docs/auth/users#bringing-users-over) them.

1. Your server mints a custom token for the user: `POST /admin/token/custom` with the secret key, `{ user_id, expires_in? }` (at most an hour, the default).
2. It hands the token to the app, which exchanges it for a session at `POST /auth/token/exchange` (`{ custom_token }`).

The token is good once (`401 token_used` a second time); a banned user's is refused (`403 user_banned`).

```ts
// server/sign-in-as.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

/** After your own check of who they are: a token the app trades for their session. */
export async function customTokenFor(userId: string): Promise<string> {
  const { data } = await palbase.auth.adminCreateCustomToken({ body: { user_id: userId, expires_in: 300 } });
  return data.custom_token;
}
```

```ts
// src/exchange.ts
import { pb } from "./lib/palbase";

export async function signInWith(customToken: string): Promise<string> {
  const { data } = await pb.auth.api.exchangeCustomToken({ body: { custom_token: customToken } });
  await pb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
  return data.user.id;
}
```

## Related

- [Overview](https://palbase.studio/docs/auth/overview): the auth settings and signing keys
- [Blocking Hooks](https://palbase.studio/docs/auth/hooks): approving a sign-in, a token or a device from your own code
- [Audit Trail](https://palbase.studio/docs/auth/audit): `token.issue`, `serviceaccount.*` and the rest
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-authoauth-clientscreate): `auth:oauth-clients:create` and its flags
