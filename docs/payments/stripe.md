> The full documentation index: https://palbase.studio/llms.txt

# Stripe

Connect your environment's own Stripe account to accept international cards, 3D Secure payments, Apple Pay / Google Pay through Checkout, saved cards, recurring subscriptions, refunds, disputes, and the Stripe Customer Portal — as well as web checkouts for [In-App Purchases](https://palbase.studio/docs/iap/web).

## Connecting Stripe

### Option 1: One-click Palbase Stripe App (recommended)

Install Palbase's Stripe App with OAuth — no API key is created or pasted manually.

- **In Studio**: Open **Payments › Channels**, click **Connect Stripe App**, choose test mode or live mode, and open the one-time install link.
- **In the CLI**:

```sh
# Test mode (default)
palbase payments:stripe:install

# Live mode (real payments)
palbase payments:stripe:install --live --channel stripe_global
```

Under the hood, Palbase calls `POST /payments/stripe/app/grants`, mints a single-use 30-minute link, and registers managed webhooks automatically once Stripe completes OAuth.

### Option 2: Restricted API key

If you prefer a restricted key (`rk_test_...` or `rk_live_...`), grant it access to Customers, Checkout Sessions, PaymentIntents, Charges, Subscriptions, Invoices, SetupIntents, and Webhook Endpoints, then hand it directly to the Payments module:

```sh
palbase payments:stripe:grant --channel stripe_global
```

`POST /payments/channels/grants` returns a single-use browser form (`GET /payments/connect`) hosted directly by your environment's Payments module so your key never passes through Studio. The link names its channel. One made with an [environment token](https://palbase.studio/docs/getting-started/access-tokens) sets up a project's first channel only: where a channel was connected before — still connected or not — it answers `409 channel_exists`, and a person signed in to Studio adds the next one or changes a channel's keys.

## Webhooks & authoritative verification

Palbase registers a dedicated webhook endpoint at `POST /payments/webhooks/stripe` (or `POST /payments/webhooks/stripe-app` for Stripe App installations) and verifies every delivery's `Stripe-Signature` header.

Before mutating any PaymentIntent, refund, subscription, or dispute, Palbase records the webhook in an idempotent inbox and verifies authoritative state directly against Stripe's API — preventing spoofing and out-of-order race conditions.

## Capabilities on Stripe channels

- **Checkout & 3DS**: Automatic hosted Checkout redirect or off-session saved-card confirmation with 3DS fallback.
- **Saved cards**: Customer card vaulting (`save_method: true` or `POST /payments/me/methods`) without handling PANs on your servers.
- **Manual capture**: Set `capture_method: "manual"` on `POST /payments/intents`, then call `POST /payments/intents/{intent_id}/capture` or `POST /payments/intents/{intent_id}/cancel`.
- **Self-service Billing Portal**: Call `pb.payments.portal(returnUrl)` (`POST /payments/me/portal`) to send signed-in subscribers to Stripe's Customer Portal.
- **Refunds & Disputes**: Full/partial card refunds (`destination: "original"`) or instant closed-loop wallet refunds (`destination: "wallet"`), plus automatic dispute ingestion.

## Live sandbox verification

Run an end-to-end test-mode check against your Stripe test channel using the built-in CLI probe:

```sh
palbase payments:sandbox:verify
```

## Related

- [Channels & Routing](https://palbase.studio/docs/payments/channels)
- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout)
- [Refunds & Disputes](https://palbase.studio/docs/payments/refunds-disputes)
