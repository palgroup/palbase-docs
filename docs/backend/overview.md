> The full documentation index: https://palbase.studio/llms.txt

# Overview

`palbase/backend` is the framework you write a Palbase backend in. You write plain TypeScript: class controllers whose methods are routes, `@Injectable()` services that hold the logic, schemas that validate what comes in, and a `@Module` per domain that says which of those classes exist. One call in `src/main.ts`, `PalbaseFactory.create(AppModule)`, builds them and serves them over HTTP. Your repository is built into a [machine](https://palbase.studio/docs/machines/overview) on every push to its branch, and the machine runs that file. There is no deploy command and no router file, and nothing reads a directory by its name. The modules and the decorators are the whole contract between your source and the framework.

## Quick example

Four files make a working backend: the entry point, the root module, and one domain.

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";

// Serves on $PORT (8080 unless the machine says). The project's address, id
// and secret key come from the environment: on a machine the platform sets
// PALBASE_URL, PALBASE_PROJECT_ID and the machine's own PALBASE_SECRET_KEY.
await PalbaseFactory.create(AppModule);
```

```ts
// src/app.module.ts
import { Module } from "palbase/backend";
import { NotesModule } from "./modules/notes/notes.module";

@Module({ imports: [NotesModule] })
export class AppModule {}
```

```ts
// src/modules/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({ controllers: [NotesController], providers: [NotesService] })
export class NotesModule {}
```

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Get, Param, Post, User, z, type UserT } from "palbase/backend";
import { NotesService, type Note } from "./notes.service";

const CreateNote = z.object({ title: z.string().min(1).max(200) });
type CreateNote = z.infer<typeof CreateNote>;

@Controller("/notes")
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post("")
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Note {
    return this.notes.create(user.id, body.title);
  }

  @Get("/{id}")
  read(@Param("id") id: string, @User() user: UserT): Note {
    return this.notes.get(user.id, id);
  }
}
```

```ts
// src/modules/notes/notes.service.ts
import { Injectable, Log, NotFound } from "palbase/backend";

export interface Note {
  id: string;
  owner: string;
  title: string;
}

// Kept in memory to keep the example small; a real app keeps them in its
// database (see Database).
@Injectable()
export class NotesService {
  private readonly notes = new Map<string, Note>();

  create(owner: string, title: string): Note {
    const note: Note = { id: crypto.randomUUID(), owner, title };
    this.notes.set(note.id, note);
    Log.info("note created", { id: note.id });
    return note;
  }

  get(owner: string, id: string): Note {
    const note = this.notes.get(id);
    if (!note || note.owner !== owner) throw new NotFound(`no note ${id}`);
    return note;
  }
}
```

That serves `POST /notes` and `GET /notes/{id}`, both for signed-in users only, because every route needs a user unless it says otherwise. A client calls them at the machine's address, `https://<ref>.app.palbase.studio/notes`, with the user's access token as `Authorization: Bearer …`. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls).

## The mental model

