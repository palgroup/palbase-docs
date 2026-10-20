> The full documentation index: https://palbase.studio/llms.txt

# CLI reference

Every command of `palbase` 0.10.2 — the CLI in the `palbase` npm package — as its own help prints it. Run it with `npx palbase <command>`, or `palbase <command>` once the package is installed; `palbase help <command>` prints the same in a terminal. Signing in, choosing an environment and using a token in CI are in [the CLI overview](https://palbase.studio/docs/cli/overview).

287 commands in 24 groups.

## Global flags

Every command takes these.

```text
  -P, --project <project>  the project (name or id; org/project when the name is in two organizations)
  -E, --env <env>          the project's environment (slug or ref)
      --json               print the answer as JSON
      --non-interactive    never ask: refuse what would need a question
  -y, --yes                confirm a change to a production environment without asking
      --debug              print each request the command sends
  -h, --help               show help
```

## General

### `palbase login`

Sign in with your Studio account

```sh
palbase login
```

Shows a one-time code and opens Studio, where you approve it while signed in there.
The CLI then holds a session of yours: Studio lists it with your others, and ending it there signs the CLI out.
On a machine with no browser (a server, an agent), open the address it prints on any device.

```text
      --no-browser  print the address instead of opening a browser
```

### `palbase logout`

Sign out: the session is ended at Palbase and forgotten on this computer

```sh
palbase logout
```

### `palbase whoami`

The account the CLI acts as, and the environment chosen for this directory

```sh
palbase whoami
```

### `palbase use`

Choose the environment this directory acts on (kept on this computer)

```sh
palbase use [<project>[/<env>] | <org>/<project>/<env>] [--clear]
```

Commands run in this directory, or a directory under it, then act on that environment unless -P/-E say otherwise.
Nothing is written into the project: two checkouts of it can each act on their own environment.
With no argument and a person at the terminal, it lists your environments to pick from.

```text
      --clear  forget the choice made for this directory
```

### `palbase status`

The environment this directory acts on: who you are there, its machines and databases

```sh
palbase status
```

### `palbase open`

Open the environment in Studio (its overview, or a section: auth, storage, flags, …)

```sh
palbase open [section]
```

### `palbase init`

Start a backend on palbase/backend here (or in `<dir>`): a health route, its module, its tests, a Dockerfile; --db adds a schema, its routes and their test

```sh
palbase init [dir] [--db] [--print]
```

Nothing already there is written over: a file init would write that exists stops it, naming the file.
--db's table is typed in palbase/palbase-env.d.ts by the block palbase db:types writes of the schema: run db:types again when you change it.
--print writes nothing: it prints the files as JSON ({ name, db, version, files: { `<path>`: `<text>` } }), for a program that seeds a repository with this release's starter (bunx `palbase@<version>` init --print `<name>` --db).
Then: bun install, palbase use `<project>/<environment>`, palbase env:pull, bun dev.
Its tests: bun test (here, no app); palbase test --users alice,bob --base-url http://localhost:8080 -- bun test ./tests (against the app you started, as test users made for the run); on the platform, palbase machines:update `<name>` --test-command "bun test ./tests" --test-users alice,bob runs them against each new build before it takes traffic.

```text
      --db     with a database: a schema file (a table each user reads alone) and its routes
      --print  print the files as JSON, write nothing ([dir] names the package)
```

### `palbase strings`

Keep the app's translations (palbase/strings/) with its code: each t("…") a sentence, every language's file with it

```sh
palbase strings [--source <language>] [--add <language>] [--translate] [--prune]
```

Reads every t("…") the backend's source calls — imported from palbase/backend, or from a module of the app that re-exports it — in the app's directory (the nearest one up with a package.json). A sentence new in the code is added to each language's file, empty: t() answers it in the source language until it is translated. A translation is kept.
A sentence the code no longer calls is kept and listed; --prune takes it out of every file. A call it could not follow (a t from a module it does not read, a linked directory) is said, where.
palbase/strings/_meta.json names the source language (the one the sentences are written in); each other language is `palbase/strings/<language>.json`, "sentence": "translation". Edit them as any file of the app.
--translate has the environment's ai module translate what is empty (the project's AI use, as any other: its cost is in the AI usage; production's asks first). A translation is used as it is written; correct it in the file.
A table in the earlier format (version 2) is written in this one.

```text
      --source <language>  the language the sentences are written in, for a table not made yet (tr, en, pt-BR)
      --add <language>     a language to translate into: its file is made (may be given more than once)
      --translate          translate what is empty, with the environment's ai module (-P/-E, or palbase use)
      --prune              take the sentences the code no longer calls out of every file
```

### `palbase run`

Run a command with the environment's address and your own key in its environment, nothing written to disk

```sh
palbase run [--secrets development|production] -- <command> [args…]
```

palbase run -- bun dev, palbase run -- npm test: the app reads the project's secrets at boot (PALBASE_SECRETS).

```text
      --secrets <set>  the project's secrets the app reads at boot: development (default) or production
```

### `palbase test`

Run the backend's tests as the platform does before a build goes out: test users made for the run and deleted after, `PALBASE_TEST_*` in the command's environment

```sh
palbase test [--machine <name>] [--users <names>] [--base-url <url>] [--secrets development|production] [-- <command> [args…]]
```

palbase test --machine backend --base-url http://localhost:8080: the machine's own test command and test users, as the platform runs them before each build of it rolls out.
palbase test --users alice,bob --base-url http://localhost:8080 -- bun test: api.signInAs("alice") acts as a test user made for this run.
The command gets what palbase run gives it, and PALBASE_TEST_AUTH_URL (the environment's address), PALBASE_TEST_IDENTITIES (the run's test users, each with its token) and, with --base-url, PALBASE_TEST_BASE_URL (where the app under test answers; without it HTTP tests skip themselves).
The test users are deleted when the command ends, however it ends — Ctrl-C too: the command is stopped, they are deleted, and palbase test ends as the signal would have.

```text
      --machine <name>  a machine whose test command (when no command is given) and test users (when --users is not) are run
      --users <names>   the test users to make for the run, comma-separated
      --base-url <url>  where the app under test answers (http://localhost:8080)
      --secrets <set>   the project's secrets the app reads at boot: development (default) or production
```

## `env`

### `palbase env:pull`

Write what the backend needs to run here into .env.local: the environment's address and your own key — no secret's value

```sh
palbase env:pull [--file <path>] [--secrets development|production]
```

The app reads the project's secrets at boot (PALBASE_SECRETS); their names are listed as comments: set one in the file to override it.
The key is yours (CLI — you (this computer)), good for 30 days, made again by env:pull and run; palbase logout revokes it.
Only the block between the palbase markers is written; the rest of the file stays as it is.

```text
      --file <path>    the file (default .env.local)
      --secrets <set>  the project's secrets the app reads at boot: development (default) or production
```

### `palbase env:tokens:list`

The environment's live tokens, by their hint (never their values)

```sh
palbase env:tokens:list
```

### `palbase env:tokens:create`

Mint a token of the environment for a program (an AI agent): your role in this environment alone, a few hours; shown this once

```sh
palbase env:tokens:create [--scope <scope>[,<scope>]] [--minutes <n>] [--name <name>]
```

It does in this environment what your role does — as your own CLI would — but never makes or shows a standing credential (a key, a token), changes people or roles, or deletes a project or an environment; nothing beyond this environment.
--scope narrows it to: machines:read, machines:logs, apps:sync, auth:test-users — machines:read reads the machines, their builds, crons and queues; machines:logs their logs; apps:sync what palbase apps:sync reads; auth:test-users makes and deletes test users.
Give it to the program as PALBASE_TOKEN: the CLI acts in this environment alone with it. It ends after --minutes (default 60, at most 240), and with what minted it.

```text
      --scope <scope>  narrow it to: machines:read, machines:logs, apps:sync, auth:test-users (comma-separated, or given again); none: your role
      --minutes <n>    how long it lives (default 60, at most 240)
      --name <name>    what it is for, as the environment lists it
```

### `palbase env:tokens:revoke`

Revoke an environment's token (by its id; with PALBASE_TOKEN an environment's token, `self` revokes it): refused from its next request on

```sh
palbase env:tokens:revoke <id|self>
```

## `types`

### `palbase types:pull`

Write the environment's secret, flag, bucket and role names into palbase/palbase-env.d.ts as types: Secrets.get, Flags and Storage.buckets take them and no other

```sh
palbase types:pull [--file <path>]
```

The names of the production secrets — what the machines start with, and so what Secrets.get reads there; development's are a developer's — leaving out what the platform sets itself (PALBASE_SECRET_KEY …), every flag, each bucket with its renditions (`Storage.buckets.<name>.getPublicUrl(path`, { variant })) and every role — never a value.
Only the block between the palbase:stack markers is written; the rest of the file stays as it is. Run it again when a name is added or taken away.

```text
      --file <path>  the file (default palbase/palbase-env.d.ts)
```

## `orgs`

### `palbase orgs:list`

Your organizations and your role in each

```sh
palbase orgs:list
```

### `palbase orgs:create`

Make an organization; you are its owner

```sh
palbase orgs:create <name>
```

### `palbase orgs:members:list`

An organization's members, and the invitations still open (for its admins)

```sh
palbase orgs:members:list
```

```text
      --org <org>  the organization (name or id); needed when you are in more than one
```

### `palbase orgs:members:invite`

Invite someone to an organization by email; they accept in Studio

```sh
palbase orgs:members:invite <email> [--role admin|member]
```

```text
      --org <org>    the organization (name or id)
      --role <role>  admin or member (default member)
```

### `palbase orgs:members:remove`

Take a member (by email or user id) or an open invitation out of an organization

```sh
palbase orgs:members:remove <email|user-id>
```

```text
      --org <org>  the organization (name or id)
```

### `palbase orgs:audit`

Who changed what at an organization's environments, through Studio or the CLI, newest first — its admins'

```sh
palbase orgs:audit [--org <org>] [--limit <n>]
```

A module keeps a change made through Studio as Studio's key's: this says whose it was. What was sent is not kept.

```text
      --org <org>  the organization (name or id)
      --limit <n>  how many at most (default 50)
```

## `tokens`

### `palbase tokens:list`

An organization's access tokens (PALBASE_TOKEN for CI and agents): name, role, when they end and were last used — never their values

```sh
palbase tokens:list
```

```text
      --org <org>  the organization (name or id)
```

### `palbase tokens:create`

Make an access token of an organization for CI or an agent; its value is shown this once

```sh
palbase tokens:create <name> [--role member|admin] [--days <n>]
```

Give it to the CI as the secret PALBASE_TOKEN: the CLI acts with it in place of a sign-in. It reaches its organization's projects and environments at its role, and nothing of its people or tokens.
It ends after --days (default 90, at most 365), and goes when it is revoked or when the one who made it leaves the organization.

```text
      --org <org>    the organization (name or id)
      --role <role>  member (default) or admin: what it may change
      --days <n>     how many days it is good for (default 90)
```

### `palbase tokens:revoke`

Revoke an organization's access token (by its name or id): refused from its next request on

```sh
palbase tokens:revoke <name|id>
```

```text
      --org <org>  the organization (name or id)
```

## `projects`

### `palbase projects:list`

Every project of your organizations, with its environments

```sh
palbase projects:list
```

### `palbase projects:create`

Make a project with its first environment (main), and print its keys

```sh
palbase projects:create <name> [--org <org>] [--env-name <name>]
```

The first environment is the project's production one: its slug is always main.
Its secret key is printed this once; keys:create makes more.

```text
      --org <org>        the organization (name or id)
      --env-name <name>  what the first environment is called on screen (default Production)
```

### `palbase projects:delete`

Delete a project and every environment of it

```sh
palbase projects:delete <project> [-y]
```

Its environments' data goes with them (the platform keeps it a week to bring back).

## `envs`

### `palbase envs:list`

A project's environments (the project chosen here, or -P)

```sh
palbase envs:list
```

### `palbase envs:create`

