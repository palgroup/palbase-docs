> The full documentation index: https://palbase.studio/llms.txt

# Controllers & Routing

Routes are declared in code, not in a router. A controller is a class decorated with `@Controller(basePath)`, and each route is a method decorated with `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` or `@Query`. The file lives with the domain that owns it (`src/modules/todos/todos.controller.ts`), and it is served because its module's `controllers` list names the class. There is no central router to register with. A `@Controller` class no module lists stops the boot, by name. See [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules).

## Quick example

```ts
// src/modules/todos/dto.ts
import { z } from "palbase/backend";

export const CreateTodo = z.object({ title: z.string().min(1).max(200) });
export type CreateTodo = z.infer<typeof CreateTodo>;

export interface Todo {
  id: string;
  owner: string;
  title: string;
  done: boolean;
}
```

```ts
// src/modules/todos/todos.service.ts
import { Injectable, NotFound } from "palbase/backend";
import type { CreateTodo, Todo } from "./dto";

@Injectable()
export class TodosService {
  private readonly todos = new Map<string, Todo>();

  list(owner: string): Todo[] {
    return [...this.todos.values()].filter((t) => t.owner === owner);
  }

  create(owner: string, input: CreateTodo): Todo {
    const todo: Todo = { id: crypto.randomUUID(), owner, title: input.title, done: false };
    this.todos.set(todo.id, todo);
    return todo;
  }

  get(id: string): Todo {
    const todo = this.todos.get(id);
    if (!todo) throw new NotFound(`no todo ${id}`);
    return todo;
  }
}
```

```ts
// src/modules/todos/todos.controller.ts
import { Body, Controller, Get, Param, Post, User, type UserT } from "palbase/backend";
import { CreateTodo, type Todo } from "./dto";
import { TodosService } from "./todos.service";

@Controller("/todos")
export class TodosController {
  // The container supplies this. Nothing here constructs or imports an instance.
  constructor(private readonly todos: TodosService) {}

  @Get("")
  list(@User() user: UserT): Todo[] {
    return this.todos.list(user.id);
  }

  @Post("", { rateLimit: { max: 10, window: 60 } })
  create(@Body(CreateTodo) body: CreateTodo, @User() user: UserT): Todo {
    return this.todos.create(user.id, body);
  }

  @Get("/{id}", { auth: false })
  get(@Param("id") id: string): Todo {
    return this.todos.get(id);
  }
}
```

```ts
// src/modules/todos/todos.module.ts
import { Module } from "palbase/backend";
import { TodosController } from "./todos.controller";
import { TodosService } from "./todos.service";

@Module({ controllers: [TodosController], providers: [TodosService] })
export class TodosModule {}
```

That serves three routes:

| Method | Verb | Full path | Auth | Limit |
|---|---|---|---|---|
| `list` | GET | `/todos` | a signed-in user (the default) | 300 a minute (the default) |
| `create` | POST | `/todos` | a signed-in user | 10 a minute |
| `get` | GET | `/todos/{id}` | anyone | 300 a minute |

At boot the app logs them: `[palbase] serving 3 route(s) on :8080`, with the list. Studio's **Backend › Endpoints** screen shows the same table, read from the app's own contract.

## `@Controller(basePath, options?)`

- `basePath` is where every route of the class is served (`"/todos"`). It must be a string.
- `options.auth` sets the controller-wide auth, which a route's own `auth` overrides. It is `true`, `false`, or `{ required?, verifiedEmail? }`. See [Authentication](https://palbase.studio/docs/backend/authentication).

Controllers are built **once**, at boot, and that one instance serves every request. A field is fine for wiring (the services the constructor took), but never store per-request state in one: concurrent requests share it. Per-request data comes from the parameter decorators.

A `@Controller` class with no routes stops the boot (`@Controller X has no routes`): a controller with nothing to serve is a mistake.

> **Note:** Export the class by name (`export class TodosController`). Its module takes it with `import { TodosController } from "./todos.controller"`, and curly braces cannot see a default export.

## Method decorators

Six decorators declare a route. Each takes `(path, options?)`:

| Decorator | HTTP method | Notes |
|---|---|---|
| `@Get` | GET | its body is never read |
| `@Post` | POST | |
| `@Put` | PUT | |
| `@Patch` | PATCH | |
| `@Delete` | DELETE | |
| `@Query` | QUERY | a safe, idempotent read that carries a body |

The options are `RouteOptions`, and the type is exported:

