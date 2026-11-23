> The full documentation index: https://palbase.studio/llms.txt

# Overview

Palbase **Payments** is the provider-agnostic payment processing, closed-loop double-entry wallet, and recurring billing module. Every project gets a single canonical **PaymentIntent** model, **1:N attempt history**, deterministic multi-provider routing across **Stripe** and **iyzico**, plus double-entry closed-loop wallets with QR spend tokens and zero-drift accounting verification.

## Payments vs In-App Purchases

Palbase separates direct payment rails from app-store entitlements into two clean modules:

| Module | What it owns | SDK surface |
|---|---|---|
| **Payments** (`/payments/*`) | Direct card checkout (Stripe and iyzico), deterministic routing, 1:N attempts, closed-loop double-entry wallets, two-phase holds, QR spend tokens, recurring subscriptions, refunds (original card or instant wallet), disputes and audit ledger. | `pb.payments`, `palbase/web/payments-ui`, `PalbasePayments`/`PalbasePaymentsUI`, `palbase-payments`/`palbase-payments-ui`, `createServer().payments`, `Palbase.payments` |
| **In-App Purchases** (`/iap/*`) | App Store StoreKit 2, Google Play Billing, unified product catalog, paywalls, placements, A/B experiments, offers, coupons, customer entitlements, credits and quotas. | `pb.iap`, `palbase/web/paywall`, `PalbaseIAP`/`PalbaseIAPUI`, `palbase-iap`, `createServer().iap`, `Palbase.iap` |

When a customer buys a catalog product on the web through [In-App Purchases](https://palbase.studio/docs/iap/web), the `iap` module delegates payment collection cleanly to your connected **Payments** channels over internal RPC — so you connect Stripe or iyzico once under **Payments › Channels** and use it everywhere.

## Core concepts

- **PaymentIntent**: Server-authoritative record of an intent to collect money (`amount` in minor units, `currency`, `capture_method`, optional split `wallet_amount` + `card_amount`, canonical `status`). By default only your server (`palbase/server` or `palbase/backend`) may call `POST /payments/intents`.
- **1:N Attempts**: Every card charge, 3DS redirect, or OTP challenge appends an immutable attempt row (`GET /payments/intents/{intent_id}/attempts`) recording the provider, round-trip latency, fees, canonical `decline_code`, and `retryable` flag.
- **Canonical NextAction**: Whether a payment routes to Stripe Checkout, iyzico 3DS iframe, or an OTP challenge, the backend returns one unified `next_action` (`none`, `redirect`, `embed`, or `otp`). `pb.payments.present()` and `openPaymentSheet()` handle all of them automatically with zero polling.
- **Closed-loop Wallets & Double-Entry Ledger**: Every wallet top-up, spend, two-phase hold, P2P transfer, instant wallet refund, and chargeback debit writes balanced debit and credit legs. Run `palbase payments:audit:drift` at any time to verify zero drift across every account and transaction.

## Quick start

1. **Connect a channel** in Studio (**Payments › Channels**) or via CLI (`palbase payments:stripe:install` or `palbase payments:iyzico:connect`). See [Channels & Routing](https://palbase.studio/docs/payments/channels).
2. **Create a PaymentIntent on your server** with `createServer().payments.createIntent` or `Palbase.payments.createIntent`. See [Server & Backend SDK](https://palbase.studio/docs/payments/server-sdk).
3. **Present checkout in your web app** using `openPaymentSheet` from `palbase/web/payments-ui` or `pb.payments.present()`. See [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout).
4. **React to settlement** in your backend with `@On("payments.payment.succeeded")` or verified webhooks. See [Webhooks](https://palbase.studio/docs/server/webhooks).

## Next steps

- [Channels & Routing](https://palbase.studio/docs/payments/channels) · [Stripe](https://palbase.studio/docs/payments/stripe) · [iyzico](https://palbase.studio/docs/payments/iyzico)
- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout) · [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr) · [Subscriptions](https://palbase.studio/docs/payments/subscriptions)
- [Refunds & Disputes](https://palbase.studio/docs/payments/refunds-disputes) · [Ledger, Drift & Audit Export](https://palbase.studio/docs/payments/audit)
- [Web SDK](https://palbase.studio/docs/payments/web-sdk) · [iOS SDK](https://palbase.studio/docs/payments/ios-sdk) · [Android SDK](https://palbase.studio/docs/payments/android-sdk) · [Server & Backend SDK](https://palbase.studio/docs/payments/server-sdk)
