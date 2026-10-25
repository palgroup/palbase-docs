> The full documentation index: https://palbase.studio/llms.txt

# Auth

`pb.auth` signs a person in and keeps them signed in. Every flow that ends in tokens puts them in the client's session and tells your app, and every call that acts for the user carries the access token from then on. The flows an app writes most are methods here: email and password, second factors, passkeys, magic links, phone codes, password and email changes, the user's sessions. Every other client operation of the auth module is reachable typed as `pb.auth.api`.

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/signin.ts
import { pb } from "./lib/palbase";

// Create the account. When the project signs new users in at once, the session starts too.
const created = await pb.auth.signUp({ email: "ada@example.com", password: "correct-horse-battery-staple" });
console.log("account", created.user.id, created.access_token ? "signed in" : "confirm your email first");

// Sign in. A second factor, when the account has one, comes back as mfaRequired.
const result = await pb.auth.signIn("ada@example.com", "correct-horse-battery-staple");
if (result.mfaRequired) {
  const code = window.prompt("The code from your authenticator app") ?? "";
  await pb.auth.mfa.challenge(result.mfaRequired.mfaToken, "totp", code);
}

const me = await pb.auth.getUser();
console.log(me.id, me.email_verified, me.has_mfa);
```

The client is built with the project's address as `url`: the browser calls auth there directly, so auth's limits count each user's own address. See [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser).

## The session

```ts
// src/session.ts
import { pb } from "./lib/palbase";

const session = await pb.auth.currentSession();
if (session) {
  console.log(session.userId, new Date(session.expiresAt));
}
```

| Member | What it does |
|---|---|
| `currentSession()` | The session, `{ accessToken, refreshToken, expiresAt, userId, user? }`, or `null` when no one is signed in. It waits for the store to load, so call it at boot. |
| `getUser()` | Reads the signed-in user's profile fresh (`GET /auth/me`): id, email, whether it is verified, whether they have a password and a second factor, their linked providers and language. |
| `refreshSession()` | Refreshes now, rather than when the token is about to lapse. |
| `setSession({ access_token, refresh_token, expires_in })` | Starts the session from a token pair your app has from a flow of its own (the social sign-in below, a ceremony you run step by step). The session held before is gone. |
| `onAuthStateChange(listener)` | Tells you every change. Returns the unsubscribe. |

The access token is refreshed a minute before it lapses, in the background while it still works, so no call waits for a refresh until the token is dead. A call refused with a 401 that is about the token (`invalid_token`, `token_expired`, `session_expired`, `session_revoked`, `missing_token`) is refreshed once and sent again, and only for the user whose session sent it. Every other 401, such as a wrong password or a wrong code, is the caller's answer and is never sent again. A refresh the server refuses ends the session (`SESSION_EXPIRED`).

## Email and password

`signUp(body)` creates the account (`POST /auth/signup`). The body is `{ email, password, locale?, redirect_to? }`. `redirect_to` is where the verification link lands, and it must be on the project's redirect allow-list (see [Where email links land](#where-email-links-land)). What comes back is `{ user, access_token?, refresh_token?, expires_in? }`: the tokens are there, and the session starts, only when the project lets a new account sign in before it confirms its address. With email confirmation required, the user confirms first and then signs in.

`signIn(email, password)` (`POST /auth/login`) answers one of two shapes:

```ts
// src/login.ts
import { pb } from "./lib/palbase";

export async function login(email: string, password: string): Promise<string> {
  const result = await pb.auth.signIn(email, password);
  if (result.mfaRequired) {
    // { mfaToken, factors }: finish with pb.auth.mfa.challenge(...) or .recovery(...)
    return `second factor: one of ${result.mfaRequired.factors.join(", ")}`;
  }
  return `signed in as ${result.user.id}`;
}
```

The password rules (the shortest length, whether an email must be confirmed first) are the project's auth settings: Studio's Auth screens, or `PUT /admin/auth-settings` with the secret key from a server. A password the policy refuses, or one known from a breach, is a `PalbaseError` with status 400 and a code that says which.

### Confirming an email

The confirmation email carries a link, or a code when the project uses codes:

```ts
// src/verify.ts
import { pb } from "./lib/palbase";

const token = new URLSearchParams(window.location.search).get("token");
if (token) {
  await pb.auth.email.verify({ token }); // the link's token
} else {
  await pb.auth.email.verify({ email: "ada@example.com", code: "482913" }); // or the code with the address
}

