> The full documentation index: https://palbase.studio/llms.txt

# Campaigns Overview

Palbase **Campaigns** unifies multi-channel audience **Broadcasts** (with deterministic holdout groups and A/B variants), cross-platform **On-Site & In-App Messages** (modals, banners, slide-ins, toasts, and fullscreen flows), and **Allowlist-Protected Tracking Links** (`/l/{slug}`) with conversion and revenue attribution.

## Broadcasts

Broadcasts dispatch targeted messages across `email`, `sms`, `whatsapp`, `push`, and `inbox` to any live [Analytics Audience](https://palbase.studio/docs/web/analytics#audiences). Broadcast SMS traffic flows through `notify`'s isolated campaign lane so transactional OTPs and alerts are never delayed by marketing bursts.

- **Holdout lift:** set `holdout_bps` (for example `1000` for a 10% holdout) to measure true incremental conversions against an unmessaged control group.
- **A/B variants:** define weighted `variants` summing to 100 and compare conversions and attributed revenue per variant.
- **Incentives:** attach a `commerce_promo`, `iap_coupon`, or `iap_offer` incentive and control exhaustion behavior via `on_promo_exhausted` (`pause`, `skip`, or `send_without_promo`).

## On-Site & In-App Messages

On-site campaigns use Palbase's shared schema-2 message renderer across Web (`palbase/web/message`), iOS (`PalbaseUI` / `PalbaseNotifyUI`), and Android (`palbase-ui` / `palbase-notify-ui`), adding `slide_in` and `toast` presentations plus one-click `apply_promo` and `copy_code` button actions.

Legacy `/notify/in-app/*` requests automatically route to the `campaigns` module so existing mobile apps continue working with zero breaking changes.

## Tracking Links & Attribution (`palbase/web`)

Tracking links live at `https://<ref>.palbase.studio/l/{slug}`. Every target URL is verified against your project's verified domains and allowed origins (unallowlisted origins are rejected with `422`), bot user-agents are filtered from click counts, and redirects append `pb_click`, `utm_*`, and optional `pb_promo` query parameters.

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

// Capture pb_click, pb_promo, and utm_* parameters on landing pages.
const attribution = pb.campaigns.captureAttribution(window.location.search);

// Fetch eligible on-site / in-app campaigns for the current visitor or signed-in user.
const { messages } = await pb.campaigns.listOnSiteMessages();

// Apply an attributed tracking-link promo code directly to a Commerce cart.
const cart = await pb.commerce.createCart({ currency: "TRY" });
if (cart.id && attribution?.promoCode) {
  await pb.campaigns.applyAttributedPromo(cart.id);
}
console.log(messages.length);
```

## Server & Backend Usage (`palbase/server`)

Use `createServer().campaigns` (or `Palbase.campaigns` inside `palbase/backend`) to manage broadcasts, on-site campaigns, tracking links, and server-side conversion attribution:

- `POST /campaigns/broadcasts` & `POST /campaigns/broadcasts/{id}/start` — create and dispatch a broadcast.
- `GET /campaigns/broadcasts/{id}/stats` — read sent, holdout, conversion, and revenue figures per variant.
- `POST /campaigns/onsite` & `GET /campaigns/onsite/{id}/stats` — create and measure on-site / in-app campaigns.
- `POST /campaigns/links` & `POST /campaigns/links/attribute` — create allowlisted links and attribute checkout revenue to click tokens.

## CLI Commands

Manage broadcasts, on-site campaigns, and tracking links from the CLI:

```bash
palbase campaigns
palbase campaigns:create --file broadcast.json
palbase campaigns:start <id>
palbase campaigns:pause <id>
palbase campaigns:stats <id>
palbase campaigns:onsite
palbase campaigns:onsite:create --file slidein.json
palbase campaigns:links
palbase campaigns:links:create --file link.json
```

Example JSON payloads:

```json
// broadcast.json
{
  "name": "Summer Drop",
  "channel": "push",
  "audience_id": "00000000-0000-0000-0000-000000000001",
  "holdout_bps": 1000,
  "variants": [
    { "key": "a", "weight": 50, "title": { "en": "Summer Drop is live" }, "body": "Save 15% today." },
    { "key": "b", "weight": 50, "title": { "en": "New arrivals" }, "body": "15% off with code SUMMER15." }
  ]
}
```

```json
// slidein.json
{
  "name": "Summer Slide-In",
  "surface": "slide_in",
  "trigger_event": "page_view",
  "definition": { "schema": 2 }
}
```

```json
// link.json
{
  "slug": "summer",
  "name": "Summer Drop",
  "target_url": "https://shop.example.com/summer",
  "promo_code": "SUMMER15",
  "utm_source": "newsletter",
  "utm_campaign": "summer_drop"
}
```

See [Journeys](https://palbase.studio/docs/backend/journeys) for event-driven lifecycle automation and Seller Blueprints, and [Promotions](https://palbase.studio/docs/commerce/promotions) for coupon and discount rules.
