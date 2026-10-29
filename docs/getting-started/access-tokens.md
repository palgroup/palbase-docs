> The full documentation index: https://palbase.studio/llms.txt

# Access Tokens

An **access token** lets a CI job or an agent act on an organization without a person signing in. It is set as the `PALBASE_TOKEN` secret of the job, and works the way a fine-grained personal token on GitHub or an access token on Vercel does, at the level of the organization.

Admins and owners manage tokens in Studio, under **Organization › Access tokens** (`/organizations/{id}/tokens`). Open the organization switcher at the top left and choose **Access tokens**, or choose it in an organization's left menu, or from **Access** in any of its environments. Members do not see them.

## Creating one

**Create token** asks for:

| Field | Meaning |
|---|---|
| Name | What the token is for, up to 100 characters on one line: `GitHub Actions` |
| Role | **Member** or **Admin**. Never owner |
| Expires after | 7, 30, 90 (the default), 180 or 365 days, or a number of days from 1 to 365 |

The token starts with `pbo_`. Studio shows it **once**, when it is created. Store it as your CI's `PALBASE_TOKEN` secret; you will not see it again. Afterwards the list shows only its last four characters, as `pbo_…a1b2`, with who made it, when it was made, when it expires and when it was last used.

If the answer to creating one is lost, Studio does not send the request again: it asks you to check the list. A token that was made but whose value was lost is deleted and made again.

## What a token can do

