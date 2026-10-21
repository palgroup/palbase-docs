> The full documentation index: https://palbase.studio/llms.txt

# Offers & Coupons

An **offer** is a price for a while, given to whom the project chooses — the members of an analytics audience, or everyone — and once to each customer. It gives one of three things:

| Kind | What the customer gets | Where it is sold |
|---|---|---|
| `discount` | A percentage off a subscription's plans, for a number of billing periods | Each store, as its own offer |
| `trial` | A free trial of a subscription's plans | Each store, as its own offer |
| `grant` | An entitlement for a time, with no store and no payment | Nowhere: the customer claims it |

A **coupon** is a code that opens an offer to whoever types it: a code many share, or a batch of one-time codes to give out.

## Offers are part of the catalog

An offer is written in the catalog's `offers`, and goes to the stores with the rest of it when a plan is confirmed ([Catalog](https://palbase.studio/docs/purchases/catalog#bringing-the-stores-to-the-catalog)): a discount or a trial becomes the App Store's **promotional offer**, Google Play's **developer-determined offer** (tagged `palbase`) and a **Stripe coupon**, each by the offer's key. In Studio, **Purchases › Offers** adds and edits them, and shows how many customers were shown each and took it, by store.

```json
{
  "offers": [
    {
      "key": "winback_50",
      "name": "Win-back: half off for 3 months",
      "product": "pro",
      "plans": ["monthly"],
      "discount": { "percent": 50, "periods": 3 },
      "audience": "<an analytics audience's id>",
      "starts_at": "2026-11-01T00:00:00Z",
      "ends_at": "2026-12-01T00:00:00Z"
    },
    { "key": "long_trial", "name": "One month free", "product": "pro", "trial": "P1M" },
    { "key": "pro_week", "name": "A week of Pro", "grant": { "entitlement": "pro", "duration": "P7D" } }
  ]
}
```

| Field | What it is |
|---|---|
| `key` | Its key, and its id at every store (hyphenated at Google Play). |
| `name` | Its name, 1 to 64 characters: the App Store's reference name. |
| `product`, `plans` | The subscription a discount or a trial is on, and its plans; no `plans`, every plan. A grant names no product. |
| `discount` | `{ "percent": 1–99, "periods": 1–12 }`. |
| `trial` | A free trial's length, ISO 8601: in the App Store `P3D`, `P1W`, `P2W`, `P1M`, `P2M`, `P3M`, `P6M` or `P1Y`. |
| `grant` | `{ "entitlement", "duration" }`: the catalog's entitlement, for `P7D`, `P1M` … from the moment it is claimed. |
| `audience` | The id of the analytics audience whose members are given it — those who allowed personalization; none, everyone. |
| `starts_at`, `ends_at` | When it is first given, and when it no longer is. |

On a product sold on the web, a discount of more than one period is one Stripe coupon, which lasts whole months: every plan it is on must bill by whole months, and by the same number of them — make one offer per plan length.

## Taking an offer in the app

The apps list the offers the signed-in customer may take now — live, not taken before, for everyone or for an audience they are in, or opened to them by a coupon they redeemed — each with what every store sells it as:

```ts
// app/offers.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function takeBestOffer(): Promise<string | null> {
  const offers = await pb.purchases.offers();
  const offer = offers[0];
  if (!offer) return null;
  await pb.purchases.offerShown(offer.key); // counted the first time

  if (offer.kind === "grant") {
    const grant = await pb.purchases.claimOffer(offer.key);
    return `${grant.entitlement} until ${grant.expires_at}`;
  }
  // A discount or a trial is bought with the offer, on one of its web plans.
  const plan = offer.web?.plans[0];
  if (!offer.product || !plan) return null;
  return pb.purchases.checkout({
    product: offer.product,
    plan,
    offer: offer.key,
    successUrl: "https://app.example.com/thanks",
    cancelUrl: "https://app.example.com/pricing",
  });
}
```

| | Web | iOS |
|---|---|---|
| The offers | `pb.purchases.offers()` | `pb.purchases.offers()` |
| Counted as shown | `offerShown(key)` | `offerShown(_:)` |
| Buy with a discount or a trial | `checkout({ …, offer })` | `purchase(_:offer:)` |
| Claim a grant | `claimOffer(key)` | `claim(_:)` |
| Take one by its key, whatever it is | — | `take(offer:)` |

A paywall's package sold with an offer the customer may take shows the offer's price as `{{offer_price}}`, and its purchase button buys with it.

