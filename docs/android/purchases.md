> The full documentation index: https://palbase.studio/llms.txt

# Purchases

`pb.purchases` (`studio.palbase:palbase-purchases`) is what the signed-in customer has, whatever store they bought in, and buying on Google Play. What they have is one answer, `CustomerInfo`, the same the web, the iOS app and the project's backend read: a Pro bought on the web is this app's Pro too. Buying goes through Google Play Billing 9, which the artifact brings with it.

Google Play is connected to the environment first: the service account Play Console invites, the Android app linked, and Play's notifications ([Google Play](https://palbase.studio/docs/purchases/google-play)). The catalog's `android` plans are what the app sells ([Catalog](https://palbase.studio/docs/purchases/catalog)).

## Quick example

```kotlin
import studio.palbase.purchases.PurchaseResult
import studio.palbase.purchases.StoreProduct
import studio.palbase.purchases.isEntitled
import studio.palbase.purchases.purchases

class PaywallViewModel : ViewModel() {
    val products = MutableStateFlow<List<StoreProduct>>(emptyList())
    val isPro = MutableStateFlow(false)
    val message = MutableStateFlow("")

    init {
        viewModelScope.launch {
            val found = pb.purchases.products()
            products.value = found.products
            found.diagnosis?.let { Log.w("Paywall", it.toString()) }   // why Play returned fewer
        }
        viewModelScope.launch {
            // Kept current: a purchase on another device or in another store, a renewal, a refund.
            pb.purchases.customerInfoUpdates.collect { info -> isPro.value = info?.isEntitled("pro") ?: false }
        }
    }

    fun buy(activity: Activity, product: StoreProduct) = viewModelScope.launch {
        when (val result = pb.purchases.purchase(activity, product)) {
            is PurchaseResult.Purchased -> isPro.value = result.customerInfo.isEntitled("pro")
            is PurchaseResult.AlreadyEntitled -> message.value = "${result.entitlement} is already yours, from ${result.store.value}"
            PurchaseResult.Pending -> message.value = "Waiting for the payment"
            PurchaseResult.Cancelled -> Unit
        }
    }

    fun restore() = viewModelScope.launch {
        isPro.value = pb.purchases.restore().isEntitled("pro")
    }
}
```

Touch `pb.purchases` at launch, in the `Application`, even before a paywall is shown. What Play holds unreported (a report that failed, a pending purchase since paid, one made outside the app) is reported then, as whoever is signed in.

## What the customer has

| Member | What it is |
|---|---|
| `customerInfo()` | Everything the signed-in customer has, read now. |
| `latest` | The newest known: what listeners were last told, or the app's own last read. `null` before any, and for anyone but who is signed in now. |
| `isEntitled(key)` | Whether the customer has the entitlement now, from `latest`. `false` when nothing is known. |
| `onCustomerInfo { info -> }` | Called once it is read, then each time it changes, and with `null` while no one is signed in. Returns what stops it. Called on a background thread. |
| `customerInfoUpdates` | The same, as a `Flow<CustomerInfo?>`; the newest when the collector falls behind. |
| `offerings(channel)` | The paywall's catalog: each product's text and price on a channel, this app's (`OfferingsChannel.ANDROID`) unless another is named. |

`CustomerInfo` holds `entitlements` (by key: `active`, `expiresAt`, `willRenew`, `billingIssue`, `store`, `isSandbox`, `manage`), `subscriptions`, one-time `purchases`, `credits` balances, `limits` and their use, and `guest` for a guest customer. `info.isEntitled("pro")` is the entitlement active and, unless it is for life, ending after now: the rule the backend's `isEntitled` reads.

What the customer has is kept current while it is listened to. The customer's own realtime channel says when it changed, and it is read again then. When another user signs in, their channel is followed, and listeners hear `null` until theirs is read: one user's is never shown as the next one's. A read that fails is asked again a few times, then on the next change or the app's return to the foreground. A listener is told what is, never an error.

## Buying on Google Play

`products()` returns the catalog's Android plans as Google Play has them for this user, in the catalog's order: a subscription once per base plan. A product Play does not return is left out, never silently: `diagnosis` names it, with Play's reason and the likely causes (also logged, tag `Palbase`). It throws `PurchasesException` when Play Billing fails, and `PalbaseError` when the catalog cannot be read.

| `StoreProduct` | What it is |
|---|---|
| `id`, `basePlanId`, `offerId` | Google Play's product id, a subscription's base plan, and the offer it is bought with (its introductory offer, when the catalog's plan has one and Play says the user may take it). |
| `name`, `title`, `description` | As Google Play has them, in the user's language. |
| `formattedPrice`, `priceAmountMicros`, `priceCurrencyCode` | The price for the user's country: a one-time product's, or the price a subscription renews at. |
| `billingPeriod` | A subscription's period, ISO 8601 (`P1M`, `P1Y`). |
| `entitlements` | What buying it gives. |
| `offering`, `plan` | The catalog's product and plan it was paired with. |
| `productDetails` | Play's own `ProductDetails`: its offers and every pricing phase. |

`purchase(activity, product, planChange)` opens Google Play's purchase sheet over `activity`. What the customer has is read first: an entitlement it gives that is already on from another store answers `AlreadyEntitled` without opening Play, so nothing is charged twice. Otherwise Play sells it with the customer's obfuscated account id, and the purchase is reported to the environment, which reads it from Play and acknowledges it (a consumable's is consumed). The SDK never acknowledges a purchase itself. A report that fails leaves the purchase unacknowledged, and it is reported again at the next start.

| `PurchaseResult` | What it means |
|---|---|
| `Purchased(customerInfo)` | Bought, and the environment has it. |
| `AlreadyEntitled(store, entitlement, manage)` | An entitlement it gives is already on, from another store or from this Google account on Play. `manage` is where it is managed: the web's is the Stripe portal. |
| `Cancelled` | The user closed the sheet. |
| `Pending` | Waiting for the payment, or a parent's approval. Once it is paid, Play hands the purchase over, it is reported, and listeners are told. |

Play's failures throw `PurchasesException`, whose `code` is one of `PurchasesException.Code`: `PRODUCT_UNAVAILABLE`, `ALREADY_OWNED`, `BILLING_UNAVAILABLE`, `SERVICE_UNAVAILABLE` (try again in a moment), `NETWORK_ERROR`, `DEVELOPER_ERROR`, `PAYMENT_DECLINED`, `INELIGIBLE_FOR_OFFER`, `PURCHASE_IN_PROGRESS`, `PLAN_CHANGE_NOT_ALLOWED` and others. Its message is one sentence, and `responseCode` and `debugMessage` are Play's own, for a log. The environment's refusals throw `PalbaseError`, and so do `session_required` (no one signed in) and `session_changed` (the signed-in user changed meanwhile).

### Changing plans

A subscription bought while the customer has another plan of its group on Google Play replaces it. Play moves the customer over as `planChange` says, and the environment ends the old purchase. `PlanChange.DEFAULT` is Google's recommendation for the change:

| Between | An upgrade | A downgrade |
|---|---|---|
| Two subscriptions | Now: `CHARGE_PRORATED_PRICE` when the new plan costs more per day, `WITH_TIME_PRORATION` when it does not | At the old plan's renewal: `DEFERRED` |
| Two base plans of one subscription | Now, at the full price: `CHARGE_FULL_PRICE` | From the next billing date: `WITHOUT_PRORATION` |

To a prepaid plan the change is always `CHARGE_FULL_PRICE`. A mode Play does not take for the change throws `PLAN_CHANGE_NOT_ALLOWED`, naming the ones it does, before Play is opened. The plan the customer already has is not bought again: `AlreadyEntitled`.

### Restoring

`restore()` is "Restore purchases", the user's own action, never automatic. Everything this Google account owns on Play is reported as restored, so a purchase made while signed in as another of the app's accounts may move to this one. It answers what the customer has now. When a purchase stays where it was, the rest is still applied and it throws `PalbaseError`: `restore_account_owned` (403: a guest restoring an account's purchase must sign in to that account), `restore_other_account` (403: another account bought it — Play's obfuscated account id names that one), `restore_other_environment` (403: another environment of the project made it) or `restore_limit` (409: moved too often lately).

## Web purchases bought without an account

Someone who bought on the web without an account is sent a link that gives the purchase to whoever opens it in the app: `<package>://palbase/redeem?token=…`, or its page's `https://…/purchases/redeem?token=…`. The app redeems the link it was opened with, for the signed-in user (a guest too):

```kotlin
import studio.palbase.purchases.redemptionToken

override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val link = intent.dataString ?: return
    if (redemptionToken(link) != null) lifecycleScope.launch { pb.purchases.redeem(link) }
}
```

A link works once (`409 already_redeemed`). One past its hour (`410 redemption_expired`) sends a new one to the buyer's email. `redemptionToken(link)` says whether a link is one, without asking anything.

## Paywalls

The Android SDK at this version draws no paywall, and asks for no placement: the app shows its own screen, from `products()`, which carries Play's prices, and from `offerings()`, which carries the catalog's text. The paywalls the project publishes are drawn by the iOS and web SDKs ([Paywalls › In the app](https://palbase.studio/docs/purchases/paywalls#in-the-app)).

## On your server

Check the entitlement where the content is served, not only in the app: `Palbase.purchases.getCustomer` and `isEntitled` from `palbase/server`, and the `purchases.entitlement.changed` event ([Checking an entitlement](https://palbase.studio/docs/purchases/entitlements#checking-an-entitlement)). The app's answer decides what the app shows; what a purchase opens on your server is checked there.

## Related

- [Purchases](https://palbase.studio/docs/purchases/overview): the catalog, the stores and how a purchase becomes access
- [Google Play](https://palbase.studio/docs/purchases/google-play): connecting the environment to Google Play
- [Catalog](https://palbase.studio/docs/purchases/catalog): the products and plans the app sells
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): what `CustomerInfo` holds, and spending credits
- [Paywalls](https://palbase.studio/docs/purchases/paywalls): the paywalls the project publishes
- [Auth](https://palbase.studio/docs/android/auth#guests): guests, whose purchases stay theirs when they become an account