- It acts on the organization's projects and environments with its role: member or admin, never owner.
- An admin token opens projects and environments, registers a project's apps and sets them in each environment, and adds an environment's webhook endpoints — what a program that opens a project for each product does with no one signed in, as a Firebase service account adds an app.
- An admin token can get a CLI key. That key lives at most one day and appears in the environment's API keys as `CLI — token <name> (<host>)`.
- An admin token links a GitHub installation that another environment of the organization linked to an environment, with no GitHub sign-in: `POST /v1/environments/{ref}/github/installations` with `{ "installation_id": 123, "from": "<the other environment's ref>" }`. The environment reaches the repositories the GitHub user who linked it there can push to, and repositories created later that they can push to. With `"repositories": ["owner/name", …]` (the CLI's `github:connect --from <env> --repo owner/name`) it reaches those alone, and never one created later: what a program that opens a project for each product gives each product, so that one product's environment builds nothing of another's.
- An admin token mints [environment tokens](#environment-tokens).

## What a token cannot do

- It cannot do what only a person can: manage the organization, its members, roles and invitations, or tokens; create or revoke an environment's API keys; or reach Palbase's own environment.
- It never has more than its creator's **current** role. If the creator becomes a member, their admin tokens stop working at once. If the creator leaves the organization or is deleted, their tokens go with them.

## Deleting one

Deleting a token makes its next request fail, and the CLI keys it got are revoked. Deleting does not undo what the token did: the deploys it made and the settings it changed stay.

The webhook endpoints a token made stay too, and keep receiving events: an endpoint's secret signs what is delivered to it and opens nothing of the platform, so it belongs to its environment, as with Stripe's and GitHub's webhooks. Each endpoint names who made it in **Settings › Webhooks**, and when you delete a token Studio lists the endpoints it made, by address and environment, before you confirm (`GET /v1/orgs/{id}/tokens/{token}/webhooks`). Remove them in their environment if you no longer want them. API keys, which do open the platform, are made by a person only.

An expired token is marked **Expired** in the list and no longer works; delete it to tidy the list.

## Environment tokens

An **environment token** is for a program that works in **one** environment — an AI agent building one product — for a few hours, the way a GitHub App's installation token is for one installation. It starts with `pbe_`, and it is set as that program's `PALBASE_TOKEN`.

It is minted with `POST /v1/environments/{ref}/tokens`, by an admin of the organization (signed in, or with an admin access token) or with the environment's own **secret key** in the `apikey` header and no one signed in:

```json
{ "expires_in_minutes": 60, "name": "agent" }
```

Studio shows it **once**. It lives 60 minutes unless you ask otherwise, 240 at most, and never longer than the access token or key that minted it.

### What it can do

In its environment it does what the role of whoever minted it does there, as their own CLI would: an admin's token reads and changes the environment's machines, databases, users, flags, apps and webhooks, and sets its secrets. A token minted with the secret key acts as an admin. The role is read on every request, so a token never holds more than its minter holds now. Its changes appear in the organization's audit log under its name.

Outside its environment it does nothing. Another environment of the project answers `404`. The project itself and the organization answer `403 token_out_of_scope`, and so does anything that changes the project (its name, its apps, its environments). When it reads its project, it sees only its own environment.

**A full token of the admin role, or one minted with the secret key, is, in what it can reach, an admin of its environment.** It deploys machines, and the code it deploys runs with a secret key of the environment (`PALBASE_SECRET_KEY`, which the platform gives every machine) and reads the environment's secrets. What that code takes, it keeps after the token has ended. So:

- give a full token only to an agent you would trust as an admin of that environment;
- for narrow work, mint a token with [`scopes`](#narrowing-it): no scope deploys anything;
- the closed list below closes the routes that make or show a credential in their own answer, not what deployed code can do.

### What no environment token can do

These routes are closed to every environment token: each one makes an identity, or makes or shows a credential that would outlive the token, in its own answer. Everything else is open at the minter's role, deploying code included (see above).

They answer `403 token_out_of_scope` (or `person_only`), whoever minted the token, in Studio and at the environment's modules alike:

- mint a token: an environment token, or an organization's access token;
- create, revoke or list API keys, or take a CLI key;
- change the organization's members, roles or invitations;
- delete the environment or the project;
- link a GitHub installation from another environment;
- sign in as one of the environment's users, or make a password reset for one;
- set a user's password or email: create or import users, change a user's email (test users are its to make);
- create an OAuth client or a service account, rotate one's key, or change where an OAuth client's codes go;
- define a role, or give or take one from a user; make, change or remove an auth hook, whose claims go into every user's token, an app's role among them;
- create a database, or make new passwords for one: both answers show its passwords;
- read a secret's value, a task's payload (it may carry a token) or a coupon's one-time codes. Setting a secret is allowed;
- set or remove a sign-in provider's client secret, or change which apps' sign-ins with it the environment takes (its client ids);
- bring or remove a message provider (where the project's mail and texts are sent, and with whose credentials);
- override or remove a template that carries a sign-in or reset credential — a reset or magic-sign-in link, a verification or invitation link, a one-time code — on email, SMS or WhatsApp. The app's own notification templates stay open, so an agent still brands them.

The last three close the roundabout ways to a user's own credential: a sign-in provider's client of one's own, a message provider aimed at a server of one's own, or a reset template that tucks the link into one it fetches, would catch a sign-in the way signing in as the user would.

The sender's own settings stay open — a token sets the project's `from` address and reply-to (`/notify/settings`), and the site and redirect URLs a new product signs in against (`/admin/auth-settings`). These change where a link points, but no credential leaves unless the user follows the link themselves.

Each module refuses these itself, on the route it matched, so writing the path another way does not get past this list: an escape, a dot segment, other letter case or a slash at the end all name the same thing.

A link the token signs does not outlive it either. A signed download or upload URL, a package's upload link, a link to hand over an Apple or Stripe key, a signed bundle's download link and the link that connects GitHub all end no later than the token. The answer's `expires_at` says when.

Test users, and the sign-ins made for them, are open: they are test fixtures, and `auth:test-users` is for them.

### Narrowing it

`scopes` narrows a token to what they name, and nothing else is reached, a read as much as a change:

```json
{ "scopes": ["machines:read", "machines:logs", "auth:test-users"], "expires_in_minutes": 60, "name": "agent" }
```

| Scope | What it reaches |
|---|---|
| `machines:read` | The environment's machines, their builds, crons and queues (not a task's payload), contracts and metrics |
| `machines:logs` | A machine's logs and its builds' logs |
| `apps:sync` | What `palbase apps:sync` reads: the project's apps as they are in this environment, their client settings, the machines' contracts |
| `auth:test-users` | The environment's test users: made with their sign-ins, listed, deleted, their kept mail and texts read (`palbase auth:test-users:messages`), a sign-up address made (`palbase auth:test-users:address`). Not other users |
| `support` | A question to Palbase's support line (`palbase support:ask`, `POST /ai/support-questions`): an agent asks Palbase what it cannot find out, not the person it works for |

### When it stops working

It stops working when it expires, when it is revoked (`DELETE /v1/environments/{ref}/tokens/{id}`, by an admin, by a token of an admin's role, or by a narrowed token itself), and when what minted it no longer holds: the admin is no longer an admin, the access token is deleted, or the secret key is revoked (within a minute). `GET /v1/environments/{ref}/tokens` lists the live ones by their last four characters.
