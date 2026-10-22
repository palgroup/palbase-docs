> The full documentation index: https://palbase.studio/llms.txt

# App Store

The catalog's `ios` products are sold in the App Store with StoreKit 2: the app buys through `PalbasePurchases`, Apple takes the payment, and the environment verifies each transaction with Apple and keeps it in the ledger. Apple's App Store Server Notifications bring renewals, cancellations, billing issues and refunds to the environment, with the app closed.

An environment that sells in the App Store holds two of Apple's keys:

| Key | Made in App Store Connect | What the environment does with it |
|---|---|---|
| **App Store Connect API key** | **Users and Access › Integrations › App Store Connect API**, role App Manager | Writes the catalog to App Store Connect, points the app's server notifications at the environment, and runs the readiness checks. It is the same key Studio's **App Distribution** connects, for TestFlight and releases. |
| **In-App Purchase key** | **Users and Access › Integrations › In-App Purchase** | Verifies the app's purchases, reads its subscriptions from Apple, and signs promotional offers. |

Each goes from your computer (or a page of the environment's) straight to the environment, never through Studio.

## Connect the App Store

**1. Register the iOS app** with its bundle in the environment, if it is not yet — [iOS SDK › Connect the app to the project](https://palbase.studio/docs/ios/overview#connect-the-app-to-the-project):

```sh
palbase apps:create ios "Shop" --slug shop --team-id ABCDE12345
palbase apps:env:set shop --bundle com.example.shop -E staging
```

**2. Connect the App Store Connect API key:**

```sh
palbase stores:apple:connect --key-file AuthKey_ABC123DEF4.p8 --issuer-id 57246542-96fe-1a63-e053-0824d011072a -E staging
```

**3. Connect the In-App Purchase key**, for the app:

```sh
palbase purchases:apple:connect --key-file SubscriptionKey_XYZ987WVU6.p8 --app shop -E staging
```

Apple is asked, with a call that changes nothing, whether it takes the key for the app; then the environment keeps it, and has App Store Connect send the app's notifications — sandbox and production — to the environment's address. The key's id is read from the file's name, and the issuer is the one step 2 connected. In Studio, **Purchases › App Store** connects it. `--print-link` prints a link that takes the key in a browser instead, once, for 30 minutes. A key connected again replaces the one before.

**4. Bring App Store Connect to the catalog:** plan the catalog and confirm it ([Catalog › Bringing the stores to the catalog](https://palbase.studio/docs/purchases/catalog#bringing-the-stores-to-the-catalog)). Your subscription groups, subscriptions and in-app purchases are created in App Store Connect, with their text, prices and introductory offers.

**5. Check what selling still needs:**

```sh
palbase purchases:doctor -E staging
```

Apple is asked now. Each line is one check — ✓ holds, ✗ does not, `i` only informs — with the command or the place in App Store Connect that fixes it, and the command exits 1 until every check that is not informational holds. Studio's **Purchases › App Store** shows the same list.

| Check | Holds when |
|---|---|
| The In-App Purchase key | Apple takes it for the app. |
| Where the App Store reports | App Store Connect sends the app's notifications to this environment. |
| The TEST notification | Apple's TEST notification arrived: the address works. |
| The catalog confirmed | The newest revision of the catalog was confirmed for the stores. |
| The catalog in App Store Connect | App Store Connect holds that revision's products, each step's error said when it does not. |
| Test purchases | Informs: what test purchases open here ([settings](https://palbase.studio/docs/purchases/customers#settings)). |
| Xcode's purchases | Informs: whether Xcode's StoreKit Testing purchases are taken ([Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple)). |

When the app's notifications already go to another server, the environment does not take them over: the check says so. Clear both addresses in App Store Connect (**Apps › the app › App Information › App Store Server Notifications**), then run `palbase purchases:apple:connect` again.

`palbase purchases:apple` shows the connection as it is: the app, the key's id, the app's Apple ID once known, and where the App Store reports — never the key.

## Buying in the app

The app links `PalbasePurchases`, and `PalbasePurchasesUI` for paywalls drawn natively. `pb.purchases.products()` returns the catalog's iOS plans as the App Store has them for this user; `purchase(_:)` buys one; `restore()` is the user's own "Restore purchases". The SDK names the customer to StoreKit with their `appAccountToken`, reports each transaction to the environment and finishes it only once the environment has it, and listens to StoreKit's updates for whoever is signed in — so a renewal, an approved Ask to Buy or an interrupted purchase is reported too. See [iOS › Purchases](https://palbase.studio/docs/ios/purchases), and [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple) for the whole flow in Xcode and the sandbox.

When `products()` returns fewer products than the catalog sells on iOS, its `diagnosis` says which and the likely causes: a product not ready in App Store Connect, the Paid Apps agreement not active, a bundle id that is not the project's, a StoreKit configuration file that lacks them. `palbase purchases:doctor` checks each.

## What the environment does with a transaction

**It verifies it.** A transaction counts only as the App Store signed it, for the connected app, in the sandbox or production. A subscription's state is never taken from the device: it is read from Apple with the environment's key. One sent again applies nothing twice.

**It gives it to a customer.** A purchase nobody has is the customer's its `appAccountToken` names, or the reporting customer's; one another customer has stays theirs, unless one of two things moves it:

- **A new purchase on it** — a switch of plan, a resubscription, an offer bought — whose `appAccountToken` names another customer moves it to them, whoever reports it, the app or Apple's notification. On an Apple ID shared among the app's accounts (a family's iPhone), the subscription follows who paid, and so does the offer it was bought with. A purchase with no token, a renewal, and a transaction reported again or late move nothing.
- **A restore** moves a purchase to the restoring customer only from the device StoreKit signed it for, and never from an account to a guest.

A purchase moves at most 3 times in 30 days, restores and new purchases counted together. A restore, or a customer's own new purchase, that leaves a purchase where it was is refused with `403 restore_not_this_device`, `403 restore_account_owned` or `409 restore_limit`, after the rest of it is applied. A move emits `purchases.ownership.transferred`, whose `via` is `purchase` or `restore`.

**It follows Apple.** A notification about a purchase applies what Apple signed — the transaction, the renewal info, the subscription's status — and the newest by Apple's time is the state. A refund, a revoked Family Sharing purchase or a chargeback turns the entitlement off and takes back the credits it gave (`purchases.refund.changed`). A subscription the App Store could not renew keeps its access through Apple's grace period, with `billing_issue` on the entitlement.

**Production waits for the app's Apple ID.** Production purchases and notifications are taken once the app's Apple ID is known; the environment reads it when it sets the notification address.

## Offers and offer codes

A catalog offer on an iOS subscription is written to App Store Connect as a **promotional offer**, and the app buys with it — `purchase(_:offer:)` — under a signature the environment makes with the In-App Purchase key: no key is ever in the app. An **App Store offer code** is a coupon of Apple's, redeemed in the App Store's own sheet. See [Offers & Coupons](https://palbase.studio/docs/purchases/offers).

## Buying on the web from the iOS app

In the App Store's United States storefront, an app may link out to buy on the web beside In-App Purchase (App Review Guideline 3.1.1(a)). The SDK opens Stripe Checkout there for the signed-in customer and records the link with the checkout. See [Web › From a native app](https://palbase.studio/docs/purchases/web#from-a-native-app).

## Disconnecting

```sh
palbase purchases:apple:disconnect -E staging
```

The environment forgets the In-App Purchase key: the App Store's notifications and the app's reports are refused from then on, and purchases already made stay in the ledger. It emits `purchases.store.changed`, as connecting does.

## Related

- [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple): buying before anyone pays, in Xcode and in the sandbox
- [iOS › Purchases](https://palbase.studio/docs/ios/purchases): `pb.purchases` in a Swift app
- [Catalog](https://palbase.studio/docs/purchases/catalog) · [Offers & Coupons](https://palbase.studio/docs/purchases/offers)
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): checking access on your server
- CLI: [`purchases:apple:connect`](https://palbase.studio/docs/cli/reference#palbase-purchasesappleconnect), [`purchases:doctor`](https://palbase.studio/docs/cli/reference#palbase-purchasesdoctor), [`stores:apple:connect`](https://palbase.studio/docs/cli/reference#palbase-storesappleconnect)
