> The full documentation index: https://palbase.studio/llms.txt

# App Distribution

App Distribution takes the builds your build machine makes to your testers: an iOS app's to TestFlight, an Android app's to Google Play's internal testing track. Your build machine makes an unsigned build with a build number the environment gives it and uploads it. Palbase signs it, hands it to Apple or Play with your own account, follows it until testers can install it, and gives it to the groups you name. No signing certificate, provisioning profile or keystore lives on the build machine, and no Apple ID signs in there.

It is the environment's stores module. Studio shows it under **App Distribution**, and the CLI's `stores` commands do the same: `palbase stores:deliver`, `palbase stores:groups`, …

## How a build reaches testers

1. **Register the app** and set it in the environment: [Client Apps](https://palbase.studio/docs/apps/overview).
2. **Connect the store**, once per environment: an App Store Connect API key ([TestFlight](https://palbase.studio/docs/distribution/testflight#connect-app-store-connect)), or a service account Palbase makes for you to invite in Play Console ([Google Play](https://palbase.studio/docs/distribution/google-play#connect-google-play)).
3. **Link the app to its store** (`palbase stores:apps:link <app id>`). An iOS app's bundle id is registered with Apple and its App Store Connect record looked up; an Android app gets the upload key Palbase signs its builds with.
4. **Make a package** (`palbase stores:packages:create`). It answers the build number to build with and a token to upload the build.
5. **Build and upload it** (`palbase stores:packages:upload`): the unsigned `.ipa`, or the `.aab`.
6. **Deliver it** (`palbase stores:deliver`). It is signed, handed to Apple or Play, processed, and given to the testers.

Steps 1 to 3 are done once. A build machine runs 4 to 6 on every build.

## From a build machine

A CI job with an organization's [access token](https://palbase.studio/docs/getting-started/access-tokens) of the admin role as `PALBASE_TOKEN`:

```sh
set -euo pipefail
APP_ID=4f6c2d10-…   # palbase apps:get shop --json prints it

pkg=$(npx palbase stores:packages:create "$APP_ID" --command-id "$CI_RUN_ID" --notes "$GIT_SHA" \
  --entitlements-file entitlements.json -E main -y --json)
PACKAGE=$(echo "$pkg" | jq -r .id)
BUILD_NUMBER=$(echo "$pkg" | jq -r .build_number)
export PALBASE_UPLOAD_TOKEN=$(echo "$pkg" | jq -r .upload.token)

# Your build, unsigned, with that number: CFBundleVersion on iOS, versionCode on Android.
# TestFlight and Google Play below show one each.
./build-unsigned.sh "$BUILD_NUMBER"   # writes build/Shop.ipa

npx palbase stores:packages:upload "$PACKAGE" --file build/Shop.ipa -E main -y
npx palbase stores:deliver "$PACKAGE" --groups "Beta" --what-to-test "$(git log -1 --format=%s)" -E main -y
```

- **The command id** names the request: the CI run's id. The same id again answers the same package, with a new upload token while it still waits for its build, so a job that is run again does not use up another build number.
- **The upload token** is printed once, works for six hours and no longer than the access token, and only the newest one handed out works. `PALBASE_UPLOAD_TOKEN` keeps it out of the process list. The file goes straight to the environment's address with it; a second upload of the same build counts as uploaded.
- **`-y`** confirms a change to the project's production environment, `main`, without asking. Every command that changes it asks first, and in a job that cannot answer it refuses (`confirmation_needed`).

Reading the module is a member's; making a package, uploading, delivering and every other change is an admin's. The few steps Apple cannot undo wait for a person: see [Actions](#actions).

## Packages

A package is one build of one app: the build number the environment handed out, the build once it arrived, and its deliveries.

| Field | What it is |
|---|---|
| `build_number` | Above every build number App Store Connect or Play has for the app, and every one the environment handed out for it. The build must say it: an iOS build's `CFBundleVersion`, an Android build's `versionCode`. |
| `status` | `awaiting_upload` until the build arrives, then `uploaded` |
| `version` | What the build says it is, once it arrived: `CFBundleShortVersionString`, or the Android `versionName` |
| `bundles` | An iOS build's app and each extension, App Clip and watch app in it, by bundle id |
| `sha256`, `size` | The uploaded file's |
| `notes` | What `--notes` kept with it: a commit, a branch |
| `deliveries` | Where it went, and where each delivery is now |

A package is made for a linked app (`404 app_not_linked` otherwise), and an iOS app's needs its App Store Connect record (`409 app_record_missing`): the build number is read from App Store Connect, or from Play once the environment is connected to it.

An upload is refused, and the package keeps waiting for the right file, when the build is not the app's (another bundle id or package, `wrong_bundle`) or says another build number (`wrong_build_number`). An `.ipa` is 2 GiB at most. One upload of a package runs at a time, and two of an environment's at once; the CLI waits and sends again when the module says it is busy. An upload ends within an hour and keeps up 256 KiB a second on average after its first minute.

A build is kept 90 days, as long as TestFlight keeps one. `palbase stores:packages` lists the newest packages (`--app` for one app's), and `palbase stores:packages:get <package id>` shows one.

## Deliveries

`palbase stores:deliver <package id>` sends a package to its app's channel: `testflight` for an iOS app, `play_internal` for an Android app. It answers at once; `palbase stores:deliveries <package id>` and Studio follow it.

| Status | What is happening |
|---|---|
| `queued` | Waiting its turn: an environment's builds are signed and handed over one at a time |
| `signing` | Palbase signs the build |
| `uploading` | Palbase hands it to App Store Connect, or to Play |
| `processing` | Apple processes it |
| `compliance` | Apple waits for the build's [export compliance](https://palbase.studio/docs/distribution/testflight#export-compliance) answer |
| `ready` | Testers can install it: TestFlight gave it to the groups named, or Play took it on the internal testing track |
| `failed` | It stopped. `error_code` says why and `error` what to do |

Sending a package again restarts a delivery that failed and changes nothing about one under way. An environment has 10 deliveries under way at most (`429 too_many_deliveries`).

What stops a delivery, by `error_code`, is on [TestFlight](https://palbase.studio/docs/distribution/testflight#when-a-delivery-fails) and [Google Play](https://palbase.studio/docs/distribution/google-play#when-a-delivery-fails). Beside those:

| `error_code` | What to do |
|---|---|
| `build_changed` | The kept build is not the one uploaded: upload it again as a new package. |
| `build_gone` | The build is no longer kept (90 days): upload it again as a new package. |
| `step_timed_out` | Signing or handing it over took more than 45 minutes: send it again. |
| `gave_up` | Several tries in a row failed; `error` names the reference the cause is kept under. |

## Actions

What changes something at Apple for good is planned first and runs only when a person confirms it: sending a build to Beta App Review, answering a build's export compliance question, expiring a build, and on the [App Store](https://palbase.studio/docs/distribution/app-store) writing an app's page, sending its version to App Review, withdrawing it, releasing it and changing its phased release. A plan holds a summary of exactly what it does and a hash of it.

```sh
palbase stores:beta-review <package id>        # plans it, prints its id and hash
palbase stores:actions --status planned
palbase stores:actions:confirm <action id> --hash <hash>
palbase stores:actions:decline <action id>
```

A confirmation names the hash of the plan that was shown, runs it once, and only within a day of planning. It is a person's: a signed-in CLI or Studio's **App Distribution › Actions**, where planned actions wait under **Waiting for you**. An access token, an environment token or the secret key alone is refused (`403 person_required`), so a build machine plans and a person confirms. The CLI shows what the action does and asks before it runs, in every environment; `-y` confirms without asking. Declining needs no person.

A platform whose own users have no Palbase account — a product studio that runs its customers' stores from its own pages — confirms for them with its organization's access token, once an owner or an admin of the organization turns on **Confirms for people** for that token (Studio's **Organization › Access tokens**). Each confirmation then names the person it is for in the `Palbase-For` header (1 to 128 of letters, digits and `. _ : @ -`, such as `yourplatform:user_42`), and the action keeps them as its decider, beside the token. A token without it that names anyone is refused (`403 token_does_not_confirm`); one with it that names no one confirms nothing. In `palbase/cloud`, give the client a `fetch` that sets the header for the person who clicked.

## In Studio

**App Distribution**, under **Release** in an environment:

| Tab | What it holds |
|---|---|
| Overview | The Apple account and the Google Play connection (connect, check again, disconnect), the linked apps (**Link an app**), and packages made per week |
| Packages | Every package, newest first. A package's page sends it (**Send to TestFlight**, **Send to internal testing**, **Send again**), follows its deliveries, gives it to a group (**Give to a group**), changes what testers read (**Edit what to test**), plans **Send to Beta App Review**, **Answer export compliance** and **Expire the build**, and downloads an Android package's **Signed bundle** |
| Groups | An iOS app's groups of testers: make, rename, delete, set their testers |
| Actions | What waits for a person's yes, and what was done, declined or failed |
| TestFlight | An iOS app's test information for Beta App Review, and what testers sent back |
| Health | An iOS app's App Store Connect webhook (**Ping**, **Make again**), testers' crashes and screenshots, and the App Store's crash data; an Android app's Play vitals ([App Health](https://palbase.studio/docs/distribution/health)) |
| App Store | An iOS app's App Store page (each language's text, its categories and screenshots), planned and confirmed, and the version App Review gets: what is missing, **Send to App Review**, **Withdraw from App Review**, **Release** and the phased release |

## Events

Every change emits a `stores.*` event to the environment's [webhooks](https://palbase.studio/docs/server/webhooks) and to a backend's [`@On` handlers](https://palbase.studio/docs/backend/hooks):

| Event | When |
|---|---|
| `stores.apple.changed` | The Apple account was connected, checked (and Apple's answer changed) or disconnected. Never the key. |
| `stores.google.changed` | The Play connection was made, checked (and Play's answer changed) or disconnected |
| `stores.app.changed` | An app was linked to its store, or its App Store Connect record made or removed with the [Apple ID](https://palbase.studio/docs/distribution/app-store#an-apple-id) |
| `stores.package.changed` | A package was made, or its build arrived |
| `stores.delivery.requested` | A delivery was sent, or sent again |
| `stores.delivery.changed` | A delivery moved: `queued`, `signing`, `uploading`, `processing`, `compliance`, `ready` or `failed` |
| `stores.group.changed` | A group was made, renamed or deleted, its testers set, or a build given to it |
| `stores.action.changed` | An action was planned, done, declined or failed |
| `stores.version.changed` | An app's App Store version came to a new state: sent to App Review, in review, approved, rejected, withdrawn, released. `source` says who told it: `apple_webhook`, `poll` or `action` |
| `stores.apple.session.changed` | An [Apple ID](https://palbase.studio/docs/distribution/app-store#an-apple-id) was signed in, or signed out. Never the session. |
| `stores.apple.session.expired` | Apple ended the Apple ID's session: sign in again |
| `stores.review.message` | App Review wrote in the app's Resolution Center: the text, the guidelines it names, its attachments (with an Apple ID signed in) |

What the stores tell of an app — its App Store Connect webhook, its build uploads, Beta App Review, testers' feedback, its in-app purchases' review, its Play releases and its crash data — is on [App Health](https://palbase.studio/docs/distribution/health#the-events).

```ts
// src/modules/releases/release-events.ts
import { Log, On, type PlatformEvent } from "palbase/backend";

export class ReleaseEvents {
  @On("stores.delivery.changed")
  moved(event: PlatformEvent<"stores.delivery.changed">): void {
    const { package_id, channel, status, error_code, error } = event.data;
    if (status === "failed") Log.warn("a delivery stopped", { package_id, channel, error_code, error });
    if (status === "compliance") Log.info("a build waits for its export compliance answer", { package_id });
  }
}
```

```ts
// src/modules/releases/releases.module.ts
import { Module } from "palbase/backend";
import { ReleaseEvents } from "./release-events";

@Module({ providers: [ReleaseEvents] })
export class ReleasesModule {}
```

## From a server

The module's API is the environment's, at its address under `/stores`, with the secret key: `createServer(…).stores` in any server, `Palbase.stores` in a `palbase/backend` app, the same calls the CLI makes (`listPackages`, `getPackage`, `deliver`, `listDeliveries`, …). Confirming an action is the one call it cannot make: that is a person's.

## Related

- [TestFlight](https://palbase.studio/docs/distribution/testflight): the Apple account, signing, groups, Beta App Review
- [App Store](https://palbase.studio/docs/distribution/app-store): the App Store page, the version, App Review and the release
- [Google Play](https://palbase.studio/docs/distribution/google-play): the Play connection, the upload key, internal testing
- [App Health](https://palbase.studio/docs/distribution/health): the App Store Connect webhook, testers' crashes, the stores' crash data and their events
- [Test Apple Purchases](https://palbase.studio/docs/purchases/testing-apple): sandbox testers and purchases in TestFlight
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
