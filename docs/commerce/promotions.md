> The full documentation index: https://palbase.studio/llms.txt

# Promotions

Palbase **Promotions** (`/promotions/*`) is the deterministic discount and coupon engine shared by **Commerce** checkouts and standalone **Payments** integrations. It runs in the same ACID database as `commerce` so cart holds, budget deductions, and order redemptions commit atomically.

## Capabilities

- **Rule Graph**: Compose eligibility rules with `all`, `any`, and `not` boolean groups over subtotal, items, categories, stores, customer segments, channels, and regions.
- **High-Throughput Sharded Codes**: Coupon redemption counters are sharded across 16 buckets to avoid hot-row contention during flash sales while enforcing exact `max_redemptions`, `max_per_customer`, and total monetary budget caps.
- **Exact Hamilton Allocation**: Cart-level discounts are distributed across line items and seller splits using the largest-remainder (Hamilton) method so totals balance to zero minor units with zero rounding drift.
- **Two-Phase Lifecycle**: Standalone backends call `POST /promotions/evaluate`, lock a budget reservation with `POST /promotions/holds`, commit on payment capture (`POST /promotions/holds/{hold_id}/commit`), release on abandonment (`POST /promotions/holds/{hold_id}/release`), or reverse on refund (`POST /promotions/redemptions/{redemption_id}/reverse`).

## Server & Backend Usage

```ts
import { createServer } from "palbase/server";

const pb = createServer({
  url: "https://k3xq81w4m.palbase.studio",
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

const evalRes = await pb.commerce.evaluatePromotions({
  body: {
    currency: "TRY",
    codes: ["WELCOME10"],
    lines: [{ id: "l1", quantity: 1, unit_price: 25000 }],
  },
});
console.log(evalRes.data.discount_total);
```

Inside a `palbase/backend` service, use the scoped `Promotions` service (`Promotions.listRules()`, `Promotions.evaluate()`, `Promotions.hold()`, `Promotions.commitHold()`, `Promotions.releaseHold()`, `Promotions.reverseRedemption()`).

## CLI Commands

```bash
palbase promotions:rules
palbase promotions:rules:create --file rule.json
palbase promotions:codes:create --file code.json
palbase promotions:codes:batch --file batch.json
palbase promotions:evaluate --file cart.json
palbase promotions:redemptions
```
