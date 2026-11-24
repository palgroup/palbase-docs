> The full documentation index: https://palbase.studio/llms.txt

# Android SDK

`studio.palbase:palbase-payments` and `studio.palbase:palbase-payments-ui` bring provider-agnostic card checkout (Stripe and iyzico), 3D Secure (Custom Tabs + `WebView` cookie/`JavascriptInterface` bridge), saved cards, BIN installments, billing portal, recurring subscriptions, and closed-loop wallets with pure-Kotlin ISO/IEC 18004 QR spend tokens to Android (`minSdk` 26, Kotlin 2.2+).

## Install

Add `palbase-payments` for headless checkout and `palbase-payments-ui` for optional drop-in PCI-DSS SAQ-A Jetpack Compose screens:

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.20.1"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-payments")
    implementation("studio.palbase:palbase-payments-ui")
}
```

Forward payment return deep links in your activity's `onNewIntent`:

```kotlin
import studio.palbase.payments.payments

class CheckoutActivity : ComponentActivity() {
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pb.payments.handleRedirectIntent(intent)
    }
}
```

## Headless API (`pb.payments`)

| Surface | Methods / Properties | What it does |
|---|---|---|
| Discovery | `capabilities(currency, channel)`, `installments(amount, currency, bin, methodId, channel)` | Reads active channel capabilities and Turkish BIN installment tables. |
| Checkout | `intent(intentId, clientSecret)`, `confirm(intentId, request, idempotencyKey)`, `submitOtp(intentId, challengeId, otp, clientSecret, saveMethod)`, `present(intent, activity, handlers, timeoutMs)` | Confirms server-created PaymentIntents, executes canonical `NextAction` (`redirect`, `embed`, `otp`), and awaits settlement over `payment_intent:<ref>:<id>` with zero polling. |
| Return links | `handleRedirectIntent(intent)`, `handleRedirectUrl(url)`, `parsePaymentReturnUrl(...)` | Delivers Custom Tab / deep-link callbacks to active `present(...)` flows. |
| Saved cards | `savedMethods()`, `addSavedMethod(request)`, `deleteSavedMethod(methodId)` | Lists, vaults (Stripe and iyzico), and removes tokenized cards. |
| Billing profile | `profile()`, `updateProfile(buyer)` | Reads and updates buyer identity and address fields required by Turkish card processors. |
| Wallets & QR | `walletState`, `walletUpdates`, `wallets()`, `topUpWallet(...)`, `createSpendToken(walletKey, maxAmount, ttlSeconds)` | `StateFlow<WalletState>` kept live over `payments:<ref>:<uid>`, card-to-wallet top-ups, and single-use `pst_...` QR spend tokens. |
| Subscriptions | `subscriptions(limit, cursor)`, `cancelSubscription(subscriptionId)`, `billingPortal(returnUrl, channel)` | Lists/cancels recurring subscriptions and opens a self-service billing portal URL. |
| Plugins | `registerPlugin(plugin)`, `unregisterPlugin(id)`, `availablePlugins(context)` | Optional `PaymentMethodPlugin` extension slot for native wallets. |

```kotlin
import studio.palbase.payments.PaymentResult
import studio.palbase.payments.PaymentsAPI
import studio.palbase.payments.payments

suspend fun confirmAndPresent(activity: Activity, intentId: String, clientSecret: String?): PaymentResult {
    val caps = pb.payments.capabilities(currency = "TRY")
    val confirmed = pb.payments.confirm(
        intentId = intentId,
        request = PaymentsAPI.ConfirmIntentRequest(
            clientSecret = clientSecret,
            saveMethod = caps.capabilities.savedCards,
        ),
    )
    return pb.payments.present(confirmed, activity = activity)
}
```

## Drop-in Compose components (`palbase-payments-ui`)

Every component in `palbase-payments-ui` is PCI-DSS SAQ-A compliant (raw PAN and CVV never enter your app) and styled with `PaymentAppearance` (`LocalPaymentAppearance`):

```kotlin
import studio.palbase.payments.PaymentResult
import studio.palbase.payments.formatMinorAmount
import studio.palbase.payments.payments
import studio.palbase.payments.ui.PaymentAppearance
import studio.palbase.payments.ui.SavedCardsView
import studio.palbase.payments.ui.SpendQRView
import studio.palbase.payments.ui.WalletTopUpSheet
import studio.palbase.payments.ui.rememberPaymentSheet

@Composable
fun PaymentsScreen(intentId: String) {
    val sheet = rememberPaymentSheet(pb, appearance = PaymentAppearance.Default)
    val walletState by pb.payments.walletState.collectAsState()
    var status by remember { mutableStateOf("") }

    Column {
        walletState.balance("try")?.let { b ->
            Text("Balance: ${formatMinorAmount(b.available, b.currency)}")
        }
        Button(onClick = {
            sheet.present(intentId) { result ->
                status = when (result) {
                    is PaymentResult.Succeeded -> "Paid ${result.intent.id}"
                    PaymentResult.Canceled -> "Canceled"
                    is PaymentResult.Failed -> result.message
                }
            }
        }) {
            Text("Pay Now")
        }
        if (status.isNotEmpty()) Text(status)
        SpendQRView(client = pb, walletKey = "try", ttlSeconds = 60L)
        SavedCardsView(client = pb)
        WalletTopUpSheet(client = pb, walletKey = "try", currency = "TRY") { result ->
            status = when (result) {
                is PaymentResult.Succeeded -> "Topped up ${result.intent.id}"
                PaymentResult.Canceled -> "Top-up canceled"
                is PaymentResult.Failed -> result.message
            }
        }
    }
}
```

## Related

- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout) · [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
- [Android SDK Overview](https://palbase.studio/docs/android/overview) · [Android In-App Purchases](https://palbase.studio/docs/android/iap)