```ts
// src/modules/todos/route-options.ts
import type { RouteOptions } from "palbase/backend";

// What a method decorator's second argument accepts.
export const strict: RouteOptions = {
  // true, false, or { required?, verifiedEmail? }
  auth: { required: true, verifiedEmail: true },
  // this route's own limit per caller, window in SECONDS; false for none
  rateLimit: { max: 10, window: 60 },
};
```

That is all a route option says: who may call it and how often. Input comes from the parameter decorators ([Request Validation](https://palbase.studio/docs/backend/validation)), and the response is whatever the method returns ([Responses & Errors](https://palbase.studio/docs/backend/errors)).

The path argument must be a string. `@Get({ … })` throws when the class is declared, because the query string is read with `@QueryParams(schema)`, not with the path.

### `@Query`: reads with a body

`@Query(path, options?)` serves the route on the HTTP `QUERY` method. It is **safe and idempotent like GET, but carries a request body like POST**. Use it for reads whose input is too structured for a query string, such as search, nested filters or batch lookups:

```ts
// src/modules/todos/search.controller.ts
import { Body, Controller, Query, User, z, type UserT } from "palbase/backend";

export const SearchTodos = z.object({
  titleContains: z.string().max(100).optional(),
  ids: z.array(z.string()).max(100).default([]),
});
export type SearchTodos = z.infer<typeof SearchTodos>;

@Controller("/todos")
export class SearchController {
  @Query("/search")
  search(@Body(SearchTodos) body: SearchTodos, @User() user: UserT): { owner: string; asked: SearchTodos } {
    return { owner: user.id, asked: body };
  }
}
```

A QUERY route's input rides in the **body**, read with `@Body`. Don't confuse the `@Query` *method* decorator with the `@QueryParams` *parameter* decorator (query-string input).

Choosing a verb for a read:

- **GET**: no input, or input that fits a few query-string values (`@QueryParams`).
- **QUERY**: a read whose input is a structured object.
- **POST**: the request changes state.

### Paths

A route's full path is `basePath + path`, split on `/` with empty segments dropped. So `@Controller("/todos")` with `@Get("")`, `@Get("/")` or `@Get("//")` is served at `/todos`.

A `{name}` segment is a path parameter, read by name with `@Param("name")`. `:name` means the same:

```ts
// src/modules/comments/comments.controller.ts
import { Controller, Get, Param } from "palbase/backend";

@Controller("/todos")
export class CommentsController {
  @Get("/{id}/comments/{commentId}", { auth: false })
  getComment(@Param("id") id: string, @Param("commentId") commentId: string): { todo: string; comment: string } {
    return { todo: id, comment: commentId };
  }
}
```

- Matching is a walk over segments with an **exact segment count**: `/todos/{id}` never matches `/todos/a/b`. Literal segments compare exactly, case included.
- The **first** route in declaration order whose method and segments match wins. One declared later that can never be reached is listed in the app's contract under `x-palbase-unreachable`, with the route that answers instead.
- A parameter's value is one segment, percent-decoded, always a string. A segment that is not valid percent-encoding is `400 bad_request`.
- `@Param("x")` naming no `{x}` in the route's path stops the boot.

### Paths that are the platform's

A machine's address is yours: your routes are served from its root, and nothing of the platform's modules (`/auth`, `/storage`, …) lives there. Two first segments are the platform's own:

- `_palbase`: the app's health (`GET /_palbase/health`) and the platform's signed calls (its crons and tasks, an upload's steps, a gateway's, an agent's tools), which the platform makes from inside. A request from outside to a `_palbase` path never reaches the app.
- `webhooks`: the platform delivers [events](https://palbase.studio/docs/backend/hooks) to `POST /webhooks/palbase`, and each [`@Webhook`](https://palbase.studio/docs/backend/webhooks) class takes a third party's at `POST /webhooks/<name>`.

`@Controller` throws when it is declared if its base path's first segment is either one, and the app does not start with a route whose full path begins with one, so the mistake is a boot error, not a route that is never called.

## Parameters your app makes: `@Resolve`

Most routes of an app with teams, workspaces or stores start the same way: find what the path names and check that the caller may touch it. Write that once, as a provider, and take its result as a parameter:

```ts
// src/modules/teams/current-team.ts
import { Forbidden, Injectable, NotFound, Resolve, type ParamResolver, type ResolveContext } from "palbase/backend";

export type TeamRole = "member" | "owner";
export interface CurrentTeamT {
  id: string;
  role: TeamRole;
}

@Injectable()
export class TeamOfRequest implements ParamResolver<CurrentTeamT, TeamRole | undefined> {
  // A real app reads the membership from its database here (Database.public.team_members.findUnique).
  private readonly members = new Map<string, TeamRole>([["team_1:user_1", "owner"]]);

  resolve({ params, user }: ResolveContext, atLeast: TeamRole | undefined): CurrentTeamT {
    const role = user ? this.members.get(`${params.teamId}:${user.id}`) : undefined;
    // A team the caller is not in is one that does not exist: a different answer would let anyone count them.
    if (!role) throw new NotFound("no such team");
    if (atLeast === "owner" && role !== "owner") throw new Forbidden("owners only");
    return { id: params.teamId, role };
  }
}

/** The team the path names, the caller's role in it checked. */
export const CurrentTeam = (atLeast?: TeamRole) => Resolve(TeamOfRequest, atLeast);
```

```ts
// src/modules/teams/notes.controller.ts
import { Body, Controller, Delete, Get, Param, Post, z } from "palbase/backend";
import { CurrentTeam, type CurrentTeamT } from "./current-team";

const NewNote = z.object({ title: z.string().min(1) });

@Controller("/teams/{teamId}/notes")
export class NotesController {
  @Get("")
  list(@CurrentTeam() team: CurrentTeamT) {
    return { team: team.id, notes: [] };
  }

  @Post("")
  create(@CurrentTeam() team: CurrentTeamT, @Body(NewNote) body: z.infer<typeof NewNote>) {
    return { team: team.id, title: body.title };
  }

  @Delete("/{id}")
  remove(@CurrentTeam("owner") team: CurrentTeamT, @Param("id") id: string) {
    return { removed: id, from: team.id };
  }
}
```

```ts
// src/modules/teams/teams.module.ts
import { Module } from "palbase/backend";
import { TeamOfRequest } from "./current-team";
import { NotesController } from "./notes.controller";

@Module({ controllers: [NotesController], providers: [TeamOfRequest] })
export class TeamsModule {}
```

- **A provider.** The resolver is an `@Injectable()` its module lists, and it takes its dependencies by constructor. The controller's module reaches it as it would a constructor's dependency: listed by the same module, or exported by one it imports. A resolver it cannot reach stops the boot, naming the route and the class.
- **What it is given.** `ResolveContext` has the path's parameters (decoded), the signed-in user (`null` on a route that needs none and was called by nobody), the request's headers and its id. The second argument is what the decorator was given: here, the role the route needs.
- **Before the body.** Resolvers run before every other parameter. A caller with no right to the team hears your `404` or `403`, not a `400` about a body they should never have been asked for.
- **In the request's transaction.** The resolver uses the request's `Database`, as the handler does: a write it made goes back with the handler's if the handler throws. A resolver that only read, before a handler that waits on something else, has its connection given back during the wait like any read of the request ([A handler that waits on something else](https://palbase.studio/docs/backend/database#a-handler-that-waits-on-something-else)).
- **Not in the contract.** The app's OpenAPI document shows the path's parameters, never the resolver.

A guard (`@UseGuards` and `@Roles` in other frameworks) answers only yes or no. The resolver answers with what it found, so the handler does not look it up a second time.

## Rate limiting

Every route has a limit: 300 requests a minute **per caller** unless `PalbaseFactory.create(…, { rateLimit })` or the route says otherwise. `rateLimit: { max, window }` allows at most `max` requests per `window` **seconds**. `rateLimit: false` turns it off for one route, and `rateLimit: false` in the bootstrap turns it off for every route that does not set its own.

```ts
// src/modules/todos/import.controller.ts
import { Body, Controller, Post, User, z, type UserT } from "palbase/backend";

export const ImportTodos = z.object({ titles: z.array(z.string().max(200)).max(1000) });
export type ImportTodos = z.infer<typeof ImportTodos>;

@Controller("/todos")
export class ImportController {
  @Post("/import", { rateLimit: { max: 5, window: 60 } })
  importTodos(@Body(ImportTodos) body: ImportTodos, @User() user: UserT): { owner: string; imported: number } {
    return { owner: user.id, imported: body.titles.length };
  }
}
```

Over the limit, the route answers `429` with a `Retry-After` header in seconds and this body:

```json
{
  "error": "too_many_requests",
  "error_description": "Rate limit exceeded for this endpoint",
  "status": 429,
  "request_id": "req_6f1c…",
  "data": { "retryAfter": 42 }
}
```

How the limit counts, because it decides what the limit protects:

- **The caller** is the signed-in user (by the token's user id), or else the client's address. On a machine that address is the last `X-Forwarded-For` entry, the one the platform's edge appended; every entry before it is whatever the client sent. An IPv6 address counts by its /64.
- **The limit is spent before the body is read.** A caller over the limit is not read for, whatever it sends.
- **The window is fixed and kept in the process's memory**, per route and caller, for up to 100,000 keys; the key used longest ago goes first. A machine running several copies counts in each copy, so the limit holds per copy. A restart forgets every window.

There are no `X-RateLimit-*` headers: a refusal carries `Retry-After`, and a request that passed carries nothing.

> **Note:** This is your route's own limit. The project as a whole also has a requests-per-second ceiling at the platform's edge, which answers `429` above it.

To refuse inside your own logic (a per-resource cooldown, say), throw `new TooManyRequests({ retryAfter })`. It is sent the same way, with its `Retry-After`. See [Responses & Errors](https://palbase.studio/docs/backend/errors).

## CORS

A backend that browsers call from another origin names those origins in the bootstrap. Off unless given:

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";

await PalbaseFactory.create(AppModule, {
  cors: { origins: ["https://app.example.com", "http://localhost:3000"], maxAge: 600 },
});
```

```ts
// src/app.module.ts
import { Module } from "palbase/backend";

@Module({})
export class AppModule {}
```

- A preflight (`OPTIONS` with `Access-Control-Request-Method`) from a named origin is answered `204`. One from any other origin is `403`, and its real request gets no CORS headers.
- Answers to a named origin carry `Access-Control-Allow-Origin` and expose `Retry-After` and `X-Request-Id` to the page.
- Origins are `https://host[:port]`, with `http://` only for `localhost` and `127.0.0.1`, and no path. Anything else stops the boot. `origins: "*"` allows any origin.
- The credential is the bearer token in `Authorization`, never a cookie, so there is no credentials mode to set.

## What a handler returns

The method's return is the answer. An object or an array is `200` with its JSON, and `undefined` or `null` is `204` with no body. A `Promise` is awaited first. A refusal is a throw ([Responses & Errors](https://palbase.studio/docs/backend/errors)).

When the answer needs its own status, headers or body, return a `Response`. It is sent as it was built, with the request's `X-Request-Id` and CORS' headers added:

```ts
// src/modules/files/files.controller.ts
import { Controller, Get, Param, Post } from "palbase/backend";

@Controller("/files")
export class FilesController {
  // 201 with where the new one is.
  @Post("")
  create() {
    return Response.json({ id: "f_1" }, { status: 201, headers: { location: "/files/f_1" } });
  }

  // Any status, with its headers: here a 412 and the version the client must send.
  @Get("/{id}/stale")
  stale(@Param("id") id: string) {
    return Response.json({ error: "precondition_failed", id }, { status: 412, headers: { etag: '"v7"' } });
  }

  // Not JSON: a CSV, downloaded as a file.
  @Get("/report.csv")
  report() {
    return new Response("id,name\n1,Ada\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="report.csv"' } });
  }

  // A stream, sent as it is made: one JSON line at a time.
  @Get("/feed")
  feed() {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 1; i <= 3; i++) controller.enqueue(encoder.encode(`${JSON.stringify({ line: i })}\n`));
        controller.close();
      },
    });
    return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
  }
}
```

The request's transaction ends when the handler returns, before the answer goes. A streamed body is read after that, so read what it needs from `Database` first. A returned `Response` is an answer, whatever its status: what the handler wrote commits. Only a throw rolls it back.

A `fetch()` answer can be returned as it is: its body is already decoded, so its `Content-Encoding` and `Content-Length` are not passed on, and neither is a connection's own header (`Connection`, `Transfer-Encoding`, …).

## Keep controllers thin

A controller reads the request (its parameters, the user, what [`@Resolve`](#parameters-your-app-makes-resolve) found) and hands it to a service. The logic and the database work belong in an `@Injectable()` service the controller takes in its constructor, which can be tested on its own and shared across controllers. See [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules) and [Testing](https://palbase.studio/docs/backend/testing).

## Related

- [Request Validation](https://palbase.studio/docs/backend/validation): `@Body`, `@QueryParams`, `@Param`, `@Headers`
- [Authentication](https://palbase.studio/docs/backend/authentication): route and controller `auth`
- [Responses & Errors](https://palbase.studio/docs/backend/errors): the answer and the envelope
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls): calling these routes from a browser
