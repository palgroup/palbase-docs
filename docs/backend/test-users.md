> The full documentation index: https://palbase.studio/llms.txt

# Test Users

A **test user** is a real user of the project — it signs in, gets tokens, owns rows and files — made with the project's secret key for testing, and marked as such everywhere it goes. Test users skip the breach check and the password's minimum length, are not counted as active users, and only test users can be deleted through the test-user route, so a cleanup that goes wrong cannot take a real account with it. Your backend sees the mark: `user.test` is `true` on a test user's requests.

Whatever sign-in your app uses, a test user can go through it: it is made of the kind the sign-in asks for (passwordless, unverified, with a second factor, with a phone), and **what the platform sends it is kept for it** — its sign-in link, its verification and second factor's codes, your project's own mail and texts — in its [test inbox](#its-mail-and-texts), where a test reads the code or the link.

## Quick example

```ts
// scripts/make-test-users.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

// Three users with generated credentials, and an access token each.
const made = await palbase.auth.adminCreateTestUsers({ body: { count: 3, with_tokens: true } });
for (const u of made.data.users) {
  // The password is shown once: keep what you need now.
  console.log(u.user_id, u.email, u.password, u.access_token?.slice(0, 16));
}
```

## Making them

`POST /admin/test-users` (`auth.adminCreateTestUsers`) creates up to 1000 at a time — **all of them, or none** — and answers their credentials once: a password is never retrievable afterwards.

| Body | What it makes |
|---|---|
| `{ count: n }` | `n` users with generated emails and passwords. |
| `{ users: [{ email, password }] }` | Users with exactly these credentials; `users` wins when both are sent. |
| `{ users: [{ email, password, phone, otp }] }` | Also a verified phone, and the fixed six-digit code that phone accepts at sign-in — so a phone sign-in can be tested without a text being sent. |
| `with_tokens: true` | Also an access token per user, for calls made as them. |

An entry of `users` says the kind of user; what it leaves out is made — an address (`test-…@test.invalid`, which receives no mail: its mail is kept in its test inbox), a password, a phone's fixed code:

| Field | The user it makes |
|---|---|
| `email` | Its own address. One of yours gets its mail too — and the copy is kept. |
| `password` / `passwordless: true` | A password of yours, or none: it signs in by a link, a code or a passkey. |
| `email_verified: false` | Unverified: your app's verification is tested on it. |
| `phone` (+ `otp`) | A verified phone, texted nothing: it accepts its fixed six-digit code (made when `otp` is left out) at a phone sign-in and as an SMS second factor. |
| `email_otp` | A fixed six-digit code its email accepts — its verification code and its email second factor — for a person with no inbox to read, such as an app store's reviewer. The mail is still sent, carrying it. |
| `mfa: "totp" \| "sms" \| "email"` | A second factor from the start. `totp` answers its key once (`totp_secret`, `totp_url`): a test makes its codes with it. `sms` is its phone. |

Each answered user carries `user_id`, `email`, `email_verified`, its `password` (none when passwordless), what else it was made with (`phone`, `otp`, `email_otp`, `mfa`, `totp_secret`) and, with `with_tokens`, `access_token` — shown this once.

```ts
// scripts/make-reviewer.ts — an account an app store's reviewer signs in with:
// a password, and an email second factor whose code they are given.
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });
const [reviewer] = (await palbase.auth.adminCreateTestUsers({
  body: { users: [{ email: "review@yourapp.com", password: "a-long-review-password", mfa: "email", email_otp: "246802" }] },
})).data.users;
console.log(reviewer.user_id, reviewer.email_otp); // what the reviewer is given
```

| Refusal | Why |
|---|---|
| `409 user_exists` | An email is already taken (nothing was made). |
| `409 test_user_cap_exceeded` | The batch would take the project past its test-user cap (its test users and its unused sign-up addresses). |
| `400 invalid_request` | Neither a positive `count` nor `users`; a kind no user can have — passwordless with a password, a fixed code that is not six digits, a phone's code with no phone, a second factor it cannot have (`sms` with no phone, `email` unverified). |

Send an `Idempotency-Key` header to make the creation safe to retry: the same key and the same request answer the first result again instead of creating twice. A fixture made with chosen emails is easy to make *if missing* — treat `409 user_exists` as "already there".

`PUT /admin/test-users/phone` (`adminSetTestUserPhone`) gives an existing test user, found by email, a verified phone and its fixed code; setting the same again succeeds, and an email that is not a test user's is `404 test_user_not_found`.

## Its mail and texts

Every email and text the project sends a test user is kept for it for 7 days — auth's sign-in links and codes, its resets and verifications, your project's own sends — and read with the secret key: `GET /notify/test-users/{user_id}/messages` (`notify.listTestUserMessages`, `palbase auth:test-users:messages <id>`, Studio's **Messages** of a test account). Each message answers what it said (`subject`, `text`, `html`), the `variables` its template had, and the `code` and `link` it carried, picked out.

A made address (`…@test.invalid`) is mailed nothing, and a test user's phone is texted nothing — the kept copy is the message; an address of yours is mailed as well (`delivered: true`). A user who is not a test user is refused, `403 not_a_test_user`: no one else's mail is kept.

```ts
// scripts/read-a-sign-in-link.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });
const [user] = (await palbase.auth.adminCreateTestUsers({ body: { users: [{ passwordless: true }] } })).data.users;
await fetch(`${process.env.PALBASE_URL}/auth/magic-link`, { method: "POST", headers: { apikey: process.env.PALBASE_PUBLISHABLE_KEY!, "content-type": "application/json" }, body: JSON.stringify({ email: user.email }) });
const [mail] = (await palbase.notify.listTestUserMessages({ path: { user_id: user.user_id }, query: { channel: "email" } })).data.messages;
const token = new URL(mail.link!).searchParams.get("token"); // the link the user would tap
console.log(mail.code, token);
```

## Testing a sign-up

Your app's sign-up form opens a new account — a real one, counted, its mail sent. A **sign-up address** makes it a test user instead: `POST /admin/test-users/addresses` (`palbase auth:test-users:address`, Studio's **Sign-up address**) answers `signup-…@test.invalid`; typed into the form, the account it opens is a test user — its token says `test`, it is not counted as an active user, and its verification mail is kept in its test inbox, never sent.

Only the secret key makes one: each holds a place of the project's test-user cap until it is used — once — or lapses, a day after it was made. A sign-up with any other address opens an ordinary user.

## Sign-in with Google, Apple and others

A provider's sign-in goes through the provider's own screen, which a test user cannot pass: test it with the provider's own test accounts (Google's OAuth test users, an Apple sandbox account). What comes after the sign-in — your app as a signed-in user — is tested with a test user's token.

