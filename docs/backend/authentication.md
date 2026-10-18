> The full documentation index: https://palbase.studio/llms.txt

# Authentication

Every route needs a signed-in user unless something says otherwise. A caller proves who they are with the access token the project's auth gave them, sent as `Authorization: Bearer <token>`. The app checks that token itself, against the project's signing keys, before the handler runs. The handler receives the user as a parameter: `@User()` where one is required, `@OptionalUser()` where anyone may call. Signing up, signing in and keeping a session are the client's job ([Web Auth](https://palbase.studio/docs/web/auth)). A backend only ever sees the token.

## Quick example

```ts
// src/modules/profile/profile.controller.ts
import { Controller, Get, OptionalUser, Post, User, type UserT } from "palbase/backend";

@Controller("/profile")
export class ProfileController {
  // The default: a signed-in user, or 401.
  @Get("/me")
  me(@User() user: UserT): { id: string; email: string | null; verified: boolean } {
    return { id: user.id, email: user.email, verified: user.emailVerified };
  }

  // Anyone; a valid token makes the caller a user.
  @Get("/greeting", { auth: false })
  greeting(@OptionalUser() user: UserT | null): { text: string } {
    return { text: user ? `Hello, ${user.email ?? "friend"}` : "Hello, guest" };
  }

  // A signed-in user whose email is verified, or 403.
  @Post("/publish", { auth: { verifiedEmail: true } })
  publish(@User() user: UserT): { published: string } {
    return { published: user.id };
  }
}
```

```ts
// src/modules/profile/profile.module.ts
import { Module } from "palbase/backend";
import { ProfileController } from "./profile.controller";

@Module({ controllers: [ProfileController] })
export class ProfileModule {}
```

## Where a route's auth comes from

A route's auth is the first of these that says anything:

1. the route's own option: `@Get("/x", { auth })`;
2. its controller's: `@Controller("/x", { auth })`;
3. the app's default: `PalbaseFactory.create(AppModule, { auth })`;
4. otherwise `true`: a signed-in user.

```ts
// src/modules/catalog/catalog.controller.ts
import { Controller, Get, Post, User, type UserT } from "palbase/backend";

// Public by default: everything in this controller answers anyone…
@Controller("/catalog", { auth: false })
export class CatalogController {
  @Get("")
  list(): { items: string[] } {
    return { items: ["tea", "coffee"] };
  }

  // …except this route, which says otherwise.
  @Post("/favourites", { auth: true })
  favourite(@User() user: UserT): { user: string } {
    return { user: user.id };
  }
}
```

### The `auth` value

