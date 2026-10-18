> The full documentation index: https://palbase.studio/llms.txt

# Event Hooks

The project's modules announce what happens in them as **events**: a user deleted, a file uploaded, a secret changed, a message sent. A backend handles one with `@On("<type>")` on a method of a provider class. The platform delivers each event to the project's webhook endpoint as a signed `POST`. `palbase/backend` receives it at `/webhooks/palbase`, checks the signature, and runs every handler of that type once, inside one database transaction.

These are the **platform's** events. A third party's — Stripe, GitHub, Slack — arrive at `/webhooks/<name>` and are taken by `@On` inside a `@Webhook` class: see [Webhooks](https://palbase.studio/docs/backend/webhooks).

## Quick example

```ts
// src/modules/accounts/account-events.ts
import { Injectable, Log, On, Palbase, type WebhookEvent } from "palbase/backend";
import { pages } from "palbase/server";

@Injectable()
export class AccountEvents {
  @On("user.deleted")
  async userDeleted(event: WebhookEvent<{ user_id: string }>, meta: { requestId: string }): Promise<void> {
    // The user's files go with them: every page of their prefix, then each object.
    const prefix = `users/${event.data.user_id}/`;
    const paths: string[] = [];
    for await (const page of pages((cursor) => Palbase.storage.listObjects({ path: { bucket: "uploads" }, query: { prefix, cursor } }))) {
      paths.push(...page.objects.map((o) => o.path));
    }
    for (const path of paths) await Palbase.storage.deleteObject({ path: { bucket: "uploads", path } });
    Log.info("removed a deleted user's uploads", { user: event.data.user_id, files: paths.length, delivery: meta.requestId });
  }
}
```

```ts
// src/modules/accounts/accounts.module.ts
import { Module } from "palbase/backend";
import { AccountEvents } from "./account-events";

@Module({ providers: [AccountEvents] })
export class AccountsModule {}
```

The class is a provider like any other: its module lists it in `providers`, and it takes its dependencies by constructor. `@On` marks it as a handler class, so it may also stand without `@Injectable()`. Add `@Injectable()` whenever it has constructor parameters, because TypeScript emits their types only for a decorated class.

## What a handler is given

```ts
// src/modules/files/file-events.ts
import { Injectable, Log, On, type WebhookEvent } from "palbase/backend";

@Injectable()
export class FileEvents {
  @On("file.uploaded")
  uploaded(event: WebhookEvent, meta: { requestId: string }): void {
    Log.info("a file arrived", { event: event.id, type: event.type, at: event.created_at, delivery: meta.requestId, data: event.data });
  }
}
```

| Field of `WebhookEvent<T>` | What it is |
|---|---|
| `id` | The event's id. The same id twice is the same event, delivered again. |
| `type` | Dotted lowercase words: `user.deleted` |
| `project_id` | The project it happened in |
| `created_at` | When it happened |
| `data` | What the module says of it, typed `T` when you give one |

`meta.requestId` is the delivery's request id: every `Log` line the handler writes carries it. `@On(type)` takes the type as dotted lowercase words (`user.deleted`). Anything else throws when the class is declared. One method handles one type. A type may have handlers in several classes, and they all run.

## Events

Each module's contract names what it emits. Among them:

| Event | From |
|---|---|
| `user.deleted` | auth: `data` is `{ user_id }` |
| `file.uploaded`, `file.deleted`, `file.moved` | storage |
| `secret.changed` | secrets (its name, never its value) |
| `notification.sent`, `notification.failed` | notify |
| `machine.created`, `machine.updated`, `machine.deleted` | machines |
| `database.created`, `database.deleted`, `database.password_changed`, … | machines |

Type `data` for the events you handle: `WebhookEvent<{ user_id: string }>`. The framework checks only the envelope (`id`, `type`, `project_id`, `created_at`, `data`).

## How a delivery runs

1. **The signature.** The platform signs each delivery with the endpoint's secret: `Palbase-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`. The app checks it against `PALBASE_WEBHOOK_SECRET` over the body exactly as it arrived, with `t` within five minutes of now. Anything else is `401 invalid_signature`, naming `missing_signature`, `malformed_signature`, `stale_timestamp` or `signature_mismatch`, and no handler runs. A request that is not a `POST` is `405`.
2. **Once.** An event already handled by this process is acknowledged again (`204`) and not run again. One whose first delivery is still running is answered `409 in_progress` with `Retry-After: 5`.
3. **One transaction.** Every handler of the type runs in order, inside **one** database transaction when the app has a database. Either all their work commits, or none of it does.
4. **The answer.** All handlers returned: `204`. One threw: the transaction is rolled back, the error is logged with the handler's name, and the answer is `500 handler_failed`. The platform then delivers the event again, with a growing delay, up to twelve attempts. A type with no handler is acknowledged with `204`.

The payload is data, like a request's body: the database takes values from `event.data`, never a filter's structure.

> **Note:** "Once" is per process, for the last 10,000 events. A machine with several copies, or one that restarted, can run an event a second time. Make a handler safe to run twice, keyed on `event.id` or on what the event names, as deleting what is already deleted is.

### The database inside a delivery

A delivery has no caller, so its transaction is `anon` with no claims, and no policy that reads `auth.uid()` admits it. Work that writes users' rows goes through `Database.$asService()`:

```ts
// src/modules/accounts/forget.ts
import { Database, Injectable, On, type WebhookEvent } from "palbase/backend";

@Injectable()
export class ForgetAudit {
  @On("user.deleted")
  async record(event: WebhookEvent<{ user_id: string }>): Promise<void> {
    await Database.$asService().$query("insert into deletion_log (user_id, event_id) values ($1, $2)", [event.data.user_id, event.id]);
  }
}
```

### `user.deleted` and the tables that keep users

An app whose schema keeps users' ids (columns declared with `ownedByUser()` or `userRef()`) handles `user.deleted` without writing a handler. The framework's own handler runs first, in the same transaction: it deletes the rows the user owned and clears the references to them. Your `@On("user.deleted")` handlers run after it. See [Schema](https://palbase.studio/docs/backend/schema).

## What the app needs to receive events

An app that has an `@On` handler, or whose schema keeps users' ids, must know the endpoint's secret. On a machine the platform gives it as `PALBASE_WEBHOOK_SECRET`; anywhere else the app reads it from there (`whsec_` and 64 hex characters), or from `PalbaseFactory.create(…, { palbase: { webhookSecret } })`. Without it the app does not start:

```text
[palbase] the app cannot start:
  - palbase.webhookSecret / PALBASE_WEBHOOK_SECRET is the project's webhook endpoint secret (whsec_…): the platform delivers this app events — its @On handlers', or user.deleted for the users its tables keep
```

The platform keeps the machine's endpoint itself: the machine's address followed by `/webhooks/palbase`, for example `https://<name>-<ref>.app.palbase.studio/webhooks/palbase`, sent exactly the events the app takes — its `@On` types, and `user.deleted` when its schema keeps users' ids. It reads them from the app's contract once a version serves alone, so a push or a rollback that changes what the app takes changes the endpoint with it. The endpoint is listed under **Settings › Webhooks** as the machine's; it cannot be changed or deleted there, and it goes with the machine. A machine whose app takes no events has none.

Any other server receives the same deliveries with `palbase/server`'s `verifyWebhook`. See [Webhooks](https://palbase.studio/docs/server/webhooks).

## Testing a handler

A delivery is an ordinary signed request, so a test can make one and hand it to the app. See [Testing](https://palbase.studio/docs/backend/testing) for building the app in a test. The signature is the HMAC of `"<t>.<body>"`:

```ts
// test/deliver.ts
import { createHmac } from "node:crypto";

export function delivery(secret: string, event: { id: string; type: string; data: unknown }): Request {
  const body = JSON.stringify({ ...event, project_id: "11111111-2222-3333-4444-555555555555", created_at: new Date().toISOString() });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("http://app.test/webhooks/palbase", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "palbase-signature": `t=${t},v1=${v1}` },
  });
}
```

## Related

- [Webhooks](https://palbase.studio/docs/backend/webhooks): a third party's deliveries, with `@Webhook`
- [Server SDK: Webhooks](https://palbase.studio/docs/server/webhooks): the same deliveries, to any server
- [Database](https://palbase.studio/docs/backend/database): `$asService()` and the request's transaction
- [Schema](https://palbase.studio/docs/backend/schema): `ownedByUser()` and `userRef()`
- [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules): providers
- [Testing](https://palbase.studio/docs/backend/testing): building the app in a test
