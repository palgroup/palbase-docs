> The full documentation index: https://palbase.studio/llms.txt

# Server & Backend SDK

Use `createServer().payments` in `palbase/server` (external Node/Bun/Edge servers) or `Palbase.payments` in `palbase/backend` (your Palbase-hosted backend machine) to create server-authoritative PaymentIntents, run two-phase wallet holds, issue refunds, manage subscriptions, query audit ledgers, and handle verified `payments.*` webhooks.

## Using `Palbase.payments` in `palbase/backend`

Inside a `palbase/backend` controller or service, `Palbase.payments` is pre-configured with your environment's secret key, and `@On("payments.*")` subscribes to verified platform events:

```ts
// src/modules/orders/orders.controller.ts
import { Body, Controller, On, Palbase, Post, User, z, type UserT } from "palbase/backend";

const CheckoutBody = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("TRY"),
});

@Controller("orders")
export class OrdersController {
  @Post("checkout")
  async startCheckout(@User() user: UserT, @Body(CheckoutBody) body: z.infer<typeof CheckoutBody>) {
    const { data: intent } = await Palbase.payments.createIntent({
      headers: { "Idempotency-Key": `order:${body.orderId}` },
      body: {
        customer_id: user.id,
        amount: body.amount,
        currency: body.currency,
        reference: body.orderId,
        description: `Order ${body.orderId}`,
      },
    });
    return { intentId: intent.id, clientSecret: intent.client_secret };
  }

  @On("payments.payment.succeeded")
  async onPaymentSucceeded(event: { data: Record<string, unknown> }) {
    console.log("Fulfill order for payment:", event.data.intent_id);
  }
}
```

## Helper utilities in `palbase/server`

`palbase/server` exports ergonomic helpers built directly on `createServer().payments`:

- **`withWalletHold(server, reservation, fn)`** & **`settleWalletHold(commitAmount, value)`**: Two-phase wallet holds with automatic rollback on throw and partial settlement support. See [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr#two-phase-holds-withwallethold).
- **`isRetryableDecline(code)`**: Reports whether a canonical `DeclineCode` (`insufficient_funds`, `three_ds_failed`, `provider_unavailable`, etc.) can safely be retried.
- **`isPaymentsEvent(event)`**: Type-narrows a verified `PalbaseEvent` from `verifyWebhook()` to `PaymentsWebhookEvent`.

```ts
import { isPaymentsEvent, isRetryableDecline, verifyWebhook } from "palbase/server";

export async function handlePaymentsWebhook(rawBody: string, signature: string | null) {
  const event = await verifyWebhook({
    secret: process.env.PALBASE_WEBHOOK_SECRET!,
    signature,
    body: rawBody,
  });

  if (!isPaymentsEvent(event)) return;

  if (event.type === "payments.payment.failed") {
    const code = event.data.decline_code;
    console.log("Payment failed:", code, "retryable:", isRetryableDecline(code));
  }
}
```

## Webhook events

Subscribe to any of the 11 `payments.*` webhook events in Studio (**Settings › Webhooks**) or with `@On(...)` in `palbase/backend`:

| Event | When it fires |
|---|---|
| `payments.payment.succeeded` | A PaymentIntent verified and settled (card, wallet, or split). |
| `payments.payment.failed` | A payment attempt failed with a canonical `decline_code`. |
| `payments.payment.canceled` | A PaymentIntent was canceled and any split wallet hold released. |
| `payments.payment.requires_capture` | A manual-capture PaymentIntent was authorized and awaits capture or cancel. |
| `payments.refund.succeeded` | A refund settled to the original card or instantly to a closed-loop wallet. |
| `payments.dispute.opened` | A provider chargeback or dispute opened against a payment. |
| `payments.dispute.closed` | A provider dispute closed (`won` or `lost`), applying chargeback debits or reversals. |
| `payments.subscription.changed` | A recurring subscription started, renewed, entered `past_due`, or changed status. |
| `payments.subscription.canceled` | A recurring subscription was canceled (immediately or at period end). |
| `payments.wallet.balance_changed` | A customer's closed-loop wallet balance changed (also delivered over Realtime). |
| `payments.wallet.hold_changed` | A two-phase wallet hold was created, committed, released, or expired. |

## Related

- [Server SDK Overview](https://palbase.studio/docs/server/overview)
- [Webhooks](https://palbase.studio/docs/server/webhooks)
- [Ledger, Drift & Audit Export](https://palbase.studio/docs/payments/audit)
