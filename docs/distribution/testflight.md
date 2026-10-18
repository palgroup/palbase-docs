> The full documentation index: https://palbase.studio/llms.txt

# TestFlight

An iOS app's builds go to TestFlight with your own Apple account. Your build machine uploads an unsigned `.ipa`. Palbase registers each bundle's id, turns on the capabilities its entitlements need, makes its App Store profile, signs it with the account's distribution certificate, uploads it to App Store Connect, waits for Apple to process it, and gives it to your groups of testers. The certificate's private key never leaves Palbase, and no Apple ID signs in on the build machine.

The steps that change something at Apple for good (Beta App Review, the export compliance answer, expiring a build) are planned and wait for a person to confirm them: [Actions](https://palbase.studio/docs/distribution/overview#actions).

## Connect App Store Connect

In App Store Connect, **Users and Access › Integrations › App Store Connect API**, make a key with the **App Manager** role or above, and download its `.p8` file (Apple lets you once). The page shows the issuer id.

```sh
palbase stores:apple:connect --key-file AuthKey_ABC123DEF4.p8 --issuer-id 57246542-96fe-1a63-e053-0824d011072a -E main
```

The key's id is read from the file's name. The CLI asks Studio for a one-time grant alone and posts the key with it to the environment's own address: the key never goes through Studio. `--print-link` prints a page that takes the key in a browser instead, good for 30 minutes and once. In Studio, **App Distribution › Overview › Connect Apple account** opens the same page.

The environment checks the key with Apple and keeps it sealed with its own data key. `palbase stores:apple` then shows the account:

| | |
|---|---|
| Status | `active`; `agreement` — Apple refuses every call until the Account Holder accepts the account's agreements in **App Store Connect › Business**; `refused` — Apple does not accept the key |
| Reaches | What the key's role reached when it was last checked: `apps`, `certificates`, `testflight`, `users`. Apple refuses whatever needs a missing one. |

After the agreements are accepted, or the key's role changed, `palbase stores:apple:check` asks Apple again. `palbase stores:apple:disconnect` forgets the key for good; Apple keeps the apps and builds.

The key is the environment's, connected once per environment. The same key puts a [purchases](https://palbase.studio/docs/purchases/testing-apple) catalog in App Store Connect and manages the team's sandbox testers.

## Link the app

```sh
palbase stores:apps:link 4f6c2d10-… --name "Shop" -E main
```

The app is one of the project's [registered apps](https://palbase.studio/docs/apps/overview), by its id, set in this environment with its bundle. Linking registers the bundle id on the Apple account when it is not, under `--name` (folded to letters, digits and spaces; the bundle id when absent), and looks up the app's App Store Connect record.

Apple's API cannot make that record. Make it once at **App Store Connect › Apps › +** with the same bundle id, then link the app again: `palbase stores:apps` shows `no record yet` until then, and a package cannot be made for the app (`409 app_record_missing`). Linking again also refreshes the bundle id.

## Make the build

```sh
pkg=$(palbase stores:packages:create 4f6c2d10-… --command-id "$CI_RUN_ID" --entitlements-file entitlements.json -E main -y --json)
```

Its answer holds the package's `id`, its `build_number` and the upload token (`upload.token`), read as [the build machine's script](https://palbase.studio/docs/distribution/overview#from-a-build-machine) reads them. The build number is above every build App Store Connect has for the app. Build with it as `CFBundleVersion`, for the app and every extension in it, and leave the build unsigned. One way, with Xcode:

```sh
xcodebuild archive -project Shop.xcodeproj -scheme Shop -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Shop.xcarchive \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGNING_ALLOWED=NO
mkdir -p build/Payload
cp -R build/Shop.xcarchive/Products/Applications/Shop.app build/Payload/
(cd build && zip -qry Shop.ipa Payload)
```

`CURRENT_PROJECT_VERSION` becomes `CFBundleVersion` when the targets' Info.plist takes it from that setting, as Xcode's projects do. The `.ipa` holds exactly one `Payload/<name>.app`.

```sh
palbase stores:packages:upload "$PACKAGE" --file build/Shop.ipa -E main -y
```

The upload is checked before it is taken, and refused otherwise: one app in `Payload/` (`not_an_ipa`), the app's bundle id, with every bundle inside it under it (`com.acme.shop.widget`, `wrong_bundle`), the package's build number as `CFBundleVersion` (`wrong_build_number`), and a `CFBundleShortVersionString` (`no_version`), whose value is yours to set.

### Entitlements

An unsigned build carries no entitlements, so the build machine says what each bundle asks for, by bundle id, in `--entitlements-file`: the app and each extension, App Clip and watch app.

```json
{
  "com.acme.shop": {
    "aps-environment": "production",
    "com.apple.developer.associated-domains": ["webcredentials:k3xq81w4m.palbase.studio"],
    "keychain-access-groups": ["$(AppIdentifierPrefix)com.acme.shop.palbase"]
  },
  "com.acme.shop.widget": {
    "keychain-access-groups": ["$(AppIdentifierPrefix)com.acme.shop.palbase"]
  }
}
```

A target's `.entitlements` file is that object in another form: `plutil -convert json -o - Shop/Shop.entitlements` prints it. `$(AppIdentifierPrefix)` and `$(TeamIdentifierPrefix)` are resolved as Xcode resolves them when it signs.

The bundle is signed with what it asks for, bounded by what its profile grants:

- Palbase turns on each capability an entitlement needs on the bundle id (Push Notifications, Associated Domains, Sign in with Apple, App Groups, iCloud, HealthKit, …) and makes the profile again when one was added.
- What Apple's API cannot assign is yours to assign once at developer.apple.com: an App Group, an iCloud container, a merchant id or a pass type id on the bundle id. Until then the delivery fails with `manual_step`, naming the bundle and the value.
- `application-identifier`, the team identifier, `get-task-allow`, `beta-reports-active` and `aps-environment` always come from the profile.

### The certificate

The first delivery makes an Apple Distribution certificate on the account, with a private key Palbase keeps sealed. It is the account's: every environment connected to the same account uses that one certificate, each after reading it from Apple with its own key. When Apple revokes it, or it is about to expire, a new one is made.

Apple lets an account hold only a few distribution certificates. When it holds as many as Apple allows, made elsewhere, the delivery fails with `certificate_limit`: revoke one you no longer use at **developer.apple.com › Certificates**, and send the package again.

## Send it to TestFlight

```sh
palbase stores:deliver "$PACKAGE" --groups Beta --what-to-test "The new checkout" -E main
palbase stores:deliveries "$PACKAGE" -E main
```

The delivery goes `queued`, `signing`, `uploading`, `processing`, then `ready`, when TestFlight has the build and the groups named have it. Studio's package page shows the same, and **Send to TestFlight** sends it from there.

### Export compliance

TestFlight gives a build to no tester until its export compliance question is answered. A build whose Info.plist sets `ITSAppUsesNonExemptEncryption` has answered it; for any other, the delivery stops at `compliance`. The answer is the person's legal statement:

```sh
palbase stores:export-compliance "$PACKAGE" --uses-non-exempt-encryption no -E main
palbase stores:actions:confirm <action id> --hash <hash> -E main
```

`no` says the app uses no encryption beyond HTTPS and what iOS provides. Once the plan is confirmed, the delivery goes on to `ready`. In Studio, **Answer export compliance** on the package's page plans it, and **Actions** confirms it.

### What testers read

`--what-to-test` sets the note with the delivery. `palbase stores:what-to-test:set <package id> --text <text>` changes it once Apple holds the build (`409 build_not_at_apple` before), in the app's primary locale or `--locale`'s: 4000 characters at most.

## Groups and testers

A group is an app's testers, as a pair of TestFlight groups: an internal one for the account's App Store Connect users, who get a build at once, and an external one for everyone else, who get it after Beta App Review.

```sh
palbase stores:groups:create 4f6c2d10-… Beta -E main
palbase stores:groups:testers:set <group id> --emails ada@example.com,grace@example.com -E main
palbase stores:groups:add-build <group id> "$PACKAGE" -E main
```

| Command | What it does |
|---|---|
| `palbase stores:groups <app id>` | The app's groups, with how many testers each holds |
| `palbase stores:groups:testers:set <group id>` | Who the group holds, whole: those not named leave it. `--emails`, or `--file` with one tester a line (`email` or `email,First,Last`) or a JSON array; `-` reads stdin. 100 at most. Apple mails each new tester. |
| `palbase stores:groups:testers <group id>` | Its testers, and which TestFlight group serves each (`internal` or `external`) |
| `palbase stores:groups:add-build <group id> <package id>` | Gives the group a package TestFlight has. `stores:deliver --groups` does it as the delivery is ready. |
| `palbase stores:groups:rename <group id> <name>` | Renames it and its TestFlight groups |
| `palbase stores:groups:delete <group id>` | Deletes it and its TestFlight groups: its testers keep what other groups gave them |

## Beta App Review

External testers get a build only after Apple's Beta App Review. Apple reads the app's test information first:

```sh
palbase stores:review-info 4f6c2d10-… -E main
printf '%s' "$DEMO_PASSWORD" | palbase stores:review-info:set 4f6c2d10-… \
  --description "Sign in, add an item to the cart and check out." --feedback-email beta@example.com \
  --contact-first-name Ada --contact-last-name Lovelace --contact-phone "+44 20 7946 0000" --contact-email ada@example.com \
  --demo-account-name reviewer@example.com --demo-password-stdin -E main
```

`stores:review-info` shows what App Store Connect holds, in the app's primary locale or `--locale`'s, and what is still missing: `beta_description`, `feedback_email`, `contact_first_name`, `contact_last_name`, `contact_phone`, `contact_email`, `demo_account`. Only the fields given are written. The demo account's password is read from stdin, never the command line, and never read back: only whether it is set. Studio's **App Distribution › TestFlight** holds the same form.

Then plan the review of a package TestFlight has, and confirm it:

```sh
palbase stores:beta-review "$PACKAGE" -E main
palbase stores:actions:confirm <action id> --hash <hash> -E main
```

A plan is refused, with what is missing, while the test information is incomplete.

## Expiring a build, and feedback

`palbase stores:expire <package id>` plans expiring the package's build in TestFlight: once confirmed, no tester can install it.

`palbase stores:feedback <app id>` lists the newest feedback testers sent from TestFlight: screenshots with their comments, and crashes. Studio shows it under **App Distribution › TestFlight**.

## When a delivery fails

| `error_code` | What to do |
|---|---|
| `apple_agreement` | The Account Holder accepts the account's agreements in **App Store Connect › Business**; then `palbase stores:apple:check` and send again. |
| `apple_key_refused` | Apple no longer accepts the connected key: connect a new one. |
| `certificate_limit` | The account holds as many distribution certificates as Apple allows, made elsewhere: revoke one at developer.apple.com and send again. |
| `app_record_missing` | Make the app's record in App Store Connect with its bundle id, link the app again and send again. |
| `manual_step` | Assign the App Group, iCloud container, merchant id or pass type id it names to the bundle id at developer.apple.com, then send again. |
| `capability_missing` | A bundle asks for an entitlement its profile does not allow: add the capability to the bundle id at developer.apple.com, then send again. |
| `not_an_ipa` | The file is not one app in `Payload/`: build it again and upload it as a new package. |
| `build_number_taken` | App Store Connect has a build of this version and number that this delivery did not upload, from Xcode or another environment on the account: make a new package, which takes the next number. |
| `upload_failed`, `processing_failed` | App Store Connect did not take the build; `error` has Apple's words, and Apple's email to the account says why. |
| `apple_refused` | Apple refused a step; `error` has its words. |

The general ones (`build_changed`, `build_gone`, `step_timed_out`, `gave_up`) are on the [overview](https://palbase.studio/docs/distribution/overview#deliveries).

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and events
- [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple): sandbox testers, and buying in TestFlight
- [iOS SDK](https://palbase.studio/docs/ios/overview): the app's settings, capabilities and client
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
