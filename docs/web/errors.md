> The full documentation index: https://palbase.studio/llms.txt

# Error Handling

Every call through the client returns its answer or throws. There is no `{ data, error }` pair to unpack. What it throws for a refusal is a `PalbaseError`, the one error class of the Palbase SDKs, exported from `palbase/web` and `palbase/server` alike. It carries the HTTP status, the module's machine-readable code, its words, the request's id and, when the server said so, how long to wait. Before it throws, the client has already done what can be done without your code: it refreshed a token that was refused before its time, solved auth's proof-of-work, and waited out a "not now" on a call that is safe to send twice.

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/login.ts
import { PalbaseError } from "palbase/web";
import { pb } from "./lib/palbase";

export async function login(email: string, password: string): Promise<string> {
  try {
    const result = await pb.auth.signIn(email, password);
    return result.mfaRequired ? "enter your second factor" : "signed in";
  } catch (e) {
    if (!(e instanceof PalbaseError)) throw e;
    if (e.status === 401) return "wrong email or password";
    if (e.status === 429) return `too many tries; wait ${e.retryAfter ?? 60} seconds`;
    if (e.status === 0) return "you are offline";
    console.error(e.op, e.status, e.code, e.message, e.requestId);
    return "something went wrong";
  }
}
```

## `PalbaseError`

| Field | What it is |
|---|---|
| `status` | The HTTP status. `0` for a call that never got an answer (see below). |
| `code` | The envelope's `error`: `invalid_token`, `rate_limited`, `pow_required`, … When the answer carried no envelope it is `http_<status>`. |
| `message` | The envelope's `error_description`, in words a person can read. |
| `requestId` | The request's id (`request_id`, or the `x-request-id` header). Quote it to find the call in logs. |
| `retryAfter` | Seconds the server asked to wait (`Retry-After`, or the envelope's `retry_after`), when it asked. |
| `body` | The refusal's body as sent, read up to 64 KiB. Useful for answers that are not the envelope (OAuth errors, a proof-of-work challenge). |
| `op` | The operation that was refused (`Login`, `RefreshToken`, `WebauthnLoginFinish`, …). |
| `cause` | The underlying error, for a call that failed before an answer. |

Check it with `instanceof PalbaseError`. The modules' typed calls (`pb.auth.api`, `pb.flags.api`) throw the same class. A call to your own backend through `pb.<backend>` refuses with a `BackendError` instead: the same envelope's `code`, `status`, `requestId` and `retryAfter`, with a `kind` to switch on and the fields that failed. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls#what-comes-back).

## The envelope

Every module and every `palbase/backend` app refuses in one shape:

```json
{
  "error": "rate_limited",
  "error_description": "Too many attempts; try again later",
  "status": 429,
  "request_id": "req_4b1f0c7e-…",
  "retry_after": 60
}
```

`status` mirrors the response's status. `retry_after` is there on a refusal that ends with time, and the `Retry-After` header says the same. A `palbase/backend` app may add `data`, such as the fields that failed their schema. `PalbaseError` keeps the whole body in `body`.

## What the client retries

A call is sent again only when sending it again cannot do the work twice:

- **Which calls.** Reads (`GET`, `HEAD`), and writes whose contract takes an `Idempotency-Key`. For those the client makes one key per call and every attempt carries the same one, so the server answers a repeat with the first answer and changes nothing. A write without one, a sign-in for example, is never sent twice by the client.
- **Which answers.** `429`, `502`, `503`, `504`, and a call that never reached the server (`network_error`). Every other answer is yours.
- **How long.** Three attempts in all, the first included. When the server said how long to wait, the client waits exactly that, and a `Retry-After` over 30 seconds is not waited for: the error comes to you with `retryAfter` set. When it said nothing, the client waits 0.5 s, then 1 s, with a little jitter.

Change it per client:

```ts
// src/lib/patient.ts
import { createClient } from "palbase/web";

