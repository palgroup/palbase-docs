> The full documentation index: https://palbase.studio/llms.txt

# Web SDK

`pb.payments` in `palbase/web` and the drop-in UI kit in `palbase/web/payments-ui` give browser apps a single provider-agnostic checkout, saved-card vault, closed-loop wallet, QR spend token, and subscription client — built on your environment's publishable key with zero polling.

## Client methods (`pb.payments`)

| Surface | Methods | What it does |
|---|---|---|
| Discovery | `capabilities({ currency?, channel? })`, `installments({ amount, currency, bin?, methodId? })` | Reads active channel feature flags and Turkish BIN installment tables. |
| Checkout | `getIntent(id)`, `confirm(id, opts)`, `submitOtp(id, opts)`, `present(intent, opts)`, `waitForIntent(id)` | Confirms server-created intents, drives canonical `NextAction` (redirect, 3DS iframe, OTP, Masterpass), and waits over Realtime. |
| Saved cards | `methods.list()`, `methods.add(opts)`, `methods.remove(id)` | Lists, vaults (card or Masterpass), and removes tokenized payment methods. |
| Billing profile | `profile.get()`, `profile.update(buyer)` | Saves buyer identity and address fields required by Turkish card processors. |
| Wallets & QR | `wallet.balances()`, `wallet.balance(key)`, `wallet.topUp(opts)`, `wallet.createSpendToken(opts)`, `wallet.onChange(fn)` | Reads live balances, initiates card-to-wallet top-ups, mints single-use `pst_...` QR tokens, and subscribes over Realtime. |
| Subscriptions | `subscriptions.list()`, `subscriptions.cancel(id)`, `portal(returnUrl)` | Lists/cancels recurring subscriptions and opens Stripe Customer Portal. |
| Live events | `onEvent(fn)` | Subscribes to `payments:<ref>:<uid>` broadcasts on the shared Realtime socket. |

## Drop-in UI components (`palbase/web/payments-ui`)

All components use clean Shadow-safe / scoped styling with `PaymentsAppearance` (`theme: "light" | "dark" | "auto"`, `primaryColor`, `surfaceColor`, `textColor`, `borderRadius`, `fontFamily`, `locale`) and return a `PaymentViewHandle` (`destroy()`, `setAppearance()`):

```ts
import { createClient } from "palbase/web";
import {
  mountPaymentSheet,
  mountSavedCardsView,
  mountSpendQRView,
  mountWalletTopUpSheet,
  openPaymentSheet,
  type PaymentsAppearance,
} from "palbase/web/payments-ui";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

const appearance: PaymentsAppearance = {
  theme: "auto",
  primaryColor: "#0f172a",
  borderRadius: "10px",
};

export function initPaymentsViews(opts: {
  checkoutEl: HTMLElement;
  topUpEl: HTMLElement;
  cardsEl: HTMLElement;
  qrEl: HTMLElement;
  intent: { id: string; client_secret?: string };
}) {
  const sheet = mountPaymentSheet(opts.checkoutEl, pb.payments, {
    intent: opts.intent,
    appearance,
    onSuccess: (settled) => console.log("Paid:", settled.id),
  });

  const topUp = mountWalletTopUpSheet(opts.topUpEl, pb.payments, {
    walletKey: "try",
    currency: "TRY",
    presets: [10000, 25000, 50000, 100000],
    appearance,
    onSuccess: (settled) => console.log("Top-up succeeded:", settled.id),
  });

  const cards = mountSavedCardsView(opts.cardsEl, pb.payments, {
    appearance,
    allowAdd: true,
    onChanged: (list) => console.log("Saved cards:", list.length),
  });

  const qr = mountSpendQRView(opts.qrEl, pb.payments, {
    walletKey: "try",
    ttlSeconds: 60,
    autoRefresh: true,
    appearance,
  });

  return () => {
    sheet.destroy();
    topUp.destroy();
    cards.destroy();
    qr.destroy();
  };
}

// Or open PaymentSheet as a modal overlay without a pre-existing container:
export function openCheckoutModal(intent: { id: string; client_secret?: string }) {
  return openPaymentSheet(pb.payments, { intent, appearance });
}
```

## Canonical decline messages

Map any `intent.decline_code` into a concise, customer-safe English string using `declineMessage()`:

```ts
import { declineMessage } from "palbase/web";

export function formatFailure(code: string | undefined): string {
  return declineMessage(code);
}
```

## Related

- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout)
- [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
- [Web SDK Overview](https://palbase.studio/docs/web/overview)
