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

## A test user's data: `@TestUserTemplate`

A screen shows data: the list a user has, the account they blocked, the order in progress. A **template** writes that data for one test user — in your backend's own code, with its own tables — so a person or an agent signs in and sees the screen as a user who has it. It is the supported way to give a test account rows your API has no route to make, without a fixture route anyone could call and without touching the database by hand.

```ts
// src/db/public.ts — the table the screen lists: each user's notes, theirs alone.
import { defineSchema, defineTable, ownedByUser, text, timestamp, uuid } from "palbase/backend";

const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    title: text(),
    created_at: timestamp().defaultNow(),
  },
});

export default defineSchema("public", { tables: [notes] });
```

```ts
// src/notes/notes.template.ts
import { Database, TestUserTemplate, type TemplateUser } from "palbase/backend";

// A test account with notes to show: `palbase auth:test-users:create --template with-notes`
// makes the user and has this write its rows, for a person or an agent to sign in and see the list.
@TestUserTemplate({ name: "with-notes" })
export class WithNotes {
  async seed(user: TemplateUser) {
    await Database.public.notes.insertMany([
      { owner: user.id, title: "Buy milk" },
      { owner: user.id, title: "Call the bank" },
      { owner: user.id, title: "Water the plants" },
    ]);
  }

  // Run before the user is deleted (auth:test-users:delete): takes away what seed wrote.
  async undo(user: TemplateUser) {
    await Database.public.notes.deleteMany({ where: { owner: user.id } });
  }
}
```

```ts
// src/app.module.ts — a template is a provider: its module lists it.
import { Module } from "palbase/backend";
import { WithNotes } from "./notes/notes.template.ts";

@Module({ providers: [WithNotes] })
export class AppModule {}
```

```sh
palbase auth:test-users:create --template with-notes --token     # on the environment's only machine
palbase auth:test-users:create --template with-notes --machine notes --count 3
```

How it runs:

- **The contract.** A class with `@TestUserTemplate({ name })` — its name lowercase letters, digits, `_` and `-`, a letter first, at most 64 — and a `seed(user, meta)` method; `undo(user, meta)` is optional. `user` is `{ id, email }`; `meta` is `{ env, environmentId, template }` (the app's environment variables, its keys left out). Both are `palbase/backend`'s, as `TemplateUser` and `TemplateMeta`.
- **Test users alone.** The platform makes the user at auth as a test user, then calls the machine for it (`POST /_palbase/test-user-templates/<name>`, signed with the machine's key, as its crons are). Before `seed` runs, the framework asks auth whether the user is a test user: anyone else is refused, `403 not_a_test_user` — in production too.
- **One transaction, as the service role.** `seed` writes everything or nothing; row-level security does not stop it, so it writes rows a user's own session could not (another user's, a moderation table's). A throw is the template's failure.
- **Its answer.** Each user is answered with the rows written, by table (`notes 3`), and the commit whose code wrote them — or why its template was not written: `no_template`, `not_a_test_user`, `template_failed`, `template_timeout` (a template has 60 seconds), `machine_unavailable`. A user whose template was not written is not left behind (below), and the command ends with 1. Asked again for the same user and template (`palbase auth:test-users:template <user> <template>`), the platform answers what was written then: `seed` never runs twice for them.
- **Cleanup.** `palbase auth:test-users:delete <id>` deletes a user made with a template through the machine that made it: each template's `undo` runs first, and an `undo` that fails keeps the user, to be deleted again. Without an `undo`, the user's deletion is the cleanup — what `ownedByUser()` owns goes with the user (`user.deleted`). Give a template an `undo` when it writes rows that are not owned that way: a plain text column naming the user, a row naming two users (a block between two accounts). Deleted at auth directly (`adminDeleteTestUser`), no `undo` runs.
- **Who may.** Your role, or an environment's token with `auth:test-users` (`palbase env:tokens:create --scope auth:test-users`): it makes users with a template, writes one again and deletes them, and lists the machines to find the one a template is on. At most 10 users at once with a template. The API is `POST /machines/{name}/test-users` (`{ count, template, with_tokens }`).

### Right after a push: the command waits for the new code

A template you just added lives in the commit you just pushed, and the machine — or the pull request's preview — answers from the code it **serves**. While the new build is asked for, waiting for its checks, queued, building, testing, or rolling out, the version before still serves, and it has no such template — an asleep preview, too, wakes on the code it ran and rolls the new one out after (the call wakes it). So the platform makes no user then: `POST /machines/{name}/test-users` answers `409 build_in_progress`, naming the build, its commit and where it is.

`palbase auth:test-users:create --template` waits for you: it follows the build (`build 0123abcd (abc1234): building`, `testing`, `succeeded, rolling out`, `succeeded, serving`) and makes the users once the new code serves, 30 minutes at most. A build that fails makes no user (`build_failed`, with the `machines:builds:log` to read), and one waiting for the variables its `.env.example` names says which (`build_waiting_config`). `auth:test-users:template` waits the same way. Called through the API, the `409` carries the build as data too (`build: { id, commit, state }`, `retry_after`): ask again once it serves. A call is answered once its users' templates were written — a minute each at most — with nothing sent meanwhile: ask for one user a call, as the CLI does (`count: 1`), so that no connection waits minutes in silence. A connection cut while it waits leaves no user behind, but tells you nothing either.

`--count` makes the users one after another. A push that lands meanwhile is waited for like the first, so the users made after it have the newer code's data — each user's `commit` says whose. A failure the next user would meet too (`no_template`, `template_failed`, `not_a_test_user`) ends the run at once.

The wait starts when Palbase hears of the push. Run in the very second after `git push`, before GitHub has told Palbase, the command finds no build on its way and the code serving answers: a template only the new commit has is `no_template`, its error naming the commit that answered — older than yours — and no user is left. Run it again a moment later.

### A user is made with its template or not at all

A test user whose template was not written is deleted again in the same call: no account is left without the data it was made for. Its answer says `deleted: true`, carries no password, and its template's `error` says why — `no_template` names the build and commit that answered and the templates that code has (`This version has no test user template "bankng" — it has: banking, onboarding`), `template_failed` the program's own error.

The command ends with 1, prints why and what to run next for each user on stderr, and with `--json` puts the same at the top of its answer:

```json
{
  "machine": "notes",
  "users": [{ "user_id": "…", "email": "bankng.1f2e3d4c1@test.invalid", "deleted": true,
              "template": { "name": "bankng", "error": "no_template: build 0123abcd (commit abc1234) answered: …", "commit": "abc1234…" } }],
  "error": { "code": "no_template", "message": "1 of 1 test user(s) not made with notes's template bankng: none was kept" }
}
```

A user is kept for now in two cases, its error saying which and naming the command that deletes it: the program may have written the template although it did not say so — it did not answer in 60 seconds, its connection ended once made, or it answered what a template does not — and its `undo` could not be run; or auth could not delete the user at that moment. The platform asks the `undo` again after an hour or so — then ever further apart, giving up on the `undo` after a day — and deletes such a user. The work for the users made goes on to its end even when the command is stopped or its connection drops, and users whose sign-ins no one saw — the command gone before its answer — are undone and deleted too: a stopped command leaves no user behind.

While such a template's outcome is not known, `auth:test-users:template` for it answers `template_in_progress` and writes nothing: asked again then, the two calls could cross.

### Where a test user came from

- **Its address** says how it was made: `<template>.<8 hex><n>@test.invalid` by `auth:test-users:create --template <template>`; `signup-…@test.invalid` by a sign-up with an [`auth:test-users:address`](#testing-a-sign-up); a run's own address by `palbase test` or a machine's `test_users` (deleted when the run ends); any other made one by `auth:test-users:create` without a template. `palbase auth:test-users:list` lists them all, each with `is_test: true`.
- **Its machine.** A test user made with a template is the machine's that made it — `<name>` or a preview's `<name>-pr<number>`: only that machine writes another template for it or deletes it through its `undo`.
- **Its code.** The answer names the build and commit that wrote each template. Asked again (`palbase auth:test-users:template <user> <template>`) after you changed the template and pushed, the answer is still what was written then — `seed` runs once for a user — and it says so: `written by commit aaaaaaa; the machine serves commit bbbbbbb now`. Make a new test user to have the new template's data.

### Deleting one test user

`palbase auth:test-users:delete <user-id>` deletes that user and nothing else. Without `--machine`, the environment's machines are asked which made it; with `--machine <name>` only that one is (a user another machine made is refused, not deleted). Each template's `undo` runs before the user goes. An `undo` that did not run is a warning, the user deleted all the same — the template has no `undo`, or the code serving now no longer has the template (you removed it and pushed): `warning: the undo of template banking did not run: …`. What it wrote is then left to the user's `user.deleted`. With `--json`, `undo` lists each template with `ran` and, when it did not, its `note`; through the API, `DELETE /machines/{name}/test-users/{user}` answers it with `Prefer: return=representation` (`204` without).

Deleting a machine leaves the test users it made with a template: their data is in the environment's database, which stays — a pull request's preview is the exception, its own database going with it. Such a user is still listed, and `palbase auth:test-users:delete <id>` without `--machine` deletes it through auth, its `user.deleted` cleaning up after it.

## In a pull request's preview

A machine's [pull request preview](https://palbase.studio/docs/machines/hosting#pull-request-previews) is a machine of the same environment, `<name>-pr<number>` (as `palbase machines:list` shows it), and it signs in **the environment's users**: a test user made in the environment — with `palbase test`, `auth:test-users:create` or the secret key — calls the preview with its token as it calls the machine. Its address is `https://<name>-pr<number>-<ref>.app.palbase.studio`.

The preview's database is its own (`<database>-pr<number>`) and starts empty. A template written on the preview fills it — the pull request's code, the pull request's tables, the environment's database never touched:

```sh
palbase auth:test-users:create --template with-notes --machine notes-pr7 --token
curl -H "authorization: Bearer <its access token>" https://notes-pr7-<ref>.app.palbase.studio/notes
palbase auth:test-users:delete <its id>      # the preview's undo runs, then the user goes
```

When the pull request is closed or merged — or the preview is taken down for want of a push — its machine and its database go, and so do **the test users it made with a template**: their data was in that database. They leave `palbase auth:test-users:list` within minutes of the preview's machine going. A test user made on the environment's own machine stays until you delete it.

In production's environment (`main`) these commands ask for a yes: `-y` gives it, and with an environment's token `-y` is the only one. With `--json`, a refusal is printed as JSON on stdout and as a line on stderr.

## From Studio

Studio's **Test accounts** tab under Authentication makes test logins of the kind a sign-in asks for, lists and searches them, shows each one's **Messages**, and makes a **Sign-up address**, for the environment you are in.

## Related

- [Authentication](https://palbase.studio/docs/backend/authentication) — `@User()`, `user.test`, and how a token is checked
- [Testing](https://palbase.studio/docs/backend/testing) — testing a backend, with and without a network
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — `createServer`, refusals and `Idempotency-Key`
- [Web Auth](https://palbase.studio/docs/web/auth) — signing in as one from an app