// The email did not arrive:
await pb.auth.email.resendVerification("ada@example.com");
```

## Where email links land

A link in an auth email (confirm the address, choose a new password, a magic link) is built from the project's auth settings, in this order:

1. the request's `redirect_to`, with `?token=` added, when it is on the allow-list: the auth settings' `redirect_urls`, together with the redirects of the project's web apps (`palbase apps:env:set <app> --redirect <url>`). Any other `redirect_to` is refused with `invalid_redirect`;
2. the project's site URL (`site_url`) with the action's page: `https://app.example.com/auth/verify-email?token=…`, `https://app.example.com/auth/reset-password?token=…`, `https://app.example.com/auth/magic-link?token=…`;
3. with neither, the page auth serves itself at the project's address, for confirming an email and choosing a password. A magic link has no such page, because it ends in a session that only your app can take: a project that sends magic links needs a site URL.

Those three pages are yours to build at your site. Each reads `token` from its query and calls the method below.

## Second factors

A sign-in that needs a second factor answers `mfaRequired: { mfaToken, factors }`. Finish it with one of these:

| Method | What it does |
|---|---|
| `mfa.challenge(mfaToken, "totp" \| "sms" \| "email", code)` | Completes the sign-in with a code. Returns the user. |
| `mfa.recovery(mfaToken, code)` | Completes it with a recovery code instead. |
| `mfa.sendSmsCode(mfaToken)` / `mfa.sendEmailCode(mfaToken)` | Sends the sign-in code; then `challenge(mfaToken, "sms" \| "email", code)`. |

Enrolling, for the signed-in user:

```ts
// src/mfa.ts
import { pb } from "./lib/palbase";

// TOTP: the secret for the authenticator app, a QR code, and the recovery codes, shown once.
const totp = await pb.auth.mfa.enrollTotp();
console.log(totp.otpUrl, totp.recoveryCodes);
await pb.auth.mfa.verifyTotp("123456"); // the first code the app shows confirms it

const factors = await pb.auth.mfa.factors();
console.log(factors);

// Removing a factor asks for the account's password.
await pb.auth.mfa.removeFactor("fac_01", "correct-horse-battery-staple");
```

`enrollSms(phone)` and `verifySms(code)` enroll a phone, `enrollEmail()` the account's address, and `regenerateRecoveryCodes()` replaces the recovery codes.

### Stepping up

A backend route that asks for a second factor (`auth: { aal: "aal2" }`), or for a recent one (`maxAge`), refuses a password sign-in with `kind: "stepUpRequired"` (`data.acr_values`, `data.max_age`). Step the signed-in user up and call again:

```ts
// src/approve.ts
import { pb } from "./lib/palbase";

await pb.auth.mfa.stepUp("123456"); // the code the authenticator app shows
// or, with one of the user's passkeys: await pb.auth.passkey.stepUp();
// or by text: await pb.auth.mfa.sendStepUpSmsCode(); then
//   await pb.auth.mfa.stepUpWithSms(codeFromTheText);
// the route called again now gets the aal2 token
```