Add an environment to a project (staging, a developer's own)

```sh
palbase envs:create <slug> [--name <name>] [--from <env> [--with-cloud]]
```

Each environment is a project of its own on the platform: its users, data, machines and keys are its own.
--from opens it with another environment's module settings (palbase config:copy: secrets are named, not copied); --with-cloud its machines and databases too — declared alike, built from the same branches, with no data (palbase db:copy brings it).

```text
      --name <name>  what it is called on screen (default: the slug)
      --from <env>   open it with this environment's settings (slug or ref)
      --with-cloud   with --from: its machines and databases too (the new environment's GitHub link builds the machines)
```

### `palbase envs:delete`

Delete an environment of a project, with its data

```sh
palbase envs:delete <slug>
```

## `keys`

### `palbase keys:list`

The environment's API keys (never their values)

```sh
palbase keys:list
```

### `palbase keys:create`

Make an API key of the environment; its value is shown this once

```sh
palbase keys:create --kind publishable|secret [--label <label>]
```

```text
      --kind <kind>    publishable (ships in apps) or secret (servers only)
      --label <label>  what it is for, as Studio lists it
```

### `palbase keys:revoke`

Revoke an API key of the environment; what holds it is refused from then on

```sh
palbase keys:revoke <key-id>
```

## `auth`

### `palbase auth:settings:get`

The environment's auth settings: passwords, email confirmation, sessions, tokens, passkeys, risk

```sh
palbase auth:settings:get
```

### `palbase auth:settings:set`

Change auth settings: key=value, a value read as JSON when it is JSON (12, true, ["https://…"])

```sh
palbase auth:settings:set <key=value>…
```

Text needs no quotes (site_url=https://shop.example); quote text that reads as JSON: from_name='"123"'.
The change is made on the revision read: one made beside it in the meantime (Studio, another terminal) is refused, not overwritten.
palbase auth:settings:get lists the keys.

### `palbase auth:providers:list`

The sign-in methods: email, phone and the social providers, whether each is on, their clients and stored secrets (by name)

```sh
palbase auth:providers:list
```

### `palbase auth:providers:set`

Turn a sign-in provider on or off and set it up: its client, its secret (from stdin), phone codes

```sh
palbase auth:providers:set <provider> [--enable|--disable] [setting=value…] [--client-id <id>] [--secret-stdin] …
```

email is always on. phone: --enable/--disable, and its code settings as setting=value (allow_signups, otp_ttl_seconds, otp_max_attempts, sender, sms_second_factor).
google, apple, github, microsoft: --client-id sets the browser client --client names (default web), made when the provider has none of that name.
--secret-stdin reads the client's secret from stdin (Apple: the .p8 signing key, with --team-id and --key-id) and keeps it under --credential (default: the provider's name). It is never taken from the command line and never printed.
--clients-file replaces the provider's clients with the file's {"browser_clients": […], "native_clients": […]} (native apps, several clients).

```text
      --enable               turn it on
      --disable              turn it off
      --client <key>         the browser client --client-id, --return-uri and the secret go to (default web)
      --client-id <id>       the provider's id of your app (Google web client id, Apple services id, Microsoft application id, GitHub client id)
      --return-uri <url>     where your app is sent back after sign-in (repeat it; replaces the list)
      --application <key>    the application the client is for (default app)
      --variant <name>       the build variant the client is for (default release)
      --directory <tenant>   microsoft: a tenant id, organizations, consumers or common (default common)
      --secret-stdin         read the client's secret (Apple: the .p8 key) from stdin
      --credential <key>     the name the secret is kept under (default: the provider's)
      --team-id <id>         apple: your team's id, with --secret-stdin
      --key-id <id>          apple: the signing key's id, with --secret-stdin
      --clients-file <path>  replace the provider's clients with the file's (JSON)
```

### `palbase auth:providers:disable`

Turn a sign-in provider off (phone, google, apple, github, microsoft); its clients and secrets stay

```sh
palbase auth:providers:disable <provider>
```

### `palbase auth:providers:secret:delete`

Delete a sign-in provider's stored secret by its name; one a client still uses is refused

```sh
palbase auth:providers:secret:delete <name>
```

### `palbase auth:roles:list`

The environment's roles: their permissions, which one new users get, how many users hold each

```sh
palbase auth:roles:list
```

### `palbase auth:roles:set`

Make a role, or change one: its permissions (the list is replaced), description, whether new users get it

```sh
palbase auth:roles:set <name> [--permissions <a.b,c.d>] [--description <text>] [--default yes|no]
```

```text
      --permissions <list>  resource.action permissions, comma-separated or repeated; replaces the list ("" for none)
      --description <text>  what the role is for
      --default <yes|no>    whether new users get it (one role at most)
```

### `palbase auth:roles:delete`

Delete a role; one users hold is deleted only with --force, and is taken from them

```sh
palbase auth:roles:delete <name> [--force]
```

```text
      --force  delete it although users hold it
```

### `palbase auth:hooks:list`

The blocking hooks: what auth calls, and waits for, before a sign-up, a sign-in, a token

```sh
palbase auth:hooks:list
```

### `palbase auth:hooks:create`

Register a blocking hook; its signing secret is printed this once

```sh
palbase auth:hooks:create --event <event> --url <url> [--failure-mode deny|allow] [--timeout <ms>] [--disable]
```

```text
      --event <event>              before.user.create, before.login, before.token.issue, … (the module lists them)
      --url <url>                  the https endpoint auth calls and waits for
      --failure-mode <deny|allow>  what auth does when the hook does not answer in time (default deny)
      --timeout <ms>               how long auth waits, 100–5000 ms (default 5000)
      --disable                    register it turned off
```

### `palbase auth:hooks:update`

Change a blocking hook: its event, endpoint, timeout, failure mode, on or off (its secret stays)

```sh
palbase auth:hooks:update <id> [--event …] [--url …] [--failure-mode …] [--timeout …] [--enable|--disable]
```

```text
      --event <event>              before.user.create, before.login, before.token.issue, … (the module lists them)
      --url <url>                  the https endpoint auth calls and waits for
      --failure-mode <deny|allow>  what auth does when the hook does not answer in time (default deny)
      --timeout <ms>               how long auth waits, 100–5000 ms (default 5000)
      --enable                     turn it on
      --disable                    turn it off
```

### `palbase auth:hooks:delete`

Delete a blocking hook; auth stops calling it

```sh
palbase auth:hooks:delete <id>
```

### `palbase auth:oauth-clients:list`

The OAuth clients of the environment's OpenID provider (apps that sign in with your users' accounts)

```sh
palbase auth:oauth-clients:list
```

### `palbase auth:oauth-clients:create`

Register an OAuth client; a confidential client's secret is printed this once

```sh
palbase auth:oauth-clients:create <name> [--public] [--redirect-uri <url>…] [--grant <type>…] [--scope <scope>…] [--client-id <id>]
```

```text
      --public              a public client (a CLI, a mobile app): it has no secret
      --redirect-uri <url>  where it may send the browser back (repeat it)
      --grant <type>        authorization_code (default), refresh_token, client_credentials, urn:ietf:params:oauth:grant-type:device_code
      --scope <scope>       what it may ask for (default openid, profile, email)
      --client-id <id>      a client_id to use as it is (default: a random one)
```

### `palbase auth:oauth-clients:delete`

Delete an OAuth client (by its id or its client_id)

```sh
palbase auth:oauth-clients:delete <id|client-id>
```

### `palbase auth:import`

Bring users over with what they sign in with: ids, addresses, password hashes, providers, second factors, passkeys, open sessions

```sh
palbase auth:import <file|folder> [--pepper-stdin]
```

A folder holds import bodies, one a file (users-0001.json…, each without its pepper); a file holds one such body, JSON lines (a user each) or one JSON array.
Password and recovery-code hashes keep the source's pepper: give it on stdin with --pepper-stdin — never on the command line.
Users go 1000 a call. One refused does not stop the others; a user whose id or address the project has is refused, never overwritten.

```text
      --pepper-stdin  read the source's pepper from stdin
```

### `palbase auth:users:list`

The environment's users: id, email, verified, last sign-in; --banned for the banned alone

```sh
palbase auth:users:list [--banned] [--limit <n>]
```

```text
      --banned     only the banned
      --limit <n>  how many at most (default 100)
```

### `palbase auth:users:get`

One user: their email and phone, how they sign in, whether verified or banned, their roles

```sh
palbase auth:users:get <user-id>
```

### `palbase auth:users:create`

Make a user with an email and a password (read from stdin, never the command line)

```sh
palbase auth:users:create <email> [--verified]
```

```text
      --verified  their email is taken as verified
```

### `palbase auth:users:delete`

Delete a user: their account, sessions and sign-ins go; backends hear user.deleted

```sh
palbase auth:users:delete <user-id>
```

### `palbase auth:users:ban`

Ban a user: their sessions end and they cannot sign in until unbanned

```sh
palbase auth:users:ban <user-id> [--reason <text>]
```

```text
      --reason <text>  why (kept with the ban)
```

### `palbase auth:users:unban`

Let a banned user sign in again

```sh
palbase auth:users:unban <user-id>
```

### `palbase auth:users:sign-out`

End every session of a user's: each device signs in again

```sh
palbase auth:users:sign-out <user-id>
```

### `palbase auth:users:export`

Everything the environment holds about one user, as the law lets them ask for it (GDPR art. 15/20): JSON

```sh
palbase auth:users:export <user-id> [--out <file>]
```

```text
      --out <file>  write it here instead of to standard output
```

### `palbase auth:audit`

Who did what in the environment's auth, newest first: sign-ins, changes to users and settings, admin actions

```sh
palbase auth:audit [--event <type>] [--limit <n>]
```

```text
      --event <type>  only this kind of event (user.login, admin.user.update…)
      --limit <n>     how many at most (default 50)
```

### `palbase auth:audit:verify`

Whether the audit trail is whole: each event chained to the one before, none changed or taken out

```sh
palbase auth:audit:verify
```

### `palbase auth:audit:export`

The audit trail as a file: JSON lines or CSV, a span of it, one kind of event

```sh
palbase auth:audit:export [--format ndjson|csv] [--from <time>] [--to <time>] [--event <type>] [--out <file>]
```

```text
      --format <ndjson|csv>  JSON lines (default) or CSV
      --from <time>          from this time on (RFC 3339: 2026-10-01T00:00:00Z)
      --to <time>            up to this time
      --event <type>         only this kind of event
      --out <file>           write it here instead of to standard output
```

### `palbase auth:signing-keys`

The keys the environment's tokens are signed with: the active one, those still verifying, the retired

```sh
palbase auth:signing-keys
```

### `palbase auth:signing-keys:rotate`

Sign with a new key from now on; tokens the old one signed go on verifying until they end

```sh
palbase auth:signing-keys:rotate
```

### `palbase auth:test-users:list`

The environment's test users (made with its secret key; their tokens say test: true)

```sh
palbase auth:test-users:list
```

### `palbase auth:test-users:create`

Make test users for a suite: their passwords, and with --token an access token each, shown this once; --template has the backend write the data a screen needs for each

```sh
palbase auth:test-users:create [--count <n>] [--token] [--template <name> [--machine <name>]]
```

A test user signs in as any user does; its tokens say test: true, so a backend can tell them apart. --token gives each an access token at once, for a test that calls the backend as that user.
--template `<name>` has the backend write the data of its @TestUserTemplate({ name }) for each user — its seed for one account, in its own code (palbase/backend), run on the machine --machine names or the environment's only one, for test users alone. Each user is answered with the rows written, by table, or why its template was not (no_template, not_a_test_user, template_failed, template_timeout, machine_unavailable): the user is made all the same, and the command then ends with 1. At most 10 users at once with a template.
palbase auth:test-users:template writes another template for a user made with one; palbase auth:test-users:delete has the template undone before the user is deleted.

```text
      --count <n>        how many (default 1, at most 100; 10 with --template)
      --token            an access token for each, too
      --template <name>  a @TestUserTemplate of the backend's: its data written for each user
      --machine <name>   the machine whose backend has the template (default: the environment's only one)
```

### `palbase auth:test-users:template`

Have the backend write a @TestUserTemplate's data for a test user made with a template — the same one again answers what it wrote then

```sh
palbase auth:test-users:template <user-id> <template> [--machine <name>]
```

The user is one auth:test-users:create --template made on that machine: a test user is the machine's that made it. Asked again for a template it wrote, the platform answers what it wrote then, and the backend is not called.

```text
      --machine <name>  the machine whose backend has the template (default: the environment's only one)
```

### `palbase auth:test-users:delete`

Delete a test user — one made with a template has the backend undo it first

```sh
palbase auth:test-users:delete <user-id> [--machine <name>]
```

A test user made with --template is deleted through the machine that made it: the backend's undo of each template runs first — a template with none leaves its data to user.deleted (what ownedByUser() owns goes with the user) — and an undo that fails keeps the user, for the delete to be asked again. Any other test user is deleted at once.
Without --machine the environment's machines are asked which made the user; a token that does not list the machines deletes it at once, its templates left to user.deleted.

```text
      --machine <name>  the machine that made the user with a template (default: whichever did)
```

## `storage`

### `palbase storage:buckets:list`

The environment's buckets: who may read each, the largest file and the types it takes

```sh
palbase storage:buckets:list
```

### `palbase storage:buckets:get`

A bucket's declaration in full, with its renditions

```sh
palbase storage:buckets:get <bucket>
```

### `palbase storage:buckets:set`

Make a bucket, or change one: public or private, the largest file, the content types, its renditions

```sh
palbase storage:buckets:set <bucket> [--public|--private] [--max-size <size>] [--types <a/b,c/*>] [--variants-file <path>]
```

What is not given is kept as it is (a new bucket: private, the platform's size, any type, no rendition).

```text
      --public                anyone may read its files at /storage/public/
      --private               its files are read with signed URLs and the rules
      --max-size <size>       the largest file: 10MB, 512KiB, 1GB, bytes, or platform
      --types <list>          the content types it takes, comma-separated (image/* a family); "" for any
      --variants-file <path>  its renditions, a JSON list of {name, width, height, fit, format, quality}
```

### `palbase storage:buckets:delete`

Delete an empty bucket (one that still holds files is refused)

```sh
palbase storage:buckets:delete <bucket>
```

### `palbase storage:ls`

A bucket's objects, or those under a prefix: path, size, type

```sh
palbase storage:ls <bucket>[:prefix]
```

### `palbase storage:cp`

Copy files between this computer and a bucket: a file, or a folder whole with -r

```sh
palbase storage:cp <from> <to> [-r] [--owner <user id>]
```

bucket:path names an object of the environment; anything else is a path on this computer.
Up: a file to bucket:path (a path ending in / keeps the file name); with -r, a folder to bucket:prefix, its paths kept.
Down: bucket:path to a file; with -r, every object under bucket:prefix into a folder.

```text
  -r, --recursive        a folder (up) or a prefix (down), whole
      --owner <user id>  the user uploaded objects belong to (deleted with them)
```

### `palbase storage:rm`

Delete an object, or every object under a prefix with -r

```sh
palbase storage:rm <bucket:path> [-r]
```

```text
  -r, --recursive  every object under the prefix
```

### `palbase storage:url`

A signed download URL for one object

```sh
palbase storage:url <bucket:path> [--expires <seconds>]
```

```text
      --expires <seconds>  how long it works (default 3600, at most 604800)
```

## `flags`

### `palbase flags:list`

The environment's flags as they are live: type, default, targeting (and the draft's state when it publishes)

```sh
palbase flags:list
```

### `palbase flags:set`

Define a flag or change its default and targeting (into the draft when the environment publishes)

```sh
palbase flags:set <key> <value> [--type bool|number|string|object] [--condition "<expression> => <value>"…] [--description <text>]
```

The value is read as the flag's type: true/false, a number, text, or a JSON object; a new flag's type is the value's unless --type says it.
--condition replaces the targeting (first match wins, 8 at most); --clear-conditions takes it away; without either it stays.
An environment that publishes takes the change into its shared draft (palbase flags:publish makes it live); one that does not, live at once.

```text
      --type <type>         bool, number, string or object
      --condition <rule>    "<expression> => <value>" (repeat it, in order)
      --clear-conditions    take its targeting away
      --variants <list>     a string flag's allowed values, comma-separated
      --description <text>  what the flag is for
```

### `palbase flags:delete`

Delete a flag, with every user's own value of it (from the draft when the environment publishes)

```sh
palbase flags:delete <key>
```

### `palbase flags:publish`

Show the flags draft's changes against the live version, then publish it as the next version

```sh
palbase flags:publish [-m <note>]
```

```text
  -m, --note <note>  why: kept with the version
```

### `palbase flags:versions`

The published versions of the flags, newest first, and which one is live

