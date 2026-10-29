> The full documentation index: https://palbase.studio/llms.txt

# Sign-in Providers

An environment's users sign in with email, a phone number, or an account at Google, Apple, GitHub or Microsoft, and visitors can have a guest account before they sign up. Email is always on. Every other way is off until you turn it on, in Studio's **Auth › Providers** or with `palbase auth:providers:set`.

```sh
palbase auth:providers:list
```

`auth:providers:list` prints each provider, whether it is on, its clients, and the secrets it keeps (by name; a secret is never printed).

## Email

Email sign-in cannot be turned off, and has no switch of its own: an account with an address signs in with its password, a magic link or a passkey, as the app offers. Its rules are the environment's [auth settings](https://palbase.studio/docs/auth/overview#passwords-and-email): password lengths, whether an address is confirmed before the first sign-in, whether the confirmation is a code or a link, and where the links in its emails land.

The emails are sent through the environment's notifications ([Auth's emails and texts](https://palbase.studio/docs/auth/overview#auths-emails-and-texts)).

## Phone

A phone number signs in with a code texted to it (`POST /auth/otp`, then `POST /auth/otp/verify`), and a text can be a second factor. Its codes go through the environment's own SMS provider or verification service, set up in the notifications module ([SMS, codes and WhatsApp](https://palbase.studio/docs/backend/notifications#sms-codes-and-whatsapp)) — and, with neither, through Palbase's Twilio Verify, with nothing to set up, at Twilio's price and 10% past $4 a month ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)).

```sh
palbase auth:providers:set phone --enable
palbase auth:providers:set phone otp_ttl_seconds=120 otp_max_attempts=5 allow_signups=false
palbase auth:providers:disable phone
```

| Setting | Default | What it says |
|---|---|---|
| `allow_signups` | `true` | A code sent to a number no account has makes an account. With it off, only existing accounts sign in by phone. |
| `otp_ttl_seconds` | `300` | How long a code is good for, 1 to 300 seconds. |
| `otp_max_attempts` | `5` | Wrong codes allowed before the code is spent, 3 to 10. |
| `sender` | `sms` | Who makes the code: `sms` (auth makes it, and texts it through your SMS provider with the template `auth.sms_otp`) or `verify` (your verification service makes and checks it). |
| `sms_second_factor` | `true` | Whether a text may be a user's second factor. Turn it off if you hold texts too weak for one. |

Studio sets them under **Auth › Providers**, the phone row's settings. Which countries a text may reach is the notifications settings' (`sms_countries`, `sms_blocked_countries`). A phone sign-in that is off answers `provider_not_enabled`.

## Google, Apple, GitHub and Microsoft

Social sign-in has three parts, set up per provider:

- **The switch.** A provider that is off signs no one in, whatever its clients say.
- **Clients.** A client is one app's way in: its `key`, the `application_key`, `platform` (`web`, `ios`, `macos`, `android`) and `variant` (a build: `release`, `debug` …) it serves, and the provider's own identifiers for it. An app asks for the clients of its application, platform and variant (`GET /auth/oauth/config`) and gets what a sign-in button needs, with nothing secret in it. A **browser client** sends the person to the provider's page and back; a **native client** signs in with the platform's own sheet (Sign in with Apple, Google's and Microsoft's SDKs) and hands auth the provider's ID token.
- **Secrets.** A browser client names the stored secret it uses (`credential_ref`). Secrets are kept by a name you choose, encrypted, and never answered. A native client needs none.

### What each provider needs

Register this callback with the provider, for every browser client:

```text
https://<ref>.palbase.studio/auth/oauth/callback/<provider>
```

`<provider>` is `google`, `apple`, `github` or `microsoft`. Studio shows it, ready to copy, as **Backend callback URL** in the provider's settings. After the provider sends the person back there, auth sends them on to your app's **return URI**: one of the client's `return_uris`, exactly as listed, or the sign-in is refused (`invalid_return_uri`).

| Provider | Browser client | Its secret | Native clients |
|---|---|---|---|
| Google | `web_client_id`: the OAuth client id of a **Web application** client in Google Cloud | That client's secret | iOS and macOS: `bundle_id`, `ios_client_id`, `redirect_uri`. Android: `package_name`, `android_client_id`, `server_client_id` (the Web application client's id), `signing_certificate_sha1` |
| Apple | `services_id`: a **Services ID** with Sign in with Apple turned on | A Sign in with Apple **key** (the `.p8` file), with your Team ID and the key's Key ID | iOS and macOS: `bundle_id` |
| GitHub | `oauth_client_id`: an **OAuth App**'s client id | The OAuth App's client secret | — (browser only) |
| Microsoft | `application_id`: an app registration's **Application (client) ID**, and the `directory` it takes accounts from | A client secret of that registration | iOS, macOS and Android: `application_id`, `bundle_id` or `package_name`, `redirect_uri`, `directory` |

A Microsoft `directory` is `common` (work, school and personal accounts), `organizations` (work and school), `consumers` (personal), or the id of one organization's directory, for its accounts alone. Apple on Android signs in through the browser.

### From the CLI