Each returns the session, which holds the token at the new level from here on; its refreshes stay at that level (`TOKEN_REFRESHED` is told). The step-up is the session's last authentication, so a route's `maxAge` counts from it. An email code is not a way up: it is not a second factor ([Second factors and their strength](https://palbase.studio/docs/backend/authentication#second-factors-and-their-strength)).

## Passkeys

```ts
// src/passkeys.ts
import { pb } from "./lib/palbase";

// Create an account with a passkey and no password, and sign in with it.
const user = await pb.auth.passkey.signUp("ada@example.com", "Ada");

// Add another passkey to the signed-in user.
await pb.auth.passkey.register("Work laptop");

// Sign in: any passkey of the site (discoverable), or one user's.
await pb.auth.signOut();
const again = await pb.auth.passkey.signIn();
console.log(user.id === again.id);

console.log(await pb.auth.passkey.list());
```

The ceremony runs through `navigator.credentials`, or the `webauthn` you give `createClient`. Outside a browser with neither, a passkey method throws once the ceremony's first call has answered.

The passkey's relying party is the project's own host, and a page on your origin uses it through WebAuthn's related origins: the project publishes its registered web apps' origins at `GET /.well-known/webauthn`, and the same list decides which origins a ceremony is accepted from. Register your site as a web app of the environment, with its origin (`https://app.example.com`): at most five registrable domains across the environment's web apps. A browser without related-origin support refuses a passkey from an origin that is not the project's host.

`passkey.remove(id)` removes one. Renaming is `pb.auth.api.webauthnRenameCredential(...)`.

## Magic links

```ts
// src/magic.ts
import { pb } from "./lib/palbase";

await pb.auth.magicLink.send("ada@example.com");

// On the page the link opened (https://app.example.com/auth/magic-link?token=…):
const token = new URLSearchParams(window.location.search).get("token");
if (token) await pb.auth.magicLink.verify(token);
```

## Phone codes

```ts
// src/phone.ts
import { pb } from "./lib/palbase";

await pb.auth.phone.sendCode("+905551234567");
const result = await pb.auth.phone.verifyCode("+905551234567", "482913");
if (result.mfaRequired) console.log("a second factor is needed");
else console.log("signed in", result.user.id);
```

Phone sign-in must be enabled for the project (`provider_not_enabled` otherwise). A code is texted through the project's own SMS provider, or its verification service when the phone settings say so (`PUT /admin/providers/phone/settings`). The answer is the same whether or not the number has an account, and sending is limited per number and per address.

## Social sign-in

Google, Apple, GitHub and Microsoft sign-in in a browser is a transaction the auth module keeps (`/auth/oauth/transactions`). The client has no one-call method for it. The steps are four calls, all on `pb.auth.api`:

1. `socialConfig` (`GET /auth/oauth/config`) answers the browser clients one application may use. `application_key` and `variant` are the ones the provider's browser client was set up with in Studio's Auth providers, and its return URIs are where the provider sends the user back.
2. `socialBegin` (`POST /auth/oauth/transactions`) takes the client's key, the return URI and a challenge made from a secret only this tab holds, and answers the provider's `authorization_url`.
3. The provider sends the user to the project's callback, which sends them on to your return URI with `?transaction_id=…&result_code=…`.
4. `socialComplete` (`POST /auth/oauth/transactions/{id}/complete`) takes the result code and the secret, and answers the session.

```ts
// src/social.ts
import { pb } from "./lib/palbase";

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** On the sign-in page: open the provider. */
export async function startGoogle(): Promise<void> {
  const config = await pb.auth.api.socialConfig({ query: { application_key: "web", platform: "web", variant: "production" } });
  const google = config.data.clients.find((c) => c.provider === "google" && "mode" in c && c.mode === "browser");
  if (!google) throw new Error("no Google browser client is set up for this application");

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const begun = await pb.auth.api.socialBegin({
    body: {
      client_key: google.key,
      completion_challenge: challenge,
      completion_challenge_method: "S256",
      purpose: "sign_in",
      return_uri: "https://app.example.com/signin/callback",
    },
  });
  sessionStorage.setItem(`social:${begun.data.transaction_id}`, verifier);
  if (begun.data.authorization_url) window.location.assign(begun.data.authorization_url);
}

/** On the return URI's page: finish it. */
export async function finishSocial(): Promise<string> {
  const q = new URLSearchParams(window.location.search);
  const id = q.get("transaction_id") ?? "";
  const verifier = sessionStorage.getItem(`social:${id}`) ?? "";
  sessionStorage.removeItem(`social:${id}`);
  const done = await pb.auth.api.socialComplete({
    path: { id },
    body: { completion_verifier: verifier, result_code: q.get("result_code") ?? "" },
  });
  const result = done.data;
  if (result.status === "signed_in") {
    await pb.auth.setSession(result.session);
    return result.is_new_user ? "welcome" : "welcome back";
  }
  if (result.status === "mfa_required") {
    // Finish with pb.auth.mfa.challenge(result.mfa_token, …)
    return `second factor: ${result.factors.join(", ")}`;
  }
  return "linked";
}
```

What the provider reported, a refusal or a cancel included, comes back from `socialComplete` as a `PalbaseError`. The callback itself always sends the user back. A transaction expires (`auth_transaction_expired`, 410), and the result code is good for a minute after the provider sends the user back. Completing again with the same body answers the same result. `socialCancel` abandons one that has not completed.

## Passwords

```ts
// src/password.ts
import { pb } from "./lib/palbase";

// Forgot it: the email's link lands on https://app.example.com/auth/reset-password?token=…
await pb.auth.password.requestReset("ada@example.com");
const token = new URLSearchParams(window.location.search).get("token");
if (token) await pb.auth.password.confirmReset(token, "a-new-long-passphrase");

// Signed in: change it, or add one to an account that has none (passkey or social).
await pb.auth.password.change({ current_password: "a-new-long-passphrase", new_password: "another-long-passphrase" });
const me = await pb.auth.getUser();
if (!me.has_password) await pb.auth.password.set({ new_password: "a-first-long-passphrase" });
```

## The user's sessions

```ts
// src/devices.ts
import { pb } from "./lib/palbase";

console.log(await pb.auth.sessions.list());
await pb.auth.sessions.revoke("ses_01"); // one of them
await pb.auth.sessions.revokeAll(); // signed out everywhere
```

## Listening for changes

```ts
// src/listen.ts
import { pb } from "./lib/palbase";

const stop = pb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || event === "SESSION_EXPIRED") window.location.assign("/login");
  if (event === "SIGNED_IN") console.log("hello", session?.userId);
});
// later: stop();
void stop;
```

| Event | When |
|---|---|
| `SIGNED_IN` | A flow started a session, or another tab signed someone in. |
| `TOKEN_REFRESHED` | The access token was refreshed, here or in another tab. |
| `USER_UPDATED` | `getUser()` read the profile, and it was stored with the session. |
| `SIGNED_OUT` | `signOut()`, or a sign-out in another tab. |
| `SESSION_EXPIRED` | The refresh token was refused (revoked, reused, expired). |

`pb.auth.sessionEndReason` says why a session ended without the app signing out, set before `SESSION_EXPIRED` is told so a listener reads it: `expired`, `revoked`, `userDeleted` (the account was deleted) or `userBanned` (it was suspended). It is `null` again once someone signs in or the app signs out.

A tab that finds a different user's session in the shared store says `SIGNED_OUT` and then `SIGNED_IN`, and a call it had in flight is not sent again as the new user.

## Signing out and deleting the account

`signOut()` ends the session on the server (`POST /auth/logout`) and here. A failed call still signs out locally.

`deleteAccount(password?)` deletes the account (`DELETE /auth/user`), everything tied to it and its sessions, and ends the session here. An account with a password gives it — `has_password` on `getUser()` says whether it has one — and auth asks for it again: a password missing or wrong is `401 reauth_required`, and the session is kept. An account without one (passkey, social, phone) is deleted on the strength of its session, and a password sent for it is ignored:

```ts
// src/delete-account.ts
import { pb } from "./lib/palbase";

/** Whether the confirmation asks for the password: only an account that has one gives it. */
export async function asksForPassword(): Promise<boolean> {
  return (await pb.auth.getUser()).has_password;
}

/** A missing or wrong password is a PalbaseError, 401 reauth_required, and the user stays signed in. */
export async function deleteAccount(password?: string): Promise<void> {
  await pb.auth.deleteAccount(password);
}
```

## `pb.auth.api`

Every client operation of the auth contract, typed, through the session's transport. A few an app reaches for:

| Call | Path |
|---|---|
| `pb.auth.api.updateMe({ body: { locale: "tr" } })` | `PATCH /auth/me` |
| `pb.auth.api.listIdentities()` | `GET /auth/identities` |
| `pb.auth.api.unlinkIdentity({ path: { id } })` | `DELETE /auth/identities/{id}` |
| `pb.auth.api.webauthnRenameCredential({ path: { id }, body })` | `PUT /auth/webauthn/credentials/{id}` |

The `/admin/*` operations are in the same client, and every one of them needs the secret key. From an app they are refused before anything is sent (`missing_credential`). Make them from a server with [`palbase/server`](https://palbase.studio/docs/server/overview).

## Proof of work

The auth module may answer a sign-in, a sign-up or a code request with `403 pow_required` and a challenge when the address looks like a bot. The client solves it (a SHA-256 search, longer the harder the challenge) and sends the same request once more with the answer. You never see the challenge. One the client cannot solve comes back as `pow_unsolved`.

## Related

- [Overview](https://palbase.studio/docs/web/overview) — `createClient`, sessions and calling the project from a browser
- [Error Handling](https://palbase.studio/docs/web/errors) — the codes these flows answer
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls) — the access token on your own routes
- [Next.js](https://palbase.studio/docs/web/nextjs) — the client in a Next.js app
- [Authentication in your backend](https://palbase.studio/docs/backend/authentication) — how a machine checks the token
- [Test Users](https://palbase.studio/docs/backend/test-users) — accounts made with the secret key
