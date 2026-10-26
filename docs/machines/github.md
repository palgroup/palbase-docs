> The full documentation index: https://palbase.studio/llms.txt

# Connecting GitHub

A machine is built from GitHub: a **repository**, a **branch** of it and a **directory** in it. The platform reaches your repositories through its GitHub App, **Palbase Cloud**, installed on the GitHub account that owns them. Once an installation is connected to the project, every push to a machine's branch that changes what the machine is built from is built and rolled out — there is no other deploy step, and no command to run.

## Connect the App

In Studio: **Backend › Machines › New machine › Connect GitHub**. Studio opens GitHub in a new tab:

1. GitHub asks who you are, and where to install **Palbase Cloud** — on your own account or an organization's, on every repository or the ones you choose.
2. GitHub brings you back to Palbase, which shows the accounts Palbase Cloud is installed on that you can push to, and where to install it on another.
3. You connect the one you choose by writing the project's ref. That is the confirmation that this installation is for this project.
4. Back in Studio, **Refresh**: the sheet lists the repositories you can push to.

The link Studio opens holds for 15 minutes. Studio is not on GitHub's way back — it hears nothing of it — which is why the sheet asks you to refresh rather than waiting for a reply.

With the secret key, the same steps are calls of the machines module (`createServer(...).machines` from [`palbase/server`](https://palbase.studio/docs/server/overview), or `Palbase.machines` inside a backend):

| Call | HTTP | What it does |
|---|---|---|
| `connectGitHub` | `POST /machines/github/connect` | Answers the address where the project's owner installs and connects Palbase Cloud (`url`, and `expires_at` 15 minutes on) |
| `listInstallations` | `GET /machines/github/installations` | The project's installations: the account each is on, and who connected it |
| `linkInstallation` | `POST /machines/github/installations` | Connects an installation with the user's own GitHub token for the App — a device flow's way, for a tool that is not a browser |
| `unlinkInstallation` | `DELETE /machines/github/installations/{installation}` | Disconnects one; refused while a machine is built from it |
| `listRepositories` | `GET /machines/github/repositories` | Every repository the installations reach: what a machine may be built from |

The CLI connects it the same way, and from a computer with no browser too:

```sh
palbase github:connect            # opens GitHub; back from it, you link the account by writing the environment's ref
palbase github:connect --device   # GitHub's device flow: a code you enter at github.com/login/device on any device
palbase github:list               # the accounts linked to the environment, and who linked each
palbase github:repos              # the repositories its machines may be built from
```

`--all-envs` links every environment of the project at once, and `--from <env>` links the installation another environment of the organization linked, with no GitHub sign-in. See the [CLI reference](https://palbase.studio/docs/cli/reference#github).

## Whose repositories

An installation reaches the repositories **the user who connected it can push to** — read when they connected it. A repository they could only read is not offered; connecting again picks up what they can push to now. Two consequences:

- A repository that does not appear in the sheet is either outside the installation (add it on GitHub, under the App's configuration) or one the connector cannot push to. Connect again as someone who can.
- A user who takes their authorization of the App back on GitHub disconnects what they connected.

Installations are a project's own, and in Studio every environment is a project of its own: connect GitHub in each environment whose machines are built from it. The machines of two environments may be built from one repository — a `staging` environment from the `staging` branch, `main` from `main`.

## Repository, branch, directory

A machine's `source`:

| Field | What it is |
|---|---|
| `repository` | The repository's full name, `owner/name` — one `listRepositories` answers |
| `branch` | The branch whose pushes are built and rolled out. Studio fills in the repository's default branch. |
| `path` | The directory the machine is built from, relative to the repository's root — the root when left out. Its `Dockerfile`, `package.json` and `.env.example` are read here. |
| `context` | What the build is given, when that is not `path` itself: a directory above `path`, or `.` for the root |

In Studio's **New machine** sheet these are **Repository**, **Branch** and **Directory**; the branch can be changed later in **Edit settings**, and a new branch is built before it rolls out.

### One repository, several machines

A monorepo holds several apps, and each can be its own machine — a `backend` built from `server/`, a `web` machine built from `web/`:

```text
acme/notes
├── server/          ← machine "backend": path "server"
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── web/             ← machine "web": path "web"
│   └── …
└── packages/shared/ ← read by both
```

An app that needs a sibling package — `server/` importing `packages/shared/` — is built with the repository's root as its context: `path: "server"`, `context: "."`. Its `Dockerfile`, which stays in `server/`, then copies from the root (`COPY packages/shared ./packages/shared`); without a Dockerfile, the build plans the whole context.

## Which pushes build which machines

A push to the branch is built for a machine **when it changes a file in what that machine's build is given**: its `context`, else its `path`, matched by whole directory names, case-sensitively. With the layout above:

| The push changes | `backend` (`server`) | `web` (`web`) | a machine with `context: "."` |
|---|---|---|---|
| `server/src/notes.ts` | built | — | built |
| `web/app/page.tsx` | — | built | built |
| `packages/shared/x.ts` | — | — | built |
| `README.md` | — | — | built |
| `serverless/x.ts` | — (not `server/`) | — | built |

A push that changes nothing a machine is built from leaves it as it runs, and does not count against the project's builds for the day. A machine built from the repository's root is built by every push.

Where GitHub's account of a push may not be everything it changed, every machine built from the branch is built: a forced push, a branch's first push, a push of 2,048 commits or more, and a commit that names no files (an empty commit among them) or 3,000 or more.

## For platforms: building with a token

A platform whose own users give their repositories to **its** GitHub App — not to Palbase Cloud — builds their machines without asking them to install another app: it makes a token for each build and gives it with the deploy (`source.access: "token"`). Its users see only the platform; nothing of Palbase is installed on their accounts.

The token is the platform's GitHub App's **installation token, for the machine's repository alone, read-only** — GitHub's `POST /app/installations/{installation_id}/access_tokens` with `repositories: ["<name>"]` and `permissions: { contents: "read" }`. Palbase checks it with GitHub at once: it must be an installation's (`ghs_…`; a person's token is refused), reach the machine's repository and nothing else. What a token may do is not something GitHub tells whoever holds it, so read-only is yours to ask for: Palbase only ever reads with it. The build reads its source with it once and forgets it — no answer, log or build keeps it. One lasts an hour, so make one for each deploy.

```ts
// platform-server.ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });
const ref = process.env.CUSTOMER_ENV_REF!;
// Your GitHub App's installation token for this repository alone, read-only.
const token = process.env.REPOSITORY_TOKEN!;

// Opened with a token: its first build is the branch's head (or `commit`).
await cloud.project(ref).machines.createMachine({ body: {
  name: "backend", size: "shared-256",
  source: { repository: "customer/shop", branch: "main", access: "token" },
  git_access_token: token,
} });

// Each push your app hears of: a new token, and the commit to build.
await cloud.project(ref).machines.deployMachine({ path: { name: "backend" }, body: {
  commit: "4f6e1c2a9b0d7e3f5a8c1b2d4e6f7a9c0b1d2e3f",
  git_access_token: token,
} });
```

A machine read with tokens is deployed by its platform: no push GitHub delivers to Palbase builds it (your app hears the push — its `push` webhook — and deploys the commit), no check is put on its commits, and it does not wait for checks (`deploy_after_checks` is refused). Everything else is a machine's like any other: its builds, their logs, its own logs, rollbacks and its settings ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)). A change of its branch is built at its next deploy. How it is read is chosen when it is made.

## What GitHub shows

Each build puts a check on its commit, named **Palbase Cloud · `<ref>`** for the `backend` machine and **Palbase Cloud · `<name>-<ref>`** for another: *Queued*, *Building*, *Waiting for configuration*, then *Rolled out*, *Build failed* or *Did not come up* — or *Left behind* when a newer commit of the branch is built first. The commit's checks are the quickest way to see what a push did; Studio's machine page has the same builds with their logs ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)).

## Disconnecting

Disconnect an installation (`unlinkInstallation`, `DELETE /machines/github/installations/{installation}`) once no machine is built from it — it is refused while one is. Delete or move the machines built from it first.

## Related

- [Machines](https://palbase.studio/docs/machines/overview) — sizes, addresses, environment and jobs
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — what a push does once it is built
- [Project Structure](https://palbase.studio/docs/getting-started/project-structure) — what a backend's directory holds
- [Quickstart](https://palbase.studio/docs/getting-started/quickstart) — connect GitHub and push a backend, end to end
