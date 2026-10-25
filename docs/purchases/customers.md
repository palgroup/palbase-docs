> The full documentation index: https://palbase.studio/llms.txt

# Customers

A **customer** is a user of the project — a guest included — and the customer's id is the user's id. There is nothing to create: a user becomes a customer when something is theirs, a purchase, a grant or credits, or when their app first reads what they have. What they have is the same answer in every app and on your server, whatever store they bought in ([Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements#what-a-customer-has)).

## Finding a customer

A person writing in rarely has their user id. In Studio, **Purchases › Customers**, find them by what they do have:

- their user id;
- an id their store gave a purchase: Apple's original transaction id or any transaction id from their receipt, a Google Play order id (`GPA.…`, a renewal's `..0` or not), a Stripe subscription, payment intent, invoice or customer id;
- the email a buyer with no account gave at checkout on the web, written whole (case and spaces around it do not matter). The address itself is not kept: an HMAC of it under the project's key is, so it is found by the whole address and by nothing less. A purchase whose link no one has redeemed yet is found too, as no one's.

One customer found opens them; several are listed. From a terminal:

```sh
palbase purchases:customers 2000000873521946 -E production
palbase purchases:customers buyer@example.com -E production
```

From your server, `GET /purchases/customers?q=…` answers the same list (`customer_id`, `matched_by`, the store and product of the purchase found).

## Looking a customer up

Their record shows their entitlements and where each is managed, their subscriptions, one-time purchases, credits and quota, test purchases marked. From a terminal:

```sh
palbase purchases:customer:get 3f6c2a1e-8d4b-4c1a-9b7e-2a5d8c0f1b3e -E production
```

From your server, `getCustomer`:

```ts
// server/support.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

export async function describe(userId: string): Promise<string[]> {
  const { data } = await palbase.purchases.getCustomer({ path: { customer_id: userId } });
  return Object.entries(data.entitlements).map(
    ([key, e]) => `${key}: ${e.active ? "on" : "off"} (${e.store}${e.is_sandbox ? ", test" : ""}) until ${e.expires_at ?? "for life"}`,
  );
}
```

A guest merged into an account reads as the account. A user never seen here reads as a customer with nothing, and the read writes nothing.

## What happened to them

Their **History**, the newest first, a page at a time: each payment and renewal, a refund (and its kind: refund, chargeback, family sharing), the subscription's renewal turned off or back on, a failed charge, its end, the grants given and taken back, the credits given, taken back, expired and forgiven, the purchases that moved to or from them, what support did at a store (`extension`, `refund_issued`, `cancel_requested`, with its days, the expiry it left, the refund's kind and support's note), and a refund they asked the App Store for (`refund_requested`, with what Apple was told: `answer`) — each with when, who did it (`store`, `customer`, the developer whose Studio or CLI call it was as `developer:…`, or the key as `key:…`) and why. Credits spent are the credits' own entries (**Credits** on the record, or `GET …/credits/entries`).

```sh
palbase purchases:customer:history <user id> -E production
```

`GET /purchases/customers/{customer_id}/history` answers it to your server; `next_cursor`, sent back as `cursor`, is the next page.

## Giving an entitlement

Support gives one of the catalog's entitlements — for a promotion, a support case, a tester — for a while or for life, saying why:

```sh
palbase purchases:customer:grant <user id> pro --reason "Ticket 4821: billing mix-up" --for 30d -E production
```

The reason is the record (500 characters at most). Without `--for` or `--until` the grant is for life. Nothing is charged in any store, and a customer not seen before is made. Every grant a customer was given — active, ended and revoked, with who gave it, why, and who revoked it — is listed with its id, which ends it:

```sh
palbase purchases:customer:grants <user id> -E production
palbase purchases:customer:revoke <user id> <grant id> -E production
```

What the customer bought is not touched: the entitlement stays on while a purchase still gives it. Studio's **Purchases › Customers** lists, gives and revokes grants too — **Revoke** on a grant of the list; from a server they are `GET /purchases/customers/{customer_id}/grants`, `grantEntitlement` and `revokeGrant`.

In Studio every member of the project reads a customer, their history and their grants; giving or revoking a grant and giving credits is an admin's or the owner's. A grant shows as `store: "promotional"`, `period_type: "promotional"`; turning the entitlement on or off emits `purchases.entitlement.changed`.

Credits and quota are given the same way, saying why — [Entitlements, Credits & Limits › Giving credits](https://palbase.studio/docs/purchases/entitlements#giving-credits).

## A subscription, at its store

Support moves a subscription's renewal later, refunds it or turns its renewal off from the customer's page (the buttons on a row of **Subscriptions**), from a terminal, or from your server with the secret key. The subscription's id is the one the record lists (`subscriptions[].id`). The store is asked to do it, then read again: the answer is the subscription as its store holds it after, and the history keeps what was done, by whom, and the note.

| | App Store | Google Play | Web (Stripe) |
|---|---|---|---|
| **Extend** (1–90 days, for free) | Apple's renewal-date extension: a paid, active subscription, at most twice a year | The next renewal deferred | The next charge moved later |
| **Refund** (the latest payment, in full or what is left of its period) | Apple decides: `409 store_decides_refunds` | Revoked, refunded | Refunded, the subscription cancelled |
| **Turn the renewal off** | The customer's, in their Apple account: `409 customer_cancels` | Cancelled at the period's end | Cancelled at the period's end |

A refund ends the subscription and the customer's access as it answers; turning the renewal off leaves them the period they paid for.

```sh
palbase purchases:customer:get <user id> -E production            # the subscription's id
palbase purchases:customer:extend <user id> <subscription id> --days 7 --reason service_issue --note "Outage of the 21st" -E production
palbase purchases:customer:refund <user id> <subscription id> --mode prorated -E production
palbase purchases:customer:cancel <user id> <subscription id> -E production
```

`--reason` is `customer_satisfaction`, `service_issue` or `other`, as Apple asks it. From your server they are `extendSubscription`, `refundSubscription` and `cancelSubscription` (`POST /purchases/customers/{customer_id}/subscriptions/{subscription_id}/extend|refund|cancel`), each under an `Idempotency-Key`: sent again with it, it is done once. A store that refuses answers `409 store_refused` with what it said; one that cannot be reached, `502 store_unreachable` — sending again with the same key is safe.

## A refund the customer asks the App Store for

In the App Store the customer asks Apple for a refund (in the app with `Transaction.beginRefundRequest`, or at reportaproblem.apple.com). Apple then asks the app, within 12 hours, what they had of the purchase, and weighs the answer. The environment answers it for you — whether it gave what was bought, whether a free trial came first, how much of a pack of credits was spent — and says nothing of its own wish: the decision is Apple's.

It answers only for a customer who allowed it in the app; Apple takes no answer without that. Ask them once, where your app speaks of refunds or privacy, and record what they said:

```ts
// app/settings.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function rememberRefundChoice(allowed: boolean): Promise<void> {
  await pb.purchases.setRefundDataConsent(allowed); // PUT /purchases/me/refund-data-consent
}
```

On iOS it is `pb.purchases.setRefundDataConsent(true)`, on Android `pb.purchases.setRefundDataConsent(true)`; the latest word counts, for every app of the project. Never asked, or `false`: Apple is told nothing. The customer's page shows what they said and when (`refund_data_consent` on the record), and the history every question Apple asked, with its `answer`: `sent`, `pending`, `not_consented`, or `expired` when Apple could not be reached in its 12 hours.

## Credit entries, debts and limits

The customer's page lists every move of their credits — given, spent, taken back by a refund, expired, forgiven — with who did each and why (`GET /purchases/customers/{customer_id}/credits/entries`). A refund of credits already spent leaves a debt, paid first from what they get next; support forgives it, all of it or an amount, saying why. A limit's maximum is set for one customer — above or below the catalog's, for a while or until cleared — and more of it given for its current period:

```sh
palbase purchases:customer:credits <user id> -E production
palbase purchases:customer:credits:give <user id> tokens 50 --reason "Ticket 4821" -E production
palbase purchases:customer:credits:forgive <user id> tokens --reason "Goodwill" -E production
palbase purchases:customer:limit:set <user id> ai_requests 500 --reason "Pilot" --for 30d -E production
palbase purchases:customer:limit:give <user id> ai_requests 20 --reason "A failed job" -E production
palbase purchases:customer:limit:clear <user id> ai_requests -E production
```

In Studio every member reads these; extending, refunding or cancelling a subscription, giving or forgiving credits and setting or giving a limit is an admin's or the owner's.

## Guests

A guest — a user signed in with no account, on one device — buys like anyone else: in the App Store, on Google Play, on the web, with a coupon. What a guest buys is theirs, and goes with them:

- **The guest becomes an account** (it signs up, adds a passkey, links a provider): it keeps its id, and everything it bought with it. Nothing to do.
- **The guest signs in to an account that already exists:** its purchases are handed over in two calls. With the guest's session, before signing in, the app asks for a proof (`POST /purchases/me/merge-grant`, good for 5 minutes); with the account's session, after, it spends it (`POST /purchases/me/merge`).

```ts
// app/sign-in.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function signInKeepingPurchases(email: string, password: string): Promise<void> {
  const info = await pb.purchases.me();
  const grant = info.guest ? await pb.purchases.mergeGrant() : null;
  await pb.auth.signIn(email, password);
  if (grant) await pb.purchases.merge(grant); // the guest's subscriptions, purchases, grants, credits and quota use
}
```

The merge is one step and cannot be undone; asked again with the same proof, it is the same merge. From then on the guest's id points to the account: its session reads `409 customer_merged`. It emits `purchases.customer.merged`. The store ids the guest bought with — its `appAccountToken`, its obfuscated account id — go with it, so the stores' later notifications reach the account.

A guest may restore purchases, but never takes an account's (`403 restore_account_owned`): it signs in to that account instead. A grant offer is an account's unless a coupon opened it, and a coupon may be for signed-in customers alone.

## Restores and moved purchases

A store purchase stays the customer's it was bought by. Two things move it:

- **A new purchase on it by another customer.** When the app's accounts share one store account (a family's iPhone), a subscription follows who paid: in the App Store, a new purchase on it (a switch of plan, a resubscription, an offer bought) made with another customer's account token moves it to that customer, with the offer it was bought with. On Google Play every new purchase is a purchase of its own, so it is its buyer's from the start.
- **Restore purchases**, the customer's own action in the app, moves the store account's purchases to whoever restores, so a purchase made while signed in to another of the app's accounts follows the person. In the App Store this works only from the device StoreKit signed the purchase for, and never moves a purchase from an account to a guest.

One purchase moves at most 3 times in 30 days, the two counted together. Each move emits `purchases.ownership.transferred`. The project's backend reads a customer's moves, newest first, with what they have (`GET /purchases/customers/{customer_id}`, its `transfers`: who had the purchase, who has it since, how and when), and Studio shows them on the customer's page under **Purchases › Customers**. The customer's own apps never read them: `GET /purchases/me` names no other customer. See [App Store](https://palbase.studio/docs/purchases/app-store#what-the-environment-does-with-a-transaction) and [Google Play](https://palbase.studio/docs/purchases/google-play#what-the-environment-does-with-a-purchase).

## When a user is deleted

The user's purchases record is erased — and the guests merged into them — and their id is never a customer again (`purchases.customer.erased`). Their renewing web subscriptions stop renewing, keeping the period they paid, unless the settings say otherwise. A subscription bought in the App Store or on Google Play is the customer's to cancel there: no one else can.

## Settings

The project's choices for its customers' purchases, in Studio under **Purchases › Settings**, or with the secret key:

```ts
// server/settings.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

// Only the team's testers get anything from test purchases here; quotas' days begin in Istanbul.
await palbase.purchases.updateSettings({
  body: { sandbox_access: "allowlist", sandbox_allowlist: ["3f6c2a1e-8d4b-4c1a-9b7e-2a5d8c0f1b3e"], time_zone: "Europe/Istanbul" },
});
```

| Setting | Default | What it says |
|---|---|---|
| `sandbox_access` | `everyone` | Whether test purchases — the App Store's sandbox (where TestFlight and App Review buy), Xcode's, Google Play's license testers', Stripe's test mode — open entitlements and credits: for `everyone`, only the customers on `sandbox_allowlist` (`allowlist`, 1,000 at most), or `nobody`. App Review buys in the sandbox: limit them only while no build of the app is in review against this environment. |
| `cancel_on_delete` | `true` | Whether a deleted user's renewing web subscriptions stop renewing. |
| `time_zone` | `UTC` | Where the quotas' calendar days and months begin: an IANA name such as `Europe/Istanbul`. |
| `reporting_currency`, `store_commission`, `stripe_fee_bps`, `stripe_fee_fixed_micros`, `stripe_fee_fixed_currency`, `app_store_link_fee_bps`, `app_store_link_attribution_days` | `USD`, `standard`, 2.9% + 0.30 USD, 0%, 7 days | How the charts count money: see [Charts › Settings](https://palbase.studio/docs/purchases/charts#settings). |

`getSettings` reads them; a change touches only the fields it gives.

## Related

- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): what a customer has, and spending it
- [Charts](https://palbase.studio/docs/purchases/charts): what customers bought, over time
- CLI: [`purchases:customer:get`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomerget), [`purchases:customer:grant`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomergrant), [`purchases:customer:revoke`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomerrevoke), [`purchases:customer:extend`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomerextend), [`purchases:customer:refund`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomerrefund), [`purchases:customer:cancel`](https://palbase.studio/docs/cli/reference#palbase-purchasescustomercancel)