## In a route

A test user's token says `test: true`, and `palbase/backend` hands it to the route as `user.test`:

```ts
// src/modules/admin/reset.controller.ts
import { Controller, Forbidden, Post, User, type UserT } from "palbase/backend";

@Controller("/admin")
export class ResetController {
  // A route only the suite may call: every other user is turned away.
  @Post("/reset-demo")
  reset(@User() user: UserT): { reset: true } {
    if (!user.test) throw new Forbidden("this route serves test users only");
    return { reset: true };
  }
}
```

The flag is the platform's, set when the user was made with the secret key: a user who signs up cannot give it to themselves.

## Calling your backend as one

With `with_tokens`, each user's `access_token` goes on a call to your machine as `Authorization: Bearer …`, exactly as a signed-in app's does:

```ts
// scripts/call-as-test-user.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });
const [user] = (await palbase.auth.adminCreateTestUsers({ body: { count: 1, with_tokens: true } })).data.users;

const res = await fetch("https://<ref>.app.palbase.studio/notes", {
  headers: { authorization: `Bearer ${user.access_token}` },
});
console.log(res.status, await res.json());

await palbase.auth.adminDeleteTestUser({ path: { uid: user.user_id } });
```

They sign in like anyone else, too — with `palbase/web`'s `pb.auth.signIn(email, password)`, or by phone with their fixed code.

## Listing and removing them

| Call | What it does |
|---|---|
| `adminListTestUsers()` | Every test user of the project, newest first, whole: their number is capped, so the list is one answer. Each carries `is_test: true`. |
| `adminDeleteTestUser({ path: { uid } })` | Deletes a test user and everything that belongs to it. A user who is not a test user is refused, `403 not_a_test_user`. |

Deleting a test user is a user deletion like any other: it emits `user.deleted` (with `is_test: true`), so your backend forgets them as it forgets anyone ([Event Hooks](https://palbase.studio/docs/backend/hooks)), and storage objects owned by them go with them — its kept mail too.

## Made for a test run

A test run makes the users its tests act as, and deletes them when it ends: `palbase test --users alice,bob` on your computer, a machine's `test_users` on the platform before each new build takes traffic. Each is a test user like these, at an address of the run's own, with its access token; a test acts as one with `api.signInAs("alice")` ([Testing](https://palbase.studio/docs/backend/testing#over-http-api-as-test-users)).

## From Studio

Studio's **Test accounts** tab under Authentication makes test logins of the kind a sign-in asks for, lists and searches them, shows each one's **Messages**, and makes a **Sign-up address**, for the environment you are in.

## Related

- [Authentication](https://palbase.studio/docs/backend/authentication) — `@User()`, `user.test`, and how a token is checked
- [Testing](https://palbase.studio/docs/backend/testing) — testing a backend, with and without a network
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — `createServer`, refusals and `Idempotency-Key`
- [Web Auth](https://palbase.studio/docs/web/auth) — signing in as one from an app
