> The full documentation index: https://palbase.studio/llms.txt

# Test Apple Purchases

There are two ways to buy your app's products before anyone pays for them. Both use the catalog you already have, and Palbase writes nothing into your Xcode project.

| | A. In Xcode | B. In the App Store sandbox |
|---|---|---|
| What sells the product | Xcode, from a file made from your catalog | The App Store, with your products in App Store Connect |
| What you need from Apple | Nothing | A developer account, its agreements, two keys, a sandbox tester |
| Where it runs | Simulator or a device, run from Xcode | A device (or TestFlight) |
| Steps | **5**, about two minutes | **7**, the first time |
| Use it for | Building the paywall, every purchase flow, renewals in seconds | The last check before release: real App Store products, real server notifications |

Start with A. Move to B once your products are in App Store Connect.

Both run against a **test environment** of your project (`staging`, say), never the production one: production takes only purchases the App Store itself signed.

In Studio, **Purchases › App Store** shows the environment's In-App Purchase key, the readiness list, Xcode's certificate and the team's sandbox testers: each step below that has a command can be done there too.

## A. In Xcode, with no App Store (5 steps)

**1. Make the StoreKit file from your catalog.**

```sh
palbase purchases:storekit -E staging
```

It reads the environment's iOS offerings and writes one file, `palbase/environments/staging/<app>.storekit`: every iOS plan as the App Store product its store id names, with its text in each language the catalog has, its price, its subscription group and level, and its introductory offer. Nothing outside `palbase/` is written.

**2. Point the scheme at it.** In Xcode, **Product › Scheme › Edit Scheme… › Run › Options › StoreKit Configuration**, choose the file. If it is not listed, add it from that same menu.

**3. Save Xcode's certificate.** Select the `.storekit` file in the Project navigator, then **Editor › Save Public Certificate**. Purchases in this mode are signed by Xcode, not by Apple, with this certificate.

**4. Let the environment take Xcode's purchases.**

```sh
palbase purchases:apple:xcode-certificate ~/Desktop/StoreKitTestCertificate.cer -E staging
```

The environment now takes purchases signed with that certificate and records them as test purchases. Studio does the same under **Purchases › App Store › Xcode StoreKit Testing**. On the production environment both refuse.

**5. Run the app and buy.** Xcode shows its own payment sheet; no Apple account is asked for. The customer has the entitlement as soon as the app reports the purchase:

```sh
palbase purchases:customer:get <user id> -E staging
```

### When the catalog changes

Run `palbase purchases:storekit -E staging` again. The same catalog makes the same file. What you set from Xcode's **Editor** menu while the file is open (the storefront, the subscription renewal rate, Ask to Buy, an error to force) is kept.

The prices are in one storefront's currency: the price you entered, or the amount you set by hand for that currency. `--storefront DEU` makes the file for another storefront; a plan with no price in its currency keeps its own amount, and the command says which.

### Renewals, refunds and errors

- **Renewals in seconds:** open the `.storekit` file and choose **Editor › Subscription Renewal Rate**.
- **Refund, expire, cancel a purchase:** while the app runs, **Debug › StoreKit › Manage Transactions…**, select the transaction, then **Refund Purchase**. StoreKit hands the refunded transaction to the app, the app reports it, and the entitlement turns off as it would after an App Store refund.
- **Ask to Buy, failed payments, StoreKit errors:** the **Editor** menu of the open `.storekit` file.

## B. In the App Store sandbox (7 steps)

**1. Connect App Store Connect.** In App Store Connect, **Users and Access › Integrations › App Store Connect API**, make a key with the App Manager role and download it once.

```sh
palbase stores:apple:connect --key-file AuthKey_ABC123DEF4.p8 --issuer-id 57246542-96fe-1a63-e053-0824d011072a -E staging
```

Studio connects it under **App Distribution**.

**2. Connect the In-App Purchase key.** In the same place, the **In-App Purchase** tab, make a key. The environment verifies purchases and reads subscriptions with it.

```sh
palbase purchases:apple:connect --key-file SubscriptionKey_XYZ987WVU6.p8 -E staging
```

The issuer is the one step 1 connected; the key's id is read from the file's name. Studio connects it under **Purchases › App Store**. Both keys go from your computer straight to the environment, never through Studio.

**3. Put the catalog in App Store Connect.** In Studio, **Purchases › Stores**, plan the stores and confirm the plan; or from a terminal:

```sh
palbase purchases:catalog:plan -E staging
palbase purchases:catalog:confirm <plan id> --hash <hash> -E staging
```

Your products, subscription groups, prices and introductory offers are created in App Store Connect, and what Apple holds of each is shown under the plan. Apple can take up to an hour to show a new product in the sandbox.

**4. Check everything is ready.**

```sh
palbase purchases:doctor -E staging
```

Each line is one check: ✓ holds, ✗ does not, and `i` only says how things are. Under each ✗ is the command or the place in App Store Connect that fixes it. Run it again until every ✗ is gone. Studio's **Purchases › App Store** shows the same list.

**5. Make a sandbox tester.** In App Store Connect, **Users and Access › Sandbox**, click **+**, and give a name, an email address that is not an Apple Account yet, a password and a country or region.

**6. Sign in on the device.** Run the app from Xcode with the scheme's **StoreKit Configuration** set to **None**, and start a purchase. When the App Store asks you to sign in, use the tester. From then on the tester is under **Settings › Developer › Sandbox Apple Account**; your own Apple Account stays signed in.

**7. Buy.** The App Store's sheet says **[Environment: Sandbox]**. Nothing is charged. Apple's server notification about the purchase reaches the environment too; it is still one purchase.

### Renewals, history and interruptions

A sandbox subscription renews on a short clock and stops after 12 renewals. Make it faster:

```sh
palbase stores:apple:sandbox-testers -E staging
palbase stores:apple:sandbox-testers:set tester@example.com --renewal 3m -E staging
```

To buy the same products again, or to be eligible for an introductory offer again, clear the tester's history:

```sh
palbase stores:apple:sandbox-testers:clear tester@example.com -E staging
```

Then sign out of the sandbox account on the device and in again. `--interrupt on` makes the tester's next purchases stop halfway, as when a bank asks for a confirmation. Studio's **Purchases › App Store › Sandbox testers** changes the same settings and clears the same history.

The device has the same settings under **Settings › Developer › Sandbox Apple Account › Manage**.

### Refunds

Ask for one from the app, with StoreKit's refund sheet (`refundRequestSheet(for:isPresented:)` in SwiftUI). In the sandbox, any reason approves the refund. For a declined one, choose **Other** and type `DECLINE`; for a partial one, `GRANT_PRORATED`. The entitlement turns off and the refund's event reaches your backend.

## The app's code

The same code runs in both ways; StoreKit decides where the purchase goes. `pb` is the app's `PalbaseClient`.

```swift
import Palbase
import PalbasePurchases
import SwiftUI

struct Paywall: View {
    @State private var products: [Purchases.StoreProduct] = []
    @State private var isPro = false
    @State private var message = ""

    var body: some View {
        List {
            ForEach(products) { p in
                Button("\(p.product.displayName) — \(p.product.displayPrice)") {
                    Task { await buy(p) }
                }
            }
            Button("Restore purchases") {
                Task { isPro = (try? await pb.purchases.restore())?.isEntitled("pro") ?? isPro }
            }
            Text(isPro ? "Pro is on" : message)
        }
        .task { products = (try? await pb.purchases.products())?.products ?? [] }
        .task {
            // Kept current: a purchase on another device, a renewal, a refund.
            for await info in pb.purchases.customerInfoUpdates {
                isPro = info?.isEntitled("pro") ?? false
            }
        }
    }

    private func buy(_ product: Purchases.StoreProduct) async {
        do {
            switch try await pb.purchases.purchase(product) {
            case .purchased(let info): isPro = info.isEntitled("pro")
            case .alreadyEntitled(_, let entitlement, _): message = "\(entitlement) is already yours, bought elsewhere"
            case .pending: message = "Waiting for approval"
            case .cancelled: break
            }
        } catch {
            message = "\(error)"
        }
    }
}
```

`products()` returns only what the App Store (or Xcode) has. When some of the catalog's iOS products are missing, `products()` says why in `diagnosis`: a product id Xcode's file or App Store Connect does not have, or a bundle id that is not the app's.

## On your server

Check the entitlement where the content is served, not only in the app:

```ts
// src/modules/premium/premium.controller.ts
import { Controller, Forbidden, Get, Palbase, User, type UserT } from "palbase/backend";
import { isEntitled } from "palbase/server";

@Controller("/premium")
export class PremiumController {
  @Get("")
  async premium(@User() user: UserT): Promise<{ pro: true }> {
    // A user who has bought nothing is read as a customer with nothing.
    const { data } = await Palbase.purchases.getCustomer({ path: { customer_id: user.id } });
    if (!isEntitled(data, "pro")) throw new Forbidden("Pro is needed", "entitlement_required");
    return { pro: true };
  }
}
```

And act when something changes, with a typed event:

```ts
// src/modules/premium/purchase-events.ts
import { Log, On, type PlatformEvent } from "palbase/backend";

export class PurchaseEvents {
  @On("purchases.entitlement.changed")
  changed(event: PlatformEvent<"purchases.entitlement.changed">): void {
    const { customer_id, entitlement, active, is_sandbox } = event.data;
    Log.info("entitlement changed", { customer_id, entitlement, active, test: is_sandbox });
  }

  @On("purchases.refund.changed")
  refunded(event: PlatformEvent<"purchases.refund.changed">): void {
    Log.info("payment taken back", { customer_id: event.data.customer_id, share: event.data.share_milli / 1000 });
  }
}
```

```ts
// src/modules/premium/premium.module.ts
import { Module } from "palbase/backend";
import { PremiumController } from "./premium.controller";
import { PurchaseEvents } from "./purchase-events";

@Module({ controllers: [PremiumController], providers: [PurchaseEvents] })
export class PremiumModule {}
```

A test purchase is marked: `is_sandbox` is `true` in its events and in what the customer has.

## When something is missing

| What you see | Why, and what to do |
|---|---|
| `products()` is empty in Xcode | The scheme has no StoreKit Configuration, or the file is older than the catalog: run `palbase purchases:storekit` again. |
| The purchase works in Xcode but the customer has nothing | The environment does not take Xcode's certificate yet: step A4. |
| `products()` is empty on a device | `palbase purchases:doctor` names it: the catalog is not in App Store Connect yet, an agreement is not signed, or the product is less than an hour old. |
| No **[Environment: Sandbox]** on the sheet | The scheme still points at the `.storekit` file: set it to **None** (B6). |
| The tester cannot buy again | Clear its history (`palbase stores:apple:sandbox-testers:clear`), then sign out and in on the device. |

## Related

- [App Store](https://palbase.studio/docs/purchases/app-store): the keys, the server notifications, and what the environment does with each transaction
- [Catalog](https://palbase.studio/docs/purchases/catalog): the products the StoreKit file is made from
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): `CustomerInfo`, `isEntitled` and every `purchases.*` event
- [Event Hooks](https://palbase.studio/docs/backend/hooks): `@On` handlers in a `palbase/backend` app
- [Webhooks](https://palbase.studio/docs/server/webhooks): the same events in any server, with `palbase/server`
- [Server SDK Overview](https://palbase.studio/docs/server/overview): `createServer`, refusals and retries
