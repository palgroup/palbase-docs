> The full documentation index: https://palbase.studio/llms.txt

# iyzico

Connect **iyzico** (Sandbox or Live) to accept Turkish cards with mandatory 3D Secure, BIN-based installment tables, saved cards, recurring subscriptions, same-day cancellations, partial refunds, and signed webhook verification.

## Connecting iyzico

- **In Studio**: Open **Payments › Channels**, click **Connect iyzico / Key**, choose **iyzico**, set your channel key (e.g. `iyzico_tr`), enter your iyzico API Key and Secret Key, and toggle Sandbox/Live mode.
- **In the CLI**:

```sh
# Interactive browser handoff form (keys never leave your browser -> environment)
palbase payments:iyzico:connect --channel iyzico_tr

# Non-interactive CI / script connect via stdin JSON
printf '{"key":"iyzico_tr","api_key":"sandbox-...","secret_key":"sandbox-...","livemode":false,"set_default":true}' \
  | palbase payments:iyzico:connect --stdin
```

Check credential health at any time with:

```sh
palbase payments:channels:check iyzico_tr
```

## Turkish installments (BIN lookup)

When routing to an iyzico channel, query installment counts and monthly totals from the card's first 6–8 digits (BIN) or a saved card ID via `POST /payments/installments`:

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

const table = await pb.payments.installments({
  amount: 30000, // 300.00 TRY in kurus
  currency: "TRY",
  bin: "552879",
});

for (const opt of table.options) {
  console.log(opt.count, opt.total_amount, opt.installment_amount);
}
```

Pass the customer's chosen installment count when confirming the intent:

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

async function payWithInstallments(intentId: string, clientSecret: string) {
  const confirmed = await pb.payments.confirm(intentId, {
    clientSecret,
    installments: { count: 3 },
  });
  return pb.payments.present(confirmed);
}

void payWithInstallments;
```

`openPaymentSheet()` from `palbase/web/payments-ui` automatically fetches capabilities and displays the installment picker whenever the active channel supports installments.

## Buyer profile & fallback defaults

iyzico risk rules require buyer contact and billing address metadata (`name`, `surname`, `email`, `identity_number`, `city`, `country`, `address`). Palbase lets customers save their profile once (`GET /payments/me/profile`, `PUT /payments/me/profile` via `pb.payments.profile`) and lets you configure safe fallback defaults in Studio (**Payments › Routing & Settings**) when a buyer omits optional fields.

## 3D Secure & authoritative webhook verification

- **Mandatory 3DS**: Set `three_ds_threshold: 0` in project settings to enforce 3D Secure on every Turkish card payment.
- **Callback & webhooks**: iyzico posts 3DS results to `POST /payments/callback/{provider}/{attempt_id}` and async lifecycle notifications to `POST /payments/webhooks/iyzico`.
- **Signature & Retrieve**: Palbase verifies the webhook HMAC signature when present and always performs an authoritative Retrieve call against iyzico before marking any PaymentIntent or refund as succeeded.

## Same-day cancel vs refund

iyzico distinguishes same-day void (`cancel`) from post-settlement `refund`. When you call `POST /payments/refunds` with `destination: "original"`, Palbase automatically selects the appropriate provider operation (`cancel` vs `refund`) and records `provider_op` on the refund record. For instant customer retention, pass `destination: "wallet"` to credit the customer's TRY wallet immediately.

## Related

- [Channels & Routing](https://palbase.studio/docs/payments/channels)
- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout)
