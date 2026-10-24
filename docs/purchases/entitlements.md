> The full documentation index: https://palbase.studio/llms.txt

# Entitlements, Credits & Limits

What a customer has is one answer, `CustomerInfo`, whatever store they bought in: their **entitlements** (`pro`), their **credits** (`tokens`) and their use of each **limit** (`ai_requests` a month). The apps read it to decide what to show; your server reads it to decide what to serve — and spends credits and quota, which only a server does.

## Quick example

A route only Pro customers reach, and one that is paid for in tokens:

```ts
// src/modules/summaries/summaries.controller.ts
import { Body, Controller, Forbidden, Get, Headers, PalError, Palbase, Post, User, z, type UserT } from "palbase/backend";
import { PalbaseError, isEntitled, withReservation } from "palbase/server";

const Summarize = z.object({ text: z.string().min(1).max(20000) });
type Summarize = z.infer<typeof Summarize>;
const Retried = z.object({ "idempotency-key": z.string().min(1).max(255) });
type Retried = z.infer<typeof Retried>;

@Controller("/summaries")
export class SummariesController {
  @Get("/archive")
  async archive(@User() user: UserT): Promise<{ pro: true }> {
    const { data } = await Palbase.purchases.getCustomer({ path: { customer_id: user.id } });
    if (!isEntitled(data, "pro")) throw new Forbidden("Pro is needed", "entitlement_required");
    return { pro: true };
  }

  @Post("")
  async create(@Body(Summarize) body: Summarize, @Headers(Retried) headers: Retried, @User() user: UserT): Promise<{ summary: string }> {
    try {
      // 10 tokens are held while the job runs and taken once it returns; if it throws, they are released.
      // The same Idempotency-Key again (a retried request) is the same hold, never a second charge.
      return await withReservation(Palbase, user.id, { credits: "tokens", amount: 10, idempotencyKey: headers["idempotency-key"] }, async () => {
        const summary = await Palbase.ai.ask(`Summarize in three sentences:\n\n${body.text}`);
        return { summary };
      });
    } catch (e) {
      if (e instanceof PalbaseError && e.code === "credits_insufficient") throw new PalError(402, "credits_insufficient", "Not enough tokens");
      throw e;
    }
  }
}
```

A customer without 10 tokens available is refused before the job runs: the purchases module answers `409 credits_insufficient`, and the route answers `402`. A module's refusal the handler does not catch answers `500` ([Responses & Errors](https://palbase.studio/docs/backend/errors#errors-from-the-projects-modules)).

## What a customer has

`CustomerInfo` is what `GET /purchases/me` answers the customer's app and `GET /purchases/customers/{customer_id}` answers your server — the same document:

| Field | What it is |
|---|---|
| `customer_id` | The user's id. A guest merged into an account reads as the account. |
| `entitlements` | Every entitlement the customer has or had, by key (below). |
| `subscriptions` | Their subscriptions and non-renewing periods, oldest first: `product`, `plan`, `store`, `state`, `active`, `expires_at`, `will_renew`, `is_sandbox`, `manage`. |
| `purchases` | Their one-time purchases, oldest first: `product`, `store`, `state`, `purchased_at`, `is_sandbox`. |
| `credits` | Their balance in each credit (below). |
| `limits` | Their use of each limit in its current window (below). |
| `guest` | Whether the user is a guest. |
| `revision` | Rises with every change of what they have; `0` while they have nothing. |
| `requested_at` | When it was computed: what was active is as of then. |

An entitlement:

| Field | What it is |
|---|---|
| `active` | Whether the customer has it now. |
| `expires_at` | When it ends; `null` for life. |
| `will_renew` | Whether what gives it renews. |
| `store` | Where it comes from: `app_store`, `play_store`, `stripe`, or `promotional` (a grant). |
| `product`, `plan` | The catalog's product and plan that give it. |
| `period_type` | `normal`, `trial` (a free trial) or `promotional` (a grant). |
| `billing_issue` | The store could not charge the renewal: the customer keeps access through its grace period. |
| `is_sandbox` | A test purchase gives it. |
| `manage` | Where it is managed: the store, and its page (`url`) — none for Stripe, whose portal is opened on request. |
| `sources` | Everything that gives it, active ones first. |

An entitlement is read from the source that gives it longest: one for life wins, a real purchase wins over a test one.

A subscription's `state` is `trial`, `active` or `grace` while it gives access, and `pending`, `billing_retry`, `paused`, `expired`, `revoked` (refunded) or `replaced` (another purchase took it over) when it does not.

## Checking an entitlement

**On your server**, read the customer and ask `isEntitled(info, key)` from `palbase/server`: the entitlement is active and, unless it is for life, ends after now. It reads the `CustomerInfo` alone, so one kept a while still ends when its entitlement does. In a `palbase/backend` app the module is `Palbase.purchases`; from any server, `createServer({ url, secretKey }).purchases`. Reading a customer writes nothing: a user who has bought nothing reads as a customer with nothing — and with every limit's free tier.

