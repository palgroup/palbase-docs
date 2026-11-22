> The full documentation index: https://palbase.studio/llms.txt

# Wallets & QR Spend Tokens

Palbase includes built-in **closed-loop double-entry wallets** (`fiat` store balance or `points`) with FIFO lot expiration, two-phase holds, instant P2P transfers, real-time balance broadcasts, and single-use **QR spend tokens** (`pst_...`) for POS, cafe, transit, or kiosk payments.

## Defining wallets

Create wallet definitions in Studio (**Payments › Wallets & Ledger**) or via the CLI (`POST /payments/wallets`, `GET /payments/wallets`):

```sh
# List configured wallets
palbase payments:wallets

# Create or update a TRY closed-loop wallet
palbase payments:wallets:put \
  --key try \
  --name "TRY Wallet" \
  --kind fiat \
  --currency TRY \
  --topup-min 1000 \
  --topup-max 500000
```

Each customer's balance tracks five accounting numbers in minor units:

- **`posted`**: Total settled ledger balance (`available + held - debt`).
- **`held`**: Funds currently reserved by active two-phase holds.
- **`available`**: Spendable balance (`max(0, posted - held)`).
- **`debt`**: Uncovered chargeback debt (automatically freezes spending until settled or forgiven).
- **`frozen`**: When `true`, all spends and holds are blocked (`PUT /payments/wallets/customers/{customer_id}/{wallet_key}/freeze`).

## Customer top-ups & live balance updates

Customers top up their wallet via `pb.payments.wallet.topUp()` (`POST /payments/me/wallets/top-up`) or the drop-in `mountWalletTopUpSheet()` component from `palbase/web/payments-ui`.

Subscribe to live balance updates over Realtime (`payments:<ref>:<uid>`) with zero polling:

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

const stop = pb.payments.wallet.onChange((balances) => {
  if (!balances) return;
  for (const b of balances) {
    console.log(b.wallet_key, b.available, b.held, b.frozen);
  }
});

void stop;
```

## Two-phase holds (`withWalletHold`)

For rides, food delivery, or metered AI/compute jobs where the final price is known only after work finishes, reserve funds up front with `withWalletHold` from `palbase/server`. If your callback throws, the hold is automatically released; if the final amount is less than reserved, return `settleWalletHold(actualAmount, result)` to commit only what was used and instantly unlock the remainder:

```ts
import { createServer, settleWalletHold, withWalletHold } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function runMeteredRide(customerId: string, rideId: string) {
  return withWalletHold(
    palbase,
    {
      customerId,
      walletKey: "try",
      amount: 30000, // Reserve up to 300.00 TRY
      idempotencyKey: `ride-hold:${rideId}`,
      ttlSeconds: 1800,
      reference: rideId,
    },
    async (hold) => {
      const actualFare = 18500; // Final metered fare: 185.00 TRY
      return settleWalletHold(actualFare, { rideId, holdId: hold.id, charged: actualFare });
    },
  );
}
```

## Single-use QR spend tokens (`pst_...`)

For in-person POS or kiosk scanning, the customer's app mints a short-lived single-use spend token (`POST /payments/me/wallets/spend-tokens`, default 60 s TTL, max 300 s) and displays it as a QR code using `mountSpendQRView()` from `palbase/web/payments-ui`:

```ts
import { createClient } from "palbase/web";
import { mountSpendQRView } from "palbase/web/payments-ui";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

export function showCheckoutQr(container: HTMLElement) {
  return mountSpendQRView(container, pb.payments, {
    walletKey: "try",
    maxAmount: 50000,
    ttlSeconds: 60,
    autoRefresh: true,
    onBalance: (b) => console.log("Live available:", b.available),
  });
}
```

Your POS or merchant backend scans the `pst_...` token and charges it atomically with `POST /payments/wallets/charge` (requiring an `Idempotency-Key`):

```ts
import { createServer } from "palbase/server";

const palbase = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

export async function chargeQrToken(spendToken: string, receiptId: string, amountMinor: number) {
  const { data } = await palbase.payments.chargeWallet({
    headers: { "Idempotency-Key": `pos:${receiptId}` },
    body: {
      spend_token: spendToken,
      amount: amountMinor,
      reference: receiptId,
      reason: "pos_purchase",
    },
  });
  return data;
}
```

## Rewards, adjustments & P2P transfers

- **Credit rewards or goodwill**: `POST /payments/wallets/credit` (requires `Idempotency-Key`, optional `expires_at`).
- **Direct server debit**: `POST /payments/wallets/charge` by `customer_id` or `spend_token` (requires `Idempotency-Key`).
- **Deadlock-free P2P transfer**: `POST /payments/wallets/transfer` atomically moves balance from `from_customer_id` to `to_customer_id` with ordered row locking (requires `Idempotency-Key`).

## Related

- [Ledger, Drift & Audit Export](https://palbase.studio/docs/payments/audit)
- [Refunds & Disputes](https://palbase.studio/docs/payments/refunds-disputes)
- [Web SDK](https://palbase.studio/docs/payments/web-sdk)
