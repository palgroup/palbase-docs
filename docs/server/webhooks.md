> The full documentation index: https://palbase.studio/llms.txt

# Webhooks

When something happens in a project — a user is deleted, a file is uploaded, a secret changes, an email bounces — the platform POSTs an **event** to each of the project's webhook endpoints that takes its type, signed with that endpoint's secret. `palbase/server` checks the signature: `verifyWebhookRequest(request, secret)` answers the event, or throws. A `palbase/backend` app does not call it at all — its `@On` handlers receive the events already checked (see [Event Hooks](https://palbase.studio/docs/backend/hooks)).

## Quick example

```ts
// server.ts
import { verifyWebhookRequest, WebhookSignatureError } from "palbase/server";

const secret = process.env.PALBASE_WEBHOOK_SECRET!; // whsec_…, shown once when the endpoint was made
const handled = new Set<string>();

export async function handle(request: Request): Promise<Response> {
  let event;
  try {
    event = await verifyWebhookRequest<{ user_id?: string }>(request, secret);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return new Response(e.code, { status: 401 });
    throw e;
  }
  // A delivery may come twice: the event's id says it is the same one.
  if (handled.has(event.id)) return new Response(null, { status: 204 });
  if (event.type === "user.deleted") {
    console.log(`forget everything about ${event.data.user_id}`);
  }
  handled.add(event.id);
  return new Response(null, { status: 204 });
}
```

Any `2xx` is delivery. Anything else — another status, a timeout, a refused connection — and the platform sends the event again.

## Endpoints

An endpoint is an `https` URL on the public internet and the event types it takes — up to 50 of them, each dotted lowercase words such as `user.deleted`; an endpoint that names none takes every type, but `messaging.message.created` and `messaging.conversation.read` — one a message, one a read — which go only to an endpoint that names them. A project has **5 endpoints at most**, besides the ones the platform keeps for its machines. When an endpoint is made, its secret (`whsec_` and 64 hex characters) is answered **once**; keep it in the receiving server's secrets.

Manage a project's endpoints in Studio, under an environment's **Settings › Webhooks**: add an endpoint (its secret is shown once, with a copy button), change its address or events, or delete it. Reading the list is open to the organization's members; adding, changing and deleting are an admin's — a person, or an admin [access token](https://palbase.studio/docs/getting-started/access-tokens). Each endpoint shows who made it: a person, an access token or an environment token, by the name it had then. An endpoint stays when the token that made it is deleted. Palbase's own environment is shown read-only. A `palbase/backend` app on a machine needs none of this: the platform gives the machine its `PALBASE_WEBHOOK_SECRET` and keeps an endpoint for exactly the events its app takes, listed as the machine's — not changed or deleted from here, and gone with the machine ([Event Hooks](https://palbase.studio/docs/backend/hooks)).

The CLI does the same:

```sh
palbase webhooks:create https://api.example.com/palbase --events user.deleted,file.uploaded --secret-to RECEIVER_WEBHOOK_SECRET
palbase webhooks:list
palbase webhooks:update <id> --events user.deleted
palbase webhooks:delete <id>
```

`--secret-to` keeps the new endpoint's secret in the environment's secrets (production, or development with `--dev`) instead of printing it, so a receiver that is itself a machine of the environment reads it by name. See the [CLI reference](https://palbase.studio/docs/cli/reference#webhooks).

### Failed deliveries

A delivery is tried 12 times, the wait growing up to five minutes between tries. When the endpoint still has not taken it, Palbase gives up and keeps the delivery for **30 days** under **Settings › Webhooks › Failed deliveries**: the event, the endpoint, how many times it was tried and why the last try failed. **Redeliver** sends the same event, with the same `Palbase-Event-Id` and body, to that endpoint again within seconds, signed afresh, as Stripe's *Resend* does. Your receiver already handles an event more than once by its id, so a redelivery is safe. Members read the list; an admin redelivers, and the redelivery is written to the organization's audit log. Studio's API does the same: `GET /v1/environments/{ref}/webhooks/deliveries?failed=true` and `POST /v1/environments/{ref}/webhooks/deliveries/{id}/redeliver`. A delivery whose endpoint was deleted is sent nowhere (`409 endpoint_gone`).

## What a delivery is

A delivery is a `POST` with a JSON body — the event — and three headers:

| Header | What it carries |
|---|---|
| `Palbase-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` |
| `Palbase-Event-Id` | The event's id (also in the body): the same id twice is the same event delivered again. |
| `Palbase-Event-Type` | The event's type (also in the body). |

```json
{
  "id": "6f2c1c9e-…",
  "type": "file.uploaded",
  "project_id": "2b7d…",
  "created_at": "2026-10-08T09:41:22Z",
  "data": { "bucket": "avatars", "path": "usr_123/face.png", "size": 48211, "content_type": "image/png", "owner_id": "usr_123" }
}
```

The platform waits **10 seconds** for an answer, follows no redirect, and tries an event up to **12 times**, waiting 1 s, 2 s, 4 s … up to five minutes between attempts. One project's slow or silent receiver holds back only that project's events.

**Delivery is at least once.** An event that reached your endpoint may be sent again — a retry after a timeout your server answered too late, or the platform's sender starting again — so key the work on the event's `id`, not on its arrival. An event is never dropped because an endpoint was down for a while: it is retried until it is taken or its attempts run out.

## The events

| Type | Sent when | `data` |
|---|---|---|
| `user.deleted` | A user is deleted — by themselves, or with the secret key. | `{ user_id, is_test, deleted_at }` |
| `session.ended` | A user's session ends — they signed out, ended it from another device, it was revoked (by an admin, a ban, a password reset, its refresh token used twice), it ran out with no one back to renew it (`ended_at` is then the moment its time was up), or the user was deleted. | `{ user_id, session_id, ended_at }` |
| `file.uploaded` | An object is written: a `PUT`, a copy, an upload through a signed URL. | `{ bucket, path, size, content_type, owner_id }` |
| `file.deleted` | An object is deleted. | the same fields |
| `file.moved` | An object is given another path. | the same fields |
| `secret.changed` | A secret is written, rolled back or deleted. The value is never in the event. | `{ environment, name, version, change }` |
| `notification.sent` / `notification.failed` | A message ended sent, or failed. | `{ message_id, channel, rail, template, … }` |
| `notification.received` | A user sent a WhatsApp message to the project's number. | the message |
| `notification.uninstalled` | A push service said no app holds a device's token any more: the app was taken off the phone. The device is forgotten. | `{ platform, provider, device_id, installation_id, user_id }` |
| `notification.push_failing` | A push provider started failing for its own fault — its APNs key refused, a topic the key may not send to: every push through it fails until its setting is fixed ([Apple (APNs)](https://palbase.studio/docs/backend/notifications#every-channel-but-one-needs-a-provider-of-yours)). At most once a day a provider. | `{ project_id, channel, provider, error, failing_since }` |
| `journey.entered` / `journey.converted` | A person entered a journey, or their run reached its goal. A try on a test user's events carry `test: true` ([Journeys](https://palbase.studio/docs/backend/journeys#events)). | `{ journey, journey_id, run_id, user_id, test }` |
| `journey.step` | A person's run took a step. | `{ journey, journey_id, run_id, user_id, step, kind, outcome, test }` |
| `journey.event` | A journey's `event` step told the project's backend. | `{ journey, journey_id, run_id, user_id, step, name, data, test }` |
| `journey.ended` | A person's run ended: `completed`, `converted`, `exited`, `stopped`. | `{ journey, journey_id, run_id, user_id, reason, test }` |
| `messaging.report.created` | A person reported a conversation, someone in it or messages of it. Read what it carries with the secret key (`GET /messaging/admin/reports/{report_id}`); an organization that runs its customers' apps passes it on to them from here ([Messaging](https://palbase.studio/docs/messaging/overview#moderation)). | `{ report_id, conversation_id, reporter_id, reported_user_id, reason, message_count }` |
| `messaging.conversation.created` / `messaging.conversation.deleted` | A conversation was made — by a person, or the project's server — or deleted for everyone. | `{ conversation_id, kind, created_by, member_ids, space }` / `{ conversation_id, deleted_by }` |
| `messaging.message.created` | A message reached a conversation — a person's, or the project's server's (`via`) — with whom it is for and whom it names; its text only with the setting `event_text`. Sent only to an endpoint that names it, never to one of every event ([Messaging](https://palbase.studio/docs/messaging/overview#your-server)). | `{ conversation_id, conversation_kind, space, message_id, seq, kind, sender_id, via, thread_id, mention_ids, recipient_ids, has_attachments, text?, created_at }` |
| `messaging.conversation.read` | A person read a conversation, or a thread of it, further. Sent only to an endpoint that names it. | `{ conversation_id, space, user_id, read_seq, thread_id }` |
| `calls.call.started` / `calls.call.ended` | A call was made — ringing, or a group going on — or ended (`end_reason` says why) ([Calls](https://palbase.studio/docs/calls/server#webhooks)). | `{ call_id, kind, video, mode, state, caller_id, conversation_id, room }`, and `end_reason` when it ended |
| `calls.participant.joined` / `calls.participant.left` | A person answered or joined a call, or left it; or the project's agent came into it, or left ([Agents](https://palbase.studio/docs/calls/agents)). | the same fields, and `user_id`, `participant_kind` (`user` or `bot`) |
| `audience.entered` / `audience.exited` | A person came to be in an analytics audience, or left it. | `{ audience_id, audience_name, person_id, user_id }` |
| `machine.created` / `machine.updated` / `machine.deleted` | A machine was opened, changed, or taken away. | `{ name, source, size, replicas, port, version }` |
| `stores.apple.changed` | The Apple account was connected, checked (and Apple's answer changed) or disconnected. The key is never in the event. | `{ change, issuer_id, key_id, status, capabilities }` |
| `stores.app.changed` | An app was linked to its store. | `{ change, app_id, bundle_id, asc_app_id }` |
| `stores.package.changed` | A package was made, or its build arrived. | `{ change, package_id, app_id, build_number, version }` |
| `stores.delivery.requested` | A delivery to TestFlight was sent, or sent again. | `{ package_id, channel }` |
| `stores.delivery.changed` | A delivery moved: `queued`, `signing`, `uploading`, `processing`, `compliance`, `ready` or `failed`. | `{ package_id, channel, status, asc_build_id, error_code, error }` |
| `stores.group.changed` | A tester group was made, renamed, deleted, its testers set, or a build given to it. | `{ change, group_id, app_id, name, testers, package_id }` |
| `stores.action.changed` | A planned action (Beta App Review, export compliance, expiring a build, an App Store page or version step) was done, declined or failed. | `{ action_id, kind, package_id, app_id, status, summary }` |
| `stores.version.changed` | An app's App Store version came to a new state: sent to App Review, in review, approved, rejected, withdrawn or released. `result` is App Review's answer, `approved` or `rejected`, or `null`; `source` who told it: `apple_webhook`, `poll` or `action`. | `{ app_id, bundle_id, name, version, asc_version_id, previous_state, state, result, source }` |
| `stores.google.changed` | The Play connection was made, checked (and Play's answer changed) or disconnected. | `{ change, service_account, status, capabilities }` |
| `stores.webhook.changed` / `stores.build.changed` / `stores.beta_review.changed` / `stores.feedback.received` / `stores.product.changed` / `stores.play_release.changed` / `stores.vitals.changed` | An app's App Store Connect webhook, its build uploads, Beta App Review, testers' feedback, its in-app purchases' review, its Play releases and its crash data — each one is in [App Health](https://palbase.studio/docs/distribution/health#the-events). | the event's own |
| `database.created` / `database.updated` / `database.deleted` / `database.undeleted` / `database.purged` / `database.password_changed` / `database.restoring` | A database's life. | `{ name, size }` |
| `purchases.*` | A purchase, a renewal, a refund, an entitlement or credits changing — each one is in [Purchases › Entitlements](https://palbase.studio/docs/purchases/entitlements#events). | the event's own |
| `ai.response.started` | A chat's turn began: a member's message, the server's, the chat's goal, or the late messages of the turn before opened it. | `{ response_id, status: "running", model, metadata, chat_id, user_id, message_metadata, goal_id, goal_turn }` |
| `ai.response.completed` / `ai.response.failed` | A response started with `background: true` ended, or a chat's turn did. A turn's `status` is `completed`, `failed`, `stopped` or `budget_exceeded`, its `metadata` the chat's labels, and one that failed says why in `error`. | `{ response_id, status, model, metadata, cost_nano_usd, error?: { code, message, retryable } }`, a turn's with `chat_id, user_id, message_metadata, goal_id, goal_turn` |
| `ai.goal.updated` | A chat's goal was set, its status changed, or it was cleared. | `{ chat_id, goal_id, status, previous_status, stop_code, stop_reason, set_by, metadata }` |
| `ai.voice.started` / `ai.voice.closed` | A chat's voice began, or ended (closed, replaced, its member taken out, its chat deleted, lost). | `{ chat_id, voice_id, user_id, delegation, status, seconds, close_reason, metadata }` |
| `ai.voice.delegated` | A person asked a voice of `delegation: "events"` for something out loud: have it done, and answer with the voice's `speak`, naming the delegation. | `{ chat_id, voice_id, delegation_id, text, earlier, user_id, metadata }` |
| `ai.workspace.published` | A chat's workspace published a tree (mid-turn, as a build writes its product, and once more as its machine lets it go): what changed against the tree it replaced. Read a file of it with `GET /ai/chats/{id}/workspace/files?path=&manifest=`. | `{ chat_id, manifest_id, previous_manifest_id?, changed: [{ path, change, size_bytes }], changed_count, changed_truncated, metadata }` |
| `ai.workspace.pushed` | A chat's agent pushed its work to the chat's branch. | `{ chat_id, repo, repository, branch, head_sha, commits: [{ sha, subject, author_name, author_email }], commits_truncated, response_id, user_id, metadata }` |

The modules' contracts say which of their operations emit which event; each is noted on the operation (for example, `PUT /storage/buckets/{bucket}/objects/{path}` "Emits file.uploaded").

## Checking a delivery

The signature is an HMAC of the body **exactly as it arrived** — the bytes, before any JSON parsing. A parsed and re-serialised body is a different string and never verifies, so read the raw body first.

| Function | Use it for |
|---|---|
| `verifyWebhookRequest(request, secret, { toleranceSeconds?, now?, maxBytes? })` | A fetch `Request` (Node, Bun, Deno, Workers, a Next.js route handler): reads its body — 1 MiB at most unless `maxBytes` says — and its header. |
| `verifyWebhook({ secret, signature, body, toleranceSeconds?, now? })` | A body you already hold, as a string or bytes, and the header's value. |
| `verifySignature({ secret, signature, body, … })` | The check alone, for a signed call whose body is not an event (see below). |

Each throws a `WebhookSignatureError` whose `code` says why:

| `code` | Why |
|---|---|
| `missing_signature` | No `Palbase-Signature` header. |
| `malformed_signature` | The header is not `t=…,v1=…`. |
| `stale_timestamp` | `t` is more than `toleranceSeconds` (300 by default) from now: an old delivery sent again is not taken. |
| `signature_mismatch` | No `v1` is this body signed with this secret — a changed body, or another endpoint's secret. |
| `invalid_body` | The signed body is not JSON, or not an event (`id`, `type`, `project_id`, `created_at`, `data`). |
| `body_too_large` | The body is larger than `maxBytes`. |

`verifyWebhook` takes only an endpoint secret (`whsec_…`): an API key passed by mistake is a `TypeError`, not a check that quietly fails.

```ts
// app/api/palbase/route.ts
import { verifyWebhook, WebhookSignatureError } from "palbase/server";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text(); // the raw body, before anything parses it
  try {
    const event = await verifyWebhook({
      secret: process.env.PALBASE_WEBHOOK_SECRET!,
      signature: request.headers.get("palbase-signature"),
      body,
    });
    console.log(event.type, event.id);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof WebhookSignatureError) return new Response(e.code, { status: 401 });
    throw e;
  }
}
```

## The platform's own calls to a machine

The platform signs what it asks of a machine the same way, with the key it starts every machine with in `PALBASE_PLATFORM_SECRET`: the crons' and tasks' lists and calls (`GET /_palbase/crons`, `POST /_palbase/crons/<name>`, `GET /_palbase/tasks`, `POST /_palbase/tasks/<name>`). Those paths are reached only by the platform: a request from outside whose path names them never gets to the machine. A program that serves them checks the call with `verifySignature`, whose body is the request's (empty for a `GET`). See [Machines](https://palbase.studio/docs/machines/overview).

## Related

- [Event Hooks](https://palbase.studio/docs/backend/hooks) — `@On` handlers in a `palbase/backend` app
- [Backend Webhooks](https://palbase.studio/docs/backend/webhooks) — a third party's deliveries (Stripe, GitHub, …) to a `palbase/backend` app, with `@Webhook`
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — `createServer`, refusals and retries
- [Storage](https://palbase.studio/docs/backend/storage) — what emits `file.uploaded`, `file.deleted` and `file.moved`
- [Secrets](https://palbase.studio/docs/backend/secrets) — where a receiving server keeps its endpoint secret