**In the App Store**, a promotional offer is bought under Apple's signature for this customer, which the environment makes with the In-App Purchase key when the app asks — the app holds no key. The signature names one of the customer's own App Store transactions, so it buys the offer for their Apple account alone: passed to someone else, it buys nothing. Apple gives a promotional offer only to a customer who subscribes, or subscribed, in the group: anyone else's purchase fails as `ineligibleForOffer`, and a customer none of whose subscriptions the environment knows is signed none (`no_app_store_purchase`) — the app reports the customer's StoreKit transactions of the group first. In Xcode, the StoreKit configuration's own Subscription Offers Key signs it ([Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple)). **On Google Play**, the Android SDK buys a plan with its introductory offer when Play says the user may take it. **On the web**, the checkout carries the offer's coupon.

A grant is claimed with an account: a guest is refused (`403 account_required`) unless a coupon opened the offer to it. An offer taken once is not taken again (`409 offer_taken`); one that is not the customer's to take now is `403 offer_not_open`. Taking one emits `purchases.offer.redeemed`.

## Coupons

A coupon opens one of the catalog's offers to whoever redeems its code, once a customer. Make one in Studio (**Purchases › Coupons › New coupon**) or from your server:

```ts
// server/coupons.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

// One code anyone may type, 500 times at most.
await palbase.purchases.createCoupon({
  body: { key: "launch", name: "Launch week", kind: "palbase", offer: "long_trial", code: "LAUNCH26", max_redemptions: 500 },
});

// 1,000 codes of one use each, to give out.
await palbase.purchases.createCoupon({
  body: { key: "partners", name: "Partner codes", kind: "palbase", offer: "pro_week", one_time_codes: 1000, signed_in_only: true },
});
```

| Field | What it is |
|---|---|
| `kind` | `palbase`: Palbase takes the code. `apple`: an App Store offer code, made in App Store Connect on one `plan` of the offer's product and redeemed in the App Store's own sheet. |
| `code`, `max_redemptions` | A code many share, 3 to 32 letters and digits, and how many times it is taken. On the web, a shared code of a discount is the Stripe promotion code of the offer's coupon too. |
| `one_time_codes` | Instead of `code`: how many codes of one use each to make, 1 to 25,000. |
| `signed_in_only` | A guest cannot redeem it. |
| `expires_at` | When it ends. An App Store batch's codes must end. |

`listCouponCodes` (`GET /purchases/coupons/{coupon_key}/codes`) lists a batch's codes — whom each was given to, who redeemed it — and answers a CSV file to hand out when asked for `text/csv`. `revokeCoupon` ends one: no code of it is redeemed from then on, and what was redeemed stays. An App Store coupon's `apple.state` says how App Store Connect took it: `pending`, `applied` or `failed`.

### Redeeming a code

The customer types the code in the app, in any case:

```ts
// app/redeem-code.ts
import { createClient, PalbaseError } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function redeemCode(code: string): Promise<string> {
  try {
    const { offer, grant } = await pb.purchases.redeemCoupon(code);
    return grant ? `${grant.entitlement} is yours` : `${offer.name} is yours to take`;
  } catch (e) {
    if (e instanceof PalbaseError && e.code === "redeem_at_app_store") return "Redeem this code in the App Store";
    if (e instanceof PalbaseError) return e.message;
    throw e;
  }
}
```

A grant is given at once; a discount or a trial is the customer's to buy from then on — `offers()` lists it, with the coupon. On iOS, `redeem(code:)` does the same and throws `CouponError`; an App Store offer code is redeemed in the App Store's sheet, `presentOfferCodeRedemption()`, and what it gives arrives as any App Store transaction does.

| Refusal | Why |
|---|---|
| `404 coupon_not_found` | No coupon has this code. |
| `409 coupon_redeemed`, `409 code_used` | The customer redeemed it or took its offer already; the one-time code was used. |
| `410 coupon_ended`, `410 coupon_exhausted`, `410 offer_ended` | The coupon ended or was taken as many times as it may be; its offer ended. |
| `403 sign_in_required` | A coupon for signed-in customers, and a guest typed it. |
| `422 redeem_at_app_store` | An App Store offer code: redeemed in the App Store. |
| `429 too_many_attempts` | Too many codes tried by this customer or from this network: try again after `retryAfter`. |

Redeeming emits `purchases.coupon.redeemed`, and `purchases.offer.redeemed` for a grant.

## Related

- [Catalog](https://palbase.studio/docs/purchases/catalog): where offers are written
- [Paywalls](https://palbase.studio/docs/purchases/paywalls): packages sold with an offer
- [Web](https://palbase.studio/docs/purchases/web) · [App Store](https://palbase.studio/docs/purchases/app-store) · [Google Play](https://palbase.studio/docs/purchases/google-play)
- [Web Analytics](https://palbase.studio/docs/web/analytics): the audiences an offer is for
