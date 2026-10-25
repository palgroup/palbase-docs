> The full documentation index: https://palbase.studio/llms.txt

# CLI

`palbase` is the command line for your organizations, projects and environments. It comes in the same npm package as the SDKs: `npx palbase <command>` runs it with nothing installed, and in a project that depends on `palbase` it runs the version installed there.

A machine is deployed by a push to its branch, which builds and rolls it out ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)); `palbase machines:deploy` builds the branch's head again, for a push GitHub did not deliver. The CLI does what a push does not — registering client apps and writing their settings, the purchase catalog, an environment's auth, storage, flags and notification settings, tokens for CI and agents, a database's dumps and restores. It is also how a script, a CI job or an AI agent works with Palbase. Every command is in the [CLI reference](https://palbase.studio/docs/cli/reference).

## Signing in

```sh
npx palbase login
```

`login` shows a one-time code and opens Studio, where you approve it while signed in. On a computer with no browser — a server, a container, an agent's sandbox — `palbase login --no-browser` prints the address to open on any device. The CLI then holds a session of yours: Studio lists it beside your other sessions, and ending it there signs the CLI out. `palbase logout` ends it from the terminal, and `palbase whoami` prints who the CLI acts as.

## Choosing an environment

Most commands act on one environment of one project. `palbase use` chooses it for the directory you are in:

```sh
palbase use shop/main          # the project "shop", its environment "main"
palbase use acme/shop/staging  # when two organizations have a project named "shop"
palbase status                 # who you are there, its machines and databases
```

The choice is kept on this computer, not in the repository, so two checkouts of the same project can each act on their own environment. Commands run in that directory, or one under it, act on it. `-P <project>` and `-E <env>` choose for a single command instead:

```sh
palbase flags:list -P shop -E staging
```