**In the app**, what the customer has is kept current on its own:

| Platform | |
|---|---|
| Web | `pb.purchases.onCustomerInfo((info) => …)`; `info.entitlements["pro"]?.active`. |
| iOS | `pb.purchases.isEntitled("pro")`; in SwiftUI, `pb.purchases.state.isEntitled("pro")` draws the view again when it changes. |
| Android | `pb.purchases.isEntitled("pro")`; `pb.purchases.customerInfoUpdates`, a `Flow`. |

The app's answer decides what the app shows. What a purchase opens on your server — content, an API, a download — is checked on the server: the app's word is the app's.

## Credits

A customer's credits come from the catalog's products — a consumable per purchase, a subscription per period — and from grants your support gives. Each lot keeps its own end: a subscription period's credits end with the period unless the product rolls them over (`rollover: "all"`), credits bought never end, and a grant's may.

| Field of a balance | What it is |
|---|---|
| `currency` | The credit. |
| `balance` | What the live lots hold, less what the customer owes. |
| `available` | What a spend can take now: the balance less what open holds keep. |
| `reserved` | What open holds keep. |
| `debt` | What the customer owes: a refund took back credits already spent. The next credits pay it first. |
| `next_expiry` | When credits next expire; `null` when none do. |

### Spending

Credits are spent by your server, with the secret key, in one of two ways.

**In one step**, for work that is done or cannot fail:

```ts
// src/modules/exports/exports.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class ExportsService {
  /** Takes 5 tokens for the export: the same exportId again is the same spend, never a second. */
  async charge(userId: string, exportId: string): Promise<number> {
    const { data } = await Palbase.purchases.spend({
      path: { customer_id: userId },
      headers: { "Idempotency-Key": `export-${exportId}` },
      body: { credits: "tokens", amount: 5, metadata: { export: exportId } },
    });
    return data.balance_after ?? 0;
  }
}
```

**Held for a job, then committed.** A hold keeps the credits — still the customer's, but no other spend can take them — until it is committed (the job ran: `commitSpend`, all of it or `amount` of it), released (it did not: `releaseSpend`) or runs out (`ttl_seconds`, 10 minutes unless said, 24 hours at most; `extendHold` gives it more). `withReservation(server, customerId, reservation, fn)` from `palbase/server` does the three: it holds, runs `fn`, commits when `fn` returns and releases when it throws. Asked again with an `idempotencyKey` whose hold is already over, it throws `ReservationSettled`, and the job does not run again.

`reverseSpend` hands back what a committed spend took — the job failed afterwards — to the lots it came from.

Credits are taken from the lots that expire first, bought ones last. The **Idempotency-Key** names a spend for good: sent again, a minute or a month later, it answers the same spend (`200`, `Idempotent-Replayed`), never a second. Every movement — given, spent, expired, taken back by a refund, forgiven — is listed by `listCreditEntries`, newest first: support's answer to "where did my credits go".

| Refusal | Why |
|---|---|
| `409 credits_insufficient` | Not that many available. |
| `409 hold_expired` | The hold ran out before it was committed: what it kept is free again. |

### Giving credits

```ts
// src/modules/support/support.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class SupportService {
  async apologize(userId: string, ticket: string): Promise<void> {
    await Palbase.purchases.grantCredits({
      path: { customer_id: userId },
      headers: { "Idempotency-Key": `ticket-${ticket}` },
      body: { credits: "tokens", amount: 50, source: "support", reason: `Ticket ${ticket}: export failed twice`, expires_at: "2027-01-01T00:00:00Z" },
    });
  }
}
```

A grant pays what the customer owes first. `source` is `promotion` or `support`, and `reason` is the record. `forgiveCredits` takes a debt off — all of it, or `amount` of it — when support lets a refunded spend go. Studio's **Purchases › Customers** gives credits too.

A balance that falls under its credit's `low_at` emits `purchases.credits.low`, once until it is back above; one that comes to nothing, `purchases.credits.depleted`.

## Limits

