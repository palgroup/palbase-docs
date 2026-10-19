> The full documentation index: https://palbase.studio/llms.txt

# Introduction

Palbase is a backend platform in two halves. **Every project has a set of modules** — auth, storage, realtime, flags, notify, secrets and analytics — that an app uses with no backend of its own, the way it would use Firebase: sign users in, keep their files, push them messages, read flags, count events. And when a project needs code of its own, it runs on **machines** built from a GitHub branch on every push, beside **Postgres databases** of its own — with a TypeScript framework, `palbase/backend`, that is made for exactly that.

You can use either half without the other. Most projects start with the modules from an app, and add a backend when a rule has to live somewhere an app cannot change it.

## A taste

An app signs a user up with the project's publishable key:

```ts
// app/signup.ts
import { createClient } from "palbase/web";

const palbase = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

const { user } = await palbase.auth.signUp({ email: "ada@example.com", password: "a passphrase of fifteen+" });
console.log(user.id);
```

A server — any server — sends that user an email with the secret key:

```ts
// server/welcome.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

await palbase.notify.sendEmail({ body: { to: "ada@example.com", subject: "Welcome", text: "Glad you are here." } });
```

And a backend of your own is a class whose methods are routes, served on a machine:

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Database, Post, User, z, type UserT } from "palbase/backend";

const CreateNote = z.object({ title: z.string().min(1).max(200) });
type CreateNote = z.infer<typeof CreateNote>;

@Controller("/notes")
export class NotesController {
  // Every route needs a signed-in user unless it says otherwise; @User() is them.
  @Post("")
  async create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Promise<{ id: string }> {
    const [row] = await Database.$query<{ id: string }>("insert into notes (owner, title) values ($1, $2) returning id", [user.id, body.title]);
    return row;
  }
}
```

Push it to its branch, and the machine builds it and rolls it out beside the version that serves. The [Quickstart](https://palbase.studio/docs/getting-started/quickstart) does all three, end to end.

## What every project has

| Module | What it does | From an app (publishable key) | From a server (secret key) |
|---|---|---|---|
| **auth** | Users, sessions, passwords, passkeys, second factors, magic links, phone codes, social sign-in, test users | [Web Auth](https://palbase.studio/docs/web/auth) | [Authentication](https://palbase.studio/docs/backend/authentication), [Test Users](https://palbase.studio/docs/backend/test-users) |
| **storage** | Buckets and files, public reads, signed URLs, image renditions | [Uploads](https://palbase.studio/docs/web/uploads) — through a URL a server signed | [Storage](https://palbase.studio/docs/backend/storage), [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads) |
| **realtime** | Channels over one socket: broadcasts, shared state, presence; a backend's gateways | [Web Realtime](https://palbase.studio/docs/web/realtime), [Web Gateways](https://palbase.studio/docs/web/gateways) | [Realtime](https://palbase.studio/docs/backend/realtime), [Gateways](https://palbase.studio/docs/backend/gateways), [Channels](https://palbase.studio/docs/backend/channels) |
| **flags** | Feature flags and remote config, per-user values | [Web Flags](https://palbase.studio/docs/web/flags) | [Flags](https://palbase.studio/docs/backend/flags) |
| **notify** | Email, push, SMS and WhatsApp; templates, topics, preferences | a user's devices, preferences and topics | [Notifications](https://palbase.studio/docs/backend/notifications) |
| **secrets** | The project's secrets, versioned, in two sets | — | [Secrets](https://palbase.studio/docs/backend/secrets) |
| **analytics** | Events, identifies, page views; summaries, funnels and retention | [Web Analytics](https://palbase.studio/docs/web/analytics) | [Analytics](https://palbase.studio/docs/analytics/overview), [Reading Analytics](https://palbase.studio/docs/analytics/reading) |
| **ai** | The platform's models: answers, tools, agents, and chats with the members a backend names | Through a backend's gateway: a chat's members join it ([Web Gateways](https://palbase.studio/docs/web/gateways#chat-gateways)) | [AI](https://palbase.studio/docs/backend/ai) |

Each module answers at the project's address, under a path of its own (`/auth/…`, `/storage/…`, `/flags/…`), and each has a contract — the OpenAPI document the SDK's clients are generated from. The SDKs are a convenience over those paths, not a requirement: anything that speaks HTTPS can call them.

And for code of your own:

| | |
|---|---|
| **Machines** | Your program, built from a repository's branch and directory on every push; sizes that sleep and sizes that never do; logs, builds and rollback — [Machines](https://palbase.studio/docs/machines/overview) |
| **Databases** | Postgres 18 with pgvector and PostGIS, backups and point-in-time restore, a read-only SQL console in Studio — [Databases](https://palbase.studio/docs/machines/databases) |
| **`palbase/backend`** | Controllers, services and modules in TypeScript, secure by default, with the project's modules and its database built in — [Backend SDK](https://palbase.studio/docs/backend/overview) |

## The surfaces

| Surface | What it is | Docs |
|---|---|---|
| `palbase/web` | The client for web and JavaScript apps: `createClient` with the publishable key — auth, the session, the realtime socket | [Web SDK](https://palbase.studio/docs/web/overview) |
| `palbase/server` | The client for servers: `createServer` with a secret key — every module's server calls, and the receiver for the project's webhooks | [Server SDK](https://palbase.studio/docs/server/overview) |
| `palbase/backend` | The framework a machine runs: `PalbaseFactory`, `@Module`, `@Controller`, and `Palbase`, `Database` and `Log` | [Backend SDK](https://palbase.studio/docs/backend/overview) |
| `palgres` | The database half of the framework: the schema in TypeScript, typed queries, and migrations that run beside the version that serves | [Schema](https://palbase.studio/docs/backend/schema), [Schema changes](https://palbase.studio/docs/backend/migrations) |
| Studio | Organizations, projects and environments; every module's screens; machines, databases, keys and secrets | [Organizations](https://palbase.studio/docs/getting-started/organizations) |

Palbase has SDKs in TypeScript (`palbase/web`, `palbase/server`, `palbase/backend`), Swift and Kotlin. An iOS app takes the Swift SDK, `palbase-swift` with Swift Package Manager ([iOS SDK](https://palbase.studio/docs/ios/overview)), and an Android app the Kotlin one, `studio.palbase:palbase` and an artifact per module ([Android SDK](https://palbase.studio/docs/android/overview)). An app on another platform, such as a game engine, calls the modules over HTTPS with the publishable key in the `apikey` header and the user's access token as `Authorization: Bearer …`, the same requests the SDKs make.

The TypeScript SDKs are one npm package, `palbase`, whose parts are its subpaths — the CLI comes with it (`npx palbase`) — and `palgres`, which `palbase/backend` brings: `npm install palbase` (or `bun add palbase`). They ship compiled, under the Palbase SDK License ([Project Structure](https://palbase.studio/docs/getting-started/project-structure)).

## Organizations, projects and environments

An **organization** is a team, a **project** is an app in it, and an **environment** is the thing that runs: each one a project of the platform's own, with **nothing shared** with another environment — its own address, its own keys, its own users and files, its own machines and databases. A staging copy of production is a second environment, with its machines built from another branch. Everyone in the organization reaches its projects at their role, owner, admin or member: members, invitations, roles and the audit log are in [Organizations](https://palbase.studio/docs/getting-started/organizations).

A project's **first environment** has the slug `main`. Every environment answers at one address, named by its **ref**:

```text
https://<ref>.palbase.studio
```

The ref is on the environment's **Settings**, and it never changes. A machine of the environment answers under the app domain — `https://<ref>.app.palbase.studio` for the one named `backend` — and a database at `<name>-<ref>.db.palbase.studio`.

