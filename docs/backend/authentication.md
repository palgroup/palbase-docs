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
| `{ aal: "aal2" }` | A user who signed in with a second factor (a passkey that verified its user, an authenticator or SMS code, a step-up), or `401 insufficient_user_authentication`. `"aal3"` asks more: a key that never leaves its device; `"aal1"` is a sign-in of any kind. An email code is not a second factor ([below](#second-factors-and-their-strength)). Implies a signed-in user: with `required: false` the app stops at boot. |
| `{ maxAge: 300 }` | A user who last proved who they are — signed in, or stepped up since — within the last 300 seconds, or `401 insufficient_user_authentication` with `max_age`. With `aal`, both: `{ aal: "aal2", maxAge: 300 }` is "a second factor within the last 5 minutes", what sending money or changing the account's email asks. Whole seconds above 0. Implies a signed-in user; an `@Upload` route cannot ask for it (the app stops at boot). |

`role` and `permission` fields are refused when the app boots. Its token carries no application roles, and Palbase does not check them against a database, so the boot stops with an error naming the route, saying the role check has no database to run against and that the role is to be checked in the service. How to check one is [below](#roles).

## What the caller is answered

| The request | On a route that needs a user | On a route that does not |
|---|---|---|
| no `Authorization` header | `401 unauthorized` | handled, user `null` |
| `Authorization` that is not `Bearer <token>` | `401 invalid_token` | handled, user `null` |
| a token that does not verify | `401 invalid_token`, `data.reason` says why | handled, user `null` |
| a valid token | handled, `@User()` is the user | handled, `@OptionalUser()` is the user |
| a valid token below the route's `aal` | `401 insufficient_user_authentication` | — |
| a valid token whose last authentication is older than the route's `maxAge` | `401 insufficient_user_authentication` | — |
| tokens cannot be checked right now | `503 auth_unavailable`, `Retry-After: 1` | handled, user `null` |

`insufficient_user_authentication` is RFC 9470's step-up challenge: `WWW-Authenticate: Bearer error="insufficient_user_authentication", acr_values="urn:nist:800-63:aal2"` and `data.acr_values: "aal2"`; a route with `maxAge` adds `max_age=300` and `data.max_age: 300`. The session is fine: the app steps the user up (their second factor) and calls again. Palbase's clients name it apart from a signed-out caller: `stepUpRequired` on iOS, `StepUpRequired` on Android, `kind: "stepUpRequired"` on the web; none refreshes or ends the session for it.

The step-up is one of:

- `pb.auth.mfa.stepUp(code)` with the authenticator app's code;
- `pb.auth.mfa.sendStepUpSmsCode()`, then `pb.auth.mfa.stepUpWithSms(code)` with the code it texted (`stepUp(smsCode:)` on iOS);
- `stepUp()` on the client's passkeys: Face ID, a fingerprint or the device's screen lock.

The session takes the token at the new level, and its refreshes stay there. A step-up is the session's last authentication: the token's `auth_time` is its moment, and every token the session is refreshed to keeps it, so a `maxAge` route counts from the step-up, not from the sign-in.

```ts
// src/modules/admin/approvals.controller.ts
import { Controller, Param, Post, User, type UserT } from "palbase/backend";

@Controller("/admin")
export class ApprovalsController {
  // Approving needs the admin's second factor, whatever their session.
  @Post("/approvals/{id}", { auth: { aal: "aal2" } })
  approve(@User() user: UserT, @Param("id") id: string) {
    return { approvedBy: user.id, id, how: user.amr };
  }
}
```

`data.reason` on an `invalid_token` refusal is one of `malformed`, `algorithm`, `unknown_key`, `signature`, `issuer`, `audience`, `project`, `expired`, `not_yet_valid`, `not_a_user`, `bound`, `not_a_session` or `session_ended`. A client that gets `expired` refreshes its session and calls again. `palbase/web` does that by itself for the project's modules. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls).

```ts
// src/modules/payments/transfers.controller.ts
import { Controller, Param, Post, User, type UserT } from "palbase/backend";

@Controller("/payments")
export class TransfersController {
  // Sending money asks for a second factor given in the last 5 minutes.
  @Post("/transfers/{id}/send", { auth: { aal: "aal2", maxAge: 300 } })
  send(@User() user: UserT, @Param("id") id: string) {
    return { transfer: id, sentBy: user.id, provedAt: user.authTime };
  }
}
```

### Second factors and their strength

The token says how its user last proved who they are: the level in `acr`, the method in `amr` (RFC 8176).

| Method | `acr` | `amr` | |
|---|---|---|---|
| A key that never leaves its device (a security key, a device-bound passkey) | `aal3` | `hwk` | Resists phishing. |
| A synced passkey: Face ID, a fingerprint, the screen lock | `aal2` | `swk` | Resists phishing. |
| An authenticator app's code | `aal2` | `otp` | |
| A code texted to the user's phone | `aal2` | `sms` | NIST calls it restricted (a SIM can be swapped): offer an app or a passkey beside it. |
| A code emailed to the user | `aal1` | `email` | Not a second factor: the inbox is where the password is reset (NIST SP 800-63B-4 §3.1.3.1). It is no way to step up. |
| A recovery code | `aal1` | `recovery` | A way back in, not a second factor. |

A sign-in with a password and a second factor carries both (`["pwd", "otp"]`); a step-up's token carries the step-up's method alone, the authentication its `auth_time` is the moment of. A route that will take only a passkey checks `amr` in the service.

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
| `acr` | `"aal1" \| "aal2" \| "aal3" \| null` | How the user signed in (the token's `acr`): `aal2` with a second factor. `null` where no token says it: an upload's or a gateway's caller, whom the platform names |
| `amr` | `string[]` | The methods the sign-in used (the token's `amr`: `pwd`, `otp`, `hwk`, …) |
| `authTime` | `number \| null` | When the user signed in or last stepped up, in Unix seconds (the token's `auth_time`) |

The object is marked as request data: the user writes their own metadata, so the database takes values from it but never treats it as a filter's structure. See [Request Validation](https://palbase.studio/docs/backend/validation).

## Device attestation

A route marked `attest: true` is called only by your own app, on a genuine device: Palbase's [iOS](https://palbase.studio/docs/ios/backend-calls#device-attestation) and [Android](https://palbase.studio/docs/android/backend-calls#device-attestation) SDKs attach a proof to the call by themselves. On iOS the proof is Apple's App Attest; on Android a key in the phone's secure hardware that Google's attestation vouches for: a locked, verified phone running your app as you signed it. A script, an emulator, a modified app or a call replayed with another body has none that verifies.

```ts
// src/modules/location/location.controller.ts
import { Body, Controller, Post, z } from "palbase/backend";

const Report = z.object({ lat: z.number(), lng: z.number() });

@Controller("/location", { auth: false })
export class LocationController {
  // A report made up with curl, or sent from a Simulator, does not get in.
  @Post("/report", { attest: true })
  report(@Body(Report) report: z.infer<typeof Report>) {
    return { received: report };
  }
}
```

`attest: true` goes on a route or on a `@Controller(path, { attest: true })`, where a route's `attest: false` leaves it out. Whether it is asked is the environment's switch, not the code's: **App Attest mode** in Studio's Authentication settings (Device trust), or `palbase auth:settings:set app_attest_mode=<mode> -E <env>`. A change applies within 30 seconds, with no deploy (the app reads it every 25).

| Mode | What an attested route does |
|---|---|
| `off` (the default) | Nothing: every call is handled. |
| `monitor` | Every call's proof is verified, and nobody is refused. Studio's Device trust shows the last 24 hours: proofs verified, proofs refused, devices that cannot attest, clients without attestation support. |
| `enforce` | A call without a proof that verifies is answered `401 app_attest_required`. |

The refusal carries `data.reason` (`app_attest_required`: no proof; `assertion_invalid`; `assertion_stale`: another call used the device's counter first; `device_unknown`: the device is not enrolled) and `data.challenge`, also in the `X-Palbase-Attest-Challenge` header: the SDK enrols the device when it must, proves the call with that challenge and sends it once more. Every answer of an attested route carries the next challenge in the same header, so a device's next call needs no extra round trip. When the proof cannot be checked (auth is not reachable, or the environment's mode was never read since the machine started) the route answers `503 attest_unavailable` with `Retry-After: 1`.

A route that decides by device — one account per phone, a shared tablet at a desk — takes the device whose proof verified with `@AttestedDevice()`: its id and platform, as auth names them.

```ts
// src/modules/shifts/shifts.controller.ts
import { AttestedDevice, Controller, Post, User, type UserT } from "palbase/backend";

@Controller("/shifts")
export class ShiftsController {
  @Post("/clock-in", { attest: true })
  clockIn(@User() user: UserT, @AttestedDevice() device: AttestedDevice | null) {
    // { id: "dev_…", platform: "ios" | "android" } under enforce; null under off and monitor.
    return { user: user.id, device: device?.id ?? null };
  }
}
```

It is the device auth verified, not the `X-Palbase-Device-Id` header the client sends: that one is only the client's word, under `off` and `monitor` too. Under `off` nothing is verified and under `monitor` nothing is refused, so `@AttestedDevice()` is `null` in both: a route does not act on a device for some calls and not for others. On a route that is not `attest: true` it is refused when the app starts.

The environment's iOS and Android apps are its registered apps (`palbase apps:env:set`): an iOS app's App Attest key is taken for its bundle and team, an Android app's key for its package and the signing certificates registered with it (Play's app signing key and your upload key; not a debug key, whose build anyone with the phone can drive to sign requests). An Android enrolment is checked again on every call: a certificate of its chain revoked since, or a signing certificate taken off the app, stops it, and after 30 days the phone enrols again. Calls an app makes at once may reach the backend in any order: each is taken once. A browser cannot attest: under `enforce`, a web app's calls to an attested route are refused. So are calls from older app versions that predate attestation; set the app's minimum version before turning `enforce` on.

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
