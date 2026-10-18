> The full documentation index: https://palbase.studio/llms.txt

# Purchases

Every project has a purchases module. It holds **one catalog** of what the app sells — subscriptions, one-time products, packs of credits — sold in the **App Store**, on **Google Play** and on the **web** through the environment's own Stripe account. And it gives **one answer** to "what does this customer have", whatever store they bought in: a Pro bought on the web is Pro in the iOS app.

Apps buy with each store's own machinery — StoreKit on iOS, Play Billing on Android, Stripe Checkout on the web — through Palbase's SDKs. Palbase verifies every purchase with the store, keeps it in the project's **ledger**, and keeps each customer's entitlements, credits and quotas current: in the apps, live, and on your server, by a read or an event.

## Quick example

The app hears what the signed-in customer has, and sends them to buy on the web:

```ts
// app/pro.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

// Told now, and again whenever it changes: a purchase in any store, a renewal, a refund.
pb.purchases.onCustomerInfo((info) => {
  const pro = info?.entitlements["pro"]?.active === true;
  document.body.classList.toggle("pro", pro);
});

export async function buyYearly(): Promise<void> {
  const url = await pb.purchases.checkout({
    product: "pro",
    plan: "yearly",
    successUrl: "https://app.example.com/thanks",
    cancelUrl: "https://app.example.com/pricing",
  });
  location.assign(url); // Stripe Checkout
}
```

The server checks the entitlement where the content is served, with the secret key:

```ts
// server/pro.ts
import { createServer, isEntitled } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

export async function isPro(userId: string): Promise<boolean> {
  // A user who has bought nothing reads as a customer with nothing.
  const { data } = await palbase.purchases.getCustomer({ path: { customer_id: userId } });
  return isEntitled(data, "pro");
}
```

## The parts