```sh
# Google: a browser client named web, its return URI, and its secret from stdin.
palbase auth:providers:set google --client-id 1234567890-abc.apps.googleusercontent.com \
  --return-uri https://app.example.com/signin/callback --secret-stdin < google-secret.txt
palbase auth:providers:set google --enable

# Apple: the Services ID, and the .p8 key with its team and key ids.
palbase auth:providers:set apple --client-id com.example.web --return-uri https://app.example.com/signin/callback \
  --secret-stdin --team-id ABCDE12345 --key-id XYZ987WVU6 < AuthKey_XYZ987WVU6.p8
palbase auth:providers:set apple --enable

# Microsoft, for work and school accounts only.
palbase auth:providers:set microsoft --client-id 00000000-0000-0000-0000-000000000000 --directory organizations \
  --return-uri https://app.example.com/signin/callback --secret-stdin < microsoft-secret.txt
```

- `--client-id` sets the browser client that `--client` names (`web` by default), making it when the provider has none of that name. `--application` and `--variant` say what it serves (`app` and `release` by default); `--return-uri`, repeated, replaces its return URIs.
- `--secret-stdin` reads the secret from standard input, never from the command line, and keeps it under `--credential` (the provider's name by default).
- `--clients-file clients.json` replaces the provider's clients with a file's `{ "browser_clients": […], "native_clients": […] }`: the way to set native clients, and several at once.
- `palbase auth:providers:disable <provider>` turns a provider off and keeps its clients and secrets. `palbase auth:providers:secret:delete <name>` deletes a stored secret; one a client still uses is refused.

### In Studio

**Auth › Providers** lists every provider with its switch. A social provider's settings hold its clients (**Add client**: the client key, application key, platform, variant, browser or native, and the fields the table above names) and its **Browser credentials**: a secret saved under a credential key, which a browser client then selects. A Google client JSON or an Apple `.p8` file can be imported instead of pasting.

A change is made against the configuration read when the form opened: one saved elsewhere in the meantime is refused, and the form asks you to reopen it. The admin calls are the same: `GET /admin/social-auth` answers an `ETag`, and `PATCH /admin/social-auth/providers/{provider}` and `PUT /admin/social-auth/credentials/{key}` take it in `If-Match`.

### When the address is an existing account's

A provider account that is already linked signs in to its user. One that is not:

- **links to the account that holds its email address**, and signs in to it, when the provider hosts that address (Google for Gmail and Workspace addresses, Apple for iCloud addresses) and the account's address was confirmed and it has no second factor;
- **is refused** with `409 identity_link_required` when another account holds the address on any other terms: the person signs in to that account and links the provider from there;
- **makes a new account** when no account holds the address.

A signed-in user links another provider to their own account with the same flow (`purpose: "link"`). The app's side of the browser flow is in [Social sign-in](https://palbase.studio/docs/web/auth#social-sign-in).

## Guests

A guest is an account with no address, password or credential: only its session. A visitor can use your app as a guest and sign up later, and the account keeps its id, so what they did as a guest stays theirs. Turn guests on in the settings:

```sh
palbase auth:settings:set anonymous_sign_ins=true
```

Off, a guest sign-in answers `403 anonymous_sign_ins_disabled`. A guest is held to what holds a sign-up: the environment's user limit, proof of work, the risk engine and your `before.user.create` [hook](https://palbase.studio/docs/auth/hooks) (told `is_anonymous: true`), and 30 guests an hour from one address. Its access token says `is_anonymous: true`.

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/guest.ts
import { pb } from "./lib/palbase";

/** A visitor's first visit: a guest account and its session. */
export async function startAsGuest(): Promise<string> {
  const current = await pb.auth.currentSession();
  if (current) return current.userId;
  const { data } = await pb.auth.api.signInAnonymously({ body: { locale: navigator.language } });
  if (!data.access_token || !data.refresh_token || !data.expires_in) throw new Error("the guest has no session");
  await pb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
  return data.user.id;
}

/** Later: the guest becomes an account with an address and a password, under the same id. */
export async function keepAccount(email: string, password: string): Promise<void> {
  await pb.auth.api.convertAnonymousUser({ body: { email, password } });
}

/** With the code the email carried. */
export async function confirmAccount(code: string): Promise<void> {
  await pb.auth.api.verifyAnonymousConversion({ body: { code } });
  await pb.auth.refreshSession(); // the new tokens no longer say is_anonymous
}
```

The address is the account's only once its owner confirms it: with the emailed code (`POST /auth/anonymous/convert/verify`, in the guest's own session) or, when the environment confirms by link, the link's token (`POST /auth/verify-email`). Until then the account is still a guest. An address another account holds is `409 email_exists`, and the guest stays signed in. A guest also becomes an account by adding a passkey, or by linking a social provider with its session; either way it keeps its id. Your backends hear `user.converted`.

## Related

- [Overview](https://palbase.studio/docs/auth/overview): the auth settings
- [Web Auth](https://palbase.studio/docs/web/auth): the sign-in flows in a browser
- [Blocking Hooks](https://palbase.studio/docs/auth/hooks): approving a sign-up or a sign-in from your own code
- [Notifications](https://palbase.studio/docs/backend/notifications): the email and SMS providers auth sends through
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-authprovidersset): `auth:providers:set` and its flags
