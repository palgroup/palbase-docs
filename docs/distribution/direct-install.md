> The full documentation index: https://palbase.studio/llms.txt

# Direct Install

A build reaches a tester's own phone with no store in between: no TestFlight, no Beta App Review, no Play track. You send a package to the people who should try it. Each gets a link by mail; an iPhone registers itself from the link and the build is signed for it, an Android phone downloads the build. It is the way to hand a branch's build to the people testing that branch, minutes after it was built.

It is the `development` channel of [App Distribution](https://palbase.studio/docs/distribution/overview). The build is the same unsigned build a build machine uploads for TestFlight or Play; what changes is where it goes.

| | iPhone | Android |
|---|---|---|
| The build | The unsigned `.ipa` | The app's APK |
| Signed with | The Apple account's development certificate, for the phones of the people invited | The app's upload key |
| A tester's phone | Registers itself once, from the link | Registers nowhere |
| Needs | An App Store Connect key connected ([TestFlight](https://palbase.studio/docs/distribution/testflight#connect-app-store-connect)) and a paid Apple Developer membership | The app linked ([Google Play](https://palbase.studio/docs/distribution/google-play#link-the-app)); no Play connection |

## Send a build

```sh
palbase stores:groups:create 4f6c2d10-… "Branch testers" --kind development -E main
palbase stores:groups:testers:set 7a1e5c33-… --emails ada@example.com,grace@example.com -E main
palbase stores:deliver "$PACKAGE" --channel development --groups "Branch testers" \
  --what-to-test "The new login screen" -E main -y
```

Each person of the groups named is invited to the package: mailed their own link. The package is made and uploaded as for any channel ([from a build machine](https://palbase.studio/docs/distribution/overview#from-a-build-machine)). Sent again, the delivery invites who joined the groups since and those whose link ran out; it mails nobody twice.

One person is invited by their address, with no group:

```sh
palbase stores:invite "$PACKAGE" ada@example.com -E main
```

It prints their link, and mails it unless `--no-mail`. A person invited already keeps their link, mailed again; an expired or revoked invitation is made again with a new link, and the old one stops working.

### Groups

A group reaches its testers one way, chosen when it is made:

| Kind | What it is |
|---|---|
| `testflight` | A pair of TestFlight groups at Apple; Apple invites its testers. A delivery to `testflight` takes these. |
| `development` | A list of people kept in the environment. Nothing goes to Apple. A delivery to `development` takes these. |

An Android app's groups are `development` groups: its Play testers are listed in Play Console. A person taken out of a development group, and the people of one that is deleted, lose the install links the group gave them: each of those invitations is revoked. An invitation made for a person by their address is revoked by you alone.

## What the tester does

The link opens the app's install page, at the environment's own address, in the tester's language (English and Turkish).

**On an iPhone**, in Safari:

1. **Register this iPhone.** Safari asks to download a configuration profile; the tester allows it, opens **Settings**, taps **Profile Downloaded**, then **Install**. The profile only reads the phone's identifier and installs nothing: once it has answered, iOS removes it.
2. The page comes back and says the build is being signed. It follows itself; nobody types anything.
3. **Install.** The app appears on the home screen.

The first time, iOS asks for **Developer Mode** before the app opens: **Settings › Privacy & Security › Developer Mode**, on, and a restart. This is once for a phone.

A tester who registered a phone before skips step 1: an invitation to the next package goes straight to the install, on every phone they registered.

**On an Android phone**: **Download**, then open the file and tap **Install**. The phone asks once to allow installs from the browser.

The page says what it is waiting for and why: the owner's Apple account is not connected, Apple is processing the phone, a signing failed. A link that is wrong, expired or revoked is answered with one page, the same for each.

## Follow it

```sh
palbase stores:invitations "$PACKAGE" -E main
palbase stores:devices -E main
palbase stores:invitations:revoke 5b0d2f44-… -E main -y
```

An invitation says how far its person got and what became of their mail:

| Status | |
|---|---|
| `invited` | Made; the link has not been opened |
| `opened` | The page was opened |
| `enrolled` | A phone of theirs is registered (an iPhone's) |
| `downloaded` | Their phone took the build |
| `revoked` | Stopped: the link answers as no link's |

| Mail | |
|---|---|
| `none` | Not mailed: the link was printed |
| `requested` | On its way; a limit of the sender may hold it until its window ends |
| `queued` | Handed to the mail provider |
| `failed` | Not sent, with why: the address takes no mail, the month's email is used up |

A link works for 14 days, and no longer than the access token that made it.

The delivery itself is `waiting` while nobody invited has a phone to sign for, `signing`, then `ready`; `stores:deliveries` shows it with the number of phones the build is signed for.

## iPhones and Apple's limits

A build installs on an iPhone only when Apple's profile names that phone, so each tester's iPhone is registered on your Apple account. Palbase does it when the phone answers the registration; you never copy a UDID.

- **A new phone, no new build.** When another phone registers, the same package is signed again for every phone of the people invited. The build number does not change, and the build already installed keeps running.
- **100 iPhones a membership year.** Apple counts each registered phone until the membership renews, also one removed since. A person registers two new iPhones at most in 30 days, through whatever links they hold, so a link that is passed around cannot spend the account's places. A phone already theirs registers again freely.
- **Apple may take up to 72 hours.** On a new or just-renewed membership Apple processes a registered phone before it puts it in profiles. The phone shows as `processing`, its page says so, and the build is signed for it by itself once Apple is done.
- **A phone Apple refuses** is `refused`, with Apple's words, or the account's limit. Its person is told on their page; nobody else's build waits on it.

`palbase stores:devices` lists the phones with whose each is.

The first direct install makes an Apple Development certificate on the account, with a private key Palbase keeps sealed, beside the distribution certificate TestFlight builds are signed with. A build signed so talks to Apple's sandbox: StoreKit's sandbox and the development push environment.

## Android

An Android app has two builds, and each goes one way. Its App Bundle (`.aab`) goes to [Google Play](https://palbase.studio/docs/distribution/google-play). Its APK is installed directly:

```sh
./gradlew :app:assembleRelease -PbuildNumber="$BUILD_NUMBER"
palbase stores:packages:upload "$PACKAGE" --file app/build/outputs/apk/release/app-release-unsigned.apk -E main -y
palbase stores:deliver "$PACKAGE" --groups "Branch testers" -E main -y
```

The upload is told from a bundle by what the file holds. An APK goes to `development` when no channel is named; sending it to Play, or a bundle to `development`, is refused (`409 not_an_aab`, `not_an_apk`).

- **One key signs every build.** The APK is signed with the app's upload key, the one Palbase made when the app was linked, whatever it came signed with: an unsigned release build, or one a debug key signed. A newer build installs over an older one on a tester's phone, whoever's machine built it. `palbase stores:apps:upload-key <app id>` prints the key's SHA-256: the signer a phone shows for the app.
- **As Android verifies it.** An app for Android 7.0 and later is signed with APK Signature Scheme v2 and none of its bytes is touched; one that still installs on an older Android carries the JAR signature too.
- **Not an Android Studio Run build.** An APK the IDE's Run button made is marked `testOnly`, and a phone installs it only from `adb`. It is refused at upload (`422 test_only_apk`): build with Gradle.

An Android phone registers nowhere, so the build is ready for everyone invited as soon as it is signed, and the same build serves whoever is invited after.

## The invitation mail

The mail says the app, its version and build number, what to test, and the link. It leaves through the environment's own [email provider](https://palbase.studio/docs/backend/notifications#every-channel-but-one-needs-a-provider-of-yours) when one is set.

Without one it leaves from Palbase's shared sender, under [its limits](https://palbase.studio/docs/backend/notifications#the-shared-senders-limits), and says less: the note on what to test and the app's icon stay on the install page, which the link opens, and an app name that reads as a web address or a telephone number is refused (the invitation's mail is `failed`, and its link is still yours to hand over). A mail a limit holds waits and goes out when the limit's window ends.

## Events

| Event | When |
|---|---|
| `stores.invitation.changed` | A person was invited, opened the link, registered a phone, took the build, was mailed, or was revoked (`change`) |
| `stores.device.changed` | A phone registered, Apple took it, is processing it, or refused it |
| `stores.delivery.changed` | The delivery moved: `waiting`, `signing`, `ready`, with `signed_devices` |

An invitation's and a phone's event carry ids and states, never a person's address or a phone's UDID: read those with `stores:invitations` and `stores:devices`. Both are typed for a backend's [`@On` handlers](https://palbase.studio/docs/backend/hooks) and for [webhooks](https://palbase.studio/docs/server/webhooks).

## In Studio

**App Distribution › Packages › a package** has a **Direct install** panel: the people invited with where each is, their mail and their phones, **Invite a person** and **Send to a group**. **Groups** shows each group's kind and makes either. **Devices** lists the registered phones and what Apple said of each.

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and events
- [TestFlight](https://palbase.studio/docs/distribution/testflight): the Apple account, the unsigned `.ipa` and its entitlements
- [Google Play](https://palbase.studio/docs/distribution/google-play): linking an Android app, and its upload key
- [Notifications](https://palbase.studio/docs/backend/notifications): email providers and the shared sender
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