// Five attempts, and wait up to two minutes when the server asks.
export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  retry: { attempts: 5, maxWaitSeconds: 120 },
});
```

`{ attempts: 1 }` turns retries off. A call you abort is not retried.

## A refused token

A call that acts for the user and is refused `401` with a code that means "this token is not good any more" (`invalid_token`, `token_expired`, `session_expired`, `session_revoked`, `missing_token`) gets one refresh of the session, and is sent once more, only if the session is still the same user's. Every other 401, such as a wrong password, a wrong code or a wrong current password, is the answer and goes to you as it came.

When the refresh itself is refused, because the refresh token was used twice, revoked or expired, the session is over. The client clears it, tells your app `SESSION_EXPIRED` through `pb.auth.onAuthStateChange`, and the call's error reaches you. Send the user to sign in from the listener, not from every `catch`. See [Auth](https://palbase.studio/docs/web/auth#listening-for-changes).

A session that changed under a refresh (another tab signed out, or signed in as someone else) throws an error whose `code` is `session_changed`, and the call that asked is not sent again. Read it by `code`: it is not a `PalbaseError`.

## Proof of work

Auth may answer a sign-in, a sign-up or a code request `403 pow_required` with a challenge, when the address it comes from looks like a bot. The client solves it and sends the same request once more with the answer. You see nothing of it unless solving fails, which comes back as `403 pow_unsolved`. A request whose body cannot be read twice (a stream) is not sent again, and the `pow_required` error comes to you.

## Errors the client makes itself

These never came from a server:

| `status` | `code` | When |
|---|---|---|
| 0 | `network_error` | The request did not reach the project: offline, DNS, a refused connection, or a cross-origin call the browser blocked. Retried like a 503. |
| 0 | `missing_credential` | The operation needs what the client does not hold: a signed-in user, or the secret key for an `/admin/*` call. Nothing was sent. |
| 0 | `invalid_path`, `invalid_path_parameter` | A path parameter that is empty, `.` or `..`, or a path that would leave the project's address. Nothing was sent. |
| 2xx | `undeclared_answer` | The server answered a success the contract does not declare. The request may have taken effect. |
| 3xx | `undeclared_redirect` | The server answered a redirect. The client never follows one, because a redirect would carry the key to whatever host it names. |
| any | `invalid_json` | An answer the contract says is JSON was not. |

`createClient` itself throws a `TypeError`, not a `PalbaseError`, for a secret key, for anything that is not a publishable key, and for a `url` that is not an `https` origin (`http` only for a loopback address).

`network_error` is also what a browser's CORS refusal looks like from code: the browser hides why. The project's address answers a page on any site, its refusals included, so a call the client makes is not refused this way (see [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser)). A machine's address answers only the origins its backend names: see [Calling Your Backend](https://palbase.studio/docs/web/backend-calls#cross-origin-calls).

## Codes worth handling by name

| Where | `status` / `code` | What to do |
|---|---|---|
| Sign-in | `401` | Wrong email or password. Say so without saying which. |
| Sign-in | `429` with `retryAfter` | The account is locked for a while after repeated failures, or the address is limited. Show the wait. |
| Sign-up, password | `400` | A password the policy refuses or one known from a breach; `message` says which. |
| A code (MFA, phone, email) | `401` | A wrong or used code. |
| Social sign-in | `410 auth_transaction_expired` | The transaction expired. Start again. |
| Any module | `429` | Over the project's request rate or a module's quota. Honour `retryAfter`. |
| Any module | `503` | The platform could not answer now. The client already retried a safe call. |

## Related

- [Overview](https://palbase.studio/docs/web/overview) — the client and its options
- [Auth](https://palbase.studio/docs/web/auth) — the flows and their answers
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls) — your backend's refusals as a `BackendError`
- [Responses & Errors](https://palbase.studio/docs/backend/errors) — what a `palbase/backend` app sends
- [Server SDK](https://palbase.studio/docs/server/overview) — the same error from a server
