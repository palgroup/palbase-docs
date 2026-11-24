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
