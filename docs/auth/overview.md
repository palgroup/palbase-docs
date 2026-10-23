> The full documentation index: https://palbase.studio/llms.txt

# Auth

Every environment has its own auth: its users, their sessions, the ways they may sign in, and the rules for all three. Nothing of it is shared with another environment, and nothing in it needs code of yours. This section is about setting it up and running it. Signing a person in from an app is [Web Auth](https://palbase.studio/docs/web/auth), and checking their token in a backend is [Authentication](https://palbase.studio/docs/backend/authentication).

## Where it is configured

Three places change the same configuration, and each sees what the others did:

- **Studio**, under the environment's **Auth** section: **Overview** (sign-ups and sign-ins over time), **Users**, **Providers**, **Sessions**, **Audit**, **Test accounts**, **Templates** and **Settings**.
- **The CLI**: its `auth:*` commands act on the environment chosen with `palbase use`, or the one `-E` names. A change to a production environment asks for confirmation first ([CLI](https://palbase.studio/docs/cli/overview#choosing-an-environment)).
- **The auth module's admin calls**, `/admin/*` at the project's address, with a secret key: `createServer({ url, secretKey }).auth` on any server, `Palbase.auth` in a `palbase/backend` app. An app's publishable key reaches none of them.

| What | Studio | CLI | Admin call |
|---|---|---|---|
| The settings | **Auth › Settings** (passwords, email confirmation, passkeys, email links, token lifetimes, security emails) | [`auth:settings:get`](https://palbase.studio/docs/cli/reference#palbase-authsettingsget), [`auth:settings:set`](https://palbase.studio/docs/cli/reference#palbase-authsettingsset) | `GET`/`PUT /admin/auth-settings` |
| Sign-in providers | **Auth › Providers** | `auth:providers:*` | `/admin/providers`, `/admin/social-auth` |
| Users | **Auth › Users** | `auth:users:*`, `auth:import` | `/admin/users` |
| Sessions | **Auth › Sessions** | `auth:users:sign-out` | `/admin/sessions` |
| Roles | — | `auth:roles:*` | `/admin/roles` |
| Blocking hooks | — | `auth:hooks:*` | `/admin/hooks` |
| OAuth clients | — | `auth:oauth-clients:*` | `/admin/oauth-clients` |
| Signing keys | — | `auth:signing-keys`, `auth:signing-keys:rotate` | `/admin/signing-keys` |
| The audit trail | **Auth › Audit** | `auth:audit`, `auth:audit:export`, `auth:audit:verify` | `/admin/audit` |
| Test users | **Auth › Test accounts** | `auth:test-users:*` | `/admin/test-users` |
| Auth's emails | **Auth › Templates** | `notify:templates:*` | `/notify/templates/email/{slug}/{locale}` |

The pages of this section:

- [Sign-in Providers](https://palbase.studio/docs/auth/providers): email, phone, Google, Apple, GitHub and Microsoft, and guest accounts.
- [Users & Roles](https://palbase.studio/docs/auth/users): the users list, banning, signing out, deleting and exporting a user, roles, and bringing users over from another project.
- [Blocking Hooks](https://palbase.studio/docs/auth/hooks): an endpoint of yours that auth asks, and waits for, before a sign-up, a sign-in or a token.
- [Audit Trail](https://palbase.studio/docs/auth/audit): who did what, chained so a change to the record shows.
- [OpenID Provider](https://palbase.studio/docs/auth/openid-provider): other apps signing in with your users' accounts, service accounts, and sign-in tokens your server makes.

## The settings

```sh
palbase auth:settings:get
palbase auth:settings:set password_min_length=12 confirm_email_required=true
palbase auth:settings:set redirect_urls='["https://app.example.com/**","myapp://callback"]'
```

`auth:settings:set` takes `key=value` pairs. A value that reads as JSON is taken as JSON (`12`, `true`, a list); any other is text, so `site_url=https://app.example.com` needs no quotes. Only the keys given change.

A change is made against the revision it was read at. `GET /admin/auth-settings` answers the revision in its `ETag` header, and `PUT /admin/auth-settings` needs it back in `If-Match`: without it the answer is `428 settings_revision_required`, and with a revision that is no longer current, `412 settings_revision_conflict`. A change someone made in the meantime, in Studio or another terminal, is never overwritten; the CLI and Studio do this for you. From a server:

```ts
// scripts/auth-settings.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const current = await palbase.auth.adminGetAuthSettings();
const saved = await palbase.auth.adminUpdateAuthSettings({
  headers: { "If-Match": current.headers.get("etag") ?? "" },
  // Only the fields sent change; an unknown field is refused.
  body: { password_min_length: 12, confirm_email_required: true },
});
console.log(saved.data.password_min_length, saved.headers.get("etag"));
```

Every field is checked against the values that will be in force together, so a maximum password length below the minimum, or a refresh token shorter-lived than the access token, is refused (`400`).

### New users

`signups_enabled` (default `true`) lets your apps create accounts. Off, every way a client opens one answers `403 signups_closed`: a sign-up with a password, a passkey sign-up, a guest, a phone's first code and a provider's first sign-in. People who have an account sign in as before, and your server still creates users with the secret key (`POST /admin/users`, imports, test users): it is how a closed app lets someone in.

```sh
palbase auth:settings:set signups_enabled=false
```

### Passwords and email

| Key | Default | What it says |
|---|---|---|
| `password_min_length` | `8` | The shortest password accepted, 6 to 64. |
| `password_max_length` | `64` | The longest, never below the shortest. |
| `confirm_email_required` | `false` | A new email account confirms its address before it signs in. With it on, a sign-up answers no session, and a sign-in before the confirmation is `403 email_not_confirmed`. |
| `email_verification_method` | `code` | How an address is confirmed: a one-time `code` in the email, or a `link`. |

A password found in a known breach is refused at sign-up and on every change (`400 password_breached`). Users created with the secret key can skip that check (`skip_password_hibp`).

### Links in auth emails

| Key | Default | What it says |
|---|---|---|
| `site_url` | none | The base of the links in auth emails: `https://app.example.com/auth/verify-email?token=…`, and the same for `reset-password` and `magic-link`. Empty: the pages auth serves itself. |
| `redirect_urls` | `[]` | Where a request's `redirect_to` may send a link instead: up to 100 URLs, wildcards and app schemes (`myapp://callback`) allowed. |

The order in which they are used, and the pages your site needs, are in [Where email links land](https://palbase.studio/docs/web/auth#where-email-links-land). A web app registered with `palbase apps:env:set <app> --redirect <url>` adds its redirects to the allow-list too.

### Sessions and tokens

| Key | Default | What it says |
|---|---|---|
| `access_token_ttl_seconds` | 1800 (30 minutes) | The access token's lifetime, 60 to 86400. |
| `refresh_token_ttl_seconds` | 2592000 (30 days) | The refresh token's, 3600 to 7776000: how long a user stays signed in without using the app. |
| `max_concurrent_sessions` | `0` | The most live sessions one user may hold; `0` is no limit. |
| `concurrent_session_strategy` | `revoke_oldest` | Past the limit: end the user's oldest sessions (`revoke_oldest`), or refuse the new sign-in with `409 max_sessions_reached` (`deny_new`). |
| `session_device_binding` | `false` | A session belongs to the device it was opened on: a refresh from another device, browser or operating system ends it. A change of network is only recorded in the audit trail. |
| `inactive_user_days` | `0` | Ban accounts with no sign-in, refresh or session activity for this many days, with the reason `inactive`: `0` is never, otherwise 30 to 3650. Test users are left alone; unbanning lets them back in. |

A refresh token is used once: each refresh answers a new pair. The same refresh token presented again, past a 30-second allowance for a retry, ends the session: someone else holds a copy of it.

### Passkeys

| Key | Default | What it says |
|---|---|---|
| `passkey_require_identifier` | `true` | A passkey sign-up carries an identifier. With it off, an account can be only its passkey. |
| `passkey_identifier_kind` | `email` | Which identifier that is: `email` or `phone`. |

The origins a passkey is accepted from are the environment's web apps; see [Passkeys](https://palbase.studio/docs/web/auth#passkeys).

### Guests

`anonymous_sign_ins` (default `false`) lets a visitor have an account and a session without signing up. See [Guests](https://palbase.studio/docs/auth/providers#guests).

### Risk

| Key | Default | What it says |
|---|---|---|
| `risk_engine_enabled` | `false` | Score every sign-up and sign-in for risk, from 0 to 1. |
| `risk_step_up` | `0.3` | At this score a sign-in asks for a second factor: an email code when the account has none. |
| `risk_strict_step_up` | `0.6` | At this score it asks for a strong one, an authenticator app or a passkey, when the account has one. |
| `risk_block` | `0.8` | At this score the sign-up or sign-in is refused, answered as a wrong password or a failed sign-up would be, so the refusal does not tell anyone the account exists. |

The three scores are set together, in that order (step up < strict step up < block). The score is made from the device's attestation, the account's own sign-in history, and, when the environment connects its own account with them, [Fingerprint](https://fingerprint.com) and [MaxMind](https://www.maxmind.com). A risk engine that cannot answer refuses a sign-up with `503` rather than letting it through.

Those two, and [Have I Been Pwned](https://haveibeenpwned.com), are connected with the environment's own credentials, from a server:

| Call | What it does |
|---|---|
| `PUT /admin/integrations/fingerprint` | `{ api_key, region? }`: a Server API key, and `us`, `eu` or `ap`. The app sends the agent's visitor id as `fingerprint_visitor_id` with a sign-in. |
| `PUT /admin/integrations/maxmind` | `{ account_id, license_key }` |
| `PUT /admin/integrations/hibp` | `{ api_key, requests_per_minute? }`: turns on the breached-account watch. Each user's address is checked every 30 days, and an account found in a breach must reset its password at its next sign-in (`403 password_reset_required`). `GET /admin/breach-watch` says how many it checked and found. |

`GET /admin/integrations` says which are connected; the credentials are never answered. `DELETE /admin/integrations/{name}` disconnects one.

### Security emails

`security_notifications` lists the changes a user is emailed about: `password_changed`, `email_changed` (told to the old address), `identity_linked`, `identity_unlinked`, `mfa_factor_enrolled`, `mfa_factor_removed`, `passkey_added`, `passkey_removed`. A second factor or a passkey added or removed (`mfa_factor_enrolled`, `mfa_factor_removed`, `passkey_added`, `passkey_removed`) is mailed by default, in every project: a change to what a user signs in with that they did not make is how a stolen password shows. The others are off until the project turns them on. Each is sent only to a confirmed address, in the user's language, with its own template (`auth.security_<kind>`). **Auth › Settings › Security notifications** turns each on and off.

### The OpenID provider

`oauth_login_url` and `fapi_enabled` are the environment's [OpenID Provider](https://palbase.studio/docs/auth/openid-provider#its-sign-in-page)'s.

### App Attest

`app_attest_mode` is `off` (the default), `monitor` or `enforce`: the switch of the backend routes marked `attest: true` ([Device attestation](https://palbase.studio/docs/backend/authentication#device-attestation)), read by the environment's machines every 30 seconds. `monitor` and `enforce` need an iOS or Android app registered with the environment (`palbase apps:env:set`).

Auth enrols a device when the app proves it: an iOS device's App Attest key (`POST /auth/devices/attest/ios`), or an Android device's Keystore key, whose attestation chain must end in one of Google's hardware attestation roots with no certificate on Google's revocation list, the key in the phone's secure hardware, the phone locked with a verified boot, and the app the registered package signed with a registered certificate (`POST /auth/devices/attest/android`). Both take the challenge of `POST /auth/devices/challenge` and need no session. Auth verifies a request's proof when a server asks it to (`POST /admin/attest/devices/assert`, with the secret key), and answers the mode at `GET /admin/attest/devices/attest-policy` and the last hours' counts at `GET /admin/attest/devices/observations`. Palbase's iOS and Android SDKs do the enrolment and the proofs by themselves.

## Signing keys

The environment's tokens are signed with its own keys, `ES256`, and its key set is public at `https://<ref>.palbase.studio/.well-known/jwks.json`. That is how a backend checks a token without asking auth ([How the token is verified](https://palbase.studio/docs/backend/authentication#how-the-token-is-verified)).

```sh
palbase auth:signing-keys
palbase auth:signing-keys:rotate
```

Keys rotate on their own every 90 days. A key is published in the key set a day before it starts signing, so a verifier that reads the key set once a day already holds it. A key that stops signing goes on verifying the tokens it signed until the longest of them has expired, and is then retired. Its status says where it is: `next` (published, not signing), `active` (signs), `grace` and `verification_only` (verify only), `retired` (gone from the key set).

`auth:signing-keys:rotate` (`POST /admin/signing-keys/rotate`) makes the change now: the published next key, or a new one, signs from then on. Tokens already issued keep working. Rotate when you think a key may have been exposed; a verifier that sees the new `kid` reads the key set again.

## Auth's emails and texts

Auth sends its emails through the project's notifications, from templates that belong to the environment: `auth.email_verify` and `auth.email_verify_code` (confirming an address), `auth.password_reset`, `auth.magic_link`, `auth.mfa_otp` (a sign-in code by email), and the security emails above. A phone code is the SMS template `auth.sms_otp`.

**Auth › Templates** edits them in each language and sends a test. Until the environment has its own email provider, auth's mail goes through the platform's shared sender with the default text; your edits are used once your own provider is connected ([Notifications](https://palbase.studio/docs/backend/notifications#every-channel-but-one-needs-a-provider-of-yours)). The same templates are reachable as any others: `palbase notify:templates:set`, or `PUT /notify/templates/email/{slug}/{locale}` ([Templates](https://palbase.studio/docs/backend/notifications#templates)).

## Between environments

```sh
palbase config:diff --from staging --to main
palbase config:copy --from staging --to main
```

The auth part of `config:copy` makes the target's settings, phone sign-in, social providers, roles, blocking hooks and OAuth clients equal to the source's. Secrets are not copied: a provider secret the target lacks is named, with the command that sets it, and a hook or confidential OAuth client made in the target gets a secret of its own, printed once.

## Related

- [Web Auth](https://palbase.studio/docs/web/auth): the sign-in flows in an app
- [Authentication](https://palbase.studio/docs/backend/authentication): the token in a backend
- [Test Users](https://palbase.studio/docs/backend/test-users): accounts for tests
- [Webhooks](https://palbase.studio/docs/server/webhooks): `user.deleted`, `session.ended` and the other events auth sends
- [CLI reference](https://palbase.studio/docs/cli/reference#auth): every `auth:*` command
