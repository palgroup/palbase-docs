> The full documentation index: https://palbase.studio/llms.txt

# Catalog

The catalog is the project's one definition of what it sells. Each product is written **once** — its kind, its plans and prices, its name in each language, the channels it is sold on and what it gives — and each channel adds only what is its own there: the App Store's shorter name, a web price without the stores' commission.

It is one JSON document, saved in **revisions**. Edit it in Studio (**Purchases › Catalog**) or keep it as a file in your repository and save it with the CLI. Saving a revision writes nothing to a store: a **plan** brings the App Store, Google Play and Stripe to it, store by store, after you have read what each will get and confirmed it.

Each environment has its own catalog.

## Quick example

A subscription sold on all three channels, and a pack of credits sold in the App Store and on the web:

```json
{
  "base_locale": "en",
  "entitlements": [{ "key": "pro", "name": "Pro" }],
  "credits": [{ "key": "tokens", "name": "Tokens", "low_at": 10 }],
  "limits": [{ "key": "ai_requests", "name": "AI requests", "window": "calendar_month", "free": 10 }],
  "products": [
    {
      "key": "pro",
      "type": "subscription",
      "group": "membership",
      "tier": 1,
      "locales": {
        "en": { "name": "Pro", "description": "Everything, every month" },
        "tr": { "name": "Pro", "description": "Her şey, her ay" }
      },
      "plans": [
        { "key": "monthly", "period": "P1M", "price": { "currency": "USD", "amount": 999 }, "intro": { "mode": "free_trial", "duration": "P1W" } },
        { "key": "yearly", "period": "P1Y", "price": { "currency": "USD", "amount": 7999 } }
      ],
      "channels": {
        "ios": { "family_shareable": true },
        "android": { "locales": { "en": { "benefits": ["No ads", "Every feature"] } } },
        "web": { "prices": { "monthly": { "currency": "USD", "amount": 799 } } }
      },
      "entitlements": ["pro"],
      "credits": { "currency": "tokens", "amount": 100, "rollover": "none" },
      "quota": [{ "limit": "ai_requests", "max": 500 }]
    },
    {
      "key": "tokens_100",
      "type": "consumable",
      "locales": { "en": { "name": "100 tokens", "description": "A pack of tokens" } },
      "plans": [{ "key": "once", "price": { "currency": "USD", "amount": 499 } }],
      "channels": { "ios": {}, "web": {} },
      "credits": { "currency": "tokens", "amount": 100 }
    }
  ]
}
```

`pro` gives the `pro` entitlement, 100 tokens each period and 500 AI requests a month; on the web its monthly plan costs 7.99 instead of 9.99. `tokens_100` gives 100 tokens each time it is bought.

## The catalog as a file

```sh
palbase purchases:catalog:get --out catalog.json -E staging
```

It writes the newest revision and prints its number. Edit the file, then check it and save it on the revision it was edited from:

```sh
palbase purchases:catalog:validate --file catalog.json -E staging
palbase purchases:catalog:put --file catalog.json --revision 3 -E staging
```

`validate` lists every problem with its path in the file (`products[0].channels.ios.locales.en.name`) and the store whose rule it breaks; it saves nothing. `put` checks the same way and saves nothing when a problem is left (`422 invalid_catalog`, every problem listed); a **warning** — something a store goes without — does not stop it. Of two people editing at once, the second is told the catalog moved past the revision they edited (`412 catalog_changed`) and nothing is saved over the first: read it again, make the edit on it, save that. The first save is on revision `0`.

Each environment's catalog is its own. To give `production` what `staging` has, get it from one and put it on the other's revision:

```sh
palbase purchases:catalog:get --out catalog.json -E staging
palbase purchases:catalog:get -E production   # prints production's revision
palbase purchases:catalog:put --file catalog.json --revision 7 -E production
```