A limit is a quota counted in a window — `calendar_month`, `calendar_day` (from midnight in the project's time zone) or `billing_period` — with a free tier for everyone, and what each product gives on top: a customer gets the largest of their products'.

| Field of a limit's use | What it is |
|---|---|
| `limit` | The limit. |
| `max` | What this window allows them: the largest of their products, or the free tier — their own limit instead when one is set — plus what was granted them in the window. |
| `used`, `remaining`, `reserved` | What they used, what is left, what open holds keep. |
| `resets_at` | When the window ends. |

A limit is spent as credits are — `spend`, `holdSpend`, `withReservation` — naming `limit` instead of `credits`:

```ts
// src/modules/ai/quota.ts
import { Palbase } from "palbase/backend";

export async function countRequest(userId: string, requestId: string): Promise<void> {
  await Palbase.purchases.spend({
    path: { customer_id: userId },
    headers: { "Idempotency-Key": requestId },
    body: { limit: "ai_requests", amount: 1 },
  });
}
```

Past the window's `max`, a limit with `overflow` takes credits instead (`per_unit` of them a unit), and one without is refused: `409 limit_reached`. A hold counts in the window it was made in, even when it is committed after the window ends.

The refusal says what would give the customer more, for the app to offer: `upgrades` lists the entitlements whose products give more of the limit than the customer has now, the smallest step up first — empty when no product gives more.

```json
{
  "error": "limit_reached",
  "error_description": "the customer used this window's limit",
  "status": 409,
  "request_id": "req_…",
  "limit": "ai_requests",
  "upgrades": [{ "entitlement": "pro", "name": "Pro", "product": "pro", "max": 500 }]
}
```

`setCustomerLimit` gives one customer their own `max` — more for a customer support looks after, less for one who abuses it — until `expires_at` or `clearCustomerLimit`; `grantLimit` gives more units in the window it is in now. Each says why (`reason`).

A window used to 80% emits `purchases.quota.threshold`, and used to the end `purchases.quota.exhausted`, each once a window.

## Events

Each change of what a customer has emits an event to the project's webhooks and to a `palbase/backend` app's `@On` handlers ([Event Hooks](https://palbase.studio/docs/backend/hooks), [Webhooks](https://palbase.studio/docs/server/webhooks)):

```ts
// src/modules/premium/purchase-events.ts
import { Log, On, type PlatformEvent } from "palbase/backend";

export class PurchaseEvents {
  @On("purchases.subscription.changed")
  changed(event: PlatformEvent<"purchases.subscription.changed">): void {
    const { customer_id, product, change, store, expires_at } = event.data;
    if (change === "billing_issue") Log.warn("renewal not charged", { customer_id, product, store, expires_at });
  }
}
```

| Type | Sent when | `data` |
|---|---|---|
| `purchases.customer.changed` | Anything a customer has changed, and their revision rose. | `{ customer_id, revision }` |
| `purchases.entitlement.changed` | An entitlement turned on or off. | `{ customer_id, entitlement, active, expires_at, store, product, is_sandbox }` |
| `purchases.purchase.completed` | A purchase new to the ledger: a subscription's start or a one-time product, in any store. | `{ customer_id, chain_id, product, plan, store, is_sandbox }` |
| `purchases.subscription.changed` | A subscription `started`, `renewed`, was `canceled` or `uncanceled`, had a `billing_issue` or `recovered`, `expired`, or moved to another product (`product_changed`). | `{ customer_id, chain_id, change, product, plan, store, state, expires_at, will_renew, is_sandbox }` |
| `purchases.refund.changed` | A store took a payment back — a `refund`, a `chargeback`, Family Sharing ended (`family`) — or reversed that; its credits are taken back, or given back. | `{ customer_id, chain_id, transaction_id, kind, share_milli, reversed }` |
| `purchases.ownership.transferred` | A purchase moved to another customer: a restore, or another customer's new purchase on a store account they share (`via`). | `{ chain_id, from_customer_id, to_customer_id, product, store, via }` |
| `purchases.credits.low`, `purchases.credits.depleted` | A balance fell under its low mark, or to nothing. | `{ customer_id, currency, balance, available, debt, low_at }` |
| `purchases.quota.threshold`, `purchases.quota.exhausted` | A window was used to 80%, or to the end. | `{ customer_id, limit, used, max, percent, resets_at, window_id }` |
| `purchases.offer.redeemed` | A customer took an offer. | `{ customer_id, offer, kind, store, product, plan, chain_id, coupon, entitlement }` |
| `purchases.coupon.redeemed` | A customer redeemed a coupon. | `{ customer_id, coupon, offer, store, one_time }` |
| `purchases.customer.merged` | A guest's purchases went to the account it signed in to. | `{ from, into }` |
| `purchases.customer.erased` | A deleted user's purchases record was erased. | `{ customer_id }` |
| `purchases.catalog.changed` | A revision of the catalog was saved. | `{ revision }` |
| `purchases.catalog.applied` | A store's part of a plan was written, or failed. | `{ plan_id, revision, store, status }` |
| `purchases.paywall.published` | A paywall's draft was published. | `{ paywall_id, name, version, schema }` |
| `purchases.store.changed` | A store's connection was made, verified, checked or removed — never its key. | `{ store, change, … }` |

The customer's own apps hear of their changes on their realtime channel and read what they have again; the SDKs do it for you.

## Related

- [Customers](https://palbase.studio/docs/purchases/customers): one customer's page, grants, guests and settings
- [Catalog](https://palbase.studio/docs/purchases/catalog): the entitlements, credits and limits a product gives
- [Server SDK](https://palbase.studio/docs/server/overview): `createServer`, refusals as `PalbaseError`, retries
- [Event Hooks](https://palbase.studio/docs/backend/hooks): `@On` in a `palbase/backend` app
