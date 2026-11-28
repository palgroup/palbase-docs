> The full documentation index: https://palbase.studio/llms.txt

# Marketplace Payments

Palbase **Payments** supports multi-seller marketplaces natively across **iyzico Pazaryeri** and **Stripe Connect**, backed by a channel-agnostic double-entry seller ledger, BDDK 6493 escrow safeguards, and automated reconciliation.

## Dual PSP Support

- **iyzico Pazaryeri**: Sub-merchant onboarding (`POST /payments/sub-merchants`), split basket items (`payment_splits`), escrow item approval/disapproval (`POST /payments/splits/{split_id}/approve`, `POST /payments/splits/{split_id}/disapprove`), per-line v1 refunds (`POST /payments/splits/{split_id}/refund`), Turkish e-commerce %1 withholding tax (`withholding_tax_amount`) and installment fee separation (`installment_fee_amount`), plus Merchant-Initiated Transaction (MIT) recurring billing.
- **Stripe Connect**: Express, Custom, and Standard connected account creation, onboarding links, Separate Charges & Transfers, automatic `TransferReversal` on split refunds, and signed Connect webhooks.

## BDDK 6493 Safeguards & Double-Entry Seller Ledger

- **No Unlicensed Fiat Float**: `allow_marketplace_fiat_wallet` defaults to `false` — marketplace split orders refuse closed-loop fiat wallet funding (`422`) unless explicitly enabled for a licensed entity.
- **Seller Accounts & Debt Offset**: Every seller gets a double-entry seller ledger account tracking escrow, pending payouts, commission, withholding tax, and negative balances from post-payout refunds/chargebacks (automatically offset against future earnings).
- **Zero-Drift Audit**: `palbase payments:audit:drift` verifies balanced double-entry accounting across both customer wallets and seller split ledgers.

## Server Usage

```ts
import { createServer } from "palbase/server";

const pb = createServer({
  url: "https://k3xq81w4m.palbase.studio",
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

const sellers = await pb.payments.listSubMerchants();
console.log(sellers.data.sub_merchants.length);
```

## Refunding a split

`POST /payments/splits/{split_id}/refund` gives a buyer back all or part of one seller's line. Send the `amount` and let Palbase work out the rest:

```json
{ "amount": 4000, "destination": "original", "reason": "return" }
```

- **Where it goes** — to the card first, as far as the card paid this split and was not given back, the rest to the wallet; `"destination": "wallet"` sends all of it to the buyer's wallet.
- **Who gives it back** — the seller, your commission, the tax withheld and your own discount each give back the share of their whole that the split's refunds so far are of what the buyer paid. A split refunded in parts gives back exactly its own amounts: 4,000 of a 10,000 split with a 1,000 commission and 8,900 for the seller reverses 400 of the commission and takes 3,560 back from the seller.

A server that keeps its own books sends the amounts by name instead (`card_refund_amount`, `wallet_refund_amount`, `seller_clawback_amount`, `platform_fee_reversed_amount`, `withholding_tax_reversed_amount`, `subsidy_reversed_amount`); the two ways together answer `400 invalid_refund`. Either way a refund is held to what is left of the split and of its payment. Asked again under the same `Idempotency-Key` for the same amount, it answers the refund it wrote and the provider is not asked again; for another amount it answers `409 idempotency_key_reused`. A payment with splits is given back through them, not through `POST /payments/refunds`.

Two refusals are worth knowing. `422 marketplace_fiat_wallet_forbidden`: `"destination": "wallet"` and the wallet is of money (`kind: fiat`) — a marketplace payment does not fill one unless you allow it (`allow_marketplace_fiat_wallet`), at payment and at refund alike. `409 refund_failed`: the provider did not make the refund, and nothing was written. A refund the provider refused is asked for again as a new request: Stripe keeps a key's first answer for a day, a refusal too, so the same request sent again once the cause is gone — your balance topped up — goes to Stripe under a key of its own.

And one answer that is no refusal: `502 provider_unavailable`. The provider did not answer the refund — in time, or so it could be read — and may have made it. Palbase does not ask a provider twice for the same money, so until it is known every refund of that payment answers `409 refund_pending`, with the `Idempotency-Key` of the one that waits. On Stripe, send that request again under its key within a day: Stripe answers a key it has seen with the refund it made. Otherwise look the refund up at the provider and say what it did:

```bash
curl -X POST "https://<ref>.palbase.studio/payments/intents/$INTENT_ID/pending-refund" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"made": true}'
```

`made: true` and the same request, sent again under its key, writes the refund without asking the provider; `made: false` and the key is let go, the payment refunded as before. On Stripe the same request sent again still goes under its own key: had Stripe made the refund after all, it answers with that refund, and none is made twice. The same request is the return completed again, or the same cancellation made again, in Commerce — or, when the order has changed since and the cancellation cannot be made the same, the refund itself sent to payments under that key and for that amount (`POST /payments/splits/{split_id}/refund`, or `POST /payments/refunds` for a payment with no splits). The answer to the settling names the key. Commerce does not learn of a refund written straight at payments: the cancellation it was the money of was never written there, so its units stay uncanceled, and canceling them in Commerce later gives their money back a second time — payments holds a refund to what is left of the store's whole order, not of those units.

On Stripe, what a transfer already sent the seller is taken back with the refund — whatever its destination — up to what was sent; what is not taken back that way comes out of what you still owe the seller, and past that is their debt, set against what they earn next. A split refunded in part before it is approved is approved for what is left of it.

Commerce does this for you when a return is completed or a paid order is canceled.

## CLI Commands

```bash
palbase payments:sub-merchants
palbase payments:sub-merchants:upsert --file seller.json
palbase payments:splits
palbase payments:splits:approve <split-id>
palbase payments:splits:refund <split-id> --card 5000 --clawback 4500
palbase payments:seller-accounts <seller-ref>
palbase payments:reconcile
```

Example `seller.json` (`seller_ref` is required; provider-specific fields such as `iban`, `tax_number`, and `sub_merchant_type` depend on your payment channel):

```json
{
  "seller_ref": "seller_42",
  "name": "Acme Goods",
  "sub_merchant_type": "private_company",
  "email": "payouts@acmegoods.example",
  "gsm_number": "+905551112233",
  "tax_number": "1234567890",
  "tax_office": "Kadikoy",
  "iban": "TR330006100519786457841326",
  "country": "TR",
  "currency": "TRY"
}
```

See [Commerce Overview](https://palbase.studio/docs/commerce/overview) for how multi-seller carts and split store orders connect automatically to Marketplace Payments.
