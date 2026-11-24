> The full documentation index: https://palbase.studio/llms.txt

# Ledger, Drift & Audit Export

Every wallet balance movement in Palbase Payments is backed by an **immutable, append-only double-entry ledger**. Every transaction writes balanced `debit` and `credit` legs summing to zero, assigned a monotonically increasing sequence number (`seq`).

## Double-entry accounts

Ledger legs use deterministic account identifiers:

- `@wallet:<customer_id>:<wallet_key>` — customer's posted wallet balance
- `@held:<customer_id>:<wallet_key>` — customer's funds reserved by active two-phase holds
- `@debt:<customer_id>:<wallet_key>` — uncovered chargeback debt
- `@external:<provider>:<currency>` — card settlement inflow / chargeback outflow
- `@merchant:<bucket>:<currency>` — merchant revenue, promotional rewards, and instant wallet refund accounts

## Zero-drift integrity verification

Run the reconciliation verifier at any time to confirm that:

1. Every double-entry transaction's debit legs equal its credit legs.
2. Every customer's live wallet balance (`posted`, `held`, `available`, `debt`) matches the exact sum of its immutable ledger legs, active holds, and FIFO lots.

- **In Studio**: Open **Payments › Wallets & Ledger** and click **Re-check drift**.
- **In the CLI**:

```sh
palbase payments:audit:drift
```

- **HTTP / SDK**: `GET /payments/audit/drift` (`palbase.payments.auditDrift()`).

A healthy environment returns `{ ok: true, transactions_checked, accounts_checked, problems: [] }`.

## Cashflow summary

Aggregate card gross, provider fees, tax, refunds, net settlement, wallet top-ups, wallet spends, instant wallet refunds, promotional rewards, transfers, and chargeback debits grouped by currency via `GET /payments/audit/cashflow`:

```ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function monthlyCashflow(fromIso: string, toIso: string) {
  const { data } = await palbase.payments.auditCashFlow({
    query: { from: fromIso, to: toIso },
  });
  return data.currencies;
}
```

## Exporting the audit ledger (CSV & JSON)

Export filtered double-entry entries by `customer_id`, `wallet_key`, `kind`, `from`, and `to`:

- **In Studio**: Open **Payments › Wallets & Ledger** and click **Export CSV** (`GET /payments/audit/ledger/export`) or **Export JSON** (`GET /payments/audit/ledger`).
- **In the CLI**:

```sh
# Export filtered CSV directly to a file
palbase payments:audit:export --wallet try --from 2026-11-01T00:00:00Z > ledger.csv

# Export structured JSON with balanced legs
palbase payments:audit:export --wallet try --json > ledger.json
```

## Related

- [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
- [Refunds & Disputes](https://palbase.studio/docs/payments/refunds-disputes)
- [CLI Overview](https://palbase.studio/docs/cli/overview)
