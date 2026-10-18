> The full documentation index: https://palbase.studio/llms.txt

# Webhooks

Stripe, GitHub, Slack and the rest tell your app what happened by POSTing to a URL you give them. A `@Webhook` class receives those deliveries at `POST /webhooks/<name>` on your machine: the framework checks each one's signature against the bytes **as they arrived**, under a secret it reads from the machine's environment, and hands it to the `@On` method of its event type. A delivery that is not signed with that secret never reaches your code.

This page is about a **third party's** deliveries. The platform's own events (`user.deleted`, `file.uploaded`, …) arrive at `/webhooks/palbase` and are handled by `@On` on an ordinary provider class: see [Event Hooks](https://palbase.studio/docs/backend/hooks). A server that is not a `palbase/backend` app receives the platform's events with `verifyWebhook`: see [Server SDK: Webhooks](https://palbase.studio/docs/server/webhooks).

## Quick example

```ts
// src/modules/billing/stripe.webhook.ts
import { Database, Log, On, Webhook, type WebhookMeta } from "palbase/backend";

interface StripeEvent<T> {
  id: string;
  type: string;
  data: { object: T };
}

interface Invoice {
  id: string;
  customer: string;
  amount_paid: number;
}

@Webhook({ name: "stripe", provider: "stripe", secret: { env: "STRIPE_WEBHOOK_SECRET" } })
export class StripeWebhook {
  @On("invoice.paid")
  async invoicePaid(event: StripeEvent<Invoice>, meta: WebhookMeta): Promise<void> {
    const invoice = event.data.object;
    // A delivery runs as no user: what it writes, it writes as the service.
    await Database.$asService().$query("update accounts set paid_until = now() + interval '1 month' where stripe_customer = $1", [invoice.customer]);
    Log.info("invoice paid", { invoice: invoice.id, delivery: meta.requestId });
  }

  @On("customer.subscription.deleted")
  async cancelled(event: StripeEvent<{ customer: string }>): Promise<void> {
    await Database.$asService().$query("update accounts set paid_until = null where stripe_customer = $1", [event.data.object.customer]);
  }
}
```

```ts
// src/modules/billing/billing.module.ts
import { Module } from "palbase/backend";
import { StripeWebhook } from "./stripe.webhook";

@Module({ providers: [StripeWebhook] })
export class BillingModule {}
```

Then, in Stripe's dashboard, add an endpoint at `https://<ref>.app.palbase.studio/webhooks/stripe` for `invoice.paid` and `customer.subscription.deleted`, and copy its signing secret (`whsec_…`) into the environment's secrets as `STRIPE_WEBHOOK_SECRET` ([The secret](#the-secret)). From the next deploy on, a paid invoice runs `invoicePaid`.

## `@Webhook(options)`

| Option | What it is |
|---|---|
| `name` | The last segment of the URL, `/webhooks/<name>`: what the sender is configured with. Lowercase letters, digits and dashes, starting and ending with a letter or digit. Not `palbase`, which is the platform's own. Two `@Webhook` classes of one app cannot share a name. |
| `provider` | A sender whose signature scheme the framework knows: `stripe`, `github`, `slack`, `discord`, `twilio`, `sendgrid` or `livekit` ([Providers](#providers)). |
| `signature` | A scheme spelled out, for any other sender ([A signature of your own](#a-signature-of-your-own)). |
| `secret` | `{ env: "VAR_NAME" }`: the environment variable that holds the signing secret. Its name, never its value. |

A webhook takes exactly one of `provider` and `signature`: one with neither would take forged deliveries, and one with both would verify with one and leave the other unread. It needs at least one `@On`, and an event type is taken by one method. Every one of these mistakes throws where the class is declared.

The class is a provider: its module lists it in `providers`, and it takes its dependencies by constructor, as a controller does ([Modules & Dependency Injection](https://palbase.studio/docs/backend/modules)). It needs no `@Injectable()`.

## Providers

Each provider's scheme is the one its own documentation describes. What it is checked with, what the framework reads as the event's type (the name an `@On` takes), and what it remembers a delivery by ([Duplicates and replays](#duplicates-and-replays)):

| `provider` | Signature | The secret is | Event type | Remembered by | Sender's largest body |
|---|---|---|---|---|---|
| `stripe` | `Stripe-Signature`: HMAC-SHA256 of `"<t>.<body>"`, any of its `v1`s; `t` within five minutes | the endpoint's signing secret (`whsec_…`) | the body's `type`: `invoice.paid` | the body's `id` | 512 KiB |
| `github` | `X-Hub-Signature-256`: `sha256=` HMAC-SHA256 of the body | the webhook's secret | `X-GitHub-Event` (unsigned, see below) and the body's `action`: `pull_request.opened`; the event alone when there is no action: `push`, `ping` | `X-GitHub-Delivery` with the body's SHA-256 | 25 MB |
| `slack` | `X-Slack-Signature`: `v0=` HMAC-SHA256 of `"v0:<ts>:<body>"`; `X-Slack-Request-Timestamp` within five minutes | the app's signing secret | the body's `type`: `url_verification`, `event_callback`; an interactivity form's `payload.type`: `block_actions`, `view_submission`; `""` for a slash command | the body's `event_id` | 64 KiB |
| `discord` | `X-Signature-Ed25519`: Ed25519 of `"<X-Signature-Timestamp><body>"`; the timestamp within five minutes | the application's **public key** (64 hex characters) | `PING` for type 1, `INTERACTION_CREATE` for type 2, `type_<n>` for any other | the body's `id` | 64 KiB |
| `twilio` | `X-Twilio-Signature`: base64 HMAC-SHA1 of the URL Twilio called and its signed parameters; no time | the account's auth token | the `EventType` parameter; `""` when there is none (a plain incoming message or call) | `I-Twilio-Idempotency-Token` with the SHA-256 of the URL and parameters signed | 64 KiB |
| `sendgrid` | `X-Twilio-Email-Event-Webhook-Signature`: ECDSA P-256 of `"<timestamp><body>"`; the timestamp within five minutes | the Event Webhook's **verification key** (the base64 public key SendGrid shows) | always `event_batch` | each event's `sg_event_id` | 1 MiB |
| `livekit` | `Authorization`: a JWT signed HS256 with the API secret, unexpired (with a minute's leeway), whose `sha256` claim is the body's hash | the API secret | the body's `event`: `room_started` | the body's `id` | 512 KiB |

**A delivery's body is capped** at the smaller of its sender's largest (the last column) and the app's own `bodyLimit` (`PalbaseFactory.create(…, { bodyLimit })`, 1 MiB unless you set it). With the default, a Stripe, LiveKit, Slack, Discord or Twilio delivery is held to what that sender sends, and a GitHub or SendGrid one to 1 MiB: an app that takes GitHub's larger pushes raises its `bodyLimit`, which raises it for every route too. A body over the cap is refused `413 payload_too_large`, before more of it is read than the cap.

The secrets of `discord` and `sendgrid` are public keys, which cannot forge a delivery. One that is not a key of the right kind stops the boot, naming the variable.

**Twilio signs the URL it called.** The framework rebuilds it as `https://` with the host the request came to, its path and its query, so give Twilio the machine's address exactly as it serves it. It tries the URL with and without the port, as Twilio's own library does. A form body's parameters, decoded and sorted, are part of what is signed, and the handler is given those same parameters: `{ From: "+1555…", Body: "hi", … }`, a name sent twice as an array. A JSON body is signed through the `bodySHA256` parameter of the URL instead.

Twilio's signed string has nothing between a name and its value, or between one parameter and the next. So a captured request can be split again into other parameters that verify just the same (`Body=HiFrom+1555` for `Body=Hi&From=+1555`). Twilio's own libraries accept such a request too, and no check can tell it from the original. A Twilio handler checks what it acts on, such as a `MessageSid` or `CallSid` it can look up, before trusting the parameters' split.

**GitHub's event name is not signed.** `X-GitHub-Event` is a header, outside what GitHub's signature covers, so whoever holds a GitHub delivery can send it again under another event's name, to that event's `@On`. GitHub signs nothing else that names the event, and every receiver routes on that header, Octokit's included. A GitHub handler checks that the payload is the one it takes: a `pull_request` has a `pull_request`, a `push` has its `ref` and `commits`.

**Slack's form or JSON is read from the signed bytes.** A body that is not JSON but is a form with a `payload` field is an interactivity payload, whatever its `Content-Type`, because no signature covers that header.

## A signature of your own

A sender with no preset is described by its scheme: an HMAC over a template of the body and, optionally, a timestamp.

```ts
// src/modules/shipping/carrier.webhook.ts
import { Log, On, Webhook } from "palbase/backend";

interface Shipment {
  type: string;
  tracking_number: string;
  status: string;
}

@Webhook({
  name: "carrier",
  signature: {
    header: "x-carrier-signature",
    prefix: "sha256=",
    algo: "hmac-sha256",
    encoding: "hex",
    // What the HMAC covers: {body} is the bytes as they arrived, {ts} the timestamp header.
    signs: "{ts}.{body}",
    timestampHeader: "x-carrier-timestamp",
  },
  secret: { env: "CARRIER_WEBHOOK_SECRET" },
})
export class CarrierWebhook {
  @On("shipment.delivered")
  delivered(event: Shipment): void {
    Log.info("delivered", { tracking: event.tracking_number });
  }
}
```

| `signature` field | What it is |
|---|---|
| `header` | The header the signature arrives in. A delivery without it is refused before its body is read. |
| `prefix` | Text before the signature in that header (`sha256=`): stripped before comparing. A header without it is refused. |
| `algo` | `hmac-sha256` or `hmac-sha1`. |
| `encoding` | `hex` or `base64`. |
| `signs` | The template the HMAC covers. It must contain `{body}`; `{ts}` puts in the timestamp header's value; everything else is literal text. |
| `timestampHeader` | Where `{ts}` is read. With `{ts}` in the template, the timestamp is whole seconds and must be within five minutes of the machine's clock. |

The event's type is the body's `type`. A body may be as large as the app's own `bodyLimit` (1 MiB unless you set it): there is no sender's largest to hold it to. A spelled-out scheme names no delivery id, so the framework cannot recognise a delivery sent again: every one runs. Without `{ts}` in `signs`, a captured delivery also verifies whenever it is sent again, at any time ([Duplicates and replays](#duplicates-and-replays)). Use the sender's timestamp when it sends one.

## The secret

`secret: { env }` names an environment variable, and the framework reads it when the app is built. Keep it with the project's other secrets:

1. **Environment › Variables**, **Add secret**: the name you gave `env` (`STRIPE_WEBHOOK_SECRET`), and the sender's secret as its value.
2. **Backend › Machines**, the machine, **Edit settings**: start it with the set that holds it (**Secrets: Production secrets**). A machine already started with it rolls out with the new value.
3. List the name in the machine's `.env.example`. A build whose variables the machine does not have waits for them instead of rolling out an app that cannot start ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)).

An app whose webhook's variable is unset, or does not hold a key its provider can use, does not start, and says which:

```text
[palbase] the app cannot start:
  - @Webhook "stripe" (StripeWebhook) reads its signing secret from STRIPE_WEBHOOK_SECRET, which is not set
```

This is not `PALBASE_WEBHOOK_SECRET`. That one is the platform's endpoint secret for [its own events](https://palbase.studio/docs/backend/hooks); an app with `@Webhook` classes and no platform `@On` does not need it.

## Events and `@On`

Inside a `@Webhook` class, `@On("<type>")` takes that sender's events, under whatever name the sender gives them: `invoice.paid`, `pull_request.opened`, `PING`, `block_actions`. (Outside one, `@On` takes the platform's events, whose types are dotted lowercase words; [Event Hooks](https://palbase.studio/docs/backend/hooks).) A handler is called as `(event, meta)`:

| Argument | What it is |
|---|---|
| `event` | The body's JSON. A body that is not JSON is given as its text. For Slack's interactivity (a form of one field, `payload=<json>`), the parsed `payload`. For Twilio's form, the signed parameters. |
| `meta.requestId` | The delivery's request id: the app's log lines of it carry it. |
| `meta.env` | The app's environment as it started, without `PALBASE_SECRET_KEY`, `PALBASE_WEBHOOK_SECRET` and `PALBASE_PLATFORM_SECRET`. |
| `meta.environmentId` | The project's id. |

```ts
// src/modules/slack/slack.webhook.ts
import { Log, On, Webhook } from "palbase/backend";

@Webhook({ name: "slack", provider: "slack", secret: { env: "SLACK_SIGNING_SECRET" } })
export class SlackWebhook {
  // Slack checks the URL once when it is set, and expects the challenge back.
  @On("url_verification")
  verify(event: { challenge: string }): { challenge: string } {
    return { challenge: event.challenge };
  }

  @On("event_callback")
  message(event: { event: { type: string; user?: string; text?: string } }): void {
    Log.info("slack event", { type: event.event.type, user: event.event.user });
  }

  // A button: Slack's interactivity form, its payload already parsed.
  @On("block_actions")
  clicked(event: { user: { id: string }; actions: { action_id: string }[] }): void {
    Log.info("clicked", { user: event.user.id, action: event.actions[0]?.action_id });
  }
}
```

A delivery whose type no `@On` takes is acknowledged with `200 { ok: true, handled: false }` and runs nothing: answering an error would make the sender retry it, and some senders turn off an endpoint that keeps failing.

**`@On("")` takes the deliveries that name no type.** Two senders' deliveries name none:

- Twilio's plain incoming message or call: a form with no `EventType`. The handler is given its signed parameters.
- A Slack slash command: a form with no `payload`. The handler is given the form's text, which `new URLSearchParams(event)` reads.

`@On("")` is a `@Webhook`'s alone. On any other class, `@On` takes the platform's events, which always name their type, and an empty one stops the boot.

A SendGrid delivery is a batch: its one event type is `event_batch`, and the handler is given the array of events.

The event is the sender's data: the database takes values from it, never a filter's structure ([Database](https://palbase.studio/docs/backend/database)). A delivery runs inside one database transaction, as no user (`anon`), as the platform's events do: what it writes, it writes through `Database.$asService()`. All of it commits when the handler returns, or none of it when it throws.

## What a handler returns

What the handler returns is what the sender gets:

| The handler returns | The sender gets |
|---|---|
| nothing (`undefined` or `null`) | `200 { ok: true, handled: true }` |
| a `Response` | that response, as it is: its status, headers and body |
| a string | `200` with it as the body: `text/xml` for `twilio` (TwiML), `text/plain` for any other |
| anything else | `200` with it as JSON: Slack's `{ challenge }`, Discord's `{ type: 1 }` to a `PING` |

```ts
// src/modules/discord/discord.webhook.ts
import { On, Webhook } from "palbase/backend";

@Webhook({ name: "discord", provider: "discord", secret: { env: "DISCORD_PUBLIC_KEY" } })
export class DiscordWebhook {
  // Discord pings the URL when it is set, and keeps it only if it answers a PONG.
  @On("PING")
  ping(): { type: number } {
    return { type: 1 };
  }

  @On("INTERACTION_CREATE")
  interaction(event: { data?: { name?: string } }): { type: number; data: { content: string } } {
    return { type: 4, data: { content: `You ran /${event.data?.name ?? "?"}` } };
  }
}
```

A Twilio number's incoming messages carry no `EventType`, so `@On("")` takes them, and a string it returns goes back to Twilio as TwiML (`text/xml`):

```ts
// src/modules/sms/sms.webhook.ts
import { Log, On, Webhook } from "palbase/backend";

interface IncomingSms {
  MessageSid: string;
  From: string;
  Body: string;
}

@Webhook({ name: "sms", provider: "twilio", secret: { env: "TWILIO_AUTH_TOKEN" } })
export class SmsWebhook {
  // A plain incoming message names no event type: "" takes it.
  @On("")
  incoming(event: IncomingSms): string {
    Log.info("sms in", { sid: event.MessageSid, from: event.From });
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks, we got it.</Message></Response>';
  }
}
```

Give Twilio `https://<ref>.app.palbase.studio/webhooks/sms` as the number's **A message comes in** webhook, method `POST`.

## What the sender sees

The sender decides from the status whether to deliver again, so every answer says what happened:

| Status | When | The sender |
|---|---|---|
| `200` | Handled; or no `@On` takes its type (`handled: false`); or a delivery already run (`handled: false, duplicate: true`) | stops |
| `401 invalid_signature` | The signature does not check: its `error_description` ends with `missing_signature`, `malformed_signature`, `stale_timestamp` or `signature_mismatch` | retries, and a forger gets nowhere |
| `405 method_not_allowed` | Not a `POST` | — |
| `409 in_progress` | The same delivery (by its id) is being handled right now; `Retry-After: 5` | delivers it again |
| `413 payload_too_large` | The body is over its cap: the smaller of what that sender sends and the app's `bodyLimit` ([Providers](#providers)) | — |
| `500 handler_failed` | The handler threw | delivers it again, later |
| `503` | What the handler needed of the platform did not answer: `auth_unavailable`, `service_unavailable` (a module call that answered 429, 502, 503 or 504, or never arrived), or the database's `database_unavailable`; with `Retry-After` | delivers it again, after the wait |

A delivery needs no API key and no user token: the signature is its only credential, and nothing else is checked. A missing signature header is refused before a byte of the body is read.

The reason for a failure stays in the app's log, under the request id: the `500` says only `The event could not be handled`, because a sender may show its answers to anyone who can open its dashboard. Refusals are counted, and the counts logged at most once a minute per webhook, so a stream of forged deliveries cannot fill the log.

## Duplicates and replays

Senders deliver **at least once**: a delivery whose answer was lost is sent again. The framework remembers the deliveries it ran, up to the last 10,000 per webhook, and acknowledges one sent again with `duplicate: true` instead of running it twice. What it remembers a delivery by comes from **what the sender signed**, never from a header alone:

| Sender | Remembered by | A captured delivery sent again by someone else |
|---|---|---|
| Stripe, Slack, Discord, LiveKit, SendGrid | the id inside the signed body (`id`, `event_id`, each event's `sg_event_id`), when it has one: a Slack interactivity payload or `url_verification` has none | is not run again within five minutes, and is refused after: they sign a time |
| GitHub | `X-GitHub-Delivery` with the SHA-256 of the body | is **run again** under a fresh `X-GitHub-Delivery`: GitHub signs neither a time nor an id |
| Twilio | `I-Twilio-Idempotency-Token` with the SHA-256 of the URL and parameters signed | is **run again** under a fresh token: Twilio signs neither a time nor an id |
| a spelled-out `signature` | nothing | is run again every time, and without `{ts}` it verifies whenever it is sent |

So the sender's own retry is run once: GitHub keeps the delivery's GUID on a redelivery, and Twilio's token is there to tell its retries apart. A delivery replayed under another id by whoever holds a copy of it, from a log or a proxy, is run again for GitHub, Twilio and a template without `{ts}`. For a SendGrid batch the framework keeps the events it has not run and hands the handler those alone.

That memory is one copy's, in its memory. Another copy of the machine, or the same one after a restart, runs a delivery again. So:

- **Write handlers to be idempotent.** Key what they write on the event's own ids (`invoice.id`, a `MessageSid`, a payload's ids) with a unique constraint or an upsert, so a second run changes nothing.
- **Check what a handler acts on.** For GitHub and Twilio, a delivery's authenticity does not say it is new, and their event name or parameters are not wholly signed ([Providers](#providers)). Look up the object the event names before you act on it.

## The contract

A `@Webhook` is part of the app's contract — written by its build, kept by the platform with it — which Studio's backend screens read: `POST /webhooks/<name>`, with `x-palbase-webhook` saying who sends it (`provider`, or the `signatureHeader` of a spelled-out scheme), the variable its secret is read from (`secretEnv`, the name alone) and the event types its `@On` take (`events`).

## The `webhooks` path segment

`webhooks` is the platform's first path segment, never a controller's. `@Controller` refuses a base path that starts with it, the app does not start with a route whose path begins with it, and a request to a `/webhooks/<name>` no `@Webhook` has answers `404`. `/webhooks/palbase` is the platform's own events ([Event Hooks](https://palbase.studio/docs/backend/hooks)); every other `/webhooks/<name>` belongs to the `@Webhook` of that name.

## Testing

A delivery is a signed `POST`, so a test signs one the way the sender does and hands it to the app. With the webhook's secret in the app's `env`:

```ts
// src/modules/billing/stripe.webhook.test.ts
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Module, On, PalbaseFactory, Webhook, type PalbaseApplication } from "palbase/backend";

const seen: string[] = [];

@Webhook({ name: "stripe", provider: "stripe", secret: { env: "STRIPE_WEBHOOK_SECRET" } })
class TestStripeWebhook {
  @On("invoice.paid")
  paid(event: { id: string }): void {
    seen.push(event.id);
  }
}

@Module({ providers: [TestStripeWebhook] })
class TestModule {}

const secret = "whsec_test_0123456789";
const env = {
  PALBASE_URL: "https://abcd1234.palbase.studio",
  PALBASE_PROJECT_ID: "11111111-2222-3333-4444-555555555555",
  PALBASE_SECRET_KEY: "pb_abcd1234_s0123456789abcdef0123456789abcdef",
  STRIPE_WEBHOOK_SECRET: secret,
};

/** A delivery as Stripe signs one: HMAC-SHA256 of "<t>.<body>". */
function stripeDelivery(event: { id: string; type: string }, key = secret): Request {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
  return new Request("http://app.test/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": `t=${t},v1=${v1}` } });
}

let app: PalbaseApplication;
beforeAll(async () => {
  app = await PalbaseFactory.create(TestModule, { env, port: 0, host: "127.0.0.1", exitOnFatal: false });
});
afterAll(() => app.close());

describe("the Stripe webhook", () => {
  it("runs a paid invoice once, however often it is delivered", async () => {
    expect((await app.handle(stripeDelivery({ id: "evt_1", type: "invoice.paid" }))).status).toBe(200);
    const again = await app.handle(stripeDelivery({ id: "evt_1", type: "invoice.paid" }));
    expect(await again.json()).toMatchObject({ handled: false, duplicate: true });
    expect(seen).toEqual(["evt_1"]);
  });

  it("refuses a delivery signed with another secret", async () => {
    const res = await app.handle(stripeDelivery({ id: "evt_2", type: "invoice.paid" }, "whsec_someone_else"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_signature" });
  });
});
```

`getWebhookManifest(StripeWebhook)` reads what a class declares (its `name`, `provider`, `secretEnv` and `events`) without building it, for a test that pins the wiring. See [Testing](https://palbase.studio/docs/backend/testing) for the rest of a backend's tests.

## Related

- [Event Hooks](https://palbase.studio/docs/backend/hooks) — the platform's own events, at `/webhooks/palbase`
- [Server SDK: Webhooks](https://palbase.studio/docs/server/webhooks) — the platform's events delivered to any other server
- [Secrets](https://palbase.studio/docs/backend/secrets) — where a webhook's signing secret is kept
- [Database](https://palbase.studio/docs/backend/database) — `$asService()` and the delivery's transaction
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers) — the paths that are the platform's
- [Testing](https://palbase.studio/docs/backend/testing) — building the app in a test
