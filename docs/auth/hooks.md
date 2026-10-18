> The full documentation index: https://palbase.studio/llms.txt

# Blocking Hooks

A blocking hook is an endpoint of yours that auth calls, and waits for, before it does something: creating an account, signing someone in, issuing a token. The endpoint answers `allow` or `deny`, and auth goes on or refuses. An allow before a token can also put claims of yours in it. The call and the answer are both signed with the hook's own secret, so auth knows the answer is yours and you know the call is auth's.

What happens *after* an operation is not a hook: it is an event, delivered to the project's webhooks (`user.deleted`, `session.ended`, `user.converted` …), and it cannot change what happened ([Webhooks](https://palbase.studio/docs/server/webhooks)).

## Quick example

Register the hook. Its signing secret is printed this once:

```sh
palbase auth:hooks:create --event before.user.create --url https://hooks.example.com/auth
```

```text
Registered hook_01J…: before.user.create → https://hooks.example.com/auth.
signing secret (shown this once): whsec_…
```

Keep it where the endpoint reads it, here `AUTH_HOOK_SECRET`. Then the endpoint: any server that answers HTTPS at a public address. This one is Node with nothing installed:

```ts
// hooks/server.ts
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

// whsec_ and the key in base64, as auth:hooks:create printed it.
const key = Buffer.from(process.env.AUTH_HOOK_SECRET!.replace(/^whsec_/, ""), "base64");

function sign(id: string, timestamp: string, body: string): string {
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

interface HookCall {
  event: string;
  user?: { id?: string; email?: string; email_verified?: boolean; is_anonymous?: boolean };
  context?: { ip?: string; user_agent?: string; risk_score?: number };
}

interface HookAnswer {
  verdict: "allow" | "deny";
  reason?: string;
  custom_claims?: Record<string, unknown>;
}

function decide(call: HookCall): HookAnswer {
  if (call.event === "before.user.create" && call.user?.email && !call.user.email.endsWith("@example.com")) {
    return { verdict: "deny", reason: "Sign-ups are open to example.com addresses only." };
  }
  if (call.event === "before.token.issue") {
    // Your own data about the user goes into the token they are about to get.
    return { verdict: "allow", custom_claims: { plan: "pro" } };
  }
  return { verdict: "allow" };
}

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    // The signature is over the bytes as they arrived: read them before parsing anything.
    const body = Buffer.concat(chunks).toString("utf8");
    const id = String(req.headers["webhook-id"] ?? "");
    const timestamp = String(req.headers["webhook-timestamp"] ?? "");
    const expected = Buffer.from(`v1,${sign(id, timestamp, body)}`);
    const given = String(req.headers["webhook-signature"] ?? "").split(" ").map((s) => Buffer.from(s));
    const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
    if (!fresh || !given.some((s) => s.length === expected.length && timingSafeEqual(s, expected))) {
      res.writeHead(401).end();
      return;
    }

    // The answer is signed the same way, with an id and a time of its own.
    const answer = JSON.stringify(decide(JSON.parse(body) as HookCall));
    const answerId = `msg_${randomUUID()}`;
    const answerTimestamp = String(Math.floor(Date.now() / 1000));
    res.writeHead(200, {
      "content-type": "application/json",
      "webhook-id": answerId,
      "webhook-timestamp": answerTimestamp,
      "webhook-signature": `v1,${sign(answerId, answerTimestamp, answer)}`,
    });
    res.end(answer);
  });
}).listen(Number(process.env.PORT ?? 8080));
```

A sign-up with any other address is now refused with `403 hook_denied`, and its message is your `reason`.

## The events

