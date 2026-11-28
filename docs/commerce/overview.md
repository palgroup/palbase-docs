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

## How an order is paid

A checkout's `payment_method` is `card` (the default) or `wallet`, paid through one of the project's payment channels, or one of the ways an order is made with nothing paid yet: `cod` (on delivery) and `bank_transfer`. A buyer picks one of those two only where the project sells that way — name them in the commerce settings' `offline_payment_methods` (`PUT /commerce/settings`); until then a buyer's checkout with one is refused (`403 payment_method_not_allowed`). `net_terms` is credit, and your server's to give: a checkout with the secret key takes it, and any of the others.

An order sent before it is paid — on delivery — is marked paid when the money is in (`POST /commerce/orders/{order_id}/mark-paid`): it is paid as any order is — its stock taken, its promotions used, its sellers' shares held, `commerce.order.paid` emitted — and stays where its shipping brought it. A line your server prices (`custom_unit_amount`, with the secret key) keeps the quantity your server gave it.

## How money goes back

A return is of an order that was paid, and an order's returns and cancellations together give back no more than was paid for it. Completing a return (`POST /commerce/returns/{return_id}/complete`, or the store's own route) gives the buyer the money, and the return is `refunded` only once it is given:

- **A store with a payment account** — the order's payment split is refunded: to the card and the wallet as they paid, or to the buyer's wallet when the return's `refund_destination` is `wallet`. The seller gives back their share of it, and the platform's commission and the tax withheld go back in the same proportion: a return of half an order gives back half of each.
- **A store with none** (your own store) — the order's payment is refunded.
- **An order paid outside the platform** (`cod`, `bank_transfer`, `net_terms`) — the money goes back outside it, and whoever completes the return says so: `{"refunded_outside": true}`. Without it the answer is `409 refund_outside_required`. A card order whose payment never went through, marked paid by hand, is given back the same way. Store credit for such an order is your own money: your server completes the return with `refund_destination: "wallet"`; a store's member cannot.

When payments does not make the refund — nothing is left of the payment, say — the answer is `409` with payments' code, and the return stays as it was. A return asked to the buyer's wallet, in a project whose wallet is of money and may not be filled from a marketplace payment (`allow_marketplace_fiat_wallet`), is given back the way the order was paid, and its `refund_destination` says so. A return completed for a part of its line leaves the rest of the line its store's. Completing a return twice gives the money once; a second call while the first is at work answers `409 return_in_progress`.

A store **turns a return down** with `POST /commerce/stores/{store_id}/returns/{return_id}/reject` and a `note` the buyer reads on the return (`rejection_note`); `commerce.return.rejected` is emitted. Who runs the marketplace has the last word: your server approves a return its store turned down (`POST /commerce/returns/{return_id}/approve`), and the buyer may ask for another. Not both for the same units: a return turned down is opened again only while its lines still have what it asks for — when the buyer has asked again for those units since, the approval answers `409 return_replaced`. A return that was refunded is not moved again; one turned down is moved by your server's approval alone; and one whose completion asked for its money is not turned down until payments says for certain that nothing was given (`409 return_state`): complete it. Payments answering `409 refund_in_progress` or `409 refund_pending`, or not answering at all, is not that certainty: a refund its provider did not answer waits for your server to say what the provider did (`POST /payments/intents/{intent_id}/pending-refund`, see [Marketplace Payments](https://palbase.studio/docs/payments/marketplace)), and the return is completed after.

**Canceling** what was not sent yet (`POST /commerce/stores/{store_id}/orders/{store_order_id}/cancel`) gives back what the buyer paid for the canceled units as the cancellation is made — and the shipping, when nothing of the order is left — the same way a return does. `refund_amount` in the answer is what was given back; an order nobody paid for gives back 0. An order given back whole is `refunded`, and a bundle is given back by its parts — in a return as in a cancellation, the line that names the bundle gives nothing more. A cancellation that gives money back emits `commerce.order.refunded` with its `cancellation_id`, and a line canceled whole loses the entitlement it granted. A shipment sends units a line still has to send (`422 invalid_fulfillment_quantity` otherwise).

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
