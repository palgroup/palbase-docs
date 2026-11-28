> The full documentation index: https://palbase.studio/llms.txt

# Checkout & PaymentSheet

Palbase Payments follows a **server-authoritative PaymentIntent** architecture: your backend decides the price, currency, and optional wallet split; the client confirms and presents the canonical `NextAction` with **zero polling**.

## 1. Create a PaymentIntent on your server

Create an intent from your backend (`palbase/backend` or `palbase/server`) and return `{ id, client_secret }` to the browser:

```ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function createOrderIntent(customerId: string, orderId: string) {
  const { data: intent } = await palbase.payments.createIntent({
    headers: { "Idempotency-Key": `order:${orderId}` },
    body: {
      customer_id: customerId,
      amount: 25000, // 250.00 TRY in minor units
      currency: "TRY",
      reference: orderId,
      description: `Order #${orderId}`,
      return_url: "https://shop.example.com/checkout/complete",
      cancel_url: "https://shop.example.com/checkout/canceled",
    },
  });

  return { id: intent.id, client_secret: intent.client_secret };
}
```

### Split card + wallet checkout

To let a customer pay part of an order from their closed-loop wallet and the remainder by card in one atomic checkout, pass `wallet_key` and `wallet_amount` in `POST /payments/intents`. Palbase places a two-phase wallet hold on `wallet_amount`, charges `amount - wallet_amount` on the routed card channel, commits the wallet hold only when the card settles, and releases the wallet hold automatically if the intent fails or is canceled. The wallet's share is the buyer's again only once the payment ends, so a payment a wallet and a card pay together stays open an hour at most, whatever `expires_in_seconds` asks: a buyer who walks away has the balance back within the hour and a quarter. A card's payment, or a wallet's alone, keeps the time it was given.

### Manual capture (authorize then capture)

Pass `capture_method: "manual"` when creating the intent. Once the customer completes 3DS/checkout, the intent enters `requires_capture` and emits `payments.payment.requires_capture`. Capture the full or partial amount later via `POST /payments/intents/{intent_id}/capture`, or void it via `POST /payments/intents/{intent_id}/cancel`.

## 2. Present PaymentSheet in the browser

`palbase/web/payments-ui` ships a zero-dependency, themeable drop-in **PaymentSheet** that handles saved cards, new cards, Turkish installments, embedded 3DS iframes, redirects, and split-payment summaries out of the box:

```ts
import { createClient } from "palbase/web";
import { openPaymentSheet } from "palbase/web/payments-ui";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

export async function checkoutOrder(intent: { id: string; client_secret?: string }) {
  const settled = await openPaymentSheet(pb.payments, {
    intent,
    appearance: {
      theme: "auto",
      primaryColor: "#2563eb",
      borderRadius: "12px",
    },
    allowSaveCard: true,
    allowInstallments: true,
  });

  if (!settled) return; // dismissed by customer
  if (settled.status === "succeeded" || settled.status === "requires_capture") {
    console.log("Payment settled:", settled.id, settled.status);
  } else {
    console.warn("Payment declined:", settled.decline_code);
  }
}
```

You can also mount inline inside your own container element with `mountPaymentSheet(container, pb.payments, options)`.

## 3. Canonical NextAction & zero-polling settlement

When building a custom checkout UI with `pb.payments.confirm()` and `pb.payments.present()`, every provider converges onto canonical `next_action.type` values:

| `next_action.type` | Meaning | How `pb.payments.present()` handles it |
|---|---|---|
| `none` | Already settled (e.g. full wallet or frictionless off-session card). | Resolves immediately. |
| `redirect` | Provider-hosted checkout or full-page 3DS redirect (`url`). | Calls `onRedirect` or navigates to `url`. |
| `embed` | Sanitized 3DS or embedded checkout HTML (`html`). | Mounts a sandboxed iframe via `mountEmbedFrame()` and listens for the callback bridge `postMessage`. |
| `otp` | Bank or vault OTP challenge (`challenge_id`, `masked_phone`). | Calls `onOtp` and submits via `pb.payments.submitOtp()`. |

`pb.payments.waitForIntent(intentId)` joins the Realtime channel `payment_intent:<ref>:<intentId>` and listens for `palbase.payments` callback bridge messages — resolving as soon as the authoritative webhook or callback settles with **zero polling**.

## Related

- [Web SDK](https://palbase.studio/docs/payments/web-sdk)
- [Server & Backend SDK](https://palbase.studio/docs/payments/server-sdk)
- [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