| Event | Auth calls it before | It is sent |
|---|---|---|
| `before.user.create` | An account is made: an email sign-up, a passkey sign-up, a social sign-up, a guest, a guest becoming an account | `user.email`, `user.email_verified`, `user.is_anonymous` (no id yet) |
| `before.login` | A password, magic-link, passkey or social sign-in | `user.id`, `context.ip`, `context.user_agent`, `context.risk_score` |
| `before.password.reset` | A password reset email is sent | `user.id` |
| `before.mfa.verify` | An authenticator-app or text code is checked as a second factor | `user.id` |
| `before.social.link` | A provider account is linked to a user | `user.id` |
| `before.token.issue` | A user's access token: at every sign-in, whatever its way, and at every refresh | `user.id` |
| `before.token.refresh` | A session is refreshed | `user.id`, `context.ip`, `context.user_agent` |
| `before.transaction.approve` | A user approves a transaction | `user.id` |
| `before.device_grant.initiate` | A device asks for a code ([OpenID Provider](https://palbase.studio/docs/auth/openid-provider#signing-in-a-device)) | — |
| `before.device_grant.authorize` | A user approves a device's code | `user.id` |

The body is `{ event, user?, context?, client_metadata? }`; a social sign-in or sign-up also sends `client_metadata.transaction_id`. A phone-code sign-in, or a phone sign-up, calls `before.token.issue` alone.

## The call and the answer

Auth POSTs the JSON body to the hook's URL with three headers, as [Standard Webhooks](https://www.standardwebhooks.com) has them:

| Header | What it is |
|---|---|
| `webhook-id` | The call's id, `msg_…`. |
| `webhook-timestamp` | When it was sent, in Unix seconds. |
| `webhook-signature` | `v1,` and the base64 HMAC-SHA256, under the secret's key, of `<webhook-id>.<webhook-timestamp>.<body>`. |

The key is the secret's part after `whsec_`, decoded from base64. An endpoint checks the signature against the body's bytes before it reads them, and refuses a timestamp more than a few minutes away.

The answer is `2xx` with a JSON body, **signed the same way**: its own `webhook-id`, a `webhook-timestamp` within five minutes of auth's clock, and a `webhook-signature` over that id, that time and the answer's body, with the same key.

| Field | What it says |
|---|---|
| `verdict` | `allow` or `deny`. |
| `reason` | Why, for a deny. A sign-up, a guest and a guest's conversion pass it to the person refused, as the message of their `403 hook_denied`; other operations answer `hook_denied` in their own words. |
| `custom_claims` | On an allow of `before.token.issue`: claims put in the access token under its `custom_claims` claim. A `palbase/backend` route reads them as the user's `metadata` ([The `UserT` shape](https://palbase.studio/docs/backend/authentication#the-usert-shape)). |

A token's claims are asked for again at each refresh, so they are never older than the token. A `before.password.reset` that denies sends no email, and the request answers as it always does, so no one learns from it whether the address has an account.

Several hooks on one event are called one after another, oldest first. The first deny refuses; the `custom_claims` of the allows are merged, a later hook's key winning.

## Timeouts and failures

`--timeout` is how long auth waits for an answer, 100 to 5000 ms (5000 by default). A hook **fails** when it does not answer in that time, or answers with a status other than `2xx`, without a valid signature, or with a body that is not JSON. What auth does then is the hook's `--failure-mode`:

| `failure_mode` | When the hook fails |
|---|---|
| `deny` (the default) | The operation fails, as an error rather than as `hook_denied`: a sign-up or a password sign-in answers `500 internal_error`. |
| `allow` | The operation goes on as if the hook had allowed it, with no claims added. |

The two device-grant events go on when their hook fails, whatever its failure mode.

Choose `deny` for a hook that is a rule (who may sign up, who may sign in), and `allow` for one that only adds something. Every sign-in waits for its hooks, so put the endpoint where it answers at once: a [machine](https://palbase.studio/docs/machines/overview) of a size that sleeps makes the first sign-in after it fell asleep wait for it to wake.

The URL is `https`, and it must not resolve to a private address.

## Managing hooks

```sh
palbase auth:hooks:list
palbase auth:hooks:update hook_01J… --timeout 2000 --failure-mode allow
palbase auth:hooks:update hook_01J… --disable
palbase auth:hooks:delete hook_01J…
```

`auth:hooks:update` changes the event, the URL, the timeout, the failure mode or the switch; the secret stays. A hook registered with `--disable`, or turned off, is not called. Deleting one stops the calls at once. The admin calls are `GET`/`POST /admin/hooks` and `PUT`/`DELETE /admin/hooks/{id}`; `PUT` replaces the hook whole, and an optional field it leaves out takes its default, not its current value.

`GET /admin/hooks/{id}/executions` lists a hook's calls, newest first, for thirty days: what it was sent (without the email address), what it answered, how long it took, and the verdict auth took (`allow`, `deny`, `timeout` or `error`). Deleting the hook deletes them.

## Related

- [Overview](https://palbase.studio/docs/auth/overview): the rest of an environment's auth
- [Webhooks](https://palbase.studio/docs/server/webhooks): the events auth sends after an operation
- [Authentication](https://palbase.studio/docs/backend/authentication): the token, and its claims, in a backend
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-authhookscreate): `auth:hooks:create` and its flags