| Concept | What it is |
|---|---|
| **Module** | A class decorated with `@Module({ imports, controllers, providers, exports })`. It decides ownership: a `@Controller` or `@Injectable()` class no module lists stops the boot by name. The root module (`AppModule` above) is the one `PalbaseFactory.create` is given, and every other module is reached through `imports`. |
| **Controller** | A class decorated with `@Controller(basePath)`. Each method decorated with `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` or `@Query` is one route. |
| **Service** | An `@Injectable()` class listed in its module's `providers`. It holds the business logic, so controllers stay thin. |
| **Dependency injection** | A class names what it needs as constructor parameters, and the container supplies them by **type**. There is no `@Inject` and no token registry. |
| **Schema** | Any [Standard Schema](https://standardschema.dev) (zod, valibot, arktype) given to `@Body`, `@QueryParams` or `@Headers`. `z` is re-exported from `palbase/backend`. |
| **Answer** | What the method returns is the response: `200` with its JSON, or `204` when it returns `undefined` or `null`. |
| **Errors** | Throw `NotFound`, `Conflict`, `Forbidden`, … or a `PalError` of your own. Every refusal is sent in one envelope. |
| **Webhook** | A `@Webhook` class listed in `providers`: a third party's signed deliveries (Stripe, GitHub, Slack, …) at `POST /webhooks/<name>`, each handed to the `@On` of its event. See [Webhooks](https://palbase.studio/docs/backend/webhooks). |
| **Gateway** | A `@Gateway(pattern)` class listed in `providers`: a realtime channel of the app, with who may join, its typed events, and its members' messages, each answered with an ack. Apps join it through their generated client. See [Gateways](https://palbase.studio/docs/backend/gateways). |

## What a handler imports

A handler or a service reaches three things by import. Nothing is injected for them, and there is no `ctx` parameter to pass around.

| Import | What it is | Docs |
|---|---|---|
| `Palbase` | The project's modules, called with the app's secret key: `Palbase.auth`, `Palbase.storage`, `Palbase.notify`, `Palbase.secrets`, `Palbase.flags`, `Palbase.analytics`, `Palbase.realtime`, `Palbase.machines`. It is the `palbase/server` client, made for you, with two more: `Palbase.ai`, the project's models, agents and chats, and `Palbase.gateways`, the app's gateways. | [Server SDK](https://palbase.studio/docs/server/overview), [AI](https://palbase.studio/docs/backend/ai), [Gateways](https://palbase.studio/docs/backend/gateways) |
| `Database` | The request's own transaction against the app's Postgres: `Database.public.<table>`, `$query`, `$transaction`, `$atomic`, `$asService()`. Committed when the handler returns, rolled back when it throws. | [Database](https://palbase.studio/docs/backend/database) |
| `Log` | Structured logging: one JSON line per call, carrying the request's id. | [Logging](#logging) |

`Palbase` is bound when the app is served. Reaching it before `PalbaseFactory.create` has run throws `Palbase.<module> is reached before the app is served`. `Database` is the request's, so it is reached inside a request: from a handler, a service a handler calls, or an `@On` handler. Reaching it at import time, from a timer or from `onStart()` throws and names where it was reached.

Per-request values come from parameter decorators instead: `@User()`, `@OptionalUser()`, `@Body()`, `@QueryParams()`, `@Param()`, `@Headers()`, `@Req()`, `@RequestId()` and `@Client()`. See [Request Validation](https://palbase.studio/docs/backend/validation) and [Authentication](https://palbase.studio/docs/backend/authentication).

## `PalbaseFactory.create(root, config?)`

The bootstrap takes the root module (or an array of them) and the backend's own settings. Each setting has one place: the app's defaults are here, a route's own auth and limit are on its decorator, and a module's settings (auth providers, storage buckets, notify senders) stay in that module, in Studio.

| Setting | Default | What it does |
|---|---|---|
| `palbase` | from the environment | `{ url, projectId, secretKey, webhookSecret }`: the project this backend belongs to. Each value is read from `PALBASE_URL`, `PALBASE_PROJECT_ID`, `PALBASE_SECRET_KEY` and `PALBASE_WEBHOOK_SECRET` unless given here. |
| `auth` | `true` | Every route's auth unless its controller or the route says otherwise. See [Authentication](https://palbase.studio/docs/backend/authentication). |
| `rateLimit` | `{ max: 300, window: 60 }` | Every route's limit per caller, unless the route says otherwise. `false` for none. |
| `bodyLimit` | 1 MiB | Bytes a request body may be. A larger one is `413 payload_too_large`. |
| `cors` | off | `{ origins: ["https://app.example.com"], maxAge? }`, or `origins: "*"`. A backend that browsers call from another origin names them here. |
| `db` | none | `{ schemas: [schema] }`: the app's database. See [Database](https://palbase.studio/docs/backend/database). |
| `port`, `host` | `$PORT` or 8080, `0.0.0.0` | Where it listens. `port: 0` takes a free one (tests). |
| `boot` | `{ attempts: 5, backoffMs: 1000 }` | How often a failed `onStart()` is tried again. |
| `exitOnFatal` | `true` | Exit 1 on an uncaught error. A test turns it off. |
| `env` | `process.env` | Where the `PALBASE_*` values are read from. |

A value that is missing or malformed stops the boot before any request is served, naming each problem and both ways to give it:

```text
[palbase] the app cannot start:
  - palbase.secretKey / PALBASE_SECRET_KEY is the project secret key (pb_<ref>_s…), kept in the project's Secrets
```

On a machine, the platform sets `PORT`, `PALBASE_URL` (the project's address, `https://<ref>.palbase.studio`), `PALBASE_PROJECT_ID`, `PALBASE_REPLICAS`, `PALBASE_PLATFORM_SECRET`, the machine's own `PALBASE_SECRET_KEY` and its `PALBASE_WEBHOOK_SECRET`, plus `PALBASE_DB_URL` and `PALBASE_DB_CONNECTIONS` when the machine is given a database. Nothing is set by hand. The machine's key is a secret key of the project, listed under **Settings › API keys** as `machine: <name>`: revoked, it is replaced and the machine rolls out with the new one, and it goes with the machine. See [Secrets](https://palbase.studio/docs/backend/secrets) and [Machines](https://palbase.studio/docs/machines/overview).

## What one request goes through

Every request takes the same path. Each step answers in the [error envelope](https://palbase.studio/docs/backend/errors) when it refuses:

1. **The route.** No route for the method and path: `404 not_found`.
2. **The caller.** A bearer token is verified against the project's keys. A route that needs a user and has none answers `401`. When tokens cannot be checked right now, the answer is `503 auth_unavailable` with `Retry-After`.
3. **A verified email**, when the route asks for one: `403 email_not_verified`.
4. **The route's rate limit**, spent before the body is read: `429 too_many_requests` with `Retry-After`.
5. **The body's size**: `413 payload_too_large`.
6. **The parameters**, against their schemas: `400 bad_request`, naming the fields.
7. **The handler**, inside the request's database transaction when the app has a database.
8. **The answer**: `204` for `undefined` or `null`, `200` with JSON otherwise.

Two first path segments are the platform's and never your controllers': `_palbase` (the app's health at `GET /_palbase/health`, and the platform's signed calls: its [crons](https://palbase.studio/docs/backend/cron) and [tasks](https://palbase.studio/docs/backend/tasks), an upload's steps, a [gateway](https://palbase.studio/docs/backend/gateways)'s, an agent's [tools](https://palbase.studio/docs/backend/ai#tools)) and `webhooks` (the platform delivers [events](https://palbase.studio/docs/backend/hooks) to `POST /webhooks/palbase`, and a [`@Webhook`](https://palbase.studio/docs/backend/webhooks) class takes a third party's at `POST /webhooks/<name>`). A `@Controller` mounted under either is refused when it is declared.

## Lifecycle

- **Boot.** Every class is built once, dependencies first. Then each one's `onStart()` runs, in that order. A boot that fails in `onStart()` (a database not up yet) is tried again from scratch after 1, 2, 4 and 8 seconds. If it still fails, the process exits 1 and the machine starts it again. What waiting cannot fix, such as a missing setting or a [DI mistake](https://palbase.studio/docs/backend/modules), stops at once.
- **Serving.** `GET /_palbase/health` answers `200 {"ok":true}` while the app serves. It is the machine's health check by default.
- **Stopping.** On `SIGTERM` the app stops taking connections and gives the requests in flight up to 20 seconds. Then it runs every `onShutdown()`, in reverse order. Health answers `503` meanwhile. A machine's sandbox sends `SIGTERM` more than once, milliseconds apart: the app stops once, and a later signal changes nothing.
- **A crash.** An uncaught error or an unhandled rejection is logged. The requests in flight get a few seconds, and the process exits 1 for the machine to start it again, rather than run half-alive.
- **A migration run.** Started with `PALBASE_DB_MIGRATE`, the same image migrates its database and exits without serving anything. See [Schema changes](https://palbase.studio/docs/backend/migrations).

## Setup

A backend is an ordinary TypeScript project. The examples run on [Bun](https://bun.sh), which runs TypeScript and its decorator metadata as written, and whose SQL client the database uses by default. `tsconfig.json` needs two settings for the container to read constructor types:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Without `emitDecoratorMetadata`, a class with constructor parameters stops the boot with `metadata missing`. A build that strips types without emitting metadata (esbuild) does the same; tsc, Bun and SWC emit it. How the repository is laid out and built is in [Project Structure](https://palbase.studio/docs/getting-started/project-structure).

## Logging

`Log` writes one JSON line per call: `time`, `level`, `msg`, the request's `request_id` when there is a request, and the fields you pass. An `Error` among them is written with its name, message and stack. `debug` and `info` go to stdout, `warn` and `error` to stderr. What a machine writes is in Studio's machine page and in its logs API. See [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds).

```ts
// src/modules/notes/notes.audit.ts
import { Injectable, Log } from "palbase/backend";

@Injectable()
export class NotesAudit {
  record(noteId: string, payload: unknown, err: unknown): void {
    Log.info("note created", { noteId });
    Log.warn("rate approaching limit");
    Log.error("import failed", { error: err });
    Log.debug("raw payload", { payload });
  }
}
```

```text
{"time":"2026-10-08T09:12:44.012Z","level":"info","msg":"note created","request_id":"req_6f1c…","noteId":"3b0e…"}
```

The framework logs its own lines the same way, prefixed `[palbase]`: the routes it serves at boot, a handler's unhandled error (with the route), a module that did not answer.

## The rules checklist

1. **A class exists because a module lists it.** `@Controller` classes go in `controllers`, `@Injectable()` services and `@On` handler classes go in `providers`. A declared class no module lists stops the boot with `unowned class`. Export every class by name: modules import them as `import { X } from "./x"`.
2. **The root module is the one you pass.** `PalbaseFactory.create(AppModule)` reaches every other module through `imports`, and imports are not transitive.
3. **Providers are `@Injectable()`.** A class in `providers` without it (and without an `@On` method) stops the boot with `undeclared provider`.
4. **Constructor parameters are classes.** An `interface`, a union or a primitive has no class to build, so it stops the boot with `unresolvable dependency`. Use a class or an `abstract class`.
5. **`onStart()` and `onShutdown()` are the lifecycle.** NestJS's `onModuleInit` and the rest are refused by name, so they are never silently ignored.
6. **Every route needs a signed-in user unless it says `auth: false`.** `@User()` on a route that does not need one stops the boot: use `@OptionalUser()`.
7. **Schemas are Standard Schema values.** Import `z` from `palbase/backend` and pass the schema itself: `@Body(CreateNote)`.
8. **Return the value, or nothing.** A handler's return is its `200` JSON; `undefined` or `null` is `204`. There is no response object to write to.
9. **Throw to refuse.** `throw new NotFound("…")` from a controller or a service. Anything that is not an `HttpError` is a `500`, logged with its stack.
10. **`experimentalDecorators` and `emitDecoratorMetadata`** in `tsconfig.json`.

## Where to next

| Topic | Page |
|---|---|
| `@Module`'s four lists, injection by type, `onStart` and `onShutdown` | [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules) |
| Routes, paths, rate limits | [Controllers & Routing](https://palbase.studio/docs/backend/controllers) |
| `@Body`, `@QueryParams`, `@Param`, `@Headers`, and the 400 they answer | [Request Validation](https://palbase.studio/docs/backend/validation) |
| Default auth, `@User`, `@OptionalUser`, verified email | [Authentication](https://palbase.studio/docs/backend/authentication) |
| The answer, the envelope, the error classes | [Responses & Errors](https://palbase.studio/docs/backend/errors) |
| Postgres, declared in TypeScript | [Database](https://palbase.studio/docs/backend/database) · [Schema](https://palbase.studio/docs/backend/schema) · [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) · [Schema changes](https://palbase.studio/docs/backend/migrations) |
| The project's modules from your backend | [Storage](https://palbase.studio/docs/backend/storage) · [Secrets](https://palbase.studio/docs/backend/secrets) · [Flags](https://palbase.studio/docs/backend/flags) · [Notifications](https://palbase.studio/docs/backend/notifications) · [Realtime](https://palbase.studio/docs/backend/realtime) |
| Realtime channels of your app, and chats of the project's agents | [Gateways](https://palbase.studio/docs/backend/gateways) · [AI](https://palbase.studio/docs/backend/ai) |
| The platform's events | [Event Hooks](https://palbase.studio/docs/backend/hooks) |
| Tests | [Test Users](https://palbase.studio/docs/backend/test-users) · [Testing](https://palbase.studio/docs/backend/testing) |
| Where it runs | [Machines](https://palbase.studio/docs/machines/overview) · [Connecting GitHub](https://palbase.studio/docs/machines/github) |

## Related

- [Project Structure](https://palbase.studio/docs/getting-started/project-structure): how a backend repository is laid out
- [Architecture](https://palbase.studio/docs/getting-started/architecture): how the pieces fit together
- [Machines](https://palbase.studio/docs/machines/overview): what runs your backend
- [Server SDK](https://palbase.studio/docs/server/overview): the client `Palbase` is