A change to a production environment asks for confirmation; `--yes` gives it in a script. `--non-interactive` makes a command refuse anything that would ask, and `--json` prints the answer as JSON for a program to read. These are the [global flags](https://palbase.studio/docs/cli/reference#global-flags) every command takes.

## Projects, environments and keys

```sh
palbase projects:create shop                 # a project with its first environment, main; its keys are printed
palbase envs:create staging --from main      # another environment of the project chosen here
palbase keys:create --kind publishable --label web
palbase open auth                            # the environment's Auth section in Studio
```

`palbase projects:list` and `palbase envs:list` list what you can reach. A new key's value is printed once; `palbase keys:list` lists the environment's keys without their values, and `palbase keys:revoke <key-id>` refuses whatever holds one from its next request.

Two environments of a project drift apart as settings change in one and not the other. `palbase config:diff --from staging --to main` shows how their module settings differ — auth, storage, flags, notifications, realtime, analytics — and `palbase config:copy --from staging --to main` makes the second equal to the first; secrets are not copied, only named. `palbase types:pull` writes the environment's secret, flag, bucket and role names into `palbase/palbase-env.d.ts`, so `Secrets.get`, `Flags` and `Storage.buckets` accept those names and no others.

## Running a backend on your computer

`palbase init` starts a backend on `palbase/backend` in the current directory: a health route, its module, its tests and a Dockerfile; `--db` adds a schema with its routes and their test ([Project Structure](https://palbase.studio/docs/getting-started/project-structure)). Nothing that already exists is written over.

The backend needs the environment's address and a key to run. Two commands give it them:

- `palbase env:pull` writes them into `.env.local`, between markers it owns; the rest of the file stays as it is. The key is yours, lasts 30 days, and is revoked by `palbase logout`. No secret's value is written: the app reads the project's secrets when it starts.
- `palbase run -- bun dev` runs a command with them in its environment and writes nothing to disk.

`palbase test` runs the backend's tests the way the platform runs them before a build takes traffic: test users are made for the run, their tokens are handed to the command, and they are deleted when it ends ([Testing](https://palbase.studio/docs/backend/testing)).

```sh
palbase test --users alice,bob --base-url http://localhost:8080 -- bun test ./tests
```

## In CI

A CI job signs in with an organization's access token instead of a person: set it as the job's `PALBASE_TOKEN` secret, and the CLI acts with it at its role — member or admin — on every project of the organization.

```sh
palbase tokens:create github-actions --role admin --days 90
```

The value is printed once. Tokens are listed with `palbase tokens:list` (never their values) and revoked with `palbase tokens:revoke <name>`; [Access Tokens](https://palbase.studio/docs/getting-started/access-tokens) says what a token may and may not do. In CI, `palbase apps:sync --check` exits 1 when the app's committed settings and clients are not what the project gives now.

## For an AI agent

An agent that works on one environment gets an environment token rather than an organization's: it does what your role does in that environment alone, for a few hours, and never makes or shows a standing credential, changes people or roles, or deletes a project or an environment.

```sh
palbase env:tokens:create --minutes 120 --name coding-agent
palbase env:tokens:create --scope machines:read,machines:logs   # only read machines and their logs
```

Give the agent the value as `PALBASE_TOKEN`. `--scope` narrows it to `machines:read`, `machines:logs`, `apps:sync`, `auth:test-users` or `support`. `palbase env:tokens:list` lists the live ones and `palbase env:tokens:revoke <id>` ends one at its next request. The docs an agent reads are at `/llms.txt`, with every page in one file at `/llms-full.txt`.

## Searching the docs

`palbase docs:search` finds what these docs say about what you need — by its meaning, in your own words; ask in English, the docs' language — and prints the sections that answer it, each with its address and its text:

```sh
palbase docs:search "<what you need>"
palbase docs:search "<what you need>" --limit 3 --json
```

Say what you need as a question of your own — what you are trying to do, not the words of a heading — and the search finds the sections that mean it.

It needs no sign-in, and a page changed here is found by what it says now within minutes. A caller searches 10 times in ten seconds, 30 a minute and 300 an hour: a sign-in or `PALBASE_TOKEN`, sent when there is one, as itself, and a search with neither by its address. When many search at once, a search waits its turn for a few seconds, or is told to search again in a moment. `--json` prints what the search answered — what an agent reads.

## Asking Palbase's support line

What the docs do not answer — a command or call that fails with nothing to act on, a page that is wrong or missing, something Palbase seems not to do — goes to Palbase's support line:

```sh
palbase support:ask "machines:deploy fails with build_failed and the log ends at npm ci — what is wrong?"
```

The answer comes from these docs and from what the environment shows you: its machines, their last builds and the end of a failed build's log, read with your own sign-in or token and sent with the question. When the answer is that Palbase lacks something, the CLI prints a case number: Palbase has it, and you are told by email when Palbase closes it. Keys, tokens and passwords in a question are masked before anyone reads it. An agent asks with an environment token that has the `support` scope. A person asks 30 questions an hour, a project 60.

## What the commands cover

| Group | What it does |
|---|---|
| [`orgs`](https://palbase.studio/docs/cli/reference#orgs), [`projects`](https://palbase.studio/docs/cli/reference#projects), [`envs`](https://palbase.studio/docs/cli/reference#envs) | Organizations and their members, projects, environments ([Organizations](https://palbase.studio/docs/getting-started/organizations)) |
| [`tokens`](https://palbase.studio/docs/cli/reference#tokens), [`keys`](https://palbase.studio/docs/cli/reference#keys), [`env`](https://palbase.studio/docs/cli/reference#env) | Access tokens, an environment's API keys, environment tokens and `.env.local` |
| [`apps`](https://palbase.studio/docs/cli/reference#apps) | The apps that call the project, and the settings and backend clients written into their repositories ([Client Apps](https://palbase.studio/docs/apps/overview)) |
| [`auth`](https://palbase.studio/docs/cli/reference#auth) | Sign-in providers, settings, roles, hooks, users, the audit trail ([Auth](https://palbase.studio/docs/auth/overview)) |
| [`storage`](https://palbase.studio/docs/cli/reference#storage), [`flags`](https://palbase.studio/docs/cli/reference#flags), [`notify`](https://palbase.studio/docs/cli/reference#notify), [`realtime`](https://palbase.studio/docs/cli/reference#realtime), [`analytics`](https://palbase.studio/docs/cli/reference#analytics), [`secrets`](https://palbase.studio/docs/cli/reference#secrets), [`webhooks`](https://palbase.studio/docs/cli/reference#webhooks) | Each module's settings and data |
| [`purchases`](https://palbase.studio/docs/cli/reference#purchases) | The catalog, paywalls, the stores' connections and customers ([Purchases](https://palbase.studio/docs/purchases/overview)) |
| [`stores`](https://palbase.studio/docs/cli/reference#stores) | Builds, testers and review on TestFlight and Google Play ([App Distribution](https://palbase.studio/docs/distribution/overview)) |
| [`github`](https://palbase.studio/docs/cli/reference#github), [`machines`](https://palbase.studio/docs/cli/reference#machines) | Connecting GitHub, machines, their builds, logs, crons and tasks ([Machines](https://palbase.studio/docs/machines/overview)) |
| [`databases`](https://palbase.studio/docs/cli/reference#databases), [`db`](https://palbase.studio/docs/cli/reference#db) | Databases, their backups, connection addresses, `psql`, dumps and schema plans ([Databases](https://palbase.studio/docs/machines/databases)) |
| [`config`](https://palbase.studio/docs/cli/reference#config), [`types`](https://palbase.studio/docs/cli/reference#types) | Comparing and copying module settings between environments, and the environment's names as TypeScript types |
| [`docs`](https://palbase.studio/docs/cli/reference#docs) | Searching these docs by meaning ([Searching the docs](#searching-the-docs)) |
| [`support`](https://palbase.studio/docs/cli/reference#support) | A question to Palbase's support line ([Asking Palbase's support line](#asking-palbases-support-line)) |