A saved revision emits `purchases.catalog.changed`. See [`purchases:catalog:get`](https://palbase.studio/docs/cli/reference#palbase-purchasescatalogget), [`purchases:catalog:put`](https://palbase.studio/docs/cli/reference#palbase-purchasescatalogput) and [`purchases:catalog:validate`](https://palbase.studio/docs/cli/reference#palbase-purchasescatalogvalidate).

## Bringing the stores to the catalog

A plan is what writing the newest revision to each store takes, worked out before anything is written:

```sh
palbase purchases:catalog:plan -E staging
```

It prints each store's part, step by step, and the plan's **hash**. Read it, then write it by naming that hash:

```sh
palbase purchases:catalog:confirm <plan id> --hash <hash> -E staging
```

The CLI shows what will be written and asks first, in every environment (`-y` confirms without asking); `palbase purchases:catalog:decline <plan id>` drops a plan unwritten. In Studio, **Purchases › Stores › Apply the catalog** plans it, shows each store's part, and writes it when you confirm.

| Store | What its part writes | What to know |
|---|---|---|
| Stripe | A product for each web product, a price for each plan, on the environment's [Stripe account](https://palbase.studio/docs/purchases/connect-stripe) — written as you confirm. | A Stripe price never changes: a new amount is a new price, which takes over the plan's lookup key, while customers on the old one keep paying it. |
| The App Store | A subscription group for each group, a subscription or an in-app purchase for each plan, with its text, price and introductory offer — written to App Store Connect with the environment's [App Store Connect API key](https://palbase.studio/docs/purchases/app-store#connect-the-app-store). | The price is the App Store's price point nearest to it in the currency's storefront; Apple prices the other storefronts. A product id, once made, is never free again. |
| Google Play | A subscription for each subscription product, with a base plan for each plan, and a one-time product for each other product — written for the app [Google Play purchases](https://palbase.studio/docs/purchases/google-play) are connected for. | Google converts the price to every region. A product id, once made, stays Google's. |

The plan's hash is its Stripe part's; with no Stripe account connected, its App Store part's; with neither, its Google Play part's. A plan is written only as it was shown: once the catalog is saved again, an older plan goes **stale** and is refused, and you plan again.

A plan writes only what changed since a store last took the catalog: a product it already has gets an update step with its new text, price or review details, and a product that did not change has no step. The App Store gives a subscription its new price from the day after tomorrow (UTC) on, in every storefront — App Store Connect schedules a price change a day or two ahead — and its subscribers keep the price they pay; an in-app purchase gets its new price at once; Google Play gives a base plan its new price for new subscribers. A language a store has that the catalog does not is left there. When a store did not answer a confirmed plan written — it stopped part way, or has not answered yet — what it holds of that plan's products is not known: the next plan writes each of them again, all of it, whatever changed.

The Stripe part is written as you confirm: the plan is **applied**, with what the account holds now, or **failed**, with what Stripe said — a new plan picks up where it stopped. The App Store and Google Play parts are written after the answer: the plan in Studio, and `palbase purchases:catalog:plan <plan id>`, show what App Store Connect and Google Play hold once they have answered — each product's state, its price, and a subscription's new price with the day it starts — and `palbase purchases:doctor` says when App Store Connect took its part. From the confirmation on, a purchase of what the plan sells maps to the catalog's product and plan. Each store's answer emits `purchases.catalog.applied`.

| Status | Means |
|---|---|
| `planned` | Shown, waiting to be confirmed or declined. |
| `applying` | Confirmed; a store's part is being written. |
| `applied` | Written. |
| `failed` | A store refused a step; plan again. |
| `stale` | The catalog was saved since: plan again. |
| `declined` | Never written. |

### What the stores know a plan by

| Store | Id |
|---|---|
| The App Store | `<product>.<plan>` (`pro.monthly`), each plan a product of its own; the group's reference name is the group's key. |
| Google Play | The product's key (`pro`) and, for a subscription, the plan's key as its base plan, `_` written `-` (`pro` / `monthly`). |
| Stripe | The price's lookup key `palbase:<ref>:<product>.<plan>`. The ref keeps two environments that share a Stripe account apart. |

`<product>.<plan>` is 40 characters at most.

### Products a store already sells

A product you made in App Store Connect or the Play Console, by hand or with another tool, joins the catalog by its id: give its plan the store's id under `store_ids`, and the plan **links** it — nothing is made or changed at the store.

```json
"channels": {
  "ios": { "store_ids": { "monthly": { "product": "com.acme.app.pro.monthly" } } },
  "android": { "store_ids": { "monthly": { "product": "pro_sub", "base_plan": "monthly-1" } } }
}
```

In Studio, a product's **iOS** and **Android** tabs hold these ids under **Sold at App Store Connect already** and **Sold at the Play Console already**. On Google Play a subscription's plans are base plans of one product: map every plan of it, to the same product. Once the plan is confirmed, the purchases made before the catalog knew the product open what the catalog gives, and their buyers hear `purchases.entitlement.changed`. A store id stays once a plan linked it: a catalog that leaves it out is refused (`store_id_kept`), because the next plan would make a second product at the store.

### What a customer bought stays

A product, a plan, an entitlement or a credit that someone holds cannot leave the catalog, and changing a key is leaving it: the save is refused (`product_has_buyers`, `plan_has_buyers`, `entitlement_has_holders`, `credit_has_holders`, `limit_has_holders`). A product a confirmed plan wrote to a store stays too (`product_at_store`): the store keeps selling it, to an older build of your app or from its own resubscribe button. To stop selling one, retire it: `"retired": true` on the product or on a plan — in Studio, the product's **On sale** switch, or a plan's **Off sale** box. A retired product is not offered, not sold on the web, not given an offer, and no plan writes it to a store, while everyone who bought it keeps what it gives. Renaming it keeps their access; it is the key that counts.

What a store never changes of a product it sells stays as it was made: its type, its subscription group and a plan's period (`store_terms_fixed`). Retire it and make a new one instead.

## The document

Unknown fields are refused: the catalog is read strictly.

| Field | What it is |
|---|---|
| `base_locale` | The language every product names itself in (`en`, `pt-BR`); the others are translations. Stripe keeps one name: this one's. |
| `entitlements` | What a customer has or not: each a `key` and a `name`. |
| `credits` | The kinds of credit the project counts: each a `key`, a `name`, and `low_at`, the balance under which your backend hears `purchases.credits.low`. |
| `limits` | The metered quotas: each a `key`, a `name`, a `window` and `free`, what a customer gets with nothing that gives more. `overflow` (`{ "currency": "tokens", "per_unit": 2 }`) spends credits past the limit instead of refusing. |
| `products` | The products (below). |
| `offers` | Discounts, trials and grants for a while: see [Offers & Coupons](https://palbase.studio/docs/purchases/offers). |

A key is lowercase letters, digits and `_`, starting with a letter, 40 at most.

A limit's `window` is `calendar_month` or `calendar_day` — from midnight in the project's time zone ([settings](https://palbase.studio/docs/purchases/customers#settings)) — or `billing_period`: the period of the subscription that gives it, a calendar month without one.

### A product

| Field | What it is |
|---|---|
| `key` | Its key. |
| `type` | `subscription` (renews until canceled), `non_consumable` (bought once, kept), `consumable` (bought again and again: it gives credits) or `non_renewing` (a period bought once). |
| `locales` | Its `name` and `description` by language: the base locale's at least. |
| `plans` | How it is paid for (below): a subscription's plans, one plan for anything else. |
| `channels` | Where it is sold — `ios`, `android`, `web` — each with what is its own there; `{}` when it is sold there as it is. At least one. |
| `entitlements` | The entitlements it gives. A consumable gives none. |
| `credits` | The credits it gives: per purchase for a consumable, per period for a subscription — `{ "currency", "amount" }`, and for a subscription `rollover`: `none` (a period's credits end with it) or `all` (they stay). Credits bought never end. |
| `quota` | How much of each limit it gives in each window: `[{ "limit", "max" }]`. A customer holding several products gets the largest. |
| `group`, `tier` | A subscription's group — the subscriptions a customer moves between — and its level in it, 1 or more, higher is more. The App Store sells every subscription in a group. |
| `retired` | Off sale: [what a customer bought stays](#what-a-customer-bought-stays). A plan can be retired on its own. |

### A plan

| Field | What it is |
|---|---|
| `key` | Its key. |
| `price` | `{ "currency": "USD", "amount": 999 }`: the amount in the currency's minor units (999 is 9.99). Each store prices the other currencies its own way; `overrides` (`{ "EUR": 999 }`) sets amounts by hand. |
| `period` | A subscription's billing period, ISO 8601: `P1W`, `P1M`, `P2M`, `P3M`, `P6M`, `P1Y` in every store; Google Play also sells `P4W`, `P4M`, `P8M`; Stripe bills at most once a year. |
| `duration` | A non-renewing product's: how long it lasts (`P1M`). |
| `intro` | A subscription plan's introductory offer, once per customer across every channel: `mode` `free_trial`, `pay_as_you_go` (a `price` for a number of `periods`) or `pay_up_front` (one `price` for the whole `duration`; the web sells the plan without it). The App Store's free trials last `P3D`, `P1W`, `P2W`, `P1M`, `P2M`, `P3M`, `P6M` or `P1Y`. |

### A channel

| Field | Channel | What it is |
|---|---|---|
| `locales` | any | Its own text, field by field, where a store's limits call for it: `name`, `description`, and Google Play's `benefits`. |
| `prices` | any | Its own price for a plan, by the plan's key: a web price without the stores' commission. |
| `family_shareable` | `ios` | Family Sharing for the purchase. |
| `review` | `ios` | What App Review sees: a `note` and the `screenshot` of the product in the app. |
| `store_ids` | `ios`, `android` | The store's own ids of the plans, by plan key: [products a store already sells](#products-a-store-already-sells). |
| `tax_code` | `web` | Stripe's tax code for the product. |

### Review screenshots

The App Store reviews every product with a screenshot and a note: without them the catalog warns (`review_missing`). Upload the screenshot, a PNG or JPEG at one of the App Store's screenshot sizes (1290x2796 for a 6.9-inch iPhone, 2064x2752 for a 13-inch iPad, or turned) — Apple fails any other size — and name it by the SHA-256 the command prints:

```sh
palbase stores:review-screenshot <app id> pro-paywall.png -E main
```

```json
"ios": { "review": { "screenshot": "sha256:9f86d081…", "note": "Settings → Pro" } }
```

In Studio, the product's **iOS** tab uploads it (**Review screenshot › Upload**) and names it for you. The next plan gives both to App Store Connect, and the product is then `READY_TO_SUBMIT`: it goes to App Review [with a version](https://palbase.studio/docs/distribution/app-store#send-it-to-app-review). A changed screenshot replaces Apple's.

## The stores' rules

`validate` checks each channel against its store, and a rule one store has is a problem on that channel alone — never a silent cut:

| Store | Its rules |
|---|---|
| The App Store | A name of 2 to 30 characters, a description of 45 at most; no emoji or symbols in a subscription's name; the six periods above; every subscription in a group. |
| Google Play | A name of 55 characters at most, a description of 200, 4 benefits of 40 characters each. |
| Stripe | A period of a year at most; a pay-up-front introductory offer is left out on the web (a warning). |

When the shared text is too long for one store, give that channel its own (`"ios": { "locales": { "en": { "name": "Pro Family" } } }`): the other channels keep the full text.

## Related

- [Purchases](https://palbase.studio/docs/purchases/overview): how the catalog, the stores and the customers fit together
- [Offers & Coupons](https://palbase.studio/docs/purchases/offers): the catalog's `offers`, and the codes that open them
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): what the catalog's entitlements, credits and limits do for a customer
- [App Store](https://palbase.studio/docs/purchases/app-store) · [Google Play](https://palbase.studio/docs/purchases/google-play) · [Connect Stripe](https://palbase.studio/docs/purchases/connect-stripe)
