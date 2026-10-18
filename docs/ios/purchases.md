> The full documentation index: https://palbase.studio/llms.txt

# Purchases

`pb.purchases` (the `PalbasePurchases` product) is what the signed-in customer has bought, in any store, as one answer, and buying in the App Store with StoreKit 2. A Pro bought on the web or on Google Play is this app's Pro too. `PalbasePurchasesUI` draws the paywall the project publishes, natively in SwiftUI, priced by the App Store. The catalog (products, plans, entitlements, offers) is the project's ([Catalog](https://palbase.studio/docs/purchases/catalog)), and the environment verifies every transaction with Apple ([App Store](https://palbase.studio/docs/purchases/app-store)).

## Quick example

```swift
import Palbase
import PalbasePurchases
import PalbasePurchasesUI
import SwiftUI

struct Settings: View {
    @State private var showPaywall = false

    var body: some View {
        List {
            // Drawn again when it changes: a purchase in any store, a renewal or its end, a refund.
            if pb.purchases.state.isEntitled("pro") {
                Text("Pro is on")
            } else {
                Button("Go Pro") { showPaywall = true }
            }
        }
        .paywall(placement: "settings", isPresented: $showPaywall)
    }
}

@main
struct ShopApp: App {
    init() {
        // Touched at launch: what the App Store hands over (a renewal, an approved Ask to Buy, an unfinished
        // purchase) is reported for whoever is signed in.
        _ = pb.purchases
    }

    var body: some Scene {
        WindowGroup {
            Settings()
                .palbasePurchases(pb.purchases)   // once, at the root: the paywalls below buy through it
                .paywallLinks(terms: URL(string: "https://example.com/terms"), privacy: URL(string: "https://example.com/privacy"))
        }
    }
}
```

## What the customer has

`CustomerInfo` is the same answer the web and your backend read: `entitlements` by key (each with `active`, `expiresAt`, `willRenew`, `store`, `billingIssue`, `isSandbox`, `periodType`, `manage`), `subscriptions`, one-time `purchases`, `credits` and `limits`, and whether the customer is a `guest`.

| Member | What it does |
|---|---|
| `state` | An `@Observable` on the main actor: `state.customerInfo`, and `state.isEntitled(_:)`. Read once, it keeps listening while the app runs. |
| `customerInfo()` | Reads it now. Throws `session_changed` when the signed-in user changed while it was read. |
| `isEntitled(_:at:)` | Whether the customer has the entitlement now, from what was last read: active and, unless it is for life, ending after now. `CustomerInfo.isEntitled(_:at:)` is the same rule, the one `palbase/server`'s `isEntitled` reads on a backend. |
| `latest` | What listeners were last told, without a call. |
| `onCustomerInfo(_:)` | Told what the customer has, once read and each time it changes; `nil` while no one is signed in. Returns what stops it. |
| `customerInfoUpdates` | The same as an `AsyncStream`, the newest when the reader falls behind. |

It is kept current over the customer's own realtime channel, theirs alone and read-only: when what they have changes anywhere, it is read again. When another user signs in, `nil` is told until theirs is read, so one user's is never shown as the next one's. Check the entitlement on your server too, where the content is served ([Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements#checking-an-entitlement)).

## Buying in the App Store

```swift
import Palbase
import PalbasePurchases

func buyFirst() async {
    do {
        let products = try await pb.purchases.products()
        if let d = products.diagnosis { print(d) } // why some of the catalog is missing
        guard let pro = products.first else { return }
        switch try await pb.purchases.purchase(pro) {
        case .purchased(let info): print("pro:", info.isEntitled("pro"))
        case .alreadyEntitled(let store, let entitlement, _): print("\(entitlement) is already on, from \(store)")
        case .pending: print("waiting for approval")
        case .cancelled: break
        }
    } catch let e as PurchasesError {
        print(e.message, e.code)
    } catch {
        print(error)
    }
}
```

| Method | What it does |
|---|---|
| `products()` | The catalog's iOS plans as the App Store has them for this user, in the catalog's order, as `StoreProduct`s: StoreKit's `product` (its `displayName`, `displayPrice`, subscription), the catalog's `offering` and `plan`, and the `entitlements` it gives. When the App Store returned fewer than the catalog sells on iOS, `diagnosis` names the missing ids and the likely causes. |
| `purchase(_:)` | Buys a product for the signed-in customer. |
| `restore()` | "Restore purchases", the user's own action, never automatic: the App Store is synced (it may ask the user to sign in), and what this Apple ID owns is reported as restored. Answers what the customer has now. |
| `offerings(channel:)` | The paywall's catalog on a channel, iOS unless another is named. |

`purchase(_:)` reads what the customer has first: when an entitlement the product gives is already on from another store, it answers `.alreadyEntitled(store:entitlement:manage:)` and the App Store is never opened, so nothing is charged twice. Otherwise the App Store sells it with the customer's account token, the transaction is reported to the environment, and it is finished only once the environment has it: a report that fails leaves it unfinished, and the App Store hands it over again. `.pending` is Ask to Buy or the bank's approval: the transaction is reported when it comes, and listeners are told.

A purchase needs someone signed in (`session_required`); a guest from `signInAnonymously()` is someone, and what a guest buys stays theirs when they become an account. StoreKit's failures throw `PurchasesError`, one sentence each, with a `code`: `.cancelled`, `.productUnavailable`, `.purchaseNotAllowed`, `.notAvailableInStorefront`, `.ineligibleForOffer`, `.invalidOffer`, `.networkError`, `.systemError`, `.unverifiedTransaction` (never reported, never finished) and others. The environment's refusals throw `PalbaseError`.

A restore moves a purchase to this customer only when StoreKit signed its transaction for this device. When one stays where it was, the rest is still applied, and `restore()` throws `PalbaseError` with `restore_not_this_device`, `restore_account_owned` (a guest restoring an account's: sign in to that account) or `restore_limit`.

## The paywall

The paywall the project publishes at a **placement** ([Paywalls](https://palbase.studio/docs/purchases/paywalls)), designed in Studio, is drawn natively by `PaywallView`: its theme, components, packages, tabs, carousels, videos and fonts, with the App Store's prices for this user in their currency, its texts in the app's language, Dynamic Type, Reduce Motion and VoiceOver. Its purchase button buys with `purchase(_:)`, with an offer while the customer may take it; a restore button is `restore()`; an offer code button opens the App Store's sheet.

| | What it does |
|---|---|
| `.palbasePurchases(pb.purchases)` | Once, at the root: the purchases module the paywalls below buy through. |
| `.paywall(placement:attributes:isPresented:onPurchased:)` | Shows the placement's paywall over the screen while `isPresented`. |
| `.presentPaywallIfNeeded(entitlement:placement:attributes:onPurchased:)` | Shows it once what the customer has is known, only when they do not have the entitlement, and closes it when they come to have it. |
| `PaywallView(placement:attributes:onPurchased:onClose:)` | The paywall as a view of your own layout. |
| `.paywallLinks(terms:privacy:)` | The app's terms and privacy policy, which a paywall's links open. |
| `.paywallComponent(_:_:)` | Draws your own view in place of the component Studio names `id`, in every paywall below. |

The paywall is asked for the signed-in customer (or this install, so an experiment's variant is the same every time) and kept on the device: asked again with its ETag, and shown as it was when the project cannot be asked. With nothing published at the placement, the SDK draws its own from the catalog. `attributes` is what the app says of the person to the placement's targeting rules (`["plan": "free"]`); the rules also read the app's version, the SDK's, the App Store's country and the person's languages. `pb.purchases.preloadPaywall(placement:attributes:)` at launch makes a placement shown early open at once, and offline.

An app that draws its own reads `pb.purchases.paywall(placement:attributes:)`, which answers the definition, its offerings, its files and offers, and calls `paywallShown(_:)` each time it puts one on screen.

## Offers and codes

Offers and coupons are the catalog's ([Offers & Coupons](https://palbase.studio/docs/purchases/offers)).

| Method | What it does |
|---|---|
| `offers()` | The catalog's offers the customer may take now: a `discount` or a `trial` bought with the offer, or a `grant`, an entitlement for a while with no store. |
| `purchase(_:offer:)` | Buys a product with a discount or a free trial, under Apple's signature of the promotional offer, which the environment makes with its In-App Purchase key: no key is in the app. |
| `claim(_:)` | Claims a grant offer: its entitlement, for its duration, from now. |
| `take(offer:)` | Takes an offer by its key: claims a grant, or buys with a discount or trial. What an in-app message's offer button does. |
| `redeem(code:)` | Redeems a coupon code the customer typed. A refusal throws `CouponError` (`coupon_not_found`, `coupon_redeemed`, `coupon_ended`, `sign_in_required`, `too_many_attempts`, …); an App Store offer code is `.redeemAtAppStore`. |
| `presentOfferCodeRedemption()` | Shows the App Store's sheet for an offer code App Store Connect made. |
| `offerShown(_:)` | Counts an offer shown, as the app puts it in front of the customer. |

## Buying on the web from the app

In the App Store's United States storefront, an app may link out to buy on the web beside In-App Purchase (App Review Guideline 3.1.1(a)). `canOpenWebCheckout()` says whether the customer's storefront is one where it may; show the web button only then, no more prominent than the In-App Purchase. `openWebCheckout(product:plan:successURL:cancelURL:)` opens Stripe Checkout in the system browser for the signed-in customer, a guest too, and records where it was opened. Elsewhere it throws `web_checkout_not_allowed` and asks nothing. Stripe sends the customer back to the app's own scheme, its bundle id (`<bundle>://palbase/checkout?result=…`), and what they have is read again when the app is in front. See [Web Purchases](https://palbase.studio/docs/purchases/web#from-a-native-app).

What someone bought on the web with no account waits for the app user who redeems it: its one-time link opens the app, and `redeem(_:)` takes it for the signed-in user.

```swift
import Palbase
import PalbasePurchases
import SwiftUI

struct Root: View {
    var body: some View {
        Text("Shop")
            .onOpenURL { url in
                guard Purchases.redemptionToken(in: url) != nil else { return }
                Task { _ = try? await pb.purchases.redeem(url) }
            }
    }
}
```

## Testing

In Xcode with a StoreKit file made from the catalog, or in the App Store sandbox with a tester: see [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple). A test purchase is marked: `isSandbox` is true on what it gives.

## Related

- [Purchases](https://palbase.studio/docs/purchases/overview): the catalog, the stores and how a purchase becomes access
- [App Store](https://palbase.studio/docs/purchases/app-store): connecting it, and what the environment does with a transaction
- [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple): buying before anyone pays
- [Web Purchases](https://palbase.studio/docs/purchases/web): Stripe Checkout, and a buyer with no account
- [Paywalls](https://palbase.studio/docs/purchases/paywalls) · [Offers & Coupons](https://palbase.studio/docs/purchases/offers) · [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements)
- [Notifications](https://palbase.studio/docs/ios/notifications#in-app-messages): an in-app message's paywall and offer buttons
