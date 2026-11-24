> The full documentation index: https://palbase.studio/llms.txt

# Commerce Overview

Palbase **Commerce** is the unified catalog, inventory, cart, single-transaction checkout, multi-seller marketplace, split order management (OMS), returns (RMA), invoicing, and seller settlement module. It pairs directly with [Marketplace Payments](https://palbase.studio/docs/payments/marketplace) for split card escrow and [Promotions](https://palbase.studio/docs/commerce/promotions) for discount evaluation.

## Commerce vs In-App Purchases

| Module | What it owns | SDK surface |
|---|---|---|
| **Commerce** (`/commerce/*`) | First-party D2C stores, multi-seller marketplaces (shared canonical catalog, per-seller listings, Buy Box ranking), physical & digital fulfillment, FBM/FBA inventory, guest and customer carts, blocking checkout hooks, split seller orders, RMA returns, VUK/TTK invoices, and seller settlements. | `pb.commerce`, `pb.commerce.seller(storeId)`, `createServer().commerce`, `Palbase.commerce`, `Commerce` |
| **Promotions** (`/promotions/*`) | Standalone and cart-integrated discount rules, coupon codes, stackable priority groups, budget caps, per-customer usage limits, and exact penny-level allocation across lines with zero rounding drift. | `createServer().commerce`, `Promotions` |
| **In-App Purchases** (`/iap/*`) | App Store StoreKit 2, Google Play Billing, unified digital subscription catalog, paywalls, placements, store offers, and cross-platform entitlements. | `pb.iap`, `createServer().iap`, `Palbase.iap` |

For hybrid brands that sell a digital course or membership on the web storefront and unlock mobile app access, set `grants_entitlement_key` on a digital variant — when checkout succeeds, `commerce` grants the matching entitlement in [In-App Purchases](https://palbase.studio/docs/iap/entitlements) automatically.

## Storefront & Seller Portal (`palbase/web`)

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

// Browse products, create a cart, apply a promo code, and check out.
const catalog = await pb.commerce.listProducts({ q: "sneaker" });
const cart = await pb.commerce.createCart({ currency: "TRY" });
if (cart.id) {
  await pb.commerce.addItem(cart.id, { listing_id: "lst_123", quantity: 1 });
  await pb.commerce.applyPromoCode(cart.id, "WELCOME10");
  const checkout = await pb.commerce.checkout(cart.id, {});
  console.log(catalog.products.length, checkout.order_id, checkout.checkout?.id);
}
```

Signed-in sellers open a session-pinned portal handle with `pb.commerce.seller(storeId)`. If the user signs out or switches accounts mid-flight, requests fail fast with `SessionChangedError`.

## Blocking Extension Hooks (`palbase/server`)

Core Commerce stays vertical-agnostic: connect your own shipping, tax, checkout validation, or Buy Box ranking logic via Standard Webhooks signed blocking hooks (`shipping.calculate`, `tax.calculate`, `checkout.validate`, `buybox.rank`):

```ts
import { createCommerceHookHandler } from "palbase/server";

export const POST = createCommerceHookHandler<{ country: string }, { shipping_amount: number }>({
  secret: process.env.COMMERCE_HOOK_SECRET!,
  handle: ({ payload }) => ({
    shipping_amount: payload.country === "TR" ? 4900 : 19900,
  }),
});
```

## CLI Commands

Manage stores, catalog products, orders, returns, settlements, and blocking hooks directly from the CLI:

```bash
palbase commerce:settings:get
palbase commerce:stores
palbase commerce:products --q sneaker
palbase commerce:products:quick --file product.json
palbase commerce:orders --status paid
palbase commerce:store-orders
palbase commerce:returns
palbase commerce:settlements
palbase commerce:hooks
```

Example `product.json` for `commerce:products:quick`:

```json
{
  "title": "Runner Sneaker",
  "handle": "runner-sneaker",
  "kind": "physical",
  "price": 149900,
  "currency": "TRY",
  "stock": 50
}
```

See [Promotions](https://palbase.studio/docs/commerce/promotions) and [Marketplace Payments](https://palbase.studio/docs/payments/marketplace) for discount rules and split seller payouts.
