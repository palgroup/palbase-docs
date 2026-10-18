> The full documentation index: https://palbase.studio/llms.txt

# Test Users

A **test user** is a real user of the project — it signs in, gets tokens, owns rows and files — made with the project's secret key for testing, and marked as such everywhere it goes. Test users are created email-verified, skip the breach check and the password's minimum length, are not counted as active users, and only test users can be deleted through the test-user route, so a cleanup that goes wrong cannot take a real account with it. Your backend sees the mark: `user.test` is `true` on a test user's requests.

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

Each answered user carries `user_id`, `email`, `password` and, with `with_tokens`, `access_token`.

| Refusal | Why |
|---|---|
| `409 user_exists` | An email is already taken (nothing was made). |
| `409 test_user_cap_exceeded` | The batch would take the project past its test-user cap. |
| `400 invalid_request` | Neither a positive `count` nor complete `users`; a phone without its six-digit code. |

Send an `Idempotency-Key` header to make the creation safe to retry: the same key and the same request answer the first result again instead of creating twice. A fixture made with chosen emails is easy to make *if missing* — treat `409 user_exists` as "already there".

`PUT /admin/test-users/phone` (`adminSetTestUserPhone`) gives an existing test user, found by email, a verified phone and its fixed code; setting the same again succeeds, and an email that is not a test user's is `404 test_user_not_found`.

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

Deleting a test user is a user deletion like any other: it emits `user.deleted` (with `is_test: true`), so your backend forgets them as it forgets anyone ([Event Hooks](https://palbase.studio/docs/backend/hooks)), and storage objects owned by them go with them.

## Made for a test run

A test run makes the users its tests act as, and deletes them when it ends: `palbase test --users alice,bob` on your computer, a machine's `test_users` on the platform before each new build takes traffic. Each is a test user like these, at an address of the run's own, with its access token; a test acts as one with `api.signInAs("alice")` ([Testing](https://palbase.studio/docs/backend/testing#over-http-api-as-test-users)).

## From Studio

Studio's **Test accounts** tab under Authentication makes test logins, lists them, and searches them, for the environment you are in.

## Related

- [Authentication](https://palbase.studio/docs/backend/authentication) — `@User()`, `user.test`, and how a token is checked
- [Testing](https://palbase.studio/docs/backend/testing) — testing a backend, with and without a network
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — `createServer`, refusals and `Idempotency-Key`
- [Web Auth](https://palbase.studio/docs/web/auth) — signing in as one from an app
