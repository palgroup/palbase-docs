> The full documentation index: https://palbase.studio/llms.txt

# Responses & Errors

A handler answers by returning and refuses by throwing. What it returns is sent as JSON with `200`, or as `204` when it returns nothing. What it throws is sent in **one envelope**, the same one the framework uses for its own refusals and the project's modules use for theirs, so a client handles every refusal one way.

## Quick example

```ts
// src/modules/invites/invites.service.ts
import { Conflict, Forbidden, Injectable, NotFound, PalError, UniqueViolation } from "palbase/backend";

export interface Invite {
  code: string;
  team: string;
  usedBy: string | null;
}

@Injectable()
export class InvitesService {
  private readonly invites = new Map<string, Invite>();

  accept(code: string, userId: string): Invite {
    const invite = this.invites.get(code);
    if (!invite) throw new NotFound("No invite with that code", "invite_not_found");
    if (invite.usedBy === userId) throw new Conflict("You already joined", "already_joined");
    if (invite.usedBy) throw new Forbidden("This invite was used", "invite_used");
    if (invite.team === "closed") {
      // Any status and code of your choosing, with typed details in data.
      throw new PalError(422, "team_closed", "The team takes no new members", { team: invite.team });
    }
    invite.usedBy = userId;
    return invite;
  }

  // A database refusal, translated into one the client can act on.
  rename(e: unknown): never {
    if (UniqueViolation.is(e) && e.constraint === "teams_name_key") throw new Conflict("That name is taken", "name_taken");
    throw e;
  }
}
```

```ts
// src/modules/invites/invites.controller.ts
import { Controller, Param, Post, User, type UserT } from "palbase/backend";
import { InvitesService, type Invite } from "./invites.service";

@Controller("/invites")
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post("/{code}/accept")
  accept(@Param("code") code: string, @User() user: UserT): Invite {
    return this.invites.accept(code, user.id);
  }
}
```

A missing code answers:

```json
{
  "error": "invite_not_found",
  "error_description": "No invite with that code",
  "status": 404,
  "request_id": "req_6f1c…"
}
```

## What a handler returns

| The method returns | The answer |
|---|---|
| an object, an array, a string, a number | `200`, `Content-Type: application/json`, the value as JSON |
| `undefined` or `null` (or `Promise<void>`) | `204`, no body |
| a `Promise` | awaited, then as above |

The return type is yours to write. The framework does not read it: an interface, a zod-inferred type and an inline object type all work. Every answer carries `X-Request-Id`. There is no way to set a status or a header on a success: a handler that needs a different status for a refusal throws.

## The error envelope

Every refusal, whether the framework's, a handler's or the database's, is:

| Field | Always | What it is |
|---|---|---|
| `error` | yes | A stable code in snake_case. Branch on this. |
| `error_description` | yes | What went wrong, for a person. Do not parse it. |
| `status` | yes | The HTTP status, the same as the response's. |
| `request_id` | yes | The request's id, also in `X-Request-Id` and in every `Log` line of the request. Quote it when you look for the request in the machine's logs. |
| `data` | when there are details | A validation's `fields`, a token's `reason`, a limit's `retryAfter`, or what your own error carries. |

A refusal that ends with time also carries a `Retry-After` header in seconds: `429` and `503` always do.

### Codes the framework generates

| Status | `error` | When |
|---|---|---|
| 400 | `bad_request` | A parameter failed its schema (`data.fields`), or a path segment is not valid percent-encoding |
| 401 | `unauthorized` | The route needs a signed-in user and the request has no token |
| 401 | `invalid_token` | The token does not verify (`data.reason`), or `Authorization` is not a bearer token |
| 403 | `email_not_verified` | The route asks for a verified email |
| 404 | `not_found` | No route for the method and path |
| 413 | `payload_too_large` | The body is over the body limit |
| 429 | `too_many_requests` | The route's limit for this caller (`data.retryAfter`, `Retry-After`) |
| 500 | `internal_error` | The handler threw something that is not an `HttpError` |
| 503 | `auth_unavailable` | Tokens cannot be checked right now (`Retry-After`) |
| 503 | `service_unavailable` | A module the request called did not answer (`Retry-After`) |