## The keys

An environment has **publishable keys** — each [registered app](https://palbase.studio/docs/apps/overview)'s own, the one the environment was made with, and any you make — and **any number of secret keys**, on **Settings › API keys**:

| Key | Looks like | Role | Where it goes |
|---|---|---|---|
| Publishable | `pb_<ref>_c…` | `anon` | In apps: a browser bundle, a mobile app. What it reaches is what an app may do, and the signed-in user's token decides whose data. |
| Secret | `pb_<ref>_s…` | `service_role` | On servers only: a machine's secrets, a server's environment. It opens the whole project — every user, every file, every secret. |

The ref is in the key, so a key names its project. A secret key is made with a name (**Create secret key**), **shown once**, and revoked on its own (**Revoke**) — give each server its own, and a leaked one is replaced without touching the others. `createClient` refuses a secret key, and `createServer` refuses to run in a browser.

Every request to the project carries one of them in the `apikey` header; a request with none is `401 missing_api_key`, and a key of another project is the same as none (`401 invalid_api_key`). A user's access token, when one is sent, must be one this project issued (`401 invalid_token` otherwise). Past the project's requests-per-second limit, a request is `429 rate_limited` with `Retry-After: 1`; past its requests for the period, under a quota that refuses, `429 quota_exceeded` with `Retry-After` until the next period.

> **Note:** The project's address answers a browser on any site. A browser app calls it directly, with the publishable key and the signed-in user's token, as [Web SDK](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser) explains. Your own machine's backend answers cross-origin requests itself, for the origins it names.

## How code reaches a machine

One way: **a push to the machine's branch.**

1. [Connect GitHub](https://palbase.studio/docs/machines/github) — install **Palbase Cloud** on the account that owns the repository, and connect it to the environment.
2. Open a machine on a repository, a branch and a directory of it (**Backend › Machines › New machine**).
3. Push. A push that changes the machine's directory is built — its `Dockerfile`, or what Railpack detects — and rolled out beside the version that serves; it takes traffic once it answers its health check.

There is no deploy command and no tool to install. A release whose machine migrates a database runs the migration itself, beside the version that serves; a release that does not come up never takes a request; and any build that succeeded can be returned to ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)).

## Related

- [Quickstart](https://palbase.studio/docs/getting-started/quickstart) — a web app, a backend, a machine, end to end
- [Architecture](https://palbase.studio/docs/getting-started/architecture) — how a backend's code is shaped
- [Project Structure](https://palbase.studio/docs/getting-started/project-structure) — what a backend repository holds
- [Web SDK](https://palbase.studio/docs/web/overview) · [Server SDK](https://palbase.studio/docs/server/overview) · [Backend SDK](https://palbase.studio/docs/backend/overview)
- [Machines](https://palbase.studio/docs/machines/overview) · [Databases](https://palbase.studio/docs/machines/databases)
