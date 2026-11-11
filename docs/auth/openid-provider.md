> The full documentation index: https://palbase.studio/llms.txt

# OpenID Provider

Every environment is an OAuth 2.0 authorization server and OpenID Connect provider for its own users. Another app (a partner's site, a CLI, a TV app, a tool of your own) signs a person in with their account in your app, the way apps offer "Sign in with Google", and gets an access token and an ID token for them. You register each such app as an **OAuth client** of the environment. This is not how your own app signs its users in: that is [Web Auth](https://palbase.studio/docs/web/auth).

The provider's issuer is the project's address, and everything about it is in its discovery document:

```text
https://<ref>.palbase.studio/.well-known/openid-configuration
```

With [your own sign-in domain](https://palbase.studio/docs/auth/providers#your-own-sign-in-domain), the provider answers there too, as its own issuer: `https://auth.example.com/.well-known/openid-configuration` names `https://auth.example.com` as the issuer and every endpoint there, and the pages a person signs in through are on it. A client keeps the issuer it discovered — tokens minted at one address name that address — so point a new client at your domain, and leave one already set up at the project's address as it is.

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
3. Your page signs the person in, naming the `auth_request_id`, with any sign-in it offers: a password (`POST /auth/login`), a new account (`POST /auth/signup`), a provider (Google, Apple, GitHub, Microsoft: `POST /auth/oauth/transactions`, then the transaction's completion), a passkey (`POST /auth/webauthn/login/begin`, then `…/finish`), an email link (`POST /auth/magic-link`, then `…/verify`) or a phone code (`POST /auth/otp`, then `…/verify`). The answer that signs them in carries `oidc_callback_url`: where the browser goes next. A sign-in that asks for a second factor carries the request in its `mfa_token`, and the challenge's answer carries `oidc_callback_url`.
4. From there, the provider sends the browser back to the client's `redirect_uri` with the `code`, the `state` and the issuer (`iss`). The client exchanges the code at `POST /oauth/token`.

The request answers the browser that opened it and completed it, once. `/oauth/authorize` leaves a cookie on the project's address (`__Host-palbase_oauth_…`, five minutes, `SameSite=Lax`) naming the request, and the sign-in that completes it is given a secret, carried in `oidc_callback_url` (`done=`) and nowhere else. The callback answers only a browser that holds both: someone who opened a request and sent its sign-in page to another person has the cookie but never the secret, and the person who signed in has the secret but not their cookie — each is answered `400 auth_request_other_browser` and no code. Once the callback sends the browser back to the client, the request is gone; visiting it again gives nothing. So the page signs the person in within the browser the flow started in, and goes to `oidc_callback_url` there, as it is, as a top-level navigation.

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/oauth-login.ts
import { pb } from "./lib/palbase";

/**
 * The page /oauth/authorize sends the browser to: https://app.example.com/oauth/login?auth_request_id=…
 * A provider sends the person back to this same page, without the id: the tab keeps it.
 */
const fromQuery = new URLSearchParams(window.location.search).get("auth_request_id");
if (fromQuery) sessionStorage.setItem("auth_request_id", fromQuery);
const authRequestId = sessionStorage.getItem("auth_request_id") ?? "";

/** The sign-in that completed the request: on to the callback, in this browser, as it is. */
function goOn(answer: { oidc_callback_url?: string }): boolean {
  if (!answer.oidc_callback_url) return false;
  window.location.assign(answer.oidc_callback_url);
  return true;
}

export async function withPassword(email: string, password: string): Promise<string> {
  const { data } = await pb.auth.api.login({ body: { email, password, auth_request_id: authRequestId } });
  if ("mfa_required" in data) {
    sessionStorage.setItem("mfa_token", data.mfa_token);
    return `second factor: ${data.factors.join(", ")}`;
  }
  return goOn(data) ? "on to the app" : "signed in";
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** clientKey: the provider's browser client, whose return URIs hold this page's address. */
export async function withProvider(clientKey: string): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const begun = await pb.auth.api.socialBegin({
    body: {
      client_key: clientKey,
      completion_challenge: challenge,
      completion_challenge_method: "S256",
      purpose: "sign_in",
      return_uri: "https://app.example.com/oauth/login",
      auth_request_id: authRequestId,
    },
  });
  sessionStorage.setItem(`social:${begun.data.transaction_id}`, verifier);
  if (begun.data.authorization_url) window.location.assign(begun.data.authorization_url);
}

/** Back from the provider: ?transaction_id=…&result_code=… */
export async function finishProvider(): Promise<string> {
  const q = new URLSearchParams(window.location.search);
  const id = q.get("transaction_id") ?? "";
  const verifier = sessionStorage.getItem(`social:${id}`) ?? "";
  const { data } = await pb.auth.api.socialComplete({
    path: { id },
    body: { completion_verifier: verifier, result_code: q.get("result_code") ?? "" },
  });
  if (data.status === "mfa_required") {
    sessionStorage.setItem("mfa_token", data.mfa_token);
    return `second factor: ${data.factors.join(", ")}`;
  }
  return data.status === "signed_in" && goOn(data) ? "on to the app" : "signed in";
}

/** The code from the person's authenticator app. */
export async function withSecondFactor(code: string): Promise<string> {
  const mfaToken = sessionStorage.getItem("mfa_token") ?? "";
  const { data } = await pb.auth.api.mfaChallenge({ body: { mfa_token: mfaToken, type: "totp", code } });
  return goOn(data) ? "on to the app" : "signed in";
}

/** A passkey: the request is bound when the ceremony begins, and its finish completes it. */
export async function withPasskey(): Promise<string> {
  const begun = await pb.auth.api.webauthnLoginBegin({ body: { auth_request_id: authRequestId } });
  // The options are the WebAuthn spec's JSON (the SDK types them as an open object): the browser parses them.
  const json = begun.data.options.publicKey as unknown as PublicKeyCredentialRequestOptionsJSON;
  const options = PublicKeyCredential.parseRequestOptionsFromJSON(json);
  const credential = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential;
  const { data } = await pb.auth.api.webauthnLoginFinish({ body: credential.toJSON() });
  return goOn(data) ? "on to the app" : "signed in";
}

/** An email link: the email carries a link and a six-digit code. */
export async function withEmailLink(email: string): Promise<string> {
  await pb.auth.api.magicLinkRequest({ body: { email, auth_request_id: authRequestId } });
  return "check your email: open the link here, or type its code";
}

/** The code from the email, typed in this tab: the link was opened on another device. */
export async function withEmailCode(code: string): Promise<string> {
  const { data } = await pb.auth.api.magicLinkVerify({ body: { auth_request_id: authRequestId, code } });
  if ("mfa_required" in data) {
    sessionStorage.setItem("mfa_token", data.mfa_token);
    return `second factor: ${data.factors.join(", ")}`;
  }
  return goOn(data) ? "on to the app" : "signed in";
}

/** Back from the email's link, in this browser: ?auth_request_id=…&email_token=… */
export async function finishEmailLink(): Promise<string> {
  const token = new URLSearchParams(window.location.search).get("email_token") ?? "";
  const { data } = await pb.auth.api.magicLinkVerify({ body: { auth_request_id: authRequestId, token } });
  if ("mfa_required" in data) {
    sessionStorage.setItem("mfa_token", data.mfa_token);
    return `second factor: ${data.factors.join(", ")}`;
  }
  return goOn(data) ? "on to the app" : "signed in";
}

/** A phone code: the request is named when the code is sent and when it is checked. */
export async function sendPhoneCode(phone: string): Promise<void> {
  await pb.auth.api.requestPhoneOtp({ body: { phone, auth_request_id: authRequestId } });
}

export async function withPhoneCode(phone: string, token: string): Promise<string> {
  const { data } = await pb.auth.api.verifyPhoneOtp({ body: { phone, token, auth_request_id: authRequestId } });
  if ("mfa_required" in data) {
    sessionStorage.setItem("mfa_token", data.mfa_token);
    return `second factor: ${data.factors.join(", ")}`;
  }
  return goOn(data) ? "on to the app" : "signed in";
}

/** A new account: it signs in at once, unless its address is to be confirmed first. */
export async function signUp(email: string, password: string): Promise<string> {
  const { data } = await pb.auth.api.signup({ body: { email, password, auth_request_id: authRequestId } });
  return goOn(data) ? "on to the app" : "confirm your email, then sign in";
}
```

The email link opens at the provider, on the address the request was opened at. In the browser that opened the request it goes on to your page with `?auth_request_id=…&email_token=…` (`finishEmailLink`). Opened anywhere else — a phone's mail app — it asks the person to go back to the tab they started in and type the six-digit code the email carries (`withEmailCode`), and spends nothing: the link and the code still work there. The code is good for as long as the request is. Five wrong codes and the email's code stops working (`400 code_max_attempts`); twenty tried for an address in a day and no code works until the day is over (`400 code_limit_reached`) — either way the link still signs the person in from the browser that opened the request. An address gets at most five such emails an hour from one network (an IPv4 address, an IPv6 /64) and thirty from all of them, each site (an IPv6 /56) counting at most five toward the thirty. A network the person has signed in from by email before is held by its own five alone: others on other networks cannot spend it, though anyone sharing that network (a carrier's or an office's) shares its five. On a network new to them, others asking from several sites can hold their email back for the hour. The email names the app the person is signing in to, and tells them to type the code only in a tab they opened themselves.

The sign-in that completes the request says how the person signed in, and the tokens the client gets say it too: `amr` is `["pwd"]` for a password (and a new account's), the provider's name (`["google"]`, `["apple"]`, `["github"]`, `["microsoft"]`) for a provider, `["swk"]` for a passkey that syncs and `["hwk"]` for one bound to its device (the authenticator's own word), `["email"]` for an email link or its code, `["sms"]` for a phone code, and the first factor with the second (`["google", "otp"]`, `["pwd", "otp"]`, `["sms", "otp"]`) after a code; `acr` is `urn:nist:800-63:aal2` after an authenticator app's or a text's code and for a passkey, `urn:nist:800-63:aal1` otherwise (a password, a provider, an email link, a phone code alone; a recovery code, an email code). A provider's sign-in follows the project's sign-up switch: a person who has no account yet gets one when sign-ups are open, as in your own app.

What the client asks of the sign-in is held to it, as other providers hold it:

| Parameter | What the provider does |
|---|---|
| `prompt=none` | Answered at once at the client's `redirect_uri` with `error=login_required`: the provider keeps no session of its own — every authorization is a sign-in on your page — so it can never answer without showing it. |
| `prompt=login`, `max_age` | Met by this provider: the sign-in that completes the request is made after the client asked, on your page, and the ID token's `auth_time` says when. A provider the person signs in with may use its own session: Microsoft is told `prompt=login` and asks for the password again; Google, Apple and GitHub take no such parameter. A client that needs proof of a fresh credential asks for `acr_values=urn:nist:800-63:aal2`: a second factor's code, typed now. |
| `acr_values` | The sign-in must reach the least level the values name, of those the provider knows (`urn:nist:800-63:aal1`, `urn:nist:800-63:aal2`). With `aal2` the password sign-in asks for an authenticator app's or a text's code — even on a trusted device — and an account with none is refused (`400 auth_request_invalid`); a provider's, an email link's and a phone code's sign-in complete the request after the second factor they ask for (after a phone code, an authenticator app: a second text adds nothing); a passkey reaches it alone; a new account, which has no second factor yet, is refused before it is opened. When the second factor named in `factors` is `webauthn`, the account's passkey, the page signs in with the passkey instead. A request asking only for `urn:nist:800-63:aal3`, which no sign-in here reaches yet, is answered at once at the client's `redirect_uri` with `error=unmet_authentication_requirements`. Values the provider does not know ask nothing; at most 8 values of 128 characters. |
| `prompt=consent`, `select_account` | Your page decides: the provider shows no consent screen of its own. A client you register is one you allow on your users' behalf. |

A request asking for a sensitive scope (`cli:admin` by default) needs `urn:nist:800-63:aal2` the same way. A second factor's code that cannot reach the level a request needs — a recovery code, an email code — is refused before it is spent.

A request no sign-in can complete, unknown, expired (five minutes after `/oauth/authorize`) or completed already, is refused when the sign-in names it: `POST /auth/login` answers `400 auth_request_invalid` before it checks the password, `POST /auth/signup` before the account is opened, `POST /auth/oauth/transactions` before the person goes to the provider, `POST /auth/webauthn/login/begin` before the person is asked for a passkey, and `POST /auth/magic-link` and `POST /auth/otp` before an email or a text is sent. Only a browser client's sign-in (`purpose: "sign_in"`) takes one; linking a provider to an account signs no one in. A request that expires while the person is at the provider or typing their code ends that sign-in with `400 auth_request_invalid`, and the client starts again. Completing a transaction again with the same body answers the same `oidc_callback_url`, and the callback answers once: two visits of it at the same moment (a double navigation, a prefetch) give one code, and the other is answered `409 auth_request_in_progress`.

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