The database adds its own: `409 unique_violation` (and `serialization_failure`, `deadlock_detected`), `400 invalid_value` for a value its column cannot take, `403 permission_denied` for a write RLS or a missing grant refuses (`401` to an anonymous caller), `429 too_many_requests` when its queue is full, and `503 database_unavailable` or `database_busy`. See [Database](https://palbase.studio/docs/backend/database).

## Built-in error classes

Import them from `palbase/backend` and throw them from a controller or a service:

| Class | Status | Default `error` | Constructor |
|---|---|---|---|
| `BadRequest` | 400 | `bad_request` | `(data: { fields: { field, message }[] }, message?)` |
| `Unauthorized` | 401 | `unauthorized` | `(message?, code?, data?)` |
| `Forbidden` | 403 | `forbidden` | `(message?, code?, data?)` |
| `NotFound` | 404 | `not_found` | `(message?, code?, data?)` |
| `Conflict` | 409 | `conflict` | `(message?, code?, data?)` |
| `TooManyRequests` | 429 | `too_many_requests` | `(data: { retryAfter }, message?)`, sent with `Retry-After` |
| `PalError` | any | yours | `(status, code, description, data?)` |
| `HttpError` | any | yours | `(status, error, errorDescription, data?, retryAfter?)` |

The message-first classes take an optional `code`, which becomes `error`. It is the field a client branches on, so give a refusal its own code (`invite_used`) rather than the class's default when the client should act on it. The message defaults to the class name in words (`Not found`).

`BadRequest` carries fields the way a failed schema does, so a check of your own reads like the framework's:

```ts
// src/modules/dates/dates.service.ts
import { BadRequest, Injectable } from "palbase/backend";

@Injectable()
export class DatesService {
  range(from: Date, to: Date): number {
    if (to <= from) throw new BadRequest({ fields: [{ field: "to", message: "must be after from" }] });
    return to.getTime() - from.getTime();
  }
}
```

`UniqueViolation`, `SerializationFailure` and `DeadlockDetected` are the database's. It throws them, and you catch them. `UniqueViolation.is(e)` holds for one whichever copy of the package made it, and `e.constraint` names the constraint Postgres reported. The constraint is a field, never part of the message, because a constraint name tells a stranger how the schema is built.

An error is recognised by a brand, not by `instanceof`, so two copies of the package in one app agree. Anything with a status from 400 to 599, an `error` and an `errorDescription` is sent as it says.

## Errors from the project's modules

A call through `Palbase` (storage, notify, auth…) that the module refuses throws a `PalbaseError` with the module's `status`, `code`, `requestId` and `retryAfter`. What the framework does with one that reaches it uncaught:

- **The module did not answer** (no connection, `429`, `502`, `503`, `504`): `503 service_unavailable` with `Retry-After`. The request can be tried again, and nothing about it was the caller's fault.
- **Any other refusal** (a `404` for an object that is not there, a `400` for a bad input): `500 internal_error`, logged. The module refused something the handler asked for, which is the handler's to decide.

So catch the refusals your code expects and answer them yourself:

```ts
// src/modules/files/files.service.ts
import { Injectable, NotFound, Palbase } from "palbase/backend";
import { PalbaseError } from "palbase/server";

@Injectable()
export class FilesService {
  async link(path: string): Promise<{ url: string }> {
    try {
      const signed = await Palbase.storage.createSignedUrl({ path: { bucket: "files" }, body: { path, expires_in: 300 } });
      return { url: signed.data.url };
    } catch (e) {
      if (e instanceof PalbaseError && e.status === 404) throw new NotFound("No such file", "file_not_found");
      throw e;
    }
  }
}
```

## What is logged

The caller sees the envelope. The machine's logs see more:

- an `HttpError` with a status of 500 or more is logged with the route and the error;
- anything that is not an `HttpError` is logged as `unhandled error in <route>`, with its stack. The caller sees only `The request could not be completed`, never the message, which may hold a query or a value;
- a module that did not answer, and tokens that cannot be checked, are logged as warnings.

A `4xx` you throw is not logged: it is an answer, not a failure. Use `Log` for what you want to keep. See [Overview](https://palbase.studio/docs/backend/overview).

## 503 or 500

The difference matters to every client. A `503` with `Retry-After` says "this was not you, and trying again is reasonable": an outage, a module that did not answer, tokens that cannot be checked. A `500` says the handler failed, and sending the same request again will fail the same way. Throw an `HttpError` with status 503 and a `retryAfter` when your own dependency is out. Let a bug be a 500.

## Related

- [Request Validation](https://palbase.studio/docs/backend/validation): the `400` a schema answers
- [Authentication](https://palbase.studio/docs/backend/authentication): `401`, `403` and `503 auth_unavailable`
- [Database](https://palbase.studio/docs/backend/database): the database's refusals
- [Error Handling](https://palbase.studio/docs/web/errors): how a browser client reads this envelope
