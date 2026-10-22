> The full documentation index: https://palbase.studio/llms.txt

# Google Play

The catalog's `android` products are sold on Google Play with Play Billing: the app buys through `palbase-purchases`, Google takes the payment, and the environment reads each purchase from Play, keeps it in the ledger and acknowledges it. Play's real-time developer notifications tell the environment when a purchase changes — a renewal, a cancellation, a refund — with the app closed.

No key changes hands. Palbase makes a service account for the environment, your Play Console invites it, and the environment reads and acknowledges the app's purchases as that account.

## Connect Google Play

**1. Register the Android app** with its package and signing certificates in the environment, if it is not yet — [Android SDK › Registering the app](https://palbase.studio/docs/android/overview#registering-the-app):

```sh
palbase apps:create android "Shop" --slug shop-android
palbase apps:env:set shop-android --package com.example.shop --sha256 play_signing=AB:CD:… -E staging
```

**2. Connect the environment to Google Play:**

```sh
palbase stores:google:connect -E staging
```

It prints the service account Palbase made. In Play Console, **Users and permissions**, invite it with the app and, for purchases, **View financial data** and **Manage orders and subscriptions**. Link the Android app to Google Play (`palbase stores:apps:link <app id>`), then check what the account reaches:

```sh
palbase stores:google:check -E staging
```

Studio's **App Distribution** does the same.

**3. Sell on Google Play in the app:**

```sh
palbase purchases:google:connect --app shop-android -E staging
```

Palbase makes the app's notifications topic, which Play's own account may publish to, and has it pushed to this environment's address. It prints the topic. In Studio, **Purchases › Stores › Google Play purchases** connects it and shows the topic.

**4. Name the topic in Play Console:** **Monetize with Play › Monetization setup › Real-time developer notifications**, paste the topic, **Save**, then **Send test notification**.

```sh
palbase purchases:google -E staging
```

It says when the test notification arrived — the topic is set — and what is left to do. Every environment of the project that sells in the app reads the same topic.

**5. Bring Google Play to the catalog:** plan the catalog and confirm it ([Catalog › Bringing the stores to the catalog](https://palbase.studio/docs/purchases/catalog#bringing-the-stores-to-the-catalog)). Each subscription product is created on Play with a base plan per plan, each other product as a one-time product, for the app connected in step 3.

## Buying in the app

The app takes `studio.palbase:palbase-purchases`, which brings Play Billing with it. `pb.purchases.products()` returns the catalog's Android plans as Play has them for this user — a subscription once per base plan — with a `diagnosis` when Play returned fewer than the catalog sells; `purchase(activity, product)` opens Play's purchase sheet; `restore()` is the user's own "Restore purchases". Touch `pb.purchases` at launch: what Play holds unreported — a report that failed, a pending purchase since paid, one made outside the app — is reported then. See [Android › Purchases](https://palbase.studio/docs/android/purchases).

Buying a subscription while the customer has another plan of its group on Play replaces it, as `PlanChange` says: by default an upgrade now and a downgrade at the renewal, as Google recommends.

## What the environment does with a purchase

**It reads it from Play.** Nothing of the device's word is taken: each purchase is read from Play by its token, as the environment's service account, and applied to the ledger. One reported again applies nothing twice.

**It gives it to a customer.** A purchase nobody has is the customer's its obfuscated account id names — the SDK buys with it, and nothing personal goes to Google — or the reporting customer's. Play makes each new purchase a purchase token of its own, so what each of the app's accounts buys on a Google account they share is theirs from the start. One another customer has stays theirs, unless restored: a restore moves it to the restoring customer, never from an account to a guest, and at most 3 times in 30 days. A purchase that stays where it was is answered, after the rest is applied, with `403 restore_account_owned` (a guest restoring an account's), `403 restore_other_account` (another account's obfuscated id names it: sign in to that account), `403 restore_other_environment` (another environment of the project made it) or `409 restore_limit`.

**It acknowledges it** once the ledger has it, and consumes a consumable: the SDK never does. Play refunds a purchase not acknowledged in three days. A purchase the catalog does not map gives nothing and is not acknowledged.

**It follows Play.** A notification only says something changed: the purchase is read again from Play, and a voided one from the app's voided purchases. A refund turns the entitlement off and takes back the credits it gave (`purchases.refund.changed`).

**Test purchases** are Google Play's license testers': `is_sandbox`, opening entitlements as the [settings](https://palbase.studio/docs/purchases/customers#settings) say.

## Offers

A catalog offer on an Android subscription is written to Play as a developer-determined offer of the subscription's base plans, tagged `palbase`. The Android SDK buys a plan with its introductory offer when the catalog's plan has one and Play says the user may take it. See [Offers & Coupons](https://palbase.studio/docs/purchases/offers).

## Disconnecting

```sh
palbase purchases:google:disconnect -E staging
```

Play's notifications stop reaching the environment and the app's reports are refused; purchases already made stay in the ledger. The app's topic stays, for the other environments that read it. `palbase stores:google:disconnect` deletes the environment's service account at Google: Play Console's invite of it then reaches nothing.

Connecting, a test notification arriving and disconnecting each emit `purchases.store.changed`.

## Related

- [Android › Purchases](https://palbase.studio/docs/android/purchases): `pb.purchases` in a Kotlin app
- [Catalog](https://palbase.studio/docs/purchases/catalog) · [Offers & Coupons](https://palbase.studio/docs/purchases/offers)
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): checking access on your server
- CLI: [`stores:google:connect`](https://palbase.studio/docs/cli/reference#palbase-storesgoogleconnect), [`purchases:google:connect`](https://palbase.studio/docs/cli/reference#palbase-purchasesgoogleconnect), [`purchases:google`](https://palbase.studio/docs/cli/reference#palbase-purchasesgoogle)
