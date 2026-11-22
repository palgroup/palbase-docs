> The full documentation index: https://palbase.studio/llms.txt

# Masterpass

Attach **Masterpass** merchant credentials to a payment channel to let Turkish customers look up their Masterpass-vaulted cards by phone number and complete one-click payments verified by SMS OTP — with zero raw card storage on your servers.

## Attaching Masterpass to a channel

Configure Masterpass on any active channel (typically your `iyzico_tr` channel):

- **In Studio**: Open **Payments › Channels**, click **Connect iyzico / Key**, toggle **Attach Masterpass card vault**, and fill in:
  - `client_id` (Masterpass merchant client identifier)
  - `secret_key` (Masterpass signing secret)
  - `macro_merchant_id` (optional macro merchant identifier)
  - `base_url` (optional custom sandbox/production endpoint)
  - `livemode` (`false` for sandbox, `true` for live)
- **Browser handoff**: Use **Browser handoff link** (`POST /payments/channels/grants` with `kind: "masterpass_key"`) if you want credentials submitted directly to the Payments module.

Once attached, `GET /payments/channels` reports `has_masterpass: true` and `GET /payments/capabilities` sets `capabilities.masterpass = true`.

## Checkout flow with Masterpass OTP

1. **Create a PaymentIntent on your server** (`POST /payments/intents`).
2. **Confirm with Masterpass** from the browser (`POST /payments/intents/{intent_id}/confirm`) passing `useMasterpass: true` and the customer's `phone`.
3. **Verify OTP**: The response returns `next_action.type === "masterpass"` (or `"otp"`) with `challenge_id` and `masked_phone`. Collect the SMS code and call `pb.payments.submitOtp()` (`POST /payments/intents/{intent_id}/otp`).

```ts
import { createClient } from "palbase/web";

const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
});

async function payWithMasterpass(
  intentId: string,
  clientSecret: string,
  phone: string,
  promptUserForCode: (maskedPhone?: string) => Promise<string | null>,
) {
  const confirmed = await pb.payments.confirm(intentId, {
    clientSecret,
    useMasterpass: true,
    phone,
  });

  // present() drives the OTP prompt, calls submitOtp(), and resolves on settlement.
  return pb.payments.present(confirmed, {
    clientSecret,
    onOtp: async (ctx) => {
      const code = await promptUserForCode(ctx.maskedPhone);
      return code ? { otp: code, saveMethod: true } : null;
    },
  });
}

void payWithMasterpass;
```

## Using PaymentSheet

When `openPaymentSheet()` or `mountPaymentSheet()` from `palbase/web/payments-ui` sees `capabilities.masterpass === true`, it automatically renders the Masterpass option and built-in OTP input screen when `allowMasterpass: true` (the default). See [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout).

## Linking Masterpass outside checkout

Signed-in customers can also link their Masterpass phone vault from their account settings using `pb.payments.methods.add({ vault: "masterpass", phone })` (`POST /payments/me/methods`).

## Related

- [Channels & Routing](https://palbase.studio/docs/payments/channels)
- [iyzico](https://palbase.studio/docs/payments/iyzico)
- [Web SDK](https://palbase.studio/docs/payments/web-sdk)
