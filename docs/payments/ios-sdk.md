> The full documentation index: https://palbase.studio/llms.txt

# iOS SDK

`PalbasePayments` and `PalbasePaymentsUI` bring provider-agnostic card checkout (Stripe and iyzico), 3D Secure (`ASWebAuthenticationSession` + `WKWebView`), saved cards, BIN installments, billing portal, recurring subscriptions, and closed-loop wallets with CoreImage QR spend tokens to iOS 18+ and macOS 15+ apps.

## Install

Add `https://github.com/palgroup/palbase-swift` (0.24.0 or later) and link `PalbasePayments` for headless checkout, plus `PalbasePaymentsUI` when you want Palbase's optional drop-in PCI-DSS SAQ-A SwiftUI sheets:

```swift
.package(url: "https://github.com/palgroup/palbase-swift", from: "0.24.0")
```

Attach `.palbasePayments(pb.payments)` once at the root of your SwiftUI hierarchy and forward payment return URLs via `.onOpenURL`:

```swift
import Palbase
import PalbasePayments
import PalbasePaymentsUI
import SwiftUI

struct ShopRootView: View {
    var body: some View {
        CheckoutScreen()
            .palbasePayments(pb.payments)
            .onOpenURL { url in
                _ = pb.payments.handleReturnURL(url)
            }
    }
}

struct CheckoutScreen: View {
    @State private var showCheckout = false
    @State private var status = ""

    var body: some View {
        VStack(spacing: 16) {
            Button("Pay Now") { showCheckout = true }
            if !status.isEmpty { Text(status) }
        }
        .paymentSheet(
            intentId: "pi_example",
            clientSecret: nil,
            isPresented: $showCheckout
        ) { result in
            switch result {
            case .completed(let intent): status = "Paid \(intent.id)"
            case .canceled: status = "Canceled"
            case .failed(_, _, _, let message): status = message
            case .processing(let intent): status = "Processing \(intent.id)"
            @unknown default: break
            }
        }
    }
}
```

## Headless API (`pb.payments`)

| Surface | Methods / Properties | What it does |
|---|---|---|
| Discovery | `capabilities(currency:channel:)`, `installments(amount:currency:bin:methodId:channel:)` | Reads active channel feature flags and Turkish BIN installment tables. |
| Checkout | `getIntent(_:clientSecret:)`, `confirm(_:options:)`, `submitOtp(_:challengeId:otp:clientSecret:saveMethod:)`, `present(_:options:)`, `waitForIntent(_:clientSecret:timeout:)` | Confirms server-created PaymentIntents, executes canonical `NextAction` (`redirect`, `embed`, `otp`), and awaits settlement over `payment_intent:<ref>:<id>` with zero polling. |
| Return links | `handleReturnURL(_:)`, `Payments.parseReturnURL(_:)` | Resumes in-flight `ASWebAuthenticationSession` or deep-link redirects. |
| Saved cards | `methods.list()`, `methods.add(channel:vault:phone:returnURL:cancelURL:)`, `methods.remove(_:)` | Lists, vaults (Stripe and iyzico), and removes tokenized cards. |
| Billing profile | `profile.get()`, `profile.update(_:)` | Reads and updates buyer identity and address fields required by Turkish card processors. |
| Wallets & QR | `wallet.state`, `wallet.balances()`, `wallet.balance(_:)`, `wallet.topUp(_:)`, `wallet.createSpendToken(walletKey:maxAmount:ttlSeconds:)`, `wallet.balancesUpdates` | `@Observable` live balances over `payments:<ref>:<uid>`, card-to-wallet top-ups, and single-use `pst_...` QR spend tokens. |
| Subscriptions | `subscriptions.list(limit:cursor:)`, `subscriptions.cancel(_:)`, `portal(returnURL:channel:)` | Lists/cancels recurring subscriptions and opens a self-service billing portal session. |
| Plugins | `register(_:)`, `unregister(pluginId:)` | Optional `PaymentMethodPlugin` extension slot for native wallets. |

```swift
import Palbase
import PalbasePayments

func confirmAndPresent(intentId: String, clientSecret: String?) async throws -> PaymentResult {
    let caps = try await pb.payments.capabilities(currency: "TRY")
    let intent = try await pb.payments.confirm(
        intentId,
        options: ConfirmIntentOptions(clientSecret: clientSecret, saveMethod: caps.capabilities.savedCards)
    )
    return try await pb.payments.present(intent, options: PresentIntentOptions(clientSecret: clientSecret))
}
```

## Drop-in SwiftUI components (`PalbasePaymentsUI`)

Every component in `PalbasePaymentsUI` is PCI-DSS SAQ-A compliant (raw PAN and CVV never enter your app) and styled with `PaymentAppearance` (`.paymentAppearance(...)`):

```swift
import Palbase
import PalbasePayments
import PalbasePaymentsUI
import SwiftUI

struct WalletHubView: View {
    @State private var showTopUp = false

    var body: some View {
        VStack(spacing: 20) {
            if let wallet = pb.payments.wallet.state.balance(for: "try") {
                Text("Available: \(PaymentFormatting.format(minorUnits: wallet.available, currency: wallet.currency))")
            }
            SpendQRView(walletKey: "try", ttlSeconds: 60)
            SavedCardsView()
            Button("Top Up") { showTopUp = true }
        }
        .sheet(isPresented: $showTopUp) {
            WalletTopUpSheet(walletKey: "try", currency: "TRY", presetAmounts: [10000, 25000, 50000]) { _ in
                showTopUp = false
            }
        }
        .paymentAppearance(PaymentAppearance(accent: .primary, cornerRadius: 12))
    }
}
```

## Related

- [Checkout & PaymentSheet](https://palbase.studio/docs/payments/checkout) · [Wallets & QR Spend Tokens](https://palbase.studio/docs/payments/wallet-qr)
- [iOS SDK Overview](https://palbase.studio/docs/ios/overview) · [iOS In-App Purchases](https://palbase.studio/docs/ios/iap)
