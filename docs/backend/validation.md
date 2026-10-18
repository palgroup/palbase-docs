> The full documentation index: https://palbase.studio/llms.txt

# Request Validation

A handler never reads raw input. Each part of the request it uses arrives through a **parameter decorator**, and every decorator that takes a schema validates before the handler runs. `@Body`, `@QueryParams` and `@Headers` take any [Standard Schema](https://standardschema.dev): zod (re-exported as `z` from `palbase/backend`), valibot, arktype or another library that implements it. A request that fails one is answered `400` with the fields that failed, and the handler is never called.

## Quick example

```ts
// src/modules/todos/dto.ts
import { z } from "palbase/backend";

export const CreateTodo = z.object({
  title: z.string().min(1).max(200),
  dueAt: z.iso.datetime().optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
});
export type CreateTodo = z.infer<typeof CreateTodo>;

// The query string arrives as strings: coerce what is a number.
export const ListTodos = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  done: z.enum(["true", "false"]).optional(),
});
export type ListTodos = z.infer<typeof ListTodos>;
```

```ts
// src/modules/todos/todos.controller.ts
import { Body, Controller, Get, Param, Post, QueryParams, User, type UserT } from "palbase/backend";
import { CreateTodo, ListTodos } from "./dto";

@Controller("/todos")
export class TodosController {
  @Post("")
  create(@Body(CreateTodo) body: CreateTodo, @User() user: UserT): { owner: string; todo: CreateTodo } {
    // body.tags is [] when the client sent none: the schema's output is what arrives.
    return { owner: user.id, todo: body };
  }

  @Get("")
  list(@QueryParams(ListTodos) query: ListTodos): { limit: number; done: string | null } {
    return { limit: query.limit, done: query.done ?? null };
  }

  @Get("/{id}")
  get(@Param("id") id: string): { id: string } {
    return { id };
  }
}
```

The handler gets the schema's **output**: defaults filled in, coercions and transforms applied. That is why the parameter's type is `z.infer<typeof Schema>`, written once beside the schema as a same-named type.

## The parameter decorators

| Decorator | What it reads | Validated |
|---|---|---|
| `@Body(schema)` | The JSON body | always (a schema is required) |
| `@QueryParams(schema)` | The query string, as an object of strings | always (a schema is required) |
| `@Headers(schema?)` | The request's headers, names lower-cased | when given a schema |
| `@Param("name")` | One path segment, `{name}` in the route's path | no: always a string |
| `@User()` / `@OptionalUser()` | The signed-in user | see [Authentication](https://palbase.studio/docs/backend/authentication) |
| `@Req()` | The `Request` itself | no |
| `@RequestId()` | The request's id (`@TraceId()` is the same) | no |
| `@Client()` | `{ sdkVersion, appVersion, platform, osVersion }`, from the client's headers | no |

A schema passed to `@Body`, `@QueryParams` or `@Headers` must be a Standard Schema value, the object itself. Anything else (a type, a plain object, `undefined`) throws when the class is declared: `@Body(schema): schema is a Standard Schema (a zod, valibot or arktype schema)`.

### `@Body`

The body is read whole, up to the body limit (1 MiB unless `PalbaseFactory.create(…, { bodyLimit })` says otherwise). Past it, the answer is `413 payload_too_large`, before the schema sees anything. The body is parsed as JSON **whatever its `Content-Type`**. An empty body, or one that is not JSON, reaches the schema as `{}`, so the caller hears a validation error that names what was missing.

A `GET` never reads its body: a `@Body` on a GET route validates `{}`. Use `@QueryParams` for a GET, or a [`@Query`](https://palbase.studio/docs/backend/controllers) route when the input is structured.

There is no multipart and no file upload in a request body: a body is JSON. To take a file, the backend grants a [signed upload URL](https://palbase.studio/docs/backend/direct-uploads) and the client sends the bytes straight to storage.

### `@QueryParams`

The query string becomes an object of **strings**, `?limit=20&done=true` as `{ limit: "20", done: "true" }`. A key given twice keeps its last value. Coerce what is a number or a boolean in the schema (`z.coerce.number()`), and keep the schema an object of scalars.

### `@Headers`

Without a schema, `@Headers()` hands over every header as an object of strings, names lower-cased. With one, the object is validated and the schema's output arrives. A header schema should let other headers through (zod's objects strip unknown keys, so the handler simply gets the ones you named):

```ts
// src/modules/sync/sync.controller.ts
import { Controller, Headers, Post, User, z, type UserT } from "palbase/backend";

const SyncHeaders = z.object({ "x-device-id": z.string().min(8).max(64) });
type SyncHeaders = z.infer<typeof SyncHeaders>;

@Controller("/sync")
export class SyncController {
  @Post("")
  sync(@Headers(SyncHeaders) headers: SyncHeaders, @User() user: UserT): { device: string; user: string } {
    return { device: headers["x-device-id"], user: user.id };
  }
}
```

### `@Param`

`@Param("id")` is the segment `{id}` of the route's path, percent-decoded, always a string. It takes no schema. Check its shape in the service (or with `schema.parse(id)`) when it must be a UUID or a number. A `@Param` that names no segment of its route stops the boot.

### `@Req`, `@RequestId` and `@Client`

`@Req()` is the web `Request`. For a route with a body, the body has already been read by the time the handler runs, so read it through `@Body`. `@RequestId()` is the request's id: the `X-Request-Id` the caller sent when it is 8 to 128 characters of `A–Z a–z 0–9 . _ : -`, otherwise one made for it (`req_…`). It is in every answer's `X-Request-Id` header, in the error envelope and in every `Log` line of the request. `@Client()` reads what a client says of itself: `x-palbase-sdk-version`, `x-palbase-client-version`, `x-platform` and `x-os-version`, each `null` when absent.

```ts
// src/modules/support/support.controller.ts
import { Client, Controller, Get, RequestId, type ClientInfo } from "palbase/backend";

@Controller("/support", { auth: false })
export class SupportController {
  @Get("/whoami")
  whoami(@RequestId() requestId: string, @Client() client: ClientInfo): { requestId: string; platform: string | null } {
    return { requestId, platform: client.platform };
  }
}
```

## Where schemas live

Schemas are ordinary values. Put a domain's in its own `dto.ts` beside its controller, each exported as a value and a same-named type, so the controller reads `@Body(CreateTodo) body: CreateTodo`. Nothing discovers the file: it is an ordinary import. A schema two domains share belongs to the module that owns the concept, or to a small shared file both import.

Import `z` from `palbase/backend` rather than installing zod yourself. The framework re-exports the zod it is built with, so your schemas and the framework agree on one version.

## What a validation failure looks like

A failed schema answers `400 bad_request` in the [error envelope](https://palbase.studio/docs/backend/errors), with each failed field in `data.fields`:

```json
{
  "error": "bad_request",
  "error_description": "Request body failed validation",
  "status": 400,
  "request_id": "req_6f1c…",
  "data": {
    "fields": [
      { "field": "title", "message": "Too small: expected string to have >=1 characters" },
      { "field": "tags.3", "message": "Too big: expected string to have <=30 characters" }
    ]
  }
}
```

- `error_description` says which part failed: `Request body failed validation`, `Query parameters failed validation` or `Request headers failed validation`.
- `field` is the issue's path, dotted (`tags.3`). It is `""` for the value as a whole.
- `message` is the schema library's own message.
- At most 20 fields are listed. When there were more, `data.more` says how many: a body of a million bad items is not answered with a million lines.

A `BadRequest` you throw yourself has the same shape: `throw new BadRequest({ fields: [{ field: "name", message: "…" }] })`. A client handles both the same way.

## The body is data, never structure

Everything a request sent is marked as **data** where it enters: the body (as `JSON.parse` made it), the query, the headers and the user's metadata. The database takes values from data, but never a filter's operators, its branches, a `select`, an `orderBy` or a column name. `{ token: body.token }` cannot become `{ token: { neq: null } }` because the client sent an object there; the query refuses it with a `400` naming the field.

What a schema builds is the route's own: `z.object({ title: z.string() })` makes a new object, and its `title` is a value. What a schema lets through untouched (`z.unknown()`, `z.any()`, a passthrough's extra keys) stays the request's, and stays marked. Declare the shape of whatever you filter by. See [Database](https://palbase.studio/docs/backend/database).

## The answer is not validated

A schema validates what comes in. What the handler returns is sent as it is, so return the fields you mean to: build the answer from the row rather than returning the row, when the row holds more than the caller should see.

## What Studio shows

Each schema is also written into the app's contract as JSON Schema, for libraries that implement the Standard JSON Schema converter (zod does). Studio's **Backend › Endpoints** screen shows each route's body, query and header schemas from there. A schema whose library has no converter is described as any value. It is still validated.

## Related

- [Controllers & Routing](https://palbase.studio/docs/backend/controllers): the routes these decorators sit on
- [Responses & Errors](https://palbase.studio/docs/backend/errors): the envelope a `400` arrives in
- [Authentication](https://palbase.studio/docs/backend/authentication): `@User` and `@OptionalUser`
- [Direct Uploads](https://palbase.studio/docs/backend/direct-uploads): files, which never ride in a request body