```sh
palbase flags:versions [--limit <n>]
```

```text
      --limit <n>  how many (default 20)
```

### `palbase flags:rollback`

Make an earlier version of the flags live again (published as the next version)

```sh
palbase flags:rollback <version> [-m <note>]
```

```text
  -m, --note <note>  why (default: rollback to <version>)
```

### `palbase flags:publishing:enable`

Turn publishing on for the environment's flags: changes go into a shared draft, live once published — for good

```sh
palbase flags:publishing:enable
```

What is live now becomes version 1. From then on flags:set and flags:delete change the draft, flags:publish makes it live as the next version, and flags:rollback brings an earlier one back. It cannot be turned off.

### `palbase flags:users:get`

Every flag as one user gets it now — their own values, the targeting, the defaults — as their client reads them

```sh
palbase flags:users:get <user-id>
```

### `palbase flags:users:set`

Give a user a flag's value of their own, whatever its default and targeting say

```sh
palbase flags:users:set <user-id> <key> <value>
```

### `palbase flags:users:unset`

Take a user's own value of a flag away, or every one with no key: the flag decides for them again

```sh
palbase flags:users:unset <user-id> [key]
```

## `notify`

### `palbase notify:providers:list`

The environment's own providers, by channel and the order they are tried (never their credentials)

```sh
palbase notify:providers:list
```

### `palbase notify:providers:set`

Bring a provider for a channel: its credentials are piped in as JSON, checked as the sender will use them, never shown

```sh
palbase notify:providers:set <channel> <provider> [--priority <n>] [--enable|--disable] < credentials.json
```

email: acs {connection_string, from_email}, ses {region, access_key_id, secret_access_key, from_domain}, sendgrid {api_key, from_domain}, smtp {host, port, username, password, from_email, use_starttls}.
sms: twilio {account_sid, auth_token, from_number}, vonage {api_key, api_secret, from}, acs {connection_string, from_number}. verify: twilio_verify {account_sid, auth_token, service_sid}.
whatsapp: meta {phone_number_id, access_token, api_version, app_secret, verify_token}. push: fcm (the service account JSON), apns {private_key, team_id, key_id, bundle_id, is_production}, expo {access_token}.
The credentials are read from stdin only: never from the command line, where the shell would keep them.

```text
      --priority <n>  lower is tried first
      --enable        turn it on
      --disable       turn it off
```

### `palbase notify:providers:remove`

Forget a provider and its credentials

```sh
palbase notify:providers:remove <channel> <provider>
```

### `palbase notify:templates:list`

The templates messages render from: the platform's defaults and the ones the environment overrides

```sh
palbase notify:templates:list [--channel email|sms|whatsapp]
```

```text
      --channel <channel>  only this channel's (default: all three)
```

### `palbase notify:templates:get`

