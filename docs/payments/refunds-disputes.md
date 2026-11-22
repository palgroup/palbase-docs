> The full documentation index: https://palbase.studio/llms.txt

# Refunds & Disputes

Palbase supports full and partial refunds either back to the **original payment method** or **instantly to the customer's closed-loop wallet**, plus automated double-entry chargeback protection when a provider dispute opens or closes.

## Issuing refunds

Every call to `POST /payments/refunds` requires an `Idempotency-Key` header so network retries never double-refund a payment. Pass `amount: 0` (or omit `amount`) to refund the full remaining refundable amount, or specify a smaller minor-unit amount for partial refunds.

### Original card vs instant wallet credit

- **`destination: "original"`** (default): Executes the provider refund (on iyzico, automatically picks same-day `cancel` vs post-settlement `refund`; on Stripe, creates a Stripe Refund).
- **`destination: "wallet"`**: Immediately credits the customer's closed-loop wallet (`wallet_key`) in a balanced double-entry `refund_to_wallet` ledger transaction — zero settlement lag and zero card-network refund wait.

```ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function issueInstantWalletRefund(intentId: string, refundRef: string, amountMinor: number) {
  const { data: refund } = await palbase.payments.createRefund({
    headers: { "Idempotency-Key": `refund:${refundRef}` },
    body: {
      intent_id: intentId,
      amount: amountMinor,
      destination: "wallet",
      wallet_key: "try",
      reason: "instant_store_credit",
    },
  });
  return refund;
}
```

Operators can issue both original-card and instant-wallet refunds directly from the transaction detail sheet in Studio (**Payments › Transactions**).

Settled refunds update `intent.refunded_amount` and emit `payments.refund.succeeded`. Inspect refund history at `GET /payments/refunds`.

## Disputes & automated wallet chargeback accounting

When Stripe or iyzico reports a chargeback or dispute via webhook, Palbase verifies the dispute with the provider, persists it under `GET /payments/disputes` (visible in Studio under **Payments › Disputes**), and emits `payments.dispute.opened`.

If the disputed PaymentIntent funded a closed-loop wallet top-up, Palbase automatically protects your balance sheet:

1. **Dispute opened (`needs_response` / `under_review`)**: Posts a balanced double-entry `chargeback_debit` against the customer's wallet. If the customer has already spent the funds, the uncovered portion becomes wallet `debt` and the wallet is automatically set to `frozen: true` so no further spending or transfers can occur.
2. **Dispute closed — Won (`won`)**: Emits `payments.dispute.closed`, posts a balanced `chargeback_reversal` ledger transaction, reduces `debt`, and unfreezes the wallet once debt reaches zero.
3. **Dispute closed — Lost (`lost`)**: Emits `payments.dispute.closed` and retains the `chargeback_debit` (and freeze if debt remains unpaid).

Submit evidence directly in your Stripe or iyzico merchant dashboard before `evidence_due_at`.

## Related

- [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
- [Ledger, Drift & Audit Export](https://palbase.studio/docs/payments/audit)
- [Server & Backend SDK](https://palbase.studio/docs/payments/server-sdk)