| Value | Meaning |
|---|---|
| `true` | A signed-in user is required. |
| `false` | Anyone may call. A valid token still makes the caller a user (`@OptionalUser()`, and the database's identity). |
| `{ required?: boolean }` | The same as `true` or `false`; `required` defaults to `true`. |
| `{ verifiedEmail: true }` | A signed-in user whose token says `email_verified: true`, or `403 email_not_verified`. |

`role` and `permission` fields are refused when the app boots. Its token carries no application roles, and Palbase does not check them against a database, so the boot stops with an error naming the route, saying the role check has no database to run against and that the role is to be checked in the service. How to check one is [below](#roles).

## What the caller is answered

| The request | On a route that needs a user | On a route that does not |
|---|---|---|
| no `Authorization` header | `401 unauthorized` | handled, user `null` |
| `Authorization` that is not `Bearer <token>` | `401 invalid_token` | handled, user `null` |
| a token that does not verify | `401 invalid_token`, `data.reason` says why | handled, user `null` |
| a valid token | handled, `@User()` is the user | handled, `@OptionalUser()` is the user |
| tokens cannot be checked right now | `503 auth_unavailable`, `Retry-After: 1` | handled, user `null` |

`data.reason` on an `invalid_token` refusal is one of `malformed`, `algorithm`, `unknown_key`, `signature`, `issuer`, `audience`, `project`, `expired`, `not_yet_valid`, `not_a_user`, `bound`, `not_a_session` or `session_ended`. A client that gets `expired` refreshes its session and calls again. `palbase/web` does that by itself for the project's modules. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls).

## How the token is verified

A machine's address takes requests without an API key, and nothing in front of the app has looked at the token. The token's own signature is the only thing that says who the caller is, so the app checks all of it:

- it is a JWS of three parts, signed `ES256` or `PS256` with a `kid`. `none`, HMAC and every other algorithm are refused before any key is looked at;
- the `kid` is a key of the project's key set, `https://<ref>.palbase.studio/.well-known/jwks.json`, and the signature verifies with it. The key set is kept as long as its answer says (an hour at most), and read again when an unknown `kid` arrives, at most every 30 seconds;
- `iss` is the project's address, `aud` names it, and `project_id` is the project's id;
- `exp` is ahead and `nbf` (when present) behind, within a minute of clock skew. `auth_time` is present: it is a user's token, not a client's;
- it is not bound to a key the caller must prove (`cnf`, DPoP);
- it belongs to a session (`session_id`), and that **session still stands**. The app asks the project (`GET /auth/user` with the token) at most every 15 seconds per session. A user who signs out, whose session is revoked or who is banned loses their tokens within that time, not at their expiry.

When the key set cannot be read and none is held, or a session's standing cannot be asked, the answer is `503 auth_unavailable`, not a `401`: the token may be fine. A key set the app already holds is used for up to ten more minutes past its age while it cannot be read again.

## Injecting the user

### `@User()`: routes that need one

`@User()` is the signed-in user. It is used on a route whose auth is required. On a route that does not require a user it would be `null`, so the app stops at boot: `@User() on a route that does not need a signed-in user — use @OptionalUser() (null when nobody is)`.

### `@OptionalUser()`: routes anyone may call

`@OptionalUser()` is the user when the request carried a valid token, and `null` otherwise. A token that does not verify makes the caller nobody here; it is not refused.

### The `UserT` shape

`@User()` is a value (the decorator) and `UserT` is a type. Import both from `palbase/backend`:

| Field | Type | What it is |
|---|---|---|
| `id` | `string` | The user's id (the token's `sub`) |
| `email` | `string \| null` | The user's email, when they have one |
| `emailVerified` | `boolean` | The token's `email_verified` |
| `role` | `string \| null` | The token's role (`authenticated` for a user) |
| `metadata` | `Record<string, unknown>` | The token's `custom_claims` |
| `sessionId` | `string \| null` | The session the token belongs to |
| `test` | `boolean` | A [test user](https://palbase.studio/docs/backend/test-users) of the project |

The object is marked as request data: the user writes their own metadata, so the database takes values from it but never treats it as a filter's structure. See [Request Validation](https://palbase.studio/docs/backend/validation).

## Roles

The token says who the user is, not which application roles they hold. Roles are defined and assigned in the project's auth module, with the secret key: `PUT /admin/roles/{name}` defines one with its permissions, and `PUT /admin/users/{uid}/roles/{role}` gives it to a user. A backend that needs one asks for the user's roles where it decides:

```ts
// src/modules/admin/admin-guard.service.ts
import { Forbidden, Injectable, Palbase, type UserT } from "palbase/backend";

@Injectable()
export class AdminGuard {
  async assertAdmin(user: UserT): Promise<void> {
    const { data } = await Palbase.auth.adminListUserRoles({ path: { uid: user.id } });
    if (!data.roles.includes("admin")) throw new Forbidden("This needs the admin role");
  }
}
```

```ts
// src/modules/admin/admin.controller.ts
import { Controller, Delete, Param, User, type UserT } from "palbase/backend";
import { AdminGuard } from "./admin-guard.service";

@Controller("/admin-tools")
export class AdminController {
  constructor(private readonly guard: AdminGuard) {}

  @Delete("/posts/{id}")
  async removePost(@Param("id") id: string, @User() user: UserT): Promise<{ removed: string }> {
    await this.guard.assertAdmin(user);
    return { removed: id };
  }
}
```

```ts
// src/modules/admin/admin.module.ts
import { Module } from "palbase/backend";
import { AdminController } from "./admin.controller";
import { AdminGuard } from "./admin-guard.service";

@Module({ controllers: [AdminController], providers: [AdminGuard] })
export class AdminModule {}
```

Assigning a role from your own code is the same client: `Palbase.auth.adminAssignUserRole({ path: { uid, role: "admin" } })`. A role that is not defined is `400 role_not_defined`.

## Auth and the database

When the app has a database, each request runs in a transaction **as its caller**. A signed-in caller is the `authenticated` role with the token's claims, so `auth.uid()` in a policy is their id. Anyone else is `anon`. That is what makes row-level security hold for every query a handler runs, whoever wrote it. An app whose every request is its operator's sets `db: { requests: "service" }` and decides access in its routes. See [Row-Level Security](https://palbase.studio/docs/backend/row-level-security).

## Who may call at all

A route with `auth: false` answers the internet: the machine's address takes requests from anyone. Give it a [rate limit](https://palbase.studio/docs/backend/controllers) that suits it, and keep what it returns to what anyone may see. A browser on another origin needs the origin named in [CORS](https://palbase.studio/docs/backend/controllers). The machine's address is never a reason to skip auth: there is no network boundary that only your own apps can cross.

## Related

- [Web Auth](https://palbase.studio/docs/web/auth): signing users in, and the session the token comes from
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls): sending the token
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security): the caller in the database
- [Test Users](https://palbase.studio/docs/backend/test-users): `user.test` and making test users
- [Responses & Errors](https://palbase.studio/docs/backend/errors): the envelope these refusals arrive in
