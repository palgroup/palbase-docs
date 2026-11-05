> The full documentation index: https://palbase.studio/llms.txt

# Users & Roles

An environment's users are its auth module's: each has an id (`usr_…`), and any of an email address, a phone number, a password, linked provider accounts, passkeys and second factors. People make their own accounts from your app ([Web Auth](https://palbase.studio/docs/web/auth)). This page is about the other side: finding them, helping them, stopping them, and the roles your app gives them.

## Finding a user

Studio's **Auth › Users** lists the environment's users, newest first: their address or phone, whether they are active or banned, a test user, or have a second factor, which addresses are confirmed, when they signed up and last signed in. **Account status** shows the banned alone. A user's page has their contact details, how they sign in, their second factors, their sessions and their metadata, and the actions below.

```sh
palbase auth:users:list --limit 500
palbase auth:users:list --banned
palbase auth:users:get usr_01J…
```

`auth:users:get` adds how they sign in and the roles they hold. From a server, `GET /admin/users` pages through them (`limit`, `cursor`, `banned`) and `GET /admin/users/{uid}` reads one, with the email and phone in clear.

## Making one

```sh
palbase auth:users:create ada@example.com --verified < password.txt
```

The password is read from standard input, never from the command line. The account is made at once, with no email sent: share the password through a channel you trust — or invite the person, and they choose it ([Inviting someone](#inviting-someone)). **Auth › Users › Create user** does the same. `POST /admin/users` takes `{ email, password, email_verified?, metadata?, skip_password_hibp? }`; it skips the self-service sign-up's rate limits and bot checks, but still holds the password to the environment's policy and, unless told not to, to the known-breaches check.

`PATCH /admin/users/{uid}` changes a user's `email`, `email_verified` and `metadata`. A new address is unconfirmed unless `email_verified` is sent with it, and one another user has is `409 user_exists`. `metadata` is merged into what the user has: a key set to `null` is removed.

## Inviting someone

An invitation makes an account for a person and lets them choose its password: how your server adds its staff, or an admin a colleague. Palbase emails them a link; they open it, set the password on a page Palbase serves at the environment's own address, and sign in with it from your app. It is `POST /admin/users/invite`, with the project's secret key:

```ts
// staff.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const { status, data } = await palbase.auth.adminInviteUser({ body: { email: "cashier@example.com", metadata: { shop: "kadikoy" } } });
// 201: an account made, invited — data.user.invited is true, data.invitation.expires_at seven days on
// 200: the address was invited before and had not taken it up: invited again (data.invitation.again)
await palbase.auth.adminAssignUserRole({ path: { uid: data.user.id, role: "cashier" } });
```

On a Palbase machine the same call is `Palbase.auth.adminInviteUser` ([Authentication](https://palbase.studio/docs/backend/authentication)). The body is `{ email, metadata?, locale?, redirect_to?, send_email? }`, and what it does is the account the address has:

| The address | What happens | Answer |
|---|---|---|
| has no account | An account is made for it, invited: it has no password, and cannot sign in with one, until the person sets it from the link. The link is emailed. | `201` |
| has an account invited that has not taken it up — no password set, never signed in, not banned | It is invited again: a new link is sent, the earlier ones no longer open it, and its seven days start now. The `metadata` sent is merged into the account's. | `200`, `invitation.again: true` |
| has any other account | Refused: `409 user_exists`, with the account's `user_id` and `email_verified`. Nothing is sent, and the account is left as it is — its password above all. Give it what you invited it for yourself, a role with `adminAssignUserRole` — **only when `email_verified` is true**: an account whose address is not confirmed was made by whoever typed the address, who may not own it. | `409` |

This is how Supabase's `inviteUserByEmail`, Firebase's `createUser` and Cognito's `AdminCreateUser` treat an address: an account the person already owns is never invited over, and an invitation not taken up is sent again.

### An invitation's life

1. **Invited.** The user has `invited: true` and an `invited_at` (Studio's **Users** shows *Invited*). Roles can be given to it already; it holds those you give it — a sign-up's default roles are a sign-up's.
2. **The email names your app, and the link lives seven days.** It reads "**Koz** invited you to join. *Accept the invitation* and choose your password" ("Koz sizi davet etti. *Daveti kabul et* …" in Turkish) — your app's name is the [auth settings](https://palbase.studio/docs/auth/overview#your-apps-name)' `app_name` (`palbase auth:settings:set app_name=Koz`, or **Auth › Settings › Your app**); without one it says "An app invited you". The link opens Palbase's page at the environment's address, in the email's language (`locale`, else the environment's): its title names the app ("Join Koz"), the address the invitation was sent to is shown in a field that cannot be changed, and the person chooses the password — held to the environment's password policy and the known-breaches check. A link that opens nothing — expired, replaced by a later invitation, already taken up — says so as the page opens, before any password is typed.
3. **Taken up.** The password is set and the address confirmed (`email_verified`), and `invited` is false. The person signs in with their email and that password. `auth.invitation.accept` is in the audit log; the invitation itself is `admin.invite`.
4. **Expired or replaced.** A link older than seven days says it has expired; one that a later invitation replaced says it is not valid, and one opened after the account is set up says so. Invite the address again for a new link. **The account stays when its link expires**: whoever owns the address can still take it up another way that proves the address — a password reset, a sign-in link — with the roles it was given.
5. **Taken back.** An invitation is withdrawn by deleting its account (`DELETE /admin/users/{uid}`, `palbase auth:users:delete`): an invitation sent to a wrong address is taken back so, not by letting it expire. A banned account takes no invitation up.

A role that matters — staff, an admin of your app — can be given once the invitation is taken up (`invited` false), rather than with the invitation: until then, the account is whoever owns the address you typed.

The person may take it up another way that proves the address — a password reset, a sign-in link — and the account is theirs from then: inviting it again is then `409 user_exists`.

An invitation to an address made for a test (`palbase auth:test-users:address`, [Test Users](https://palbase.studio/docs/backend/test-users)) opens a test user, as a sign-up with it does: nothing is sent, the invitation's mail is kept in its test inbox (`palbase auth:test-users:messages <user-id>`, the link among its variables as `accept_link`), and a test takes the invitation up from there. Another address no mail reaches (`.invalid`) is refused, `400 email_undeliverable`.

### Sending the link yourself, or your own page

`send_email: false` sends nothing: the answer carries the link as `invitation.accept_url`, for you to deliver — a text message, your own mail. It sets the account's password, so give it to the person alone.

`redirect_to` — a page of your app's, on the redirect allow-list (`additional_redirect_urls` in the [auth settings](https://palbase.studio/docs/auth/overview)) — is where the link opens instead of Palbase's page. It receives `?token=`, and sends it with the password the person chose to `POST /auth/invitations/accept` (`{ token, password }`, with the publishable key); they then sign in. The email itself is the environment's `auth.user_invitation` template (**Auth › Templates**).

### From the terminal and Studio

```sh
palbase auth:users:invite cashier@example.com              # emails the link
palbase auth:users:invite cashier@example.com --no-email   # prints it, sending nothing
```

`--redirect-to` and `--locale` are the call's `redirect_to` and `locale`. In Studio, **Auth › Users › Invite user** sends the same invitation.

An invitation makes an identity, as making a user with a password does: an environment's token (an agent's or CI's) is refused it, `403 token_out_of_scope`. The project's secret key on your server, a person's own CLI session and Studio make it.

## Knowing a password was changed

A backend that must know a user set their password — a staff account given a temporary one, unlocked once it is changed — asks Palbase, not the app: an app's "I changed it" can be sent by anyone who signed in. Better still, give no temporary password: [invite](#inviting-someone) the person, and the password is theirs from the first.

- **The user's `password_changed_at`** (`GET /admin/users/{uid}`, `adminGetUser`): when their password was last set — the account made with it, changed, reset, set first, or an invitation taken up. A temporary password you set at a time is changed when `password_changed_at` is later than it. A sign-in that rehashes the same password does not move it; an account with no password, or one imported from another system, has none.
- **`user.password_changed`** ([Webhooks](https://palbase.studio/docs/server/webhooks#the-events), `@On` in a backend): sent when the user's password is set by its owner, with `{ user_id, changed_at, method, is_test }` — `method` is `change`, `reset`, `set` or `invitation`. The backend unlocks the account there, with nothing asked of the app.
- **The audit trail** (`GET /admin/audit?user_id=…&event_type=auth.password.change`): that user's password changes, newest first — each `result` `success` or `failure` ([Audit Trail](https://palbase.studio/docs/auth/audit#reading-it)).

```ts
// src/modules/staff/password-changed.ts
import { Database, Injectable, On, type WebhookEvent } from "palbase/backend";

@Injectable()
export class PasswordChanged {
  // A staff account given a temporary password is unlocked once its owner set one of their own.
  @On("user.password_changed")
  async unlock(event: WebhookEvent<{ user_id: string; changed_at: string; method: string }>): Promise<void> {
    await Database.$asService().$query("update staff set must_change_password = false where user_id = $1", [event.data.user_id]);
  }
}
```

## Helping someone back in

| Studio (the user's page) | CLI | Admin call | What it does |
|---|---|---|---|
| **Create reset token** | — | `POST /admin/users/{uid}/reset-password` | A one-hour password reset token, answered to you, with no email sent. The person sets a new password with it (`pb.auth.password.confirmReset(token, …)`). |
| **Reset MFA** | — | `DELETE /admin/users/{uid}/mfa` | Removes every second factor and recovery code, for someone who lost their authenticator: they sign in with their first factor and enroll again. |
| **Revoke all sessions** | `auth:users:sign-out` | `POST /admin/users/{uid}/sessions/revoke-all` | Ends every session: each device signs in again. |
| — | — | `POST /admin/users/{uid}/credentials/revoke-all` | Ends every session and refresh token, and revokes the user's attested and trusted devices and pending transactions, at once. The account stays. |

## Banning

```sh
palbase auth:users:ban usr_01J… --reason "chargeback fraud"
palbase auth:users:unban usr_01J…
```

A banned user's sessions end, and their sign-ins are refused with `403 user_banned` until they are unbanned. The reason is kept as `ban_reason`, and Studio shows it. **Ban user** and **Unban user** on the user's page do the same; the admin calls are `POST /admin/users/{uid}/ban` (`{ reason? }`) and `POST /admin/users/{uid}/unban`.

The environment can ban idle accounts by itself: `inactive_user_days` in the [auth settings](https://palbase.studio/docs/auth/overview#sessions-and-tokens).

## Sessions

Studio's **Auth › Sessions** lists the environment's live sessions: whose, the device and browser, the address, the authentication level, when each started and was last used. One can be revoked there. From a server, `GET /admin/sessions` (with `user_id` for one user's) and `DELETE /admin/sessions/{id}`.

Revoking a session deletes its refresh tokens, so it is never renewed. An access token it already issued is valid until it expires, but a `palbase/backend` app stops taking it within 15 seconds ([How the token is verified](https://palbase.studio/docs/backend/authentication#how-the-token-is-verified)). Backends hear `session.ended`.

## Deleting a user

```sh
palbase auth:users:delete usr_01J…
```

The user and everything auth holds for them go in one step: sessions, tokens, second factors, passkeys, linked providers, consents, roles. It cannot be undone. The project's other modules delete what is the user's too (a file stored with their `owner_id`, their flag values, their devices and messages), and your backends hear `user.deleted` to delete what is theirs in your own tables ([Event Hooks](https://palbase.studio/docs/backend/hooks)). **Delete user** on the user's page, and `DELETE /admin/users/{uid}`, do the same. A person deletes their own account from your app with `deleteAccount` ([Web Auth](https://palbase.studio/docs/web/auth#signing-out-and-deleting-the-account)).

## A user's own data

```sh
palbase auth:users:export usr_01J… --out ada.json
```

Everything auth holds about one person, as they may ask for it under the GDPR (articles 15 and 20), as JSON: their profile with the email and phone in clear, linked providers, sessions, consents, second factors, passkeys, devices, and their part of the audit trail. It holds no secrets: no password hash, no factor secret, no token. The export is itself recorded in the [audit trail](https://palbase.studio/docs/auth/audit). The file `--out` writes is readable by you alone. **Export user data** on the user's page, and `GET /admin/users/{uid}/export`, answer the same.

## Roles

A role is a name your app gives users, with the permissions it stands for. Roles are defined in the environment and given to users with the secret key; your code decides what they allow.

```sh
palbase auth:roles:set editor --permissions posts.publish,posts.delete_any --description "Edits everyone's posts"
palbase auth:roles:set member --permissions posts.write --default yes
palbase auth:roles:list
palbase auth:roles:delete editor --force
```

- A role's name is lowercase letters, digits and `_`, 64 at most. `anon`, `authenticated`, `service_role` and names starting `backend_` are the platform's.
- A permission is `resource.action`: lowercase, one dot, no wildcard (`posts.delete_any`). `--permissions` replaces the role's list; `""` empties it. Users who hold the role have the new list at once.
- `--default yes` gives the role to every new user. One role at most is the default.
- A role users hold is deleted only with `--force`, which takes it from them; without it the answer is `409`.

There is no CLI command that gives a user a role: that is your app's decision, made from your server.

| Admin call | What it does |
|---|---|
| `PUT /admin/users/{uid}/roles/{role}` | Gives the user the role. A role that is not defined is `400 role_not_defined`. |
| `DELETE /admin/users/{uid}/roles/{role}` | Takes it from them. |
| `GET /admin/users/{uid}/roles` | The roles they hold. |
| `PUT /admin/roles/{name}`, `DELETE /admin/roles/{name}` | What `auth:roles:set` and `auth:roles:delete` call. |

The roles a user holds are in the `user` of every sign-in answer, as `roles`, not in their access token. A backend asks for them where it decides (the [Roles](https://palbase.studio/docs/backend/authentication#roles) section of Authentication shows how), and hears `user.permissions_changed`, with the user's whole permission list, each time a role is given, taken or changed. `palbase types:pull` writes the environment's role names into `palbase/palbase-env.d.ts`.

## Bringing users over

`auth:import` brings users from another Palbase project, or from any source written as import bodies, with what they sign in with, so they notice nothing:

```sh
palbase auth:import users.ndjson --pepper-stdin < pepper.txt
palbase auth:import ./export/        # users-0001.json, users-0002.json … in order
```

A file is one import body (`{ "hash": { … }, "users": [ … ] }`, with no pepper in it), JSON lines with a user a line, or one JSON array of users. Each user keeps:

| Field | What is kept |
|---|---|
| `id` | Their id, `usr_` and a lowercase UUID. |
| `email`, `phone`, `email_verified`, `phone_verified`, `email_confirmed_by` | Their addresses, and who confirmed the email (`email`, `admin`, `google`, `apple`). |
| `password_hash`, `recovery_code_hashes` | Their password and recovery codes, as the source hashed them: `palbase-argon2id` only. Verified with the source's pepper until the user's next sign-in hashes the password again with this environment's. |
| `identities` | Their linked provider accounts: `provider` and the provider's `subject`. |
| `mfa_factors` | Second factors, at most one of each type: an authenticator app's secret, a phone, an email. |
| `passkeys` | Their WebAuthn credentials. A passkey signs in here when the environment's passkey host is the one it was registered for. |
| `sessions` | Their open sessions: the refresh token their app holds goes on working, here. An ended session, or a banned user's, is left behind. |
| `metadata`, `locale`, `banned`, `ban_reason`, `created_at`, `last_login_at` | As they were. |

The source's pepper, which the hashes were made with, is read from standard input (`--pepper-stdin`), never from a file or the command line. Auth keeps it sealed and uses it only to verify.

Users go 1000 to a call, and each is written whole or not at all. One user refused does not stop the others: the command lists each by id and why. A user whose id, address, phone, provider account, passkey or session the environment already has is refused (`user_exists`, `email_exists` …), never overwritten, so running the same import again writes only what the first run did not. The admin call is `POST /admin/users/import`, 1000 users and 1 MiB a call.

## Test users

Accounts made for tests, marked `test: true` in their tokens and left out of the counts, are [Test Users](https://palbase.studio/docs/backend/test-users): `palbase auth:test-users:create`, and Studio's **Auth › Test accounts**.

## Related

- [Overview](https://palbase.studio/docs/auth/overview): the environment's auth settings
- [Audit Trail](https://palbase.studio/docs/auth/audit): what was done to each user, and by whom
- [Authentication](https://palbase.studio/docs/backend/authentication): the user in a backend route
- [Webhooks](https://palbase.studio/docs/server/webhooks): `user.deleted`, `session.ended` and the other events
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-authuserslist): the `auth:users:*` commands