A template as it renders now in a locale (yours, or the platform's default); --json gives the document templates:set takes

```sh
palbase notify:templates:get <slug> --locale <locale> [--channel email|sms|whatsapp]
```

```text
      --channel <channel>  email (default), sms or whatsapp
      --locale <locale>    the template's locale: en, tr, pt-BR
```

### `palbase notify:templates:set`

Override a template in a locale, from a file or stdin (email: {subject, html_body, text_body} as JSON)

```sh
palbase notify:templates:set <slug> --locale <locale> [--channel email|sms|whatsapp] [--file <path>]
```

email: {"subject", "html_body", "text_body"}; sms: the text, or {"body"}; whatsapp: {"name", "language", "variables", "code_button"} of a template approved on your Meta account.
notify:templates:get … --json > t.json gives a document to edit and set back. Handlebars: {{name}}, {{#if}}, {{#each}}.

```text
      --channel <channel>  email (default), sms or whatsapp
      --locale <locale>    the template's locale: en, tr, pt-BR
      --file <path>        the template (default: stdin)
```

### `palbase notify:templates:delete`

Remove an override: the platform's default renders again (a WhatsApp mapping is forgotten)

```sh
palbase notify:templates:delete <slug> --locale <locale> [--channel email|sms|whatsapp]
```

```text
      --channel <channel>  email (default), sms or whatsapp
      --locale <locale>    the template's locale: en, tr, pt-BR
```

### `palbase notify:topics:list`

The topics users follow, how many follow each, whether they follow it from the app

```sh
palbase notify:topics:list
```

### `palbase notify:topics:create`

Make a topic users can follow; a push to it reaches its followers

```sh
palbase notify:topics:create <name> [--self-subscribe yes|no]
```

```text
      --self-subscribe <yes|no>  users follow it from the app (default no: the project adds them)
```

### `palbase notify:topics:delete`

Delete a topic and who follows it

```sh
palbase notify:topics:delete <name>
```

### `palbase notify:settings:get`

The environment's message settings: the default locale, who email is from, where texts may go

```sh
palbase notify:settings:get
```

### `palbase notify:settings:set`

Change message settings: key=value (from_email=…, sms_countries=["+90","+44"], mx_check=true)

```sh
palbase notify:settings:set <key=value>…
```

The change is made on the revision read: one made beside it in the meantime is refused, not overwritten.

### `palbase notify:send`

Send an email or a text through the environment's providers: written here, or a template with its variables

```sh
palbase notify:send <email|sms> <to> [--template <slug> --var name=value…] [--subject <s> --text <t> --html <h>] [--body <text>]
```

A message is sent as a backend sends it (POST /notify/email, /notify/sms): its delivery is in palbase notify:messages.

```text
      --template <slug>   a template of the environment (notify:templates:list)
      --var <name=value>  a template's variable (again for each)
      --locale <locale>   the template's locale
      --subject <text>    an email's subject
      --text <text>       an email's text
      --html <html>       an email's HTML
      --body <text>       a text's words
```

### `palbase notify:messages`

The messages the environment sent, newest first, and what became of each

```sh
palbase notify:messages [--limit <n>]
```

```text
      --limit <n>  how many (default 20)
```

### `palbase notify:deliverability`

Whether each channel can send now, through which providers, and what to do when it cannot

```sh
palbase notify:deliverability
```

## `realtime`

### `palbase realtime:channels:get`

The channel declaration, in the order patterns are matched: who may join each, publish, read and write its state

```sh
palbase realtime:channels:get
```

### `palbase realtime:channels:set`

Replace the channel declaration with a JSON file or stdin ({"channels": […]} or the list)

```sh
palbase realtime:channels:set [--file <path>]
```

Each channel: {"pattern": "room:{id}", "kind": "public", "publish": true, "state_read": true, "state_write": false}, or {"pattern": "user:{uid}", "kind": "owner"}.
realtime:channels:get --json gives the document to edit. Open sockets are decided again within a heartbeat.

```text
      --file <path>  the declaration (default: stdin)
```

### `palbase realtime:limits:get`

The limits the environment holds its clients to (null: the platform's), and the platform's

```sh
palbase realtime:limits:get
```

### `palbase realtime:limits:set`

Change realtime limits: key=value (max_connections=500), null for the platform's

```sh
palbase realtime:limits:set <key=value>…
```

The keys: max_connections, max_events_per_second, max_joins_per_second, max_channels_per_connection. A value above the platform's has no effect beyond it.

### `palbase realtime:broadcast`

Send an event to a channel's subscribers, as the server does: its payload JSON (or text)

```sh
palbase realtime:broadcast <topic> <event> [payload]
```

## `analytics`

### `palbase analytics:settings:get`

How long analytics keeps events and console records, the share of performance samples kept, whether bodies are kept

```sh
palbase analytics:settings:get
```

### `palbase analytics:settings:set`

Change analytics settings: key=value (retention_days=30, perf_sample_pct=10, console_bodies=false)

```sh
palbase analytics:settings:set <key=value>…
```

A shorter retention removes what is older within minutes.

### `palbase analytics:events`

The events analytics recorded, newest first: by name, by user, over a window

```sh
palbase analytics:events [--name <event>] [--user <distinct-id>] [--window <24h>] [--limit <n>]
```

```text
      --name <event>   only this event's
      --user <id>      only this user's (their distinct id)
      --window <span>  how far back: 30m, 24h, 7d (default 24h)
      --limit <n>      how many (default 50)
```

### `palbase analytics:summary`

What analytics counted over a window: events, users, sessions, the top events

```sh
palbase analytics:summary [--window <24h>]
```

```text
      --window <span>  how far back: 30m, 24h, 7d (default 24h)
```

## `config`

### `palbase config:diff`

How two environments' module settings differ (auth, storage, flags, notify, realtime, analytics; machines, databases when named)

```sh
palbase config:diff --from <env> --to <env> [--only <modules>]
```

- a key only in --from, + only in --to, ~ in both with other values. Ids, times and versions are not compared; a secret is compared as set or not, never by its value.
Exit code 0 when they are the same, 1 when they differ. --json gives each difference with both values.

```text
      --from <env>      the environment compared from (slug or ref)
      --to <env>        the environment compared to (slug or ref)
      --only <modules>  only these, comma-separated: auth,storage,flags,notify,realtime,analytics (the default), and databases,machines when named
```

### `palbase config:copy`

Make one environment's module settings equal to another's (secrets excepted: their names are said)

```sh
palbase config:copy --from <env> --to <env> [--only <modules>]
```

It shows the differences, asks before changing a production environment (-y confirms), changes the target, and compares again.
A secret is never copied: a provider's credentials and a sign-in client's secret are listed by name for you to set. A new hook or OAuth client gets its own secret, printed this once.
What the target holds that its users depend on is not taken by a copy: a bucket with files, a role users hold, a topic users follow are left and said.
--only machines,databases copies what they are declared as — a machine's source, size, copies, settings, secrets' name, database; a database's size, who may connect, backups — never a database's data (palbase db:copy) nor a secret's value. A machine or database only the target has is left serving.
Exit code 0 when the two are the same afterwards, 1 when a difference remains.

```text
      --from <env>      the environment compared from (slug or ref)
      --to <env>        the environment compared to (slug or ref)
      --only <modules>  only these, comma-separated: auth,storage,flags,notify,realtime,analytics (the default), and databases,machines when named
```

## `secrets`

### `palbase secrets:list`

The environment's secrets by name, with their version — never their values

```sh
palbase secrets:list [--dev]
```

```text
      --dev  the development set (what a backend on a developer's computer reads), not production
```

### `palbase secrets:set`

Set a secret: its value is read from stdin, never from the command line

```sh
palbase secrets:set <NAME> [--dev] < value
```

The environment's machines read production at their next start; a backend run with palbase run or env:pull reads development.

```text
      --dev  the development set (what a backend on a developer's computer reads), not production
```

### `palbase secrets:get`

Print one secret's value (an admin's)

```sh
palbase secrets:get <NAME> [--dev]
```

```text
      --dev  the development set (what a backend on a developer's computer reads), not production
```

### `palbase secrets:unset`

Take a secret away

```sh
palbase secrets:unset <NAME> [--dev]
```

```text
      --dev  the development set (what a backend on a developer's computer reads), not production
```

### `palbase secrets:versions`

A secret's versions, newest first — never their values

```sh
palbase secrets:versions <NAME> [--dev]
```

```text
      --dev  the development set (what a backend on a developer's computer reads), not production
```

### `palbase secrets:rollback`

Put a secret back to one of its versions (a new version with that value)

```sh
palbase secrets:rollback <NAME> --version <n> [--dev]
```

```text
      --dev          the development set (what a backend on a developer's computer reads), not production
      --version <n>  the version to go back to
```

### `palbase secrets:audit`

Every read and write of the environment's secrets, newest first: which secret, which key did it, when — never a value

```sh
palbase secrets:audit [--name <NAME>] [--dev | --prod] [--limit <n>]
```

A backend that reads the secrets at boot (palbase run, a machine) shows here as a read, with the key it read with: palbase keys:list names the key.

```text
      --name <NAME>  only this secret's
      --dev          only the development secrets
      --prod         only the production secrets
      --limit <n>    how many (default 30)
```

## `webhooks`

### `palbase webhooks:list`

The environment's webhook endpoints: where its events go, which (never their secrets)

```sh
palbase webhooks:list
```

### `palbase webhooks:create`

Add a webhook endpoint; its signing secret is printed this once, or kept in a secret with --secret-to

```sh
palbase webhooks:create <url> [--events <a,b>] [--secret-to <NAME> [--dev]]
```

A machine is given its own endpoint and its secret (PALBASE_WEBHOOK_SECRET) by the platform, for the events its app takes: this is for another receiver. --secret-to keeps the secret in the environment's secrets (production; --dev: development) and prints it nowhere.

```text
      --events <list>     the events it is sent, comma-separated (user.deleted, …); none: every event
      --secret-to <NAME>  keep its signing secret in the environment's secret NAME instead of printing it
      --dev               with --secret-to: the development secrets, not production
```

### `palbase webhooks:update`

Change a webhook endpoint's address or events (its secret stays)

```sh
palbase webhooks:update <id> [--url <url>] [--events <a,b>|""]
```

```text
      --url <url>      where it is delivered now
      --events <list>  the events it is sent now, comma-separated; "" for every event
```

### `palbase webhooks:delete`

Remove a webhook endpoint: its events are no longer delivered there

```sh
palbase webhooks:delete <id>
```

### `palbase webhooks:deliveries:list`

The deliveries the platform gave up on after its tries, still owed (--failed), or every one kept 30 days (--all)

```sh
palbase webhooks:deliveries:list [--failed] [--all]
```

```text
      --failed  those it gave up on and still owes (the default)
      --all     every one kept, those delivered again among them
```

### `palbase webhooks:deliveries:redeliver`

Send a failed delivery again: the same event, its id and body, to the endpoint it failed at, within seconds

```sh
palbase webhooks:deliveries:redeliver <id>
```

As Stripe's Resend: the receiver takes an event more than once by its Palbase-Event-Id. An admin's; it is written to the organization's audit log.

## `stores`

### `palbase stores:apple`

The environment's Apple account: whether one is connected, what Apple last said of its key, what the key reaches

```sh
palbase stores:apple
```

### `palbase stores:apple:connect`

Connect an App Store Connect API key: it goes from this computer straight to the environment, never through Studio

```sh
palbase stores:apple:connect --key-file <AuthKey_KEYID.p8> --issuer-id <issuer id> [--key-id <KEYID>] | --print-link
```

App Store Connect → Users and Access → Integrations → App Store Connect API makes the key and shows the Issuer ID; stores:apple then says what its role reaches.
Studio is asked for a one-time grant alone; the key is posted with it to the environment's own address. --print-link prints a link that takes the key in a browser instead.

```text
      --key-file <AuthKey_KEYID.p8>  the .p8 file Apple gave when the key was made
      --key-id <KEYID>               the key's id (default: from the file's name)
      --issuer-id <issuer id>        the account's issuer id
      --print-link                   only print a link that takes the key in a browser (valid 30 minutes, once)
```

### `palbase stores:apple:check`

Ask Apple about the connected key again: after the account holder accepted its agreements, or its role changed

```sh
palbase stores:apple:check
```

### `palbase stores:apple:disconnect`

Take the environment's Apple key away (Apple keeps its apps and builds)

```sh
palbase stores:apple:disconnect
```

### `palbase stores:google`

The environment's Play connection: the service account Play Console invites, what Play let it reach

```sh
palbase stores:google
```

### `palbase stores:google:connect`

Connect Google Play: Palbase makes a service account for the environment, which your Play Console invites

```sh
palbase stores:google:connect
```

No key changes hands: Palbase acts as the service account it made in its own Google Cloud project.
Then, in Play Console → Users and permissions, invite the service account with the app (Release to testing tracks; for purchases also View financial data and Manage orders and subscriptions), link the Android app (stores:apps:link) and check: stores:google:check.

### `palbase stores:google:check`

Ask Play what the environment's service account reaches of each Android app: after Play Console invited it

```sh
palbase stores:google:check
```

### `palbase stores:google:disconnect`

Delete the environment's service account at Google: Play Console's invite of it reaches nothing any more

```sh
palbase stores:google:disconnect
```

### `palbase stores:apple:sandbox-testers`

The Apple team's sandbox testers: the accounts that buy in the App Store's sandbox, how fast their subscriptions renew

```sh
palbase stores:apple:sandbox-testers
```

They are the team's, every environment's alike. Only a person makes one: App Store Connect › Users and Access › Sandbox.

### `palbase stores:apple:sandbox-testers:set`

Change how a sandbox tester buys: how fast its monthly subscriptions renew, whether its purchases are interrupted, its storefront

```sh
palbase stores:apple:sandbox-testers:set <email|id> [--renewal 3m|5m|15m|30m|1h] [--interrupt on|off] [--storefront <code>]
```

A monthly subscription renews at the rate given; a yearly one in proportion. Apple renews one 12 times at most, then lets it end.
An interrupted purchase stops for an action of the buyer's, as when a bank asks for one: what the app does then is tested.

```text
      --renewal <rate>      every 3m, 5m, 15m, 30m or 1h
      --interrupt <on|off>  interrupt its purchases
      --storefront <code>   the storefront it buys in, three letters (USA, DEU, TUR …)
```

### `palbase stores:apple:sandbox-testers:clear`

Clear sandbox testers' purchase history: each buys again as for the first time, introductory offers included

```sh
palbase stores:apple:sandbox-testers:clear <email|id>…
```

Apple clears them after it answers, which can take minutes. Then sign out of the sandbox account on the device and in again.

### `palbase stores:apps`

The environment's apps linked to their store

```sh
palbase stores:apps
```

### `palbase stores:apps:link`

Link an app of the project to its store: an iOS app to the App Store, an Android app to Google Play (with an upload key Palbase makes)

```sh
palbase stores:apps:link <app id> [--name <name in the store>]
```

```text
      --name <name>  its name in the store (default: the bundle id or package)
```

### `palbase stores:apps:upload-key`

An Android app's upload key: the certificate Palbase signs its builds with (never its private key)

```sh
palbase stores:apps:upload-key <app id> [--out <file.pem>]
```

Play Console shows an app's upload key by this fingerprint; asked to change an app's upload key to Palbase's, it takes this certificate (--out).

```text
      --out <file.pem>  write the certificate (PEM) to this file
```

### `palbase stores:feedback`

An app's TestFlight feedback: testers' screenshots and crashes

```sh
palbase stores:feedback <app id>
```

### `palbase stores:packages`

The packages handed to the stores, newest first

```sh
palbase stores:packages [--app <app id>] [--limit <n>]
```

```text
      --app <app id>  only this app's
      --limit <n>     how many (1–200, default 20)
```

### `palbase stores:packages:get`

One package: its build, its bundles and its deliveries

```sh
palbase stores:packages:get <package id>
```

### `palbase stores:packages:create`

Make a package of an app: its build number, and the URL and token its .ipa is uploaded with

```sh
palbase stores:packages:create <app id> --command-id <id> [--notes <text>] [--entitlements-file <json>]
```

The build is made with the build number it answers (CFBundleVersion), then uploaded: palbase stores:packages:upload.
The same --command-id again answers the same package, with a new upload token while it waits for its build: a build machine sends its run's id.

```text
      --command-id <id>           names the request (a CI run id): sent again, the same package
      --notes <text>              notes kept with it (a commit, a branch)
      --entitlements-file <json>  what each bundle asks for, by bundle id ({"com.acme.app": {"aps-environment": "production"}})
```

### `palbase stores:packages:upload`

Hand a package its build: the .ipa or .aab goes straight to the environment's address with the upload token

```sh
palbase stores:packages:upload <package id> --file <app.ipa|app.aab> --token <upload token>
```

The token is the one stores:packages:create printed; PALBASE_UPLOAD_TOKEN stands in for --token, out of the process list.
The file goes with its Content-Length. While the module is busy with another upload it is sent again, after the wait the module names, five times at most; a package that has its build already (this token's upload arrived before) counts as uploaded.

```text
      --file <app.ipa|app.aab>  the unsigned .ipa, or the Android App Bundle (unsigned, or signed with the app's upload key), the build machine made
      --token <upload token>    the package's upload token
```

### `palbase stores:packages:bundle`

Download a package's bundle as Palbase signed it for Play: to upload it in Play Console by hand

```sh
palbase stores:packages:bundle <package id> --out <file.aab> [--channel play_internal]
```

stores:deliver sends every build to Play, an app's first too; when Play wants a release made in Play Console instead (Testing → Internal testing → Create new release), upload this file there: it is signed with the app's upload key.
The bytes come from the environment's address on a link the module sealed for this bundle, valid 15 minutes; Studio is asked for the link alone.

```text
      --out <file.aab>     where to write it
      --channel <channel>  the Play delivery (play_internal)
```

### `palbase stores:deliver`

Send a package to a channel's testers: signed, handed to Apple or Play, and given to the testers

```sh
palbase stores:deliver <package id> [--channel testflight|play_internal] [--groups <group,…>] [--what-to-test <text>] [--locale <locale>]
```

An iOS app goes to TestFlight: processed, then given to the groups; an export compliance question is answered with stores:export-compliance.
An Android app goes to Play's internal testing track, to the testers it lists in Play Console. An invite given in Play Console just now takes a while to reach Play's API: a delivery Play refuses then (google_not_allowed) is sent again later.
palbase stores:deliveries `<package id>` follows it.

```text
      --channel <channel>    where it goes: testflight, or play_internal (default: the app's platform's)
      --groups <group,…>     the groups it goes to once ready, by id or name
      --what-to-test <text>  the note testers read
      --locale <locale>      the note's locale (default: the app's primary one)
```

### `palbase stores:deliveries`

A package's deliveries: where each is now, and what to do when one failed

```sh
palbase stores:deliveries <package id>
```

### `palbase stores:what-to-test:set`

Change what testers read with a package's TestFlight build, once Apple holds the build

```sh
palbase stores:what-to-test:set <package id> --text <text> [--locale <locale>]
```

Apple's note on the build, and the delivery's own; before Apple holds the build the module says so (build_not_at_apple) — stores:deliver --what-to-test sets it with the delivery.

```text
      --text <text>      the note testers read (4000 characters at most)
      --locale <locale>  its locale (default: the app's primary one)
```

### `palbase stores:groups`

An app's groups of testers

```sh
palbase stores:groups <app id>
```

### `palbase stores:groups:create`

Make a group of testers for an app (in TestFlight an internal and an external group)

```sh
palbase stores:groups:create <app id> <name>
```

### `palbase stores:groups:rename`

Rename a group

```sh
palbase stores:groups:rename <group id> <name>
```

### `palbase stores:groups:delete`

Delete a group: its testers lose the builds it gave them

```sh
palbase stores:groups:delete <group id>
```

### `palbase stores:groups:testers`

A group's testers

```sh
palbase stores:groups:testers <group id>
```

### `palbase stores:groups:testers:set`

Set who a group holds, whole: those not named leave it

```sh
palbase stores:groups:testers:set <group id> (--emails <a@x,…> | --file <testers.txt>)
```

A file names one tester a line — email, or email,First,Last — or is a JSON array; - reads it from stdin. 100 at most.

```text
      --emails <a@x,…>  the testers' addresses
      --file <path>     the testers, one a line (- for stdin)
```

### `palbase stores:groups:add-build`

Give a group a package that TestFlight has (external testers get it after Beta App Review)

```sh
palbase stores:groups:add-build <group id> <package id>
```

### `palbase stores:review-info`

An app's TestFlight test information as Apple holds it, in one locale, and what Beta App Review still lacks — the demo password only as set or not

```sh
palbase stores:review-info <app id> [--locale <locale>]
```

```text
      --locale <locale>  the locale to read (default: the app's primary one)
```

### `palbase stores:review-info:set`

What Beta App Review needs to know of an app: only the fields given are written; it answers what is still missing

```sh
palbase stores:review-info:set <app id> [--description <text>] [--feedback-email <a@x>] [--contact-… <…>] [--demo-account-name <name> --demo-password-stdin] [--notes <text>] [--locale <locale>]
```

```text
      --description <text>         what testers should test
      --feedback-email <a@x>       where testers send feedback
      --contact-first-name <name>  whom Apple calls: first name
      --contact-last-name <name>   last name
      --contact-phone <phone>      phone
      --contact-email <a@x>        email
      --demo-account-name <name>   a sign-in for the reviewer, when the app needs one
      --demo-password-stdin        read the demo account's password from stdin (never the command line)
      --notes <text>               notes to the reviewer
      --locale <locale>            the description's and feedback address's locale (default: the app's primary one)
```

### `palbase stores:beta-review`

Plan sending a package to Beta App Review (external testers get it after Apple's review); it runs when confirmed

```sh
palbase stores:beta-review <package id>
```

### `palbase stores:export-compliance`

Plan the export compliance answer of a package's build (the question TestFlight waits on); it runs when confirmed

```sh
palbase stores:export-compliance <package id> --uses-non-exempt-encryption yes|no
```

```text
      --uses-non-exempt-encryption <yes|no>  whether the app uses encryption beyond HTTPS and what iOS provides
```

### `palbase stores:expire`

Plan expiring a package's build in TestFlight (testers can no longer install it); it runs when confirmed

```sh
palbase stores:expire <package id>
```

### `palbase stores:listing:get`

An iOS app's draft App Store page — categories, age rating, each language's text and screenshots — and its revision

```sh
palbase stores:listing:get <app id> [--out <palbase/store/listing.json>]
```

--out writes the draft to a file to edit, under palbase/; stores:listing:put saves the edit on the revision printed. A screenshot can be named there by its file under palbase/ (relative to the draft's file) instead of its SHA-256: listing:put uploads it first.
Nothing of the draft is at Apple: stores:listing:plan compares it with App Store Connect, and the plan, once confirmed, writes it.

```text
      --out <file>  write the draft to this file, under palbase/
```

### `palbase stores:listing:put`

Save an iOS app's draft App Store page, whole, on the revision it was edited from — its screenshot files uploaded first

```sh
palbase stores:listing:put <app id> --file <palbase/store/listing.json> --revision <n>
```

A screenshot is named by its SHA-256, or by a file — a path from the draft's own file, under palbase/ (nothing else is read): each file is uploaded first, and the draft is saved with its SHA-256 in its place. The file itself is left as it is.
Of two people editing at once, the second is told — the draft moved past the revision they edited — never saved over. Nothing goes to Apple: stores:listing:plan says what the draft changes there.

```text
      --file <listing.json>  the draft, as stores:listing:get --out wrote it ('-' or none: stdin)
      --revision <n>         the revision it was edited from, as stores:listing:get printed it (0: the first)
```

### `palbase stores:screenshots:upload`

Upload screenshots for an iOS app's App Store page: each is kept by its SHA-256, which the draft names it by

```sh
palbase stores:screenshots:upload <app id> <file.png|file.jpg>…
```

Each is a PNG or JPEG of 10 MB at most, of a size the App Store takes: iPhone 6.9" (1320x2868, 1290x2796, 1260x2736), iPhone 6.5" (1242x2688, 1284x2778) or iPad 13" (2064x2752, 2048x2732), or turned. The same image again is the one kept.
stores:listing:put uploads the files a draft names itself; this is for the SHA-256 alone.

### `palbase stores:listing:plan`

Plan writing an iOS app's draft page to App Store Connect: what changes, language by language; it runs when confirmed

```sh
palbase stores:listing:plan <app id>
```

The draft is compared with the page of the app's version that can change; a field the draft leaves empty, and a language it has not, are left as they are.

### `palbase stores:version`

An iOS app's App Store version as App Review will see it — its build, release, phased release, price, content rights, review contact — and what App Review would refuse it for

```sh
palbase stores:version <app id>
```

The demo account's password is never read out: only whether Apple holds one. watched is what the module last saw of the version sent to App Review (it reads it every few minutes).

### `palbase stores:version:prepare`

Prepare an iOS app's App Store version: its number, build, copyright, release, phased release, content rights, a free price, App Review's details

```sh
palbase stores:version:prepare <app id> [--version <x.y.z>] [--build <n>] [--copyright <text>] [--release manual|after_approval|scheduled] [--release-at <RFC 3339>] [--phased | --no-phased] [--third-party-content | --no-third-party-content] [--free] [--review-file <review.json>] [--demo-password-stdin]
```

Only what is given is written; --version makes the next version when the app has none that can change. The build is a TestFlight build of that version, by its number.
--review-file holds App Review's details as stores:version --json shows them (its review): a field the file leaves out stays as it is. The demo account's password is read from stdin alone (--demo-password-stdin), never from the file or the command line; it goes to Apple, and is never printed or kept.

```text
      --version <x.y.z>            the version's number: makes it when the app has none that can change
      --build <n>                  the TestFlight build App Review gets, by its build number
      --copyright <text>           the copyright line (2026 Your Company)
      --release <how>              how it goes out once approved: manual, after_approval or scheduled
      --release-at <RFC 3339>      a scheduled release, not before then (alone, it is scheduled)
      --phased                     release it in phases over seven days
      --no-phased                  release it to everyone at once
      --third-party-content        the content rights statement: the app shows, contains or reaches third-party content
      --no-third-party-content     the content rights statement: it does not
      --free                       make an app with no price free everywhere (a paid price is set in App Store Connect)
      --review-file <review.json>  App Review's details: contact, demo account, notes ('-': stdin)
      --demo-password-stdin        read the demo account's password from stdin (never a file or the command line)
```

### `palbase stores:version:submit`

Plan sending an iOS app's prepared version to App Review — refused, with what is missing, until it has what App Review needs; it runs when confirmed

```sh
palbase stores:version:submit <app id>
```

### `palbase stores:version:withdraw`

Plan taking the version out of App Review: it is edited again, and sent again from the start; it runs when confirmed

```sh
palbase stores:version:withdraw <app id>
```

### `palbase stores:version:release`

Plan releasing an approved version that waits for its developer (a manual release) on the App Store, for good; it runs when confirmed

```sh
palbase stores:version:release <app id>
```

### `palbase stores:version:phased`

Plan pausing, resuming or completing the version's phased release (complete: everyone gets it now); it runs when confirmed

```sh
palbase stores:version:phased <app id> <paused|active|complete>
```

### `palbase stores:actions`

The actions planned at Apple, newest first: what each does, and whether it ran (running: a page still being written)

```sh
palbase stores:actions [--status planned|done|declined|failed] [--limit <n>]
```

```text
      --status <status>  only those planned, done, declined or failed
      --limit <n>        how many (1–200, default 30)
```

### `palbase stores:actions:confirm`

Run a planned action at Apple: it names the hash of the plan that was shown, and is asked about first

```sh
palbase stores:actions:confirm <action id> --hash <hash>
```

What it does is shown, then asked about — in every environment, as it cannot be undone at Apple. -y confirms without asking.
An App Store page's plan is written after the answer (its screenshots take minutes): the command waits for it to be done or failed, 15 minutes at most; stopping the wait does not stop the writing.

```text
      --hash <hash>  the plan's hash, as it was shown when it was planned
```

### `palbase stores:actions:decline`

Decline a planned action: it never runs

```sh
palbase stores:actions:decline <action id>
```

## `purchases`

### `palbase purchases:catalog:get`

The environment's catalog: its newest revision, the products it sells and what they give

```sh
palbase purchases:catalog:get [--out <catalog.json>]
```

--out writes the catalog to a file to edit; catalog:put saves the edit with the revision it was edited from, which is printed.

```text
      --out <catalog.json>  write the catalog (the JSON catalog:put takes) to this file
```

### `palbase purchases:catalog:put`

Save a new revision of the whole catalog, on the revision it was edited from; nothing is written to a store

```sh
palbase purchases:catalog:put --file <catalog.json> --revision <n>
```

The module checks it first: a catalog that breaks a rule is refused with every problem, and nothing is saved.
Of two people editing at once, the second is told — the catalog moved past the revision they edited — never overwritten.
The stores are brought to it by a plan: palbase purchases:catalog:plan.

```text
      --file <catalog.json>  the catalog, as catalog:get --out wrote it ('-' or none: stdin)
      --revision <n>         the revision it was edited from (0 for the first), as catalog:get printed it
```

### `palbase purchases:catalog:validate`

Check a catalog without saving it: every problem, with its path and the store whose rule it breaks

```sh
palbase purchases:catalog:validate --file <catalog.json>
```

```text
      --file <catalog.json>  the catalog ('-' or none: stdin)
```

### `palbase purchases:catalog:plan`

Plan bringing the stores to the catalog's newest revision, store by store, before anything is written

```sh
palbase purchases:catalog:plan
```

A plan is confirmed with its Stripe part's hash (purchases:catalog:confirm) — with no Stripe account connected, its App Store part's; the App Store and Google Play parts are written by the stores module once their accounts are connected.

### `palbase purchases:catalog:confirm`

Write a plan — its Stripe part now, its App Store part through the stores module: it names the hash of the plan that was shown, and is asked about first

```sh
palbase purchases:catalog:confirm <plan id> --hash <hash>
```

What it writes is shown, then asked about — in every environment: a price written to Stripe is never changed or removed there, a product made in App Store Connect never goes away. -y confirms without asking.

```text
      --hash <hash>  the hash the plan printed (its Stripe part's; with no Stripe account, its App Store part's)
```

### `palbase purchases:catalog:decline`

Decline a plan: its Stripe part is never written

```sh
palbase purchases:catalog:decline <plan id>
```

### `palbase purchases:customer:get`

What a customer has, whatever store they bought in: entitlements, subscriptions, purchases, credits and limits

```sh
palbase purchases:customer:get <customer id>
```

The customer is the user's id; a guest merged into an account answers as the account.

### `palbase purchases:customer:grant`

Give a customer one of the catalog's entitlements, for a while or for life, saying why — a promotion, a support case, a tester

```sh
palbase purchases:customer:grant <customer id> <entitlement> --reason <why> [--for 30d | --until <date>]
```

The reason is the record. Without --for or --until the grant is for life. It prints the grant's id: purchases:customer:revoke ends it.
A customer not seen before is made; nothing is charged, in any store.

```text
      --reason <why>  why it is given (500 characters at most): the record
      --for <span>    how long: 12h, 30d, 2w
      --until <date>  when it ends (2026-12-31, or a time)
```

### `palbase purchases:customer:revoke`

End a granted entitlement now; what the customer bought is not touched

```sh
palbase purchases:customer:revoke <customer id> <grant id>
```

The grant's id is the one purchases:customer:grant printed. The entitlement stays on while a purchase still gives it.

### `palbase purchases:stripe`

The environment's Stripe account: whether one is connected, what Stripe last said of its key

```sh
palbase purchases:stripe
```

### `palbase purchases:stripe:grant`

A link that connects a Stripe restricted key: the key goes from the browser straight to the environment, never through Studio or this computer

```sh
palbase purchases:stripe:grant
```

The link works once, for 30 minutes; a project holds 10 open at most.

### `palbase purchases:stripe:install`

A link that connects the environment's Stripe account with one click: Palbase's Stripe App, installed at Stripe — no key pasted

```sh
palbase purchases:stripe:install
```

The link opens Palbase's install page, naming the project; from there Stripe: pick the account, accept what the App may do, and Stripe sends you back to Palbase, which connects it.
It works once, for 30 minutes; --live installs the App in live mode (Stripe test mode otherwise).
A restricted key connects an account too: palbase purchases:stripe:grant.

```text
      --live  install the App in live mode (test mode otherwise)
```

### `palbase purchases:storekit`

An Xcode StoreKit configuration of the environment's iOS products, under palbase/: a build Xcode runs buys them with no App Store

```sh
palbase purchases:storekit [--app <app>] [--out <palbase/….storekit>] [--storefront <code>]
```

Each plan is the App Store product its store id names, with its text in every language the catalog has and its price; a subscription is in its group, at its tier's level, with its introductory offer and the catalog's offers on it as promotional offers (a grant has no store).
Prices are in the storefront's currency: the catalog's price, or the amount set by hand in that currency. The storefront is --storefront, else the one the file has, else the one the catalog's currency is the App Store's own price in (USD: USA, EUR: Germany, TRY: Turkey …), else USA.
Made again, the file is made whole from the catalog — the same catalog, the same file — keeping the test settings Xcode's Editor menu wrote in it. Nothing outside palbase/ is written: Xcode is pointed at the file in the scheme.

```text
      --app <app>                 the iOS app it is for (default: the one this checkout syncs, or the project's only one)
      --out <palbase/….storekit>  where under palbase/ (default: palbase/environments/<env>/<app>.storekit)
      --storefront <code>         the App Store storefront prices are in, by its three letters (USA, DEU, TUR, GBR, JPN …)
```

### `palbase purchases:apple`

The environment's App Store connection: the In-App Purchase key, where the App Store reports, whether Xcode's purchases are taken

```sh
palbase purchases:apple
```

### `palbase purchases:apple:connect`

Connect an In-App Purchase key for an iOS app: it goes from this computer straight to the environment, never through Studio

```sh
palbase purchases:apple:connect --key-file <SubscriptionKey_KEYID.p8> [--key-id <KEYID>] [--issuer-id <issuer id>] [--app <app>] | --print-link
```

App Store Connect → Users and Access → Integrations → In-App Purchase makes the key (`SubscriptionKey_<KEYID>.p8`) and shows the Issuer ID — the team's, the same as its App Store Connect API keys': left out, the one stores:apple connected is taken.
The environment verifies the app's purchases and reads its subscriptions with it, and has the stores module point the App Store's notifications at the environment.
Studio is asked for a one-time grant alone; the key is posted with it to the environment's own address. --print-link prints a link that takes the key in a browser instead.

```text
      --key-file <SubscriptionKey_KEYID.p8>  the .p8 file Apple gave when the key was made
      --key-id <KEYID>                       the key's id (default: from the file's name)
      --issuer-id <issuer id>                the team's issuer id (default: the connected App Store Connect key's)
      --app <app>                            the iOS app (default: the one this checkout syncs, or the project's only one)
      --print-link                           only print a link that takes the key in a browser (valid 30 minutes, once)
```

### `palbase purchases:apple:disconnect`

Forget the environment's In-App Purchase key: the App Store's purchases and notifications are refused from then on (what was bought stays)

```sh
palbase purchases:apple:disconnect
```

### `palbase purchases:apple:xcode-certificate`

Take the purchases Xcode's StoreKit Testing signs with this certificate, as test purchases — never on production; --remove stops

```sh
palbase purchases:apple:xcode-certificate <certificate.cer> | --remove
```

Xcode saves the certificate: select the .storekit file (palbase purchases:storekit makes it), then Editor › Save Public Certificate.
From then on what the app reports signed with it — Xcode's own purchases, on a developer's Mac — is a test purchase of the environment, with or without an In-App Purchase key; nothing of it is asked of Apple. Set again, it replaces the one before.
The production environment takes only what the App Store signed: it is refused there.

```text
      --remove  stop taking Xcode's purchases (those taken stay)
```

### `palbase purchases:google`

The environment's Google Play purchases: the app they are made in, the topic its Play Console names, whether Play's test notification arrived

```sh
palbase purchases:google
```

### `palbase purchases:google:connect`

Sell on Google Play in one of the project's Android apps: Palbase makes the app's notifications topic and has it pushed to this environment

```sh
palbase purchases:google:connect [--app <app>]
```

The project's Play connection (palbase stores:google:connect) is the account Palbase reads and acknowledges the app's purchases as: its Play Console invites it with View financial data and Manage orders and subscriptions.
Then, in Play Console: Monetize with Play › Monetization setup › Real-time developer notifications, the topic this prints, Save, and Send test notification — palbase purchases:google says when it arrived.

```text
      --app <app>  the Android app (default: the one this checkout syncs, or the project's only one)
```

### `palbase purchases:google:disconnect`

Stop taking the environment's Google Play purchases: Play's notifications stop reaching it, and the app's reports are refused (what was bought stays)

```sh
palbase purchases:google:disconnect
```

### `palbase purchases:doctor`

Whether the environment sells in the App Store now, check by check — the App Store Connect side and the purchases side — with the fix of each that fails

```sh
palbase purchases:doctor [--app <app>]
```

Apple is asked now: the keys, the agreements, the app's App Store Connect record, where the App Store reports, the sandbox testers, each product's state, the catalog's last confirmation; and whether Xcode's purchases are taken.
It exits 1 while a check that is not informational fails: run it again until every line is ✓.

```text
      --app <app>  the iOS app (default: the environment's one linked app)
```

### `palbase purchases:paywalls`

The environment's paywalls: each one's draft revision, the version published, and the placements that show it

```sh
palbase purchases:paywalls
```

A paywall is a JSON definition: purchases:paywalls:get writes one to a file, purchases:paywalls:put saves the edit as its draft, purchases:paywalls:publish makes the draft what the apps draw.
An app sees a paywall once it is published and a placement shows it.
How a definition is written — every component and field, and three to start from: palbase purchases:paywalls:guide

### `palbase purchases:paywalls:get`

Write a paywall's draft — or a version published — to a file to edit, with the revision it is at

```sh
palbase purchases:paywalls:get <name|id> [--out <palbase/paywalls/name.json>] [--version <n>]
```

The file is the definition alone, as purchases:paywalls:put takes it, under palbase/paywalls/. Its first line names its JSON Schema, written beside it (palbase/paywalls/paywall.schema.json), so an editor checks the file as it is edited.
The revision printed is the one an edit is saved on: purchases:paywalls:put --revision.

```text
      --out <file>   where under palbase/ (default: palbase/paywalls/<name>.json)
      --version <n>  a published version instead of the draft
```

### `palbase purchases:paywalls:validate`

Check a paywall definition as publishing it would, without saving it: every problem, by its path

```sh
palbase purchases:paywalls:validate --file <paywall.json>
```

Every rule of the schema is checked, and every package against the environment's catalog as it is. A warning (what App Review expects of a paywall, say) does not stop a save or a publish.
It exits 1 while a problem that is not a warning is left; --json prints { valid, problems } either way.

```text
      --file <paywall.json>  the definition ('-' or none: stdin)
```

### `palbase purchases:paywalls:put`

Save a definition as a paywall's draft, on the revision it was edited from — or make the paywall, at revision 0; --publish publishes it too

```sh
palbase purchases:paywalls:put <name|id> --file <paywall.json> --revision <n> [--publish]
```

The module checks it first: a definition that breaks a rule is refused with every problem, and nothing is saved.
Of two people editing at once, the second is told — the draft moved past the revision they edited — never overwritten.
What the apps draw changes only when the draft is published (--publish, or purchases:paywalls:publish). A new paywall takes the name its definition gives.
How a definition is written: palbase purchases:paywalls:guide

```text
      --file <paywall.json>  the definition, as purchases:paywalls:get wrote it ('-' or none: stdin)
      --revision <n>         the draft revision it was edited from, as purchases:paywalls:get printed it (0 makes a new paywall)
      --publish              publish the saved draft as the next version
```

### `palbase purchases:paywalls:publish`

Publish a paywall's draft as its next version: what the apps asking for a placement that shows it draw from then on

```sh
palbase purchases:paywalls:publish <name|id> [--revision <n>]
```

It is checked as the apps will get it: every package must be sold by the catalog, every asset still what was registered.
--revision names the draft revision that was looked at: a draft saved since is not published in its place. Without it, the draft as it is now is published.
A draft the same as the newest version publishes nothing new.

```text
      --revision <n>  the draft revision looked at (default: the draft as it is now)
```

### `palbase purchases:paywalls:delete`

Delete a paywall and its versions; one a placement or a running experiment shows is not deleted

```sh
palbase purchases:paywalls:delete <name|id>
```

### `palbase purchases:paywalls:schema`

The JSON Schema of a paywall definition: every component, its fields and their bounds, for an editor or an agent to check a file against

```sh
palbase purchases:paywalls:schema [--out <palbase/paywalls/paywall.schema.json>]
```

It is the module's contract, as the CLI was built with it: a file that passes may still be refused for what only the module knows (the catalog's packages, the project's assets) — purchases:paywalls:validate asks it.
purchases:paywalls:get writes it too, and names it on the first line of each file ("$schema").

```text
      --out <file>  where under palbase/ (default: palbase/paywalls/paywall.schema.json); --json prints it instead
```

### `palbase purchases:paywalls:guide`

How a paywall definition is written by hand — for an agent or a person: the flow, every component and field in the contract's words, three definitions to start from

```sh
palbase purchases:paywalls:guide [--out <palbase/paywalls/GUIDE.txt>]
```

It is made from the definition's JSON Schema the CLI carries (purchases:paywalls:schema), so it says what this version of the CLI checks.

```text
      --out <file>  write it to a file under palbase/ instead of printing it
```

### `palbase purchases:paywalls:assets`

The project's paywall assets: the images, videos, fonts and HTML blocks a definition names `asset:<id>`

```sh
palbase purchases:paywalls:assets
```

### `palbase purchases:paywalls:assets:upload`

Upload a file to the project's storage and register it for paywalls: it answers the `asset:<id>` a definition names

```sh
palbase purchases:paywalls:assets:upload <file> [--kind image|video|font|html]
```

The file goes to the project's public bucket paywall-assets (made when there is none; a private one is left as it is, and refuses). The module then reads it there, says what it is by its bytes, and keeps their SHA-256: an app draws what it downloads only when it is that.
An image is PNG, JPEG or WebP, at most 2 MiB; a video MP4 or MOV, 50 MiB; a font TTF, OTF or WOFF2, 5 MiB; an HTML block a zip with index.html at its root, 5 MiB.

```text
      --kind <kind>  what the file is meant to be: one whose bytes are another kind is refused
```

### `palbase purchases:paywalls:assets:delete`

Forget a paywall asset no paywall names, and remove its file from the project's storage

```sh
palbase purchases:paywalls:assets:delete <asset:id|id>
```

### `palbase purchases:paywalls:preview`

A picture of a paywall as an app draws it — the SDK's own renderer, in a headless browser — to look at before it is saved

```sh
palbase purchases:paywalls:preview <name|id> | --file <paywall.json> [--platform ios|android|web] [--appearance light|dark] [--locale <tag>] [--text-size default|largest] [--package <key>] [--state tab=<id>,switch=on|off,sheet=<id>] [--full] [--all] [--out <png>] [--html <file>]
```

It draws the file being edited (--file), or a paywall's draft by its name. The picture is the platform's screen: its status bar and home indicator kept clear, as on a phone. --full draws the whole paywall instead: the part that scrolls in full, the header and the footer once.
Prices are the environment's catalog's, as the platform sells each package; a package it does not sell there is drawn at a sample price, and named. The project's assets are downloaded and drawn when their bytes are the ones registered.
It needs Chrome, Chromium, Edge or Brave (PALBASE_BROWSER names another; PALBASE_BROWSER_ARGS adds to its arguments, as --no-sandbox in a container that has no sandbox for it). Without one the page is written as HTML to open, and it exits 3; when the browser or the renderer cannot draw it, 4.
--all draws every platform in both appearances at both text sizes into one folder (`palbase/paywalls/.preview/<name>/`). --html writes the page alone, to open in a browser. purchases:paywalls:check measures what is drawn and lists what is wrong.

```text
      --file <paywall.json>      the definition to draw ('-': stdin)
      --locale <tag>             the reader's language (default: the definition's default_locale)
      --package <product.plan>   the package selected
      --state <k=v,…>            tab=<id> (every tabs component on it), switch=on|off, sheet=<id> (open)
      --width <px>               the screen's width in CSS pixels (default: the platform's)
      --height <px>              the screen's height (default: the platform's)
      --platform <platform>      ios (default), android or web: the screen and the platform's rules
      --appearance <appearance>  light (default) or dark
      --text-size <size>         default, or largest: every text at the largest size a reader sets
      --full                     the whole paywall, as tall as it is, not the screen alone
      --all                      every platform × appearance × text size, into one folder
      --out <file>               the PNG under palbase/ (default: palbase/paywalls/.preview/<name>-<platform>-<appearance>.png); with --all, the folder
      --html <file>              write the page alone, as HTML under palbase/, to open in a browser
```

### `palbase purchases:paywalls:check`

Measure a paywall as an app draws it, on every screen, and list what is wrong — code — where — what — exiting 1 while anything is

```sh
palbase purchases:paywalls:check <name|id> | --file <paywall.json> [--platform …] [--appearance …] [--text-size …] [--locale <tag>] [--package <key>] [--state …]
```

It draws the paywall with the SDK's own renderer in a headless browser — every platform, light and dark, at the default and the largest text size, unless a flag names one — and measures what shows:
overflow_x: wider than the screen · text_cut: a text cut off · word_broken: a word (a price) broken across lines · purchase_hidden: no purchase button on the screen as it opens · covered_by_footer: an interactive part still under the fixed footer with the paywall scrolled to its end · large_gap: an empty band over 12% of the screen · contrast: text under WCAG's 4.5:1 (3:1 large) · selection_contrast: the selected package or tab under 3:1 from the others · small_target: a target under 44×44 on a phone, 24×24 on the web (a switch, a link inside a sentence and a carousel's dots aside) · image_missing: an image that did not load · repeated_text: the same words twice in one package.
Each names the component by its path in the definition (root.children[2]) and the words it shows. A text over a picture or a gradient is said apart, as not measured (unmeasured_contrast): a note, not a problem.
--json prints { problems: [{ code, where, message, screens }], notes: [ … ], screens }.
It exits 0 when nothing is wrong, 1 when something is (and on a refusal: --json then prints { error } instead), 3 without a browser, 4 when the browser or the renderer could not draw the paywall.

```text
      --file <paywall.json>      the definition to draw ('-': stdin)
      --locale <tag>             the reader's language (default: the definition's default_locale)
      --package <product.plan>   the package selected
      --state <k=v,…>            tab=<id> (every tabs component on it), switch=on|off, sheet=<id> (open)
      --width <px>               the screen's width in CSS pixels (default: the platform's)
      --height <px>              the screen's height (default: the platform's)
      --platform <platform>      ios, android or web alone (default: all three)
      --appearance <appearance>  light or dark alone (default: both)
      --text-size <size>         default or largest alone (default: both)
```

### `palbase purchases:paywalls:templates`

The module's designed paywalls to start from: each one's key, what it looks like, and the packages it sells

```sh
palbase purchases:paywalls:templates
```

palbase purchases:paywalls:new `<name>` --template `<key>` writes one to a file, selling the catalog's own packages.

### `palbase purchases:paywalls:new`

Write a new paywall's definition to a file from one of the module's templates, selling the catalog's own packages, its pictures uploaded to the project

```sh
palbase purchases:paywalls:new <name> --template <key> [--package <template package>=<product.plan> …] [--out <palbase/paywalls/name.json>]
```

A template sells pro.monthly, pro.yearly, family.monthly, family.yearly and lifetime.once: each is renamed to the catalog's package that stands for it — the same one when the catalog sells it, else a plan of the same period. One that nothing stands for is said, and stays: --package `pro.yearly=<product>.<plan>` names it.
A template's pictures are uploaded to the project's public bucket paywall-assets (made when there is none; a private one is left as it is, and nothing is written) and registered; the definition names the project's assets in their place.
Nothing is saved to the environment but those assets: the file is edited, checked and looked at (purchases:paywalls:validate, :preview, :check), then saved with purchases:paywalls:put `<name>` --file `<file>` --revision 0.

```text
      --template <key>     the template, as purchases:paywalls:templates lists them
      --package <from=to>  a template's package and the catalog's that stands for it (repeat it, or a comma list)
      --out <file>         where under palbase/ (default: palbase/paywalls/<name>.json)
```

### `palbase purchases:placements`

The environment's placements: each one's default paywall, its rules and the experiment running on it

```sh
palbase purchases:placements
```

An app asks for a placement by its key (pb.purchases.paywall("onboarding")): an experiment running for everyone there decides first, then the first of its rules that holds for the viewer, then its default paywall.

### `palbase purchases:placements:set`

Give a placement its default paywall — what it shows whoever none of its rules holds for — making the placement when it is new

```sh
palbase purchases:placements:set <placement> --paywall <name|id>
```

The apps asking for it get the paywall's newest version they can draw; a paywall never published is nothing yet: they draw their own until it is.

```text
      --paywall <name|id>  the paywall it shows
```

### `palbase purchases:placements:delete`

Forget a placement and its rules: the apps that ask for it draw their own paywall

```sh
palbase purchases:placements:delete <placement>
```

### `palbase purchases:placements:rules:get`

A placement's rules, in the order they are read — each with its conditions, schedule and target — and their revision

```sh
palbase purchases:placements:rules:get <placement> [--out <palbase/….json>]
```

--out writes them to a file to edit ({ "rules": [ … ] }); rules:put saves the edit on the revision printed.

```text
      --out <file>  write the rules to this file, under palbase/
```

### `palbase purchases:placements:rules:put`

Replace a placement's rules — all of them, in the order they are to be read — on the revision they were edited from

```sh
palbase purchases:placements:rules:put <placement> --file <rules.json> --revision <n>
```

The first rule in effect whose conditions all hold for a viewer shows its target: a published paywall, or the variant of the experiment running on the placement for the rules. At most 50 rules of at most 10 conditions.
A condition reads country, platform, app, app_version, sdk_version, locale, entitlement, first_seen_days or an attribute the app sends; purchases:placements:preview tries rules against a viewer before they are saved (--rules).
Of two people editing at once, the second is told — the rules moved past the revision they edited — never overwritten.

```text
      --file <rules.json>  the rules, as rules:get --out wrote them ('-' or none: stdin)
      --revision <n>       the revision they were edited from, as rules:get printed it
```

### `palbase purchases:placements:preview`

What a placement shows a viewer, and why: the experiment, the rule that decided — every rule, condition by condition — or the default

```sh
palbase purchases:placements:preview <placement> [--platform ios|android|web] [--country TR] [--app-version 2.1.0] [--sdk palbase-swift@0.2.0] [--locale tr-TR] [--attr key=value …] [--user <id>] [--rules <file>] [--at <RFC3339>]
```

The viewer is what its app would send. With --user, the user's entitlements and the days since they were first seen are the project's; the user (else an installation) is who an experiment's variant is drawn for.
--rules tries rules not yet saved (a rules:put file) instead of the saved ones; --at, a moment (a scheduled rule's start). Nothing is counted or changed.

```text
      --platform <platform>    ios, android or web
      --country <code>         the store's country: ISO 3166-1, two or three letters
      --app-version <version>  the app's version
      --sdk <name@version>     the SDK the app draws with (palbase-swift@0.2.0)
      --locale <tag>           the viewer's language (BCP 47)
      --attr <key=value>       what the app says of the viewer (repeat it, or a comma list)
      --user <id>              the signed-in user
      --rules <file>           rules to try instead of the saved ones
      --at <RFC 3339>          the moment (default: now)
```

### `palbase purchases:placements:results`

What each of a placement's rules showed and what its viewers did — exposures, viewers, purchases, conversion, revenue — beside the rules since removed, an experiment's variants and the default

```sh
palbase purchases:placements:results <placement> [--days <n>] [--window-days <n>] [--sandbox]
```

What was shown in the last days (30 unless said, at most 90). The rules come in the order they are read, then the rules the placement no longer has, the variants of an experiment for everyone there, its default.
A purchase counts once, for what its buyer saw first at the placement, within the window after seeing it (7 days unless said): the purchases the stores confirmed, never what an app reports. Revenue is what was paid to date, renewals in, refunds out.

```text
      --days <n>         the days of what was shown the results look back over, 1 to 90 (default 30)
      --window-days <n>  the days after first seeing what was shown a purchase counts for it, 1 to 90 (default 7)
      --sandbox          count the stores' test purchases too
```

### `palbase purchases:placements:attributes`

The attribute keys the environment's apps sent with a placement's paywall, as they said them — suggestions for attribute conditions, the most used first, each with its JSON type and the hours it was seen in

```sh
palbase purchases:placements:attributes
```

An app sends what it says of the viewer as attributes (pb.purchases.paywall(placement, { attributes })); the keys are kept, never the values. They are what apps said, unverified — anyone with the publishable key can send one —: a help to write rules, not a list of what the app defines.
A key is seen again at most once an hour, and counted in one more hour as often. At most 200 are kept: past them a new key takes the place of the key seen longest ago once that one was last seen over a day ago, so keys sent once age out.

### `palbase purchases:experiments`

The environment's paywall experiments: the placement each runs on, its variants and their shares, and how it ended

```sh
palbase purchases:experiments [--placement <placement>]
```

```text
      --placement <placement>  one placement's alone
```

### `palbase purchases:experiments:start`

Start an experiment on a placement: each viewer is shown one of 2 to 4 published paywalls, by weight, the same one every time

```sh
palbase purchases:experiments:start <placement> --variants <paywall>=<weight>,<paywall>=<weight>[,…] [--audience placement|rules] [--name <name>]
```

audience placement (the default): everyone at the placement, decided before its rules; the placement is made when new and keeps its default for when the experiment ends.
audience rules: only the viewers the placement's rules send to it — a rule's target names the experiment (purchases:placements:rules:put).
The first variant is what a stop keeps. One experiment runs on a placement at a time; each variant's paywall must be published.

```text
      --variants <paywall=weight,…>  the paywalls (name or id) and their weights; key:paywall=weight names a key (else a, b, c, d)
      --audience <audience>          placement (default) or rules
      --name <name>                  the experiment's name (default: the placement and its paywalls)
```

### `palbase purchases:experiments:stop`

Stop a running experiment, at once: what it showed becomes its first variant's paywall; its results stay

```sh
palbase purchases:experiments:stop <id|name>
```

### `palbase purchases:experiments:winner`

End a running experiment with its winner: the winner's paywall becomes the placement's default — or, with --as-rule, a rule shows it to everyone

```sh
palbase purchases:experiments:winner <id|name> --variant <key> [--as-rule]
```

For an experiment for everyone at the placement, --as-rule rolls the winner out as a live rule at the top of its rules (to narrow later) and leaves the default as it is. For one for the rules, the rules that targeted it show the winner's paywall.
purchases:experiments:results says which variant leads and whether calling it is sound yet.

```text
      --variant <key>  the winning variant's key
      --as-rule        roll the winner out as a rule for everyone, at the top of the placement's rules
```

### `palbase purchases:experiments:results`

What each variant's viewers did — exposures, viewers, purchases, conversion, revenue — each one's chance to convert best, and whether calling the leader is sound

```sh
palbase purchases:experiments:results <id|name> [--window-days <n>] [--sandbox]
```

A purchase counts for the first variant its buyer saw, within the window after seeing it (7 days unless said): the purchases the stores confirmed, never what an app reports. Revenue is what was paid to date, renewals in, refunds out.
The chance to win is Bayesian (each variant's rate a Beta distribution): how likely each one is best. The leader is called soundly once every variant has been seen enough and its chance is high enough; until then the reasons are said.

```text
      --window-days <n>  the days after first seeing a variant a purchase counts for it, 1 to 90 (default 7)
      --sandbox          count the stores' test purchases too
```

### `palbase purchases:charts`

The purchase charts, each with its definition: what it counts, over which period, and how refunds, product changes, resubscriptions and test purchases count

```sh
palbase purchases:charts
```

A chart is read with purchases:charts:get `<chart>`; the figures of now with purchases:charts:overview.

### `palbase purchases:charts:overview`

The project's figures at a glance: MRR, active subscriptions and trials now; revenue, new customers and active customers over the last 28 days

```sh
palbase purchases:charts:overview [--revenue-type gross|net_of_taxes|proceeds] [--currency <code>] [--sandbox]
```

```text
      --revenue-type <type>  gross (default), net_of_taxes or proceeds
      --currency <code>      the currency to report money in (default: the reporting currency)
      --sandbox              count the stores' test purchases too
```

### `palbase purchases:charts:get`

One purchase chart, period by period — a table of its periods and segments, or the module's CSV

```sh
palbase purchases:charts:get <chart> [--from <YYYY-MM-DD>] [--to <YYYY-MM-DD>] [--resolution day|week|month] [--segment <dimension>] [--filter <dimension:value>]… [--revenue-type <type>] [--currency <code>] [--window-days <n>] [--cohort new_customers|new_paying_customers] [--sandbox] [--csv [--out <palbase/….csv>]]
```

Days are UTC; from and to are both included, at most two years apart (by default the last 30 days, 12 weeks or 12 months). A period marked `*` is not over: its value may still change.
Money is in the reporting currency (purchases:charts:settings) at the European Central Bank's rate of the day it was paid; proceeds take off the store's commission and Stripe's fee, which the ledger does not hold: they are estimated, and so are taxes a store did not state.
--csv prints the module's CSV (a row a segment and period) — on the terminal its control characters escaped —; with --out it is written to that file, under palbase/. A cell that would start a spreadsheet formula (=, +, -, @) begins with a quote.

```text
      --from <YYYY-MM-DD>         the first day
      --to <YYYY-MM-DD>           the last day, included (default today)
      --resolution <resolution>   day (default), week or month
      --segment <dimension>       split by a dimension (purchases:charts lists them)
      --filter <dimension:value>  keep only this value, one each --filter: --filter store:app_store --filter country:TR
      --revenue-type <type>       gross (default), net_of_taxes or proceeds
      --currency <code>           the currency to report money in (default: the reporting currency)
      --window-days <n>           the conversion window or customer lifetime, in days from a customer's first day, 0 to 730 (default: to now)
      --cohort <cohort>           the cohort explorer's cohorts: new_customers (default) or new_paying_customers
      --sandbox                   count the stores' test purchases too
      --csv                       the module's CSV instead of a table
      --out <file>                with --csv, write it to this file, under palbase/
```

### `palbase purchases:charts:settings`

The charts' settings — the reporting currency, the stores' commission, Stripe's fee and the App Store's fee on web purchases linked out of the app — read, or changed with the flags given

```sh
palbase purchases:charts:settings [--currency <code>] [--commission standard|small_business] [--stripe-percent <n>] [--stripe-fixed <amount>] [--stripe-fixed-currency <code>] [--app-store-link-percent <n>] [--app-store-link-days <n>]
```

Every amount is converted to the reporting currency at the European Central Bank's rate of the day it was paid; the ledger keeps what was paid as it was paid, so a change redraws every chart from its first day.
The commission is what proceeds take off App Store and Google Play payments: standard (30%; 15% of a subscription's renewals after its first paid year in the App Store, and of every Google Play subscription) or small_business (15%). Stripe's fee — its share and fixed part — is taken off web payments; the ledger does not hold it, so proceeds are estimated.
The App Store's link fee is what Apple takes of a web purchase bought through a link out of the iOS app in its United States storefront, within the days after the link: nothing today (App Review Guideline 3.1.1(a)), set here once Apple charges one.

```text
      --currency <code>               the reporting currency, one the European Central Bank published a rate for in the last ten days
      --commission <commission>       standard (30%) or small_business (15%)
      --stripe-percent <n>            Stripe's share of a payment, in percent (2.9)
      --stripe-fixed <amount>         Stripe's fixed fee of a payment (0.30)
      --stripe-fixed-currency <code>  the currency of Stripe's fixed fee (USD)
      --app-store-link-percent <n>    the App Store's share of a web purchase linked out of the iOS app, in percent (0)
      --app-store-link-days <n>       for how many days after the link a purchase owes it (7)
```

## `apps`

### `palbase apps:list`

The project's apps, and what each is in every environment it is set in

```sh
palbase apps:list
```

### `palbase apps:create`

Register an app of the project (an iOS app names its Apple team); then set it in each environment (apps:env:set)

```sh
palbase apps:create ios|android|web <name> [--slug <slug>] [--team-id <id>] [--app-id-prefix <prefix>]
```

An app is one product on one platform: its widgets, notification service and other extensions are not apps of their own — Apple gives them bundles under the app's, and they share its sign-in.
The slug is the app's file in a checkout: `palbase/environments/<env>/<slug>.json`.

```text
      --slug <slug>             its name in a checkout (default: from the name)
      --team-id <id>            an iOS app's Apple team: 10 characters, Apple Developer › Membership
      --app-id-prefix <prefix>  an iOS app's App ID prefix when it is not the team's (an app made before 2011, or moved from another team)
```

### `palbase apps:get`

An app of the project, with what it is and its key in every environment it is set in

```sh
palbase apps:get <app>
```

### `palbase apps:update`

Rename an app, or change an iOS app's Apple team: every environment it is in is told

```sh
palbase apps:update <app> [--name <name>] [--team-id <id>] [--app-id-prefix <prefix>|""]
```

```text
      --name <name>             what it is called
      --team-id <id>            an iOS app's Apple team
      --app-id-prefix <prefix>  its App ID prefix; "" for the team's
```

### `palbase apps:delete`

Delete an app: suspended in every environment for 30 days — its builds stop reaching the project — then removed for good

```sh
palbase apps:delete <app>
```

### `palbase apps:restore`

Bring a deleted app back as it was, with its keys, in every environment

```sh
palbase apps:restore <app>
```

### `palbase apps:env:set`

What an app is in the environment: its bundle (iOS), package and signing certificates (Android) or origins (web)

```sh
palbase apps:env:set <app> [--bundle <id> [--app-clip <id>] [--watch <id>]] [--package <id> --sha256 <label>=<fingerprint>…] [--origin <url>… --redirect <url>…]
```

iOS: the app's bundle in this environment; its App Clip and watch app are the bundle followed by one more part. Its extensions are not set: they share the app's.
Android: its application ID and the SHA-256 of each certificate it is signed with — Play Console › App signing (Google's app signing key, not the upload key), ./gradlew signingReport for a debug key. Label each: debug, play_signing, upload…
Web: the origins its pages are served from (https; http only on this computer) and the addresses a sign-in may return to.
The platform publishes it to Apple and Google for the environment: a device sees a change in a day or so (Apple caches its file; Android 15 re-checks within a week).

```text
      --bundle <id>                 an iOS app's bundle identifier here
      --app-clip <id>               its App Clip's bundle (the bundle followed by one more part)
      --watch <id>                  its watch app's bundle (the bundle followed by one more part)
      --package <id>                an Android app's application ID here
      --sha256 <label=fingerprint>  a signing certificate's SHA-256, labelled (play_signing=AB:CD:…); every one the app is signed with
      --origin <url>                a web app's origin
      --redirect <url>              an address a sign-in may return to
```

### `palbase apps:env:unset`

Take an app out of the environment: its key there revoked, Apple's and Google's files no longer naming it

```sh
palbase apps:env:unset <app>
```

### `palbase apps:sync`

Write each environment's settings and backend clients (Palbe) of this checkout's apps under palbase/ — nothing else is touched

```sh
palbase apps:sync [<app>…] [--check] [--types <env>] [--backend [<machine>=]<dir>] [--as <machine>=<name>]…
```

The apps named join this checkout's (palbase/project.json); with none named, its apps are synced.
`palbase/environments/<env>/`: each app's settings (`<app>.json`), each backend's contract (`contracts/<machine>.openapi.json`) and Palbe client made from it — TypeScript for a web app, Swift for an iOS app (in `palbase/<app>.palbase`), Kotlin for an Android app. A web app imports pb from `palbase/<app>.ts`: one environment's for the editor (--types), the build's mode's for the build (palbase() in vite.config), which type-checks the app against that environment.
--check writes nothing: it exits 1 naming what differs from the project now — for CI.
--backend makes a backend's Palbe from its checkout on this computer (its palbase/backend app writes its contract and exits; nothing is connected to), to try an endpoint before any machine serves it.
A backend is `pb.<name>` in the apps — pb.shopApi.rooms.create() for the machine shop-api — unless --as names it (--as shop-api=shop): the name is the checkout's, the same in every environment, and none of the client's own (auth, flags, storage, …).

```text
      --check                    write nothing; exit 1 when the checkout is not what the project gives now
      --types <env>              the environment the editor's types are of (remembered in palbase/project.json)
      --backend <[machine=]dir>  a backend's checkout here: its Palbe made from the contract it writes, not from its machine's
      --as <machine=name>        a backend's name in the apps (pb.<name>): its machine's camelCased unless named; the same in every environment (remembered in palbase/project.json)
```

### `palbase apps:sdkconfig`

An app's settings in the environment, as palbase apps:sync writes them: its address, its publishable key, what its modules tell it

```sh
palbase apps:sdkconfig <app> [--format json|env]
```

The publishable key is public: it ships in the app. A secret key never does.

```text
      --format <format>  json (default) or env
```

## `github`

### `palbase github:connect`

Link the environment to GitHub: Palbase Cloud's GitHub app on the account whose repositories machines are built from

```sh
palbase github:connect [--device | --github-token-stdin | --from <env> [--repo <owner/name>…]] [--installation <account|id>] [--all-envs]
```

Opens GitHub; back from it, the page shows the account and you link it by writing the environment's ref.
--from `<env>`: the installation another environment of the organization linked (its slug in this project, or its ref), linked here too with no GitHub sign-in — a program that opens a project for each product (an admin, or an admin access token). The environment reaches what the GitHub user who linked it there can push to.
--repo `<owner/name>` (given again for more): with --from, the environment reaches those repositories of the installation alone, never one it reaches later — a product's environment builds nothing of another product's.
--device: no browser here — GitHub's device flow (a code you enter at github.com/login/device on any device); the GitHub token stays in memory.
--all-envs links every environment of the project the same way.

```text
      --device                     GitHub's device flow, for a computer with no browser (a server, an agent)
      --github-token-stdin         a GitHub user's token from stdin (CI): the installations it reaches, no browser and no code
      --installation <account|id>  which installation to link, when the GitHub user reaches more than one (--device)
      --all-envs                   link every environment of the project
      --from <env>                 another environment of the organization whose linked installation this one shares (its slug in this project, or its ref): no GitHub sign-in
      --repo <owner/name>          with --from: the repositories it reaches of the installation, and no other (given again for more)
```

### `palbase github:list`

The GitHub accounts linked to the environment, and who linked each

```sh
palbase github:list
```

### `palbase github:repos`

The repositories machines of the environment may be built from

```sh
palbase github:repos
```

### `palbase github:disconnect`

Unlink a GitHub account from the environment; its repositories are no longer built

```sh
palbase github:disconnect <account|installation-id>
```

## `machines`

### `palbase machines:sizes`

The machine sizes, and which of them this environment may open now

```sh
palbase machines:sizes
```

### `palbase machines:list`

The environment's machines: size, state, the version serving, address

```sh
palbase machines:list
```

### `palbase machines:get`

A machine in full: its source, size, environment, database and the build serving

```sh
palbase machines:get [name]
```

### `palbase machines:create`

Make a machine from the code in this directory, built on every push to its branch

```sh
palbase machines:create [name] [--size <size>] [--db <database> --migrations] [--repo --branch --path --context] …
```

Run in a checkout, it reads the repository from origin, the branch from HEAD and the directory from where you are; flags say otherwise.
The first build starts at once; --wait follows it until the machine serves, and prints its address.
The environment needs its GitHub link first: palbase github:connect.

```text
      --repo <owner/name>                 the GitHub repository (default: this checkout's origin)
      --branch <branch>                   the branch whose pushes are built and rolled out (default: the one checked out)
      --path <dir>                        the directory built, from the repository's root (default: this directory's place in it)
      --context <dir>                     what the build is given above --path (a monorepo: ".")
      --size <size>                       its size (palbase machines:sizes lists them)
      --replicas <n>                      how many copies run, each on a node of its own
      --port <port>                       the port it listens on (it also finds it in PORT)
      --health <path>                     where it answers 2xx while well; a release that does not is not rolled out
      --openapi-path <path>               where its app serves its OpenAPI contract, when it is not a Palbase backend (apps:sync makes its client from it); "" for a Palbase backend's own
      --db <database>                     a database of the environment it is given (PALBASE_DB_URL); "" for none
      --migrations                        run the database's migrations before each release (a Palbase backend's)
      --secrets <production|development>  the secrets it is started with, by name; "" for none
      --var <K=V>                         a setting it is started with (repeat it); secrets go in secrets:set
      --test-command <command>            what each new build runs before it takes traffic, in its image, against the new version itself once its migration has run (bun test, npm test); a failure fails the build and the machine runs what it ran; "" for none
      --test-users <names>                the test users each test run makes for its tests (api.signInAs), comma-separated; "" for none
      --wait                              follow the first build until the machine serves
```

### `palbase machines:update`

Change a machine: the change rolls out as a new version beside the one serving

```sh
palbase machines:update [name] [--size …] [--replicas …] [--db …] [--repo --branch --path --context] …
```

```text
      --repo <owner/name>                 the GitHub repository (default: this checkout's origin)
      --branch <branch>                   the branch whose pushes are built and rolled out (default: the one checked out)
      --path <dir>                        the directory built, from the repository's root (default: this directory's place in it)
      --context <dir>                     what the build is given above --path (a monorepo: ".")
      --size <size>                       its size (palbase machines:sizes lists them)
      --replicas <n>                      how many copies run, each on a node of its own
      --port <port>                       the port it listens on (it also finds it in PORT)
      --health <path>                     where it answers 2xx while well; a release that does not is not rolled out
      --openapi-path <path>               where its app serves its OpenAPI contract, when it is not a Palbase backend (apps:sync makes its client from it); "" for a Palbase backend's own
      --db <database>                     a database of the environment it is given (PALBASE_DB_URL); "" for none
      --migrations                        run the database's migrations before each release (a Palbase backend's)
      --secrets <production|development>  the secrets it is started with, by name; "" for none
      --var <K=V>                         a setting it is started with (repeat it); secrets go in secrets:set
      --test-command <command>            what each new build runs before it takes traffic, in its image, against the new version itself once its migration has run (bun test, npm test); a failure fails the build and the machine runs what it ran; "" for none
      --test-users <names>                the test users each test run makes for its tests (api.signInAs), comma-separated; "" for none
```

### `palbase machines:env:list`

What a machine is started with, and where each comes from (the platform, the machine, its secrets)

```sh
palbase machines:env:list [name]
```

### `palbase machines:env:set`

Set settings a machine is started with (not secrets: secrets:set keeps those)

```sh
palbase machines:env:set K=V… [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:env:unset`

Take settings away from what a machine is started with

```sh
palbase machines:env:unset K… [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:builds`

A machine's builds, newest first

```sh
palbase machines:builds [name]
```

### `palbase machines:builds:log`

A build's log (the newest build's when none is named)

```sh
palbase machines:builds:log [build] [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:logs`

A machine's log: the last hour, or since a time; -f follows what it writes next

```sh
palbase machines:logs [name] [-f] [--since <time>] [--lines <n>] [--search <text>]
```

```text
  -f, --follow         keep printing what the machine writes
      --since <time>   from when: an RFC 3339 time, or 10m, 2h, 1d ago
      --lines <n>      how many lines at most (default 200)
      --search <text>  only the lines that hold this text
```

### `palbase machines:deploy`

Build the head of a machine's branch now and roll it out, as a push does

```sh
palbase machines:deploy [name] [--wait]
```

A push to the branch does this by itself; this is for the one GitHub did not deliver, or a build again.
The commit is the branch's head on GitHub: push first.

```text
      --wait  follow the build until the machine serves it
```

### `palbase machines:rollback`

Serve an earlier build again (the one before the serving one, or a named one)

```sh
palbase machines:rollback [name] [--to <build>]
```

```text
      --to <build>  the build to go back to (default: the last one that served before)
```

### `palbase machines:crons`

The crons a machine runs on a schedule (its app's @Cron classes): when each is next due, on which zone's clocks, and how its last run went

```sh
palbase machines:crons [name]
```

### `palbase machines:crons:runs`

A cron's runs, newest first

```sh
palbase machines:crons:runs <cron> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:crons:run`

Run a cron now, apart from its schedule — the machine woken for it if asleep

```sh
palbase machines:crons:run <cron> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:crons:pause`

Pause a cron: it is not run until resumed, whatever version of the machine comes up meanwhile

```sh
palbase machines:crons:pause <cron> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:crons:resume`

Resume a paused cron: it is due at its next time from now — what it missed is not made up

```sh
palbase machines:crons:resume <cron> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:tasks`

The tasks on a machine's queue (its app's @Task classes), newest first: of one state, one type, or all

```sh
palbase machines:tasks [--machine <name>] [--state waiting|running|succeeded|failed|cancelled] [--task <type>] [--limit <n>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
      --state <state>   only tasks in this state
      --task <type>     only tasks of this type
      --limit <n>       the most listed (50; 100 at most)
```

### `palbase machines:tasks:types`

The task types a machine's running version declares, and what each one's queue holds

```sh
palbase machines:tasks:types [name]
```

### `palbase machines:tasks:get`

One task on a machine's queue, with what it carries

```sh
palbase machines:tasks:get <task id> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:tasks:enqueue`

Put a task on a machine's queue, as its app's Tasks.enqueue does

```sh
palbase machines:tasks:enqueue <type> [--payload '<json>'] [--delay <seconds>] [--key <key>] [--machine <name>]
```

```text
      --machine <name>   the machine (default: the only one, or this directory's)
      --payload <json>   what it carries: a JSON value (64 KiB at most)
      --delay <seconds>  due this many seconds from now (30 days at most)
      --key <key>        put once under this key (held until a day after the task is over)
```

### `palbase machines:tasks:retry`

Put a task that failed back on the queue, due now, with as many attempts again as its type gives

```sh
palbase machines:tasks:retry <task id> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:tasks:cancel`

Take a task that is waiting off the queue: it is not run, nor tried again

```sh
palbase machines:tasks:cancel <task id> [--machine <name>]
```

```text
      --machine <name>  the machine (default: the only one, or this directory's)
```

### `palbase machines:contract`

The API a Palbase backend serves (its OpenAPI document), as the platform reads it from the machine

```sh
palbase machines:contract [name]
```

### `palbase machines:delete`

Delete a machine: it stops serving, its address answers nothing

```sh
palbase machines:delete <name>
```

## `databases`

### `palbase databases:sizes`

The database sizes, and which of them this environment may open now

```sh
palbase databases:sizes
```

### `palbase databases:list`

The environment's databases: size, state, how full

```sh
palbase databases:list
```

### `palbase databases:get`

A database in full, with how to connect to it

```sh
palbase databases:get <name>
```

### `palbase databases:create`

Open a database; its passwords are kept on this computer (the platform shows them once)

```sh
palbase databases:create [name] [--size <size>] [--allow <ip/cidr,…>] [--backup-days <n>] [--show-passwords]
```

```text
      --size <size>      its size (palbase databases:sizes lists what is open)
      --allow <list>     who may connect, as addresses or CIDRs, comma-separated (default: anyone with the password)
      --backup-days <n>  how many days of backups to keep, 1 to 35
      --show-passwords   print the passwords too (they are kept on this computer either way)
```

### `palbase databases:update`

Change a database's size, who may connect to it, or how long its backups are kept

```sh
palbase databases:update <name> [--size <size>] [--allow <list>|""] [--backup-days <n>] [--wait]
```

A new size is taken at once and the database moves to it serving on (palbase databases:sizes lists them): its sessions on the direct port end once, when its primary moves, and new logins wait a few seconds then.

```text
      --size <size>      the size to move it to
      --allow <list>     who may connect (comma-separated addresses or CIDRs); "" for anyone with the password
      --backup-days <n>  how many days of backups to keep, 1 to 35
      --wait             with --size: follow the move until it serves at the new size
```

### `palbase databases:password:reset`

Make a database role's password new; it is kept on this computer, the old one stops working

```sh
palbase databases:password:reset <name> --role owner|app [--show-password]
```

The app role's new password reaches the machines given the database as they roll out with it; they keep serving.

```text
      --role <role>    owner (migrations, the console) or app (what the machines use)
      --show-password  print it too
```

### `palbase databases:restore`

Bring a database back to a moment of its backups

```sh
palbase databases:restore <name> --to <time>
```

```text
      --to <time>  the moment, as an RFC 3339 time (2026-10-08T12:00:00Z)
```

### `palbase databases:delete`

Delete a database (the platform keeps it 7 days to take back)

```sh
palbase databases:delete <name>
```

### `palbase databases:undelete`

Take back a database deleted in the last 7 days

```sh
palbase databases:undelete <name>
```

### `palbase databases:purge`

Delete a deleted database for good, now

```sh
palbase databases:purge <name>
```

## `db`

### `palbase db:url`

A database's connection address, for any tool (Prisma, Drizzle, pg_dump, a GUI)

```sh
palbase db:url [name] [--role owner|app] [--pooled] [--with-password]
```

Without --with-password the address holds no password: give the tool PGPASSWORD, or pass --with-password and keep the line out of your history.
The address asks for a checked certificate (sslmode=verify-full). Node drivers check it against the system's roots by themselves; psql, pg_dump and other libpq tools do only with PGSSLROOTCERT=system (Postgres 16+). The address does not say so itself: a driver that sends what it does not know to the server (postgres.js) would be refused.

```text
      --role <role>    owner (migrations, dumps) or app (what the machines use); default owner
      --pooled         the pooled port (PgBouncer, transaction mode): for an app's many short connections
      --with-password  put the password in the address
```

### `palbase db:shell`

Psql on a database (it wakes if asleep); -c runs one statement and ends

```sh
palbase db:shell [name] [--role owner|app] [--command <sql>]
```

```text
      --role <role>    owner (migrations, dumps) or app (what the machines use); default owner
  -c, --command <sql>  run this and end
```

### `palbase db:dump`

A copy of a database (pg_dump's custom format), as its owner

```sh
palbase db:dump [name] [--file <path>] [--schema-only]
```

```text
      --file <path>  where to write it (default <database>-<time>.dump)
      --schema-only  its structure, not its data
```

### `palbase db:restore`

Load a dump into a database, as its owner: a custom-format dump (pg_restore) or a .sql file (psql)

```sh
palbase db:restore <file> [--db <name>] [--clean]
```

A database Palbase did not make is taken over by its first release: its tables stay as they are (palbase db:pull writes their schema files).

```text
      --db <name>  the database (default: the environment's only one)
      --clean      drop what the dump makes before making it again
```

### `palbase db:copy`

Copy a database's data from one environment of the project to another

```sh
palbase db:copy --from <env> --to <env> [--db <name>] [--to-db <name>]
```

The target is overwritten with the source: what it held of the same tables goes (pg_restore --clean).

```text
      --from <env>    the environment copied from (slug)
      --to <env>      the environment copied into (slug)
      --db <name>     the source's database (default: its only one)
      --to-db <name>  the target's database (default: the same name)
```

### `palbase db:plan`

What a start of the app's schema would do to a database, and what it would refuse — nothing is changed

```sh
palbase db:plan [--url <postgres-url> | --db <name>] [--check]
```

--check ends with 1 when the schema would be refused: run it in CI before a push to production (-E main).

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
      --check               end with 1 when the plan has refusals
```

### `palbase db:status`

A database's Palgres ledger: the version serving, and the migration open and who opened it

```sh
palbase db:status [--url <postgres-url> | --db <name>]
```

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
```

### `palbase db:push`

Try the app's schema on a database: your own one at once, the environment's beside the version serving

```sh
palbase db:push [--url <postgres-url> | --db <name>] [--reset]
```

On a database of your own (--url) the migration is started and completed at once; a refused one can --reset (its data goes, the schema is made anew).
On the environment's database it is only started: the release serving goes on with its version, your backend with yours; the next release completes it, or takes its place.
One migration is open at a time: yours is replaced by your next push; another developer's or a release's is said, and yours waits.
Production's schema changes with its releases alone: db:push refuses it (db:plan -E main shows what a release would do).

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
      --reset               with --url: make the schema anew, its data gone
```

### `palbase db:migrate`

A migration step by hand: start, complete or rollback — for a database whose app runs elsewhere, or to finish one

```sh
palbase db:migrate <start|complete|rollback> [--url <postgres-url> | --db <name>]
```

An app that is not one of the environment's machines: start, release the app, then complete once the old one is gone (pgroll's way).

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
```

### `palbase db:pull`

Write the schema files (`db/*.ts`) of what a database holds: to take a database over

```sh
palbase db:pull [--url <postgres-url> | --db <name>] [--dir <dir>]
```

Its first release then takes the database over: the tables stay as they are, nothing is copied.

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
      --dir <dir>           where db/ is written (default: here)
```

### `palbase db:seed`

Run db/seed.ts against a database that is not production

```sh
palbase db:seed [--url <postgres-url> | --db <name>] [--file <path>]
```

```text
      --url <postgres-url>  a database of your own (a local Postgres 18): the schema goes in it at once
      --db <name>           the environment's database (default: its only one)
      --entry <file>        the app's entry, what it is started with (default src/main.ts)
      --file <path>         the seed script (default db/seed.ts)
```

### `palbase db:types`

Write the app's tables into palbase/palbase-env.d.ts as types — rows, inserts, unique keys and relations both ways (with, has) — from its schema files

```sh
palbase db:types [--entry <file>] [--file <path>]
```

`Database.public.<table>` and `Database.<schema>.<table>` are typed from them with no import and no generic — the relations of a foreign key to another file's table too, which a schema's own type (TablesOf) cannot see: an app that declares Tables with TablesOf leaves that out once it has these. palbase init --db writes the block of its starter schema; run db:types again when a schema changes.
No database is asked: the app is started in its types mode, which reads its schema files and writes nothing else. Only the block between the palbase:env markers is written; run it again when a schema changes.

```text
      --entry <file>  the app's entry, what it is started with (default src/main.ts)
      --file <path>   the file (default palbase/palbase-env.d.ts)
```
