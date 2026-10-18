> The full documentation index: https://palbase.studio/llms.txt

# Google Play

An Android app's builds go to Google Play's internal testing track, for the testers that track lists in Play Console. Your build machine uploads the Android App Bundle (`.aab`). Palbase signs it with the app's upload key, which it made and keeps, uploads it to Play, puts it on the track and commits the release. Play then signs what devices install with Google's app signing key, as it does for every app enrolled in Play App Signing. No keystore lives on the build machine, and no Google key changes hands.

## Connect Google Play

```sh
palbase stores:google:connect -E main
```

Palbase makes a service account for the environment in its own Google Cloud project and prints it. It holds no key: Palbase acts as it. Connecting again answers the same account. In Studio, **App Distribution › Overview › Connect Google Play** does the same.

Then, in Play Console:

1. **Users and permissions › Invite new users**: invite the service account's address.
2. Give it the app, with **Release apps to testing tracks**. For the app's Google Play purchases, give it **View financial data** and **Manage orders and subscriptions** too.
3. [Link the Android app](#link-the-app), then ask Play what the account reaches: `palbase stores:google:check`.

`palbase stores:google` shows the connection:

| | |
|---|---|
| Status | `invited`: made, and no app answered it yet. `active`: Play answers it for an app. `refused`: it answered once, and no app does any more. |
| Reaches | Per app: `releases` (uploading builds, changing tracks), `products` (reading its subscriptions), or the reason Play gave for not letting it reach the app |

An invite given in Play Console just now takes a while to reach Play's API: check again in a few minutes. `palbase stores:google:disconnect` deletes the service account at Google, and Play Console's invite of it reaches nothing any more.

The app must exist in Play Console, under its package name: Play's API makes none.

## Link the app

```sh
palbase stores:apps:link 7d21e9b4-… -E main
```

The app is one of the project's [registered apps](https://palbase.studio/docs/apps/overview), by its id, set in this environment with its package. Linking makes the app's **upload key**: the key Palbase signs its builds with, the first release in Play Console among them. Linking again keeps it, and asks Play about the app again.

```sh
palbase stores:apps:upload-key 7d21e9b4-… --out upload-certificate.pem -E main
```

`stores:apps:upload-key` prints the upload key's SHA-256, as Play Console shows an upload key, and `--out` writes its certificate. Its private key never leaves Palbase.

- **A new app**, never uploaded to Play: its first release, signed by Palbase, makes Palbase's key the app's upload key.
- **An app that has an upload key already**: ask Play to change it to Palbase's, from Play Console's **App signing** page (an upload key reset), with the certificate above. Or keep yours: upload bundles you signed with it, and Palbase hands them to Play as they are.

## Make the build

```sh
pkg=$(palbase stores:packages:create 7d21e9b4-… --command-id "$CI_RUN_ID" -E main -y --json)
```

Its answer holds the package's `id`, its `build_number` and the upload token, as on [the build machine](https://palbase.studio/docs/distribution/overview#from-a-build-machine). The build number is above every version code Play has seen for the app, once the environment is connected to Play, and every one the environment handed out. Build the release bundle with it as `versionCode`:

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        versionCode = (findProperty("buildNumber") as String?)?.toInt() ?: 1
    }
}
```

```sh
./gradlew :app:bundleRelease -PbuildNumber="$BUILD_NUMBER"
palbase stores:packages:upload "$PACKAGE" --file app/build/outputs/bundle/release/app-release.aab -E main -y
```

Leave the release build unsigned, or sign it with the app's upload key. The upload is checked before it is taken:

| Refusal | Why |
|---|---|
| `not_an_aab` | Not an Android App Bundle that can be read: build the release bundle (`bundleRelease`) |
| `wrong_bundle` | The bundle is another package's |
| `wrong_build_number` | Its `versionCode` is not the package's build number |
| `bad_signature` | It is signed, but its signature does not hold: upload it unsigned |

A bundle signed by its maker is kept as it came, with its certificate's fingerprint (`signer_fingerprint`), for Play to compare with the app's upload key.

## Send it to internal testing

```sh
palbase stores:deliver "$PACKAGE" -E main
palbase stores:deliveries "$PACKAGE" -E main
```

The delivery goes `queued`, `signing`, `uploading`, then `ready`, once Play took it: its `play_version_code` is the version code Play took, and its `play_release_status` is `completed` when testers get it, or `draft` on an app never published, which only Play Console rolls out. Groups are TestFlight's: on Play, the testers are the ones the internal testing track lists in Play Console. Studio's package page shows the same, and **Send to internal testing** sends it from there.

### The first release

Play may take an app's first release only in Play Console. The delivery then fails with `first_release_manual`: download the bundle as Palbase signed it, and upload it once yourself.

```sh
palbase stores:packages:bundle "$PACKAGE" --out app-signed.aab -E main
```

In Play Console, **Testing › Internal testing › Create new release**, upload that file: it is signed with the app's upload key. The next package is delivered by Palbase. The bundle comes from the environment's address on a link sealed for it, valid 15 minutes; Studio's package page downloads it with **Signed bundle**.

## When a delivery fails

| `error_code` | What to do |
|---|---|
| `google_not_connected` | Connect Google Play (`palbase stores:google:connect`), invite the service account, and send again. |
| `google_no_access` | Play Console has not invited the service account with this app: invite it, then send again. |
| `google_not_allowed` | Play lets the account reach the app but not release it. An invite given just now takes a while to reach Play's API: send again in a while; otherwise give it **Release apps to testing tracks** for the app. |
| `play_app_missing` | Play has no app by this package that the account may reach: create it in Play Console and invite the account with it. |
| `first_release_manual` | Upload the signed bundle in Play Console once ([The first release](#the-first-release)), then send the next package. |
| `no_upload_key` | The app has no upload key: link it again. |
| `not_an_aab` | The build could not be read to be signed: build it again and upload it as a new package. |
| `google_refused` | Play refused a step; `error` has Play's words. |

A package cannot be made at all once Play has seen the highest version code it takes (`409 version_codes_spent`). The general failures (`build_changed`, `build_gone`, `step_timed_out`, `gave_up`) are on the [overview](https://palbase.studio/docs/distribution/overview#deliveries).

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and events
- [Client Apps](https://palbase.studio/docs/apps/overview): an Android app's package and the certificates its passkeys trust
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
