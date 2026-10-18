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

The password is read from standard input, never from the command line. The account is made at once, with no email sent: share the password through a channel you trust. **Auth › Users › Create user** does the same. `POST /admin/users` takes `{ email, password, email_verified?, metadata?, skip_password_hibp? }`; it skips the self-service sign-up's rate limits and bot checks, but still holds the password to the environment's policy and, unless told not to, to the known-breaches check.

`PATCH /admin/users/{uid}` changes a user's `email`, `email_verified` and `metadata`. A new address is unconfirmed unless `email_verified` is sent with it, and one another user has is `409 user_exists`. `metadata` is merged into what the user has: a key set to `null` is removed.

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
