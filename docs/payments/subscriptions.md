> The full documentation index: https://palbase.studio/llms.txt

# Subscriptions

Manage recurring card subscriptions across **Stripe** and **iyzico** channels through one canonical API — with trials, period tracking, support extensions, self-service cancellation, and `payments.subscription.*` webhook events.

> Looking for mobile app-store subscriptions (StoreKit 2 & Google Play Billing) paired with paywalls and entitlements? See [In-App Purchases](https://palbase.studio/docs/iap/overview).

## Creating a recurring subscription

Create a subscription from your server via `POST /payments/subscriptions`. If the channel requires an initial card capture or 3D Secure verification, the returned `SubscriptionView` includes a `next_action` you hand off to the customer:

```ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function startSubscription(customerId: string, planRef: string) {
  const { data: sub } = await palbase.payments.createSubscription({
    headers: { "Idempotency-Key": `sub:${customerId}:${planRef}` },
    body: {
      customer_id: customerId,
      product_name: "Pro Monthly",
      amount: 19900,
      currency: "TRY",
      interval: "month",
      interval_count: 1,
      description: "Pro Monthly",
      return_url: "https://app.example.com/billing",
      cancel_url: "https://app.example.com/pricing",
    },
  });
  return sub;
}
```

## Subscription states

| Status | Meaning |
|---|---|
| `pending` | Created and awaiting initial payment / 3DS completion. |
| `trialing` | Active in a free trial window (`trial_end`). |
| `active` | Paid and renewing automatically until canceled. |
| `past_due` | Renewal charge failed; provider retry schedule is active. |
| `canceled` | Canceled and no longer renewing. |
| `expired` | Ended without renewal. |

Every state transition emits `payments.subscription.changed` (or `payments.subscription.canceled` on cancellation).

## Operator & support actions

From Studio (**Payments › Subscriptions**) or your backend (`palbase/server`):

- **List subscriptions**: `GET /payments/subscriptions` (filterable by `customer_id`, cursor-paginated).
- **Extend billing period**: `POST /payments/subscriptions/{subscription_id}/extend` shifts the renewal date forward by 1–90 days for free.
- **Cancel subscription**: `POST /payments/subscriptions/{subscription_id}/cancel` with `{ at_period_end: true }` (default, keeps access through `current_period_end`) or `{ at_period_end: false }` (immediate cancellation).

## Customer self-service

Signed-in users manage their own subscriptions from `palbase/web`:

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

async function manageMyBilling() {
  const { subscriptions } = await pb.payments.subscriptions.list();
  const active = subscriptions.find((s) => s.status === "active");
  if (active) {
    await pb.payments.subscriptions.cancel(active.id);
  }

  // On Stripe channels, you can also open the hosted Customer Portal:
  const portalUrl = await pb.payments.portal("https://app.example.com/billing");
  return portalUrl;
}

void manageMyBilling;
```

## Related

- [Channels & Routing](https://palbase.studio/docs/payments/channels)
- [Refunds & Disputes](https://palbase.studio/docs/payments/refunds-disputes)
- [Server & Backend SDK](https://palbase.studio/docs/payments/server-sdk)
