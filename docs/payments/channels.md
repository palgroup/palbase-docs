> The full documentation index: https://palbase.studio/llms.txt

# Channels & Routing

An environment can connect multiple payment channels simultaneously — for example `iyzico_tr` for Turkish Lira cards with installments and 3DS, and `stripe_global` for international USD/EUR payments — and route every PaymentIntent deterministically by currency, country, or payment kind.

## Managing channels

Use Studio (**Payments › Channels**) or the CLI:

```sh
# List connected channels, status, capabilities, and default marker
palbase payments:channels

# Probe live provider credentials and verify permissions
palbase payments:channels:check iyzico_tr

# Make a channel the fallback default when no routing rule matches
palbase payments:channels:default stripe_global

# Disconnect a channel (existing transactions and ledger entries remain intact)
palbase payments:channels:disconnect iyzico_tr
```

Provider credentials are encrypted at rest inside the Payments module and never returned by any API. Only a non-secret `key_hint`, connection method (`app` or `key`), live capability matrix, and webhook URL are exposed via `GET /payments/channels`.

## Capabilities matrix

Each channel declares its live capabilities (`GET /payments/capabilities`), which `pb.payments.capabilities()` reads so your checkout UI adapts automatically without hardcoding provider names:

- `three_ds`: 3D Secure authentication support
- `installments`: BIN-based Turkish installment tables (`POST /payments/installments`)
- `saved_cards`: PCI-safe tokenized card vault (`GET /payments/me/methods`)
- `subscriptions`: Native recurring billing (`POST /payments/subscriptions`)
- `manual_capture`: Separate authorization and capture (`POST /payments/intents/{intent_id}/capture`)
- `customer_portal`: Provider-hosted self-service billing portal (`POST /payments/me/portal`)
- `currencies`: Supported ISO 4217 currency codes

## Deterministic routing rules

When `POST /payments/intents` runs without an explicit `channel` override, Palbase evaluates your environment's routing rules (`GET /payments/routing-rules`, `PUT /payments/routing-rules`) in ascending `priority` order (lowest integer first). The first enabled rule whose non-null `currency`, `country`, and `payment_kind` match selects the channel; otherwise the default active channel is used.

```sh
# Inspect active routing rules
palbase payments:routing

# Replace routing rules from a JSON file
palbase payments:routing:put routing-rules.json
```

Example `routing-rules.json`:

```json
{
  "rules": [
    {
      "priority": 10,
      "currency": "TRY",
      "country": "TR",
      "payment_kind": null,
      "channel_key": "iyzico_tr",
      "enabled": true
    },
    {
      "priority": 20,
      "currency": "USD",
      "country": null,
      "payment_kind": "payment",
      "channel_key": "stripe_global",
      "enabled": true
    }
  ]
}
```

Every PaymentIntent records its `channel_key`, `provider`, and `routing_reason` so operators can trace exactly why a channel was selected in Studio (**Payments › Transactions**).

## Project settings, 3DS & velocity controls

Project-wide payment guardrails live at `GET /payments/settings` and `PUT /payments/settings` (Studio: **Payments › Routing & Settings**):

| Setting | Default | What it controls |
|---|---|---|
| `default_currency` | `USD` | Default ISO 4217 currency code. |
| `topup_min` / `topup_max` | `1000` / `500000` | Allowed wallet top-up bounds in minor units. |
| `max_payment_amount` | `1000000` | Ceiling on a single PaymentIntent in minor units. |
| `three_ds_threshold` | `0` | Minor-unit threshold at or above which 3DS is enforced (`0` = always enforce 3DS). |
| `velocity_max_failures` / `velocity_window_seconds` | `5` / `300` | Sliding failure rate limit per IP/customer before card attempts are throttled. |
| `allow_client_payments` | `false` | Opt-in switch. Keep `false` so only servers with the secret key can create PaymentIntents. |
| `cancel_on_delete` | `true` | Automatically cancels active recurring subscriptions when a user is deleted in Auth. |

## Related

- [Stripe](https://palbase.studio/docs/payments/stripe) · [iyzico](https://palbase.studio/docs/payments/iyzico)
- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout)
