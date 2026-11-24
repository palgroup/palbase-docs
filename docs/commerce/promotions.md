> The full documentation index: https://palbase.studio/llms.txt

# Promotions

Palbase **Promotions** (`/promotions/*`) is the deterministic discount and coupon engine shared by **Commerce** checkouts and standalone **Payments** integrations. It runs in the same ACID database as `commerce` so cart holds, budget deductions, and order redemptions commit atomically.

## Capabilities

- **Rule Graph**: Compose eligibility rules with `all`, `any`, and `not` boolean groups over subtotal, items, categories, stores, customer segments, channels, and regions.
- **High-Throughput Coupon Codes**: Coupon redemption counters scale cleanly under flash-sale contention while enforcing exact `max_total_uses`, `max_uses_per_customer`, per-code `max_uses`, and total monetary budget caps.
- **Exact Penny-Level Allocation**: Cart-level discounts are distributed deterministically across line items and seller splits so totals balance to the exact minor unit with zero rounding drift.
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
    lines: [{ line_id: "l1", store_id: "st_1", quantity: 1, unit_amount: 25000, subtotal: 25000 }],
  },
});
console.log(evalRes.data.total_discount_amount);
```

Inside a `palbase/backend` service, use the scoped `Promotions` service (`Promotions.listRules()`, `Promotions.evaluate()`, `Promotions.hold()`, `Promotions.commitHold()`, `Promotions.releaseHold()`, `Promotions.reverseRedemption()`).

## CLI Commands

```bash
palbase promotions:rules
palbase promotions:rules:create --file rule.json
palbase promotions:codes:create <rule id> --file code.json
palbase promotions:codes:batch <rule id> --file batch.json
palbase promotions:evaluate --file cart.json
palbase promotions:redemptions
```

Example JSON payloads:

```json
// rule.json
{
  "key": "welcome-10",
  "name": "Welcome 10% Off",
  "trigger_kind": "code",
  "effect_kind": "percent_off",
  "effect": { "bps": 1000 },
  "max_uses_per_customer": 1
}
```

```json
// code.json
{
  "code": "WELCOME10",
  "kind": "shared",
  "max_uses": 500
}
```

```json
// batch.json
{
  "count": 100,
  "prefix": "VIP-",
  "max_uses": 1
}
```

```json
// cart.json
{
  "currency": "TRY",
  "codes": ["WELCOME10"],
  "lines": [
    { "line_id": "l1", "store_id": "st_1", "quantity": 1, "unit_amount": 25000, "subtotal": 25000 }
  ]
}
```