| | What it is |
|---|---|
| **Catalog** | The project's one definition of what it sells, saved in revisions: each product once, with its kind, its plans and prices, its name in each language, the channels it is sold on (`ios`, `android`, `web`) and what it gives. See [Catalog](https://palbase.studio/docs/purchases/catalog). |
| **Product** | One thing sold: a `subscription` (renews until canceled), a `non_consumable` (bought once, kept), a `consumable` (bought again and again, for credits) or a `non_renewing` period. |
| **Plan** | How a product is paid for: a subscription's period and price (`monthly`, `yearly`), or the one price of anything else. The stores know a plan as `<product>.<plan>`. |
| **Entitlement** | Something a customer has or not: `pro`. Products give entitlements, and apps and servers check entitlements — never products — so a plan can change without the checks changing. |
| **Credits** | A balance the customer spends: `tokens`. A consumable gives them per purchase, a subscription per period. |
| **Limit** | A quota counted in a window: `ai_requests` a month, with a free tier, and what each product gives on top. |
| **Offerings** | The catalog as a paywall shows it: each channel's text and price, and the id each store sells a plan by. Any of the project's keys reads it. |
| **Customer** | A user of the project, a guest included: the customer's id is the user's id. What they have is **`CustomerInfo`**: each entitlement (on or off, until when, whether it renews, which store gives it), their subscriptions and one-time purchases, credit balances and quota use. |
| **Paywall**, **placement** | What an app draws to sell the catalog, designed in Studio and published without an app update; a placement is the place in the app that shows one. See [Paywalls](https://palbase.studio/docs/purchases/paywalls). |
| **Offer**, **coupon** | A discount, a longer free trial or a grant, for an audience or everyone, once a customer; a coupon is a code that opens one. See [Offers & Coupons](https://palbase.studio/docs/purchases/offers). |

## The stores

| Channel | Store | The app buys with | The environment needs | Page |
|---|---|---|---|---|
| `ios` | The App Store | StoreKit 2, through `PalbasePurchases` | An In-App Purchase key; an App Store Connect API key to write the catalog | [App Store](https://palbase.studio/docs/purchases/app-store) |
| `android` | Google Play | Play Billing, through `palbase-purchases` | A service account your Play Console invites, and the app's notifications topic in Play Console | [Google Play](https://palbase.studio/docs/purchases/google-play) |
| `web` | Stripe | Stripe Checkout, through `pb.purchases.checkout()` | The environment's own Stripe account | [Connect Stripe](https://palbase.studio/docs/purchases/connect-stripe), [Web](https://palbase.studio/docs/purchases/web) |

Each environment connects its own stores: `staging` can sell through Stripe's test mode while `production` takes live payments.

## How a purchase becomes access

1. **The app buys**, naming the customer to the store: StoreKit with the customer's `appAccountToken`, Play Billing with their obfuscated account id, Checkout with the customer's session. The SDKs do this; nothing personal goes to Apple or Google.
2. **The purchase reaches Palbase.** The iOS and Android apps report what the store gave them; Stripe reports its own. Nothing is taken on the device's word: an App Store transaction is checked against Apple's signature and the subscription read from Apple with the environment's key, a Play purchase is read from Play by its token, a Stripe object is read again from Stripe.
3. **The ledger applies it**, and the customer's entitlements, credits and quotas follow. A Google Play purchase is acknowledged once the ledger has it — the SDK never does.
4. **Everyone hears it.** The customer's apps are told at once (each customer has a realtime channel of their own, `purchases:<ref>:<user id>`, read-only), and your backend receives `purchases.*` events.
5. **The stores keep it current.** Apple's App Store Server Notifications, Google Play's real-time developer notifications and Stripe's events bring renewals, cancellations, billing issues and refunds into the ledger, with the app closed.

An entitlement already on from one store is not sold again in another: the iOS and Android SDKs answer `alreadyEntitled` without opening the store, and a web checkout is refused (`409 already_entitled`), naming the store it is managed in. A free trial is given once per customer, across every channel.

## Who calls what

| Caller | Key | What it does |
|---|---|---|
| A customer's app | The publishable key and the user's session (a guest's too) | Reads the offerings and a placement's paywall; reads what the customer has (`GET /purchases/me`); buys, reports, restores; redeems web purchases and coupons; takes offers; opens the Stripe portal; moves a guest's purchases to an account. |
| Your server | A secret key | Everything else: the catalog and its plans, the stores' connections, every customer, grants, credits and limits, paywalls, placements and experiments, offers' figures and coupons, charts, settings. |
| The stores | None: each signs its own | Their notifications, at the environment's own address. |

In a `palbase/backend` app the module is `Palbase.purchases`; from any other server it is `createServer({ url, secretKey }).purchases` — the same client, generated from the purchases contract, one method per operation (`GET /purchases/customers/{customer_id}` is `getCustomer`).

## Test purchases

Purchases nobody pays for are **test purchases**: the App Store's sandbox (where TestFlight and App Review buy), Xcode's StoreKit Testing, Google Play's license testers and Stripe's test mode. Each is marked `is_sandbox` — in what the customer has and in the purchase events — and the environment's settings say whether they open entitlements: for **everyone** (the default), only for customers on an allowlist, or for **nobody**. App Review buys in the sandbox: on the environment a build in review uses, a test purchase that opens nothing gets the app rejected. See [Customers](https://palbase.studio/docs/purchases/customers#settings).

Test the iOS side end to end with [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple).

## Setting up, in order

1. **Write the catalog** — in Studio, **Purchases › Catalog**, or as a file with `palbase purchases:catalog:put`. [Catalog](https://palbase.studio/docs/purchases/catalog)
2. **Connect the stores you sell in** — the [App Store](https://palbase.studio/docs/purchases/app-store), [Google Play](https://palbase.studio/docs/purchases/google-play), [Stripe](https://palbase.studio/docs/purchases/connect-stripe).
3. **Bring the stores to the catalog** — plan it, read what each store will get, and confirm: `palbase purchases:catalog:plan`, then `palbase purchases:catalog:confirm`. Palbase creates the products and prices in each store.
4. **Buy from the apps** — [iOS](https://palbase.studio/docs/ios/purchases), [Android](https://palbase.studio/docs/android/purchases), [the web](https://palbase.studio/docs/purchases/web).
5. **Check access where the content is served** — [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements).
6. When the app needs them: [paywalls](https://palbase.studio/docs/purchases/paywalls) designed in Studio, [offers and coupons](https://palbase.studio/docs/purchases/offers), and [charts](https://palbase.studio/docs/purchases/charts) of what sold.

## In Studio

Each environment's **Purchases** has these screens:

| Screen | What it does |
|---|---|
| **Catalog** | The products, each with its plans, text, channels and what it gives. |
| **Stores** | The Stripe account, Google Play purchases, and the plans that bring the stores to the catalog, each store's part shown before you confirm it. |
| **App Store** | The In-App Purchase key, what selling in the App Store still needs, Xcode's test purchases and the team's sandbox testers. |
| **Paywalls** | The paywalls, their drafts and versions, and the placements that show them, with their targeting rules. |
| **Experiments** | Paywalls tried against each other on a placement, and which sells best. |
| **Offers**, **Coupons** | The catalog's discounts, trials and grants, and the codes that open them. |
| **Charts** | Revenue, subscriptions, conversion and retention, from the ledger. |
| **Customers** | What a customer has, from every store; an entitlement or credits given, saying why. |
| **Settings** | What test purchases open, a deleted user's web subscriptions, the quotas' time zone, and how charts count money. |

## The CLI

The `purchases` commands cover the catalog, the stores' connections, paywalls, placements, experiments, charts and customers; the `stores` commands connect the App Store Connect and Google Play accounts the catalog is written with. Every one is in the [CLI reference](https://palbase.studio/docs/cli/reference#purchases).

## Related

- [Catalog](https://palbase.studio/docs/purchases/catalog) · [App Store](https://palbase.studio/docs/purchases/app-store) · [Google Play](https://palbase.studio/docs/purchases/google-play) · [Connect Stripe](https://palbase.studio/docs/purchases/connect-stripe) · [Web](https://palbase.studio/docs/purchases/web)
- [Paywalls](https://palbase.studio/docs/purchases/paywalls) · [Offers & Coupons](https://palbase.studio/docs/purchases/offers)
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements) · [Customers](https://palbase.studio/docs/purchases/customers) · [Charts](https://palbase.studio/docs/purchases/charts)
- [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple)
