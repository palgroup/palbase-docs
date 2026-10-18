> The full documentation index: https://palbase.studio/llms.txt

# Architecture

A Palbase backend is a plain TypeScript repository, and **one declaration says what exists, who owns it and what it may reach**: a `@Module` lists a domain's classes — its `controllers`, its `providers`, what it `exports` and whose exports it `imports` — and a class that no module lists is **refused at boot**, by name. The root module is the one `src/main.ts` hands to `PalbaseFactory.create`; every other module is reached from it through `imports`.

Dependencies arrive through the **constructor**, and the container supplies them: a dependency is named by its parameter's **type** and by nothing else. There is no `@Inject`, no `useFactory`, no `forwardRef` and no token registry. What the platform gives every handler — the project's modules, the request's database, the log — is **imported**, never injected: `Palbase`, `Database` and `Log` from `palbase/backend`.

This page answers one question: **what shape does the code take?** It is the shape of Palbase's own examples and of Studio's backend; [Project Structure](https://palbase.studio/docs/getting-started/project-structure) lists the files, and [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules) the full declaration surface.

## The layers

| Layer | What it does | What it never does |
|---|---|---|
| `src/main.ts` | Boots the app: `PalbaseFactory.create(AppModule, config)` — the database's schemas, CORS, the routes' default auth and limit | holds routes or logic |
| `src/app.module.ts` | The root: `imports` every domain's module | owns a domain's classes |
| `src/modules/<domain>/<domain>.module.ts` | The declaration: which classes the domain owns, and which of them another domain may reach | holds logic · lists a class another module owns |
| `src/modules/<domain>/<name>.controller.ts` | HTTP only: validates input through a schema, picks the caller, turns the service's answer into the response. Listed in `controllers` | imports `Database` · holds business rules · keeps per-request state on the instance |
| `src/modules/<domain>/<name>.service.ts` | The decisions: which rows, whose, in what order; the calls to the project's modules. `@Injectable()`, listed in `providers` | knows about HTTP (no request, no response) · builds its own dependencies |
| `src/modules/<domain>/dto.ts` | Schemas — each a **value** for `@Body` and a same-named **type** | holds logic |
| `src/db/public.ts` | **Is** the database: tables, columns, indexes, [row-level security](https://palbase.studio/docs/backend/row-level-security) | produces migration files — there are none |

In one line: **controllers thin, services thick, schemas quiet, `db/` the single truth — and the module is the registration.**

A domain is a **folder** with a module in it, and adding one is adding a folder and naming its module in the root's `imports`. The file suffixes (`.controller.ts`, `.service.ts`) are a convention that helps a reader and decides nothing: what decides is the list a class appears in and the decorator it carries.

The rule that carries the most weight is the narrowest: **a controller does not import `Database`.** When a route starts reaching for a table, the logic has moved into the layer that is hardest to test, and the layer that was meant to hold it becomes decoration.

## Where does this go

| The need | Its home |
|---|---|
| Validate input | a schema in the module's `dto.ts`, passed to `@Body(Schema)` / `@QueryParams(Schema)` |
| Enforce ownership | a row-level-security policy in `src/db/public.ts` **and** the service's `where` — the policy is the backstop, not a reason to stop writing the filter |
| A business rule, a calculation, an ordering | the service |
| Answer with an HTTP status | `throw new NotFound(…)` (or `Forbidden`, `Conflict`, `PalError`) — from the service or the controller; no response object is needed |
| Call another domain | name its class in your constructor — its module `exports` it, and yours `imports` that module |
| Send an email, sign a file URL, read a secret | `Palbase.notify`, `Palbase.storage`, `Palbase.secrets` — in the service |
| Work at start-up or shutdown | an `onStart()` / `onShutdown()` method on a provider — awaited in dependency order |
| Work on a schedule | a [cron](https://palbase.studio/docs/backend/cron) — not a timer: a machine that sleeps runs none |
| Work done once, now or later | a [task](https://palbase.studio/docs/backend/tasks) on the machine's queue — not a cron that looks in a table every minute |
| Register a new class | add it to a module's `providers` (or `controllers`) — nothing else registers anything |
| A setting | an environment variable of the machine; a secret is a project secret the machine starts with |

## One vertical, end to end

A `notes` domain, in the order you would build it.

### 1. The database

```ts
// src/db/public.ts
import { defineSchema, defineTable, index, policy, text, timestamp, uuid } from "palbase/backend";

// Each user's notes, theirs alone: row-level security says so, whatever a route forgets.
const notes = defineTable("notes", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: text(),
    title: text(),
    created_at: timestamp().defaultNow(),
  },
  policies: (p) => [
    policy("notes_own").for("all").to("authenticated").using(p.col("owner").eq(p.auth.uid())).withCheck(p.col("owner").eq(p.auth.uid())),
  ],
  indexes: (p) => [index("notes_owner_created").on(p.col("owner"), p.col("created_at"))],
});

export default defineSchema("public", { tables: [notes] });
```

One file per schema, each with a default export. There are no migration files: a release migrates the database to this declaration beside the version that serves ([Schema changes](https://palbase.studio/docs/backend/migrations)). The request runs as its caller — `authenticated`, with the token's claims — so `auth.uid()` is the signed-in user, and the policy holds for every query of the request.

> **Note:** `ownedByUser()` is the column type made for `owner`: when the user is deleted, their rows go. The platform tells the app through the project's webhook (`user.deleted`), so an app whose schema has an `ownedByUser()` or `userRef()` column does not boot without `PALBASE_WEBHOOK_SECRET`, the secret of the project's webhook endpoint — and an endpoint cannot be made from Studio. A project without one keeps its owner column a `text()` with a policy, as here. See [Event Hooks](https://palbase.studio/docs/backend/hooks).

### 2. The schemas

```ts
// src/modules/notes/dto.ts
import { z } from "palbase/backend";

export const CreateNote = z.object({ title: z.string().min(1).max(200) });
export type CreateNote = z.infer<typeof CreateNote>;

export const ListNotes = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export type ListNotes = z.infer<typeof ListNotes>;

export const Note = z.object({ id: z.string(), title: z.string(), created_at: z.string() });
export type Note = z.infer<typeof Note>;
```

Each schema is exported twice under one name: the **value** a decorator validates with, and the **type** a signature reads. Any Standard Schema works — zod, valibot, arktype; `z` is re-exported from `palbase/backend` so the app and the framework agree on one zod.

### 3. The service

```ts
// src/modules/notes/notes.service.ts
import { Database, Injectable, Log, NotFound } from "palbase/backend";
import type { CreateNote, Note } from "./dto";

@Injectable()
export class NotesService {
  async list(owner: string, limit: number): Promise<Note[]> {
    // RLS already narrows this to the caller's rows; the filter says what the route means.
    return Database.public.notes.findMany({
      where: { owner },
      select: ["id", "title", "created_at"],
      orderBy: { column: "created_at", direction: "desc" },
      limit,
    });
  }

  async create(owner: string, input: CreateNote): Promise<Note> {
    const note = await Database.public.notes.insert({ owner, title: input.title });
    Log.info("note created", { note: note.id });
    return { id: note.id, title: note.title, created_at: note.created_at };
  }

  async remove(owner: string, id: string): Promise<void> {
    const gone = await Database.public.notes.deleteMany({ where: { id, owner } });
    if (gone === 0) throw new NotFound(`no note ${id}`);
  }
}
```

`Database` is **the request's own transaction**: it is opened by the first query, committed when the handler returns — before the answer goes — and rolled back when it throws. A service the handler calls shares it, so a route's writes land together or not at all. It is reached inside a request (a handler, a service it calls, an `@On` handler), never at import time or from a timer.

`Database.public.notes` is typed by the declaration file Palgres writes from `src/db/public.ts` ([Database](https://palbase.studio/docs/backend/database)): a column that does not exist, or a value of the wrong type, is a compile error. Raw SQL is `Database.$query(sql, params)`.

### 4. The controller

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Delete, Get, Param, Post, QueryParams, User, type UserT } from "palbase/backend";
import { CreateNote, ListNotes, type Note } from "./dto";
import { NotesService } from "./notes.service";

@Controller("/notes")
export class NotesController {
  // The container supplies this. Nothing here constructs or imports an instance.
  constructor(private readonly notes: NotesService) {}

  @Get("")
  list(@QueryParams(ListNotes) query: ListNotes, @User() user: UserT): Promise<Note[]> {
    return this.notes.list(user.id, query.limit);
  }

  @Post("", { rateLimit: { max: 30, window: 60 } })
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Promise<Note> {
    return this.notes.create(user.id, body);
  }

  @Delete("/{id}")
  remove(@Param("id") id: string, @User() user: UserT): Promise<void> {
    return this.notes.remove(user.id, id);
  }
}
```

Every route needs a signed-in user unless it, its controller or the app's config says otherwise (`{ auth: false }`); `@User()` is that user. A body that fails its schema is a `400` naming the fields, a caller over the route's limit a `429`, a thrown `NotFound` a `404` — all in the platform's one envelope ([Responses & Errors](https://palbase.studio/docs/backend/errors)). A handler that returns nothing answers `204`; anything else is JSON.

### 5. The module

```ts
// src/modules/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  controllers: [NotesController], // its entry points
  providers: [NotesService], //      the classes it owns
  exports: [], //                    which of them another module may reach
  imports: [], //                    whose exports this module may reach
})
export class NotesModule {}
```

That list **is** the registration, and the only place ownership is decided. `exports` stays empty until another domain needs one of these classes; until a name appears there, nothing outside the module can reach it. Imports are not transitive: a module reaches the exports of the modules it imports, and of no others.

### 6. The root and the boot

```ts
// src/app.module.ts
import { Module } from "palbase/backend";
import { NotesModule } from "./modules/notes/notes.module";

@Module({ imports: [NotesModule] })
export class AppModule {}
```

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";
import schema from "./db/public";

// Serves on $PORT with its database; run by a release with PALBASE_DB_MIGRATE,
// it migrates the database to this schema and exits.
await PalbaseFactory.create(AppModule, { db: { schemas: [schema] } });
```

At boot the container reads every module, refuses what is wrong — a class no module lists, a dependency from a module that is not imported or a class it does not export, a cycle — naming the path that led to it, builds every class once, runs their `onStart()` and serves. The project's address, id and secret key come from the machine's environment.

## Never write this

These are the shapes a code assistant reaches for by default. Every one is wrong here:

- **Express-style handlers** — `app.get(...)`, `(req, res) => …`. A route is a **method on a class**.
- **A `ctx` object or middleware** — there is no context to thread and no pipeline to mount; auth, validation, limits and the error envelope are the framework's.
- **A class no module lists** — refused at boot, by name.
- **`@Inject`, `useFactory`, `forwardRef`** — a dependency is named by its constructor parameter's type and nothing else.
- **An `interface` as a dependency** — it has no runtime existence. Use a class, or an `abstract class` with one listed subclass: the container gives the one owned subclass for it, and refuses by name when there are none or two.
- **NestJS lifecycle names** — `onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy` … are refused at boot. The hooks are `onStart()` and `onShutdown()`.
- **A hand-wired singleton** — `export const notes = new NotesService()`. Mark it `@Injectable()`, list it, and let the container build it once.
- **I/O in a constructor** — it runs while the app comes up, synchronously. Start-up work goes in `onStart()`, which is awaited before the first request.
- **A timer for scheduled work** — a machine that sleeps runs no timer, and three copies run three. Use a [cron](https://palbase.studio/docs/backend/cron), or a [task](https://palbase.studio/docs/backend/tasks) for work done once.
- **State in the instance that must outlive a request** — a machine may run several copies, and sleeps; what must be shared goes in the database.
- **A migration file** — there are none. The schema file is the declaration.
- **`try { … } catch { return 500 }`** — throw the error class and let the framework build the envelope; swallowing it turns a `404` into a `500`.
- **Hand-built responses** — no `new Response(...)`, no `JSON.stringify`. Return the value; return nothing for `204`.
- **A secret in the repository** — the secret key and every credential are project secrets the machine starts with; `.env.example` names them, never their values.

## Adding a feature

1. `src/db/public.ts` — declare the table and its policies.
2. `src/modules/<domain>/dto.ts` — the schemas, each a value and a type.
3. `src/modules/<domain>/<name>.service.ts` — the logic; `@Injectable()`, its dependencies as constructor parameters.
4. `src/modules/<domain>/<name>.controller.ts` — the routes; the service in the constructor, never `Database`.
5. `src/modules/<domain>/<domain>.module.ts` — list them; name the module in the root's `imports`.
6. Regenerate the tables' declaration file, if the schema changed ([Database](https://palbase.studio/docs/backend/database)).
7. Push. The release migrates the database beside the version that serves, then rolls the new version out.

## Give this to your agent

For the full reference — every decorator, every module call, every schema builder — point your coding assistant at **`/llms.txt`**, the index of these docs, or **`/llms-backend.txt`**, the slice for writing a backend: getting started, the backend SDK, the server SDK and machines, in one file. Assistants fetch those when you name them; they do not go looking.

## Related

- [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules) — the four lists, and what is refused at boot
- [Project Structure](https://palbase.studio/docs/getting-started/project-structure) — every file of a backend repository
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers) — the routing and decorator surface
- [Request Validation](https://palbase.studio/docs/backend/validation) — `@Body`, `@QueryParams`, `@Param`, `@Headers`
- [Responses & Errors](https://palbase.studio/docs/backend/errors) — the envelope, and the error classes
- [Database](https://palbase.studio/docs/backend/database) · [Schema](https://palbase.studio/docs/backend/schema) · [Row-Level Security](https://palbase.studio/docs/backend/row-level-security) — the database half
- [Testing](https://palbase.studio/docs/backend/testing) — services and the HTTP layer, with no network
