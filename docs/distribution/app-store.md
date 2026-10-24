> The full documentation index: https://palbase.studio/llms.txt

# App Store

An iOS app's App Store page and the version App Review gets are managed from the environment, with your own Apple account. You keep the page as a draft, language by language, with its screenshots. Palbase plans what changes at App Store Connect, and writes it only once you confirm the plan. You prepare the version (its build, release, review details), send it to App Review, and release it. Each of those steps is a plan you confirm too.

You need an iOS app [linked to the App Store](https://palbase.studio/docs/distribution/testflight#link-the-app), with its App Store Connect record, and the environment's [App Store Connect key](https://palbase.studio/docs/distribution/testflight#connect-app-store-connect) with the **App Manager** role or above. Studio shows all of it under **App Distribution › App Store**.

## The page

The draft is the environment's: what you want the page to be. Nothing in it is at Apple until a plan of it is confirmed.

```sh
palbase stores:listing:get 4f6c2d10-… --out palbase/store/listing.json -E main
```

```json
{
  "primary_category": "PRODUCTIVITY",
  "secondary_category": "UTILITIES",
  "locales": {
    "en-US": {
      "name": "Shop",
      "subtitle": "Groceries in a tap",
      "description": "Shop keeps your list and orders from the store near you.",
      "keywords": "groceries,list,shopping",
      "promotional_text": "Same-day delivery is here.",
      "whats_new": "A faster checkout.",
      "privacy_policy_url": "https://shop.example.com/privacy",
      "support_url": "https://shop.example.com/help",
      "marketing_url": "https://shop.example.com",
      "screenshots": { "iphone_6_9": ["screens/home.png", "screens/cart.png"] }
    }
  }
}
```

Edit the file, then save it on the revision `stores:listing:get` printed:

```sh
palbase stores:listing:put 4f6c2d10-… --file palbase/store/listing.json --revision 3 -E main
```

A language is App Store Connect's code (`en-US`, `tr`, `de-DE`). A field you leave empty is not written, and a language the draft does not have is left as App Store Connect holds it.

| Field | What it is |
|---|---|
| `name` | The app's name in the language, 2 to 30 characters |
| `subtitle` | Under the name, 30 characters at most |
| `description` | What the app does, 4000 characters at most |
| `keywords` | Comma-separated search words, 100 bytes at most |
| `promotional_text` | Above the description, 170 characters at most. It changes without a new version. |
| `whats_new` | An update's notes. The app's first version has none. |
| `privacy_policy_url`, `support_url`, `marketing_url` | http(s) addresses |
| `primary_category`, `secondary_category` | App Store categories: `PRODUCTIVITY`, `UTILITIES`, `GAMES` … |

Two people can edit the page at once. The second save is refused (`409 listing_moved`), never written over the first: read the page again, make your edit on it, and save with its revision.

### Screenshots

Each display takes up to 10 screenshots, PNG or JPEG, 10 MB at most, in the order the App Store shows them:

| Display | Sizes (portrait, or turned) |
|---|---|
| `iphone_6_9` | 1320×2868, 1290×2796 or 1260×2736 |
| `iphone_6_5` | 1242×2688 or 1284×2778 |
| `ipad_13` | 2064×2752 or 2048×2732 |

The draft names a screenshot by its SHA-256. `stores:listing:put` takes a file instead, a path from the draft's file under `palbase/`: it uploads each one first and saves its SHA-256 in its place. To upload without saving:

```sh
palbase stores:screenshots:upload 4f6c2d10-… screens/home.png screens/cart.png -E main
```

It prints each image's SHA-256 and the displays its size fits. An image of another size is refused (`422 screenshot_size`).

### Plan and confirm

```sh
palbase stores:listing:plan 4f6c2d10-… -E main
palbase stores:actions:confirm <action id> --hash <hash> -E main
```

The plan compares the saved draft with the page of the app's version that can still change, and lists each change: the categories, the age rating, each language's name, subtitle and privacy policy, its description, keywords and links, and each display's screenshots. When App Store Connect already holds the page, there is nothing to confirm.

A confirmation is a person's, as every [action](https://palbase.studio/docs/distribution/overview#actions) is. The text is written while the confirmation answers. The screenshots are uploaded after it: the action is `running`, then `done` or `failed`. `palbase stores:actions` shows where it is, and Studio's page says when it ends. Planned again after a failure, it writes what is left.

In Studio, **App Store** shows the page for each language, takes screenshots for each display, and saves the draft. **Plan the changes** lists the steps; **Confirm and write** writes them.

## The version

```sh
palbase stores:version 4f6c2d10-… -E main
```

It shows the version App Review would get: its number, its state, its build, how it is released, its phased release, the price, the content rights statement and App Review's contact and demo account. The demo account's password is never shown: only whether Apple holds one.

Prepare it:

```sh
palbase stores:version:prepare 4f6c2d10-… --version 1.3.0 --build 42 --copyright "2026 Acme" \
  --release manual --phased --no-third-party-content --review-file review.json -E main
```

```json
{
  "contact_first_name": "Ada",
  "contact_last_name": "Lovelace",
  "contact_email": "ada@example.com",
  "contact_phone": "+44 20 7946 0000",
  "demo_account_required": true,
  "demo_account_name": "reviewer@example.com",
  "demo_account_password": "…",
  "notes": "Sign in with the demo account, then add an item to the cart."
}
```

| Flag | What it does |
|---|---|
| `--version` | The version's number. When the app has no version that can change, this makes the next one. |
| `--build` | The TestFlight build App Review gets, by its build number. Its version is this version: [deliver it to TestFlight](https://palbase.studio/docs/distribution/testflight#send-it-to-testflight) first. |
| `--release` | `manual` (you release it), `after_approval`, or `scheduled` with `--release-at` |
| `--phased`, `--no-phased` | Release it over seven days, or to everyone at once |
| `--third-party-content`, `--no-third-party-content` | Apple's content rights question |
| `--free` | Makes an app with no price free in every country. A paid price is set in App Store Connect. |
| `--territories all` | Sells an app that is sold nowhere in every country and region, and in those Apple opens later. An app sold somewhere keeps its countries: choose them in App Store Connect. |
| `--app-privacy published` | Says you published the app's privacy details in App Store Connect. Apple has no API for them, so the missing list asks until you say so. `unpublished` takes it back. |
| `--review-file` | App Review's details. A field the file leaves out stays as it is. The password goes to Apple and is never printed or kept. |

What you prepare is written to App Store Connect at once: it is no plan. Studio's **Version** panel holds the same form, with **Sell the app in every country and region** and the **App Privacy** switch.

### What is missing

`stores:version` lists what App Review would refuse the version for, one line each, as App Store Connect holds it now: a processed build with its export compliance answer, the copyright, a primary category, the content rights statement, a price, the age rating, App Review's contact and demo account, and each language's name, description, keywords, privacy policy and support URLs, What's New and screenshots. A draft page you saved but did not write yet does not count: plan it and confirm it first. Sending the version is refused while the list is not empty (`409 version_incomplete`).

The list also names what is not the version's own:

- **The countries the app is sold in**, when it is sold in none. `--territories all` sells it everywhere.
- **iPad screenshots**, when the version's build runs on the iPad (its `UIDeviceFamily`, read from the package you uploaded).
- **App Privacy.** Its questions are answered in App Store Connect, and Apple has no API for them. Answer them there, then run `stores:version:prepare <app id> --app-privacy published`. If Apple still refuses the version for App Privacy, the line comes back.

### Send it to App Review

```sh
palbase stores:version:submit 4f6c2d10-… -E main
palbase stores:actions:confirm <action id> --hash <hash> -E main
```

An app's first in-app purchases and subscriptions go to App Review with a version, as Apple requires. Name them by their product ids:

```sh
palbase stores:version:submit 4f6c2d10-… --with com.acme.app.pro.monthly,com.acme.app.coins -E main
```

In Studio, **Send with the version** lists the catalog's App Store products above **Send to App Review**: tick the ones to send. Each is sent only if Apple holds it as `READY_TO_SUBMIT`: its text, price, availability and [review screenshot](https://palbase.studio/docs/purchases/catalog#review-screenshots) are complete. A subscription's group goes with it until Apple has approved the group. The plan names them, and when you confirm it, Palbase checks that they are still what was planned. The action's result shows each one's state at Apple (`WAITING_FOR_REVIEW`), and withdrawing the version withdraws them too. Apple takes a withdrawal in a few seconds: the withdrawal's result says it is under way, and `stores:version` shows the version's state once Apple has it.

Once the plan is confirmed, the version waits for review. Palbase reads its state every two minutes while App Review has it, and while it waits for its release. `stores:version` shows the state it saw last (`watched`) and since when.

| Command | What it plans |
|---|---|
| `palbase stores:version:withdraw <app id>` | Takes the version out of App Review. You can edit it again, and you send it again from the start. |
| `palbase stores:version:release <app id>` | Releases an approved version that waits for you (`PENDING_DEVELOPER_RELEASE`). A release cannot be taken back. |
| `palbase stores:version:phased <app id> paused` | Pauses a phased release, for 30 days at most in all |
| `palbase stores:version:phased <app id> active` | Resumes it |
| `palbase stores:version:phased <app id> complete` | Gives the update to everyone now |

Each waits for your confirmation, as sending it does. In Studio, the **Version** panel shows the steps the version can take now: **Send to App Review**, **Withdraw from App Review**, **Release**, and the phased release's. Each opens the plan for you to confirm, and closing it declines the plan.

### Phased release

A phased release gives an update to a growing share of the users who have automatic updates, a day each over seven days: 1%, 2%, 5%, 10%, 20%, 50%, then 100%. Anyone can download it from the App Store at once. It starts when the version is released. It applies to an update, never to the app's first version.

## App Review's answer

When App Review approves or rejects the version, the owners of the environment's organization get an email from Palbase. An approved version is released as you set it: one that waits for you is released from Studio's **App Store** page, or with `stores:version:release`. Apple gives no reason for a rejection over its API. With an [Apple ID signed in](#an-apple-id) for the environment, Palbase reads it for you: the Resolution Center's message, the guidelines it names and its attachments. Without one, read it in App Store Connect's **Resolution Center**. Fix what it names, and send the version again.

Every state the version comes to is the environment's `stores.version.changed` event: sent to App Review, in review, approved, rejected, withdrawn, released. It goes to the environment's [webhooks](https://palbase.studio/docs/server/webhooks) and to a backend's [`@On` handlers](https://palbase.studio/docs/backend/hooks):

```ts
// src/modules/releases/version-events.ts
import { Log, On, type WebhookEvent } from "palbase/backend";

interface VersionChanged {
  app_id: string;
  name: string;
  version: string;
  previous_state: string | null;
  state: string;
  result: "approved" | "rejected" | null;
}

export class VersionEvents {
  @On("stores.version.changed")
  changed(event: WebhookEvent<VersionChanged>): void {
    const { name, version, state, result } = event.data;
    if (result === "rejected") Log.warn("App Review rejected a version", { name, version, state });
    if (state === "READY_FOR_DISTRIBUTION") Log.info("a version is on the App Store", { name, version });
  }
}
```

```ts
// src/modules/releases/releases.module.ts
import { Module } from "palbase/backend";
import { VersionEvents } from "./version-events";

@Module({ providers: [VersionEvents] })
export class ReleasesModule {}
```

`result` is App Review's answer, set only in a state that is one: `approved` from `PENDING_DEVELOPER_RELEASE` on, `rejected` in `REJECTED`, `METADATA_REJECTED` or `INVALID_BINARY`.

## An Apple ID

Apple's API leaves some of App Store Connect to a person on its website: App Review's messages in the Resolution Center and the answer to them, the App Privacy details, and making an app's record. Sign in with an Apple ID of your team, and Palbase does them with the session App Store Connect's own pages use, as fastlane does. It is optional; the [App Store Connect key](https://palbase.studio/docs/distribution/testflight#connect-app-store-connect) does everything else.

An Apple ID is signed in to the environment's team: the team of its App Store Connect key or, with no key yet, the team its iOS apps are in. When the Apple ID is in that team, Palbase chooses it for you; when it is in other teams alone, the sign-in is refused with `422 apple_team_mismatch`, naming the Apple ID's teams and the environment's, and nothing is kept.

You sign in once for the whole organization. An environment with no session of its own is lent one that another environment of its organization signed in to the same team — staging and production of a project, or two projects of one company account, sign in once — for a person who is an owner or an admin of the environment it was signed in for: Studio, and the CLI with your sign-in. `GET /stores/apple/session` says so with `shared_from`. A secret key, or an environment's token, reaches its own environment's session alone. Signing out, by such a person, signs it out for every environment that uses it. Each keeps its session until Apple ends it.

Sign in from Studio, under **App Distribution › Apple ID**, or ask for the link yourself with `POST /stores/apple/session/grants` and open its `connect_url`. Studio asks for a one-time link and opens Palbase's own sign-in page. You type the password there, and the page seals it to a key only the environment's stores module opens: nothing on its way reads it. The module hands it to Apple and keeps it nowhere: Palbase keeps only the session Apple gives back, sealed with the environment's own key.

From a terminal, `palbase stores:apple:connect --apple-id you@example.com` reads the password there, seals it the same way, then asks for Apple's code, and for the team when the Apple ID is in more than one of the environment's (`--team` names it). With `--print-link` it prints the one-time link instead, for a browser to open. `palbase stores:apple` shows the session, `stores:apple:check --apple-id` asks Apple about it again, and `stores:apple:disconnect --apple-id` signs it out.

A client of your own signs in the same way. The link's answer carries `seal_key`, the environment's X25519 public key. Seal the password to it with HPKE (RFC 9180, base mode, DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM), its info `palbase/stores/apple-id/password/1`, a NUL byte, then the link's `grant`, and post `{"grant", "apple_id", "password_sealed"}` to `POST /stores/connect/apple-id`, where `password_sealed` is the base64url of the encapsulated key and the ciphertext. A password in the clear is refused. Then you type the code Apple sends to your devices and, if the Apple ID is in more than one team, choose the one the environment's apps are in. A link takes three passwords and three codes, and an environment six passwords an hour, so that Apple does not lock the Apple ID. Signing an Apple ID in, and out, is an owner's or an admin's.

Apple ends a session after a few weeks, and when the Apple ID's password changes. Palbase checks it every six hours. When it has ended, the person who signed it in gets an email (the organization's owners, if they are no longer an owner or an admin), the environment gets the `stores.apple.session.expired` event, and what needs the Apple ID answers `409 apple_id_expired` until someone signs in again. Studio's **Apple ID** panel, or `GET /stores/apple/session`, shows whose it is, its team and whether Apple still takes it; **Sign out**, or `DELETE /stores/apple/session`, signs it out, at Apple too.

### Keys, made for you

With an Apple ID signed in, Palbase makes the keys the environment lacks at Apple and connects them, so no one downloads a `.p8` and carries it over:

- **The App Store Connect API key**: Admin, every app. Connected as one you upload would be, and asked of Apple's API first. Disconnecting it (`DELETE /stores/apple`) revokes it at Apple.
- **APNs keys**: two, one for production and one for the sandbox, each scoped to the environment's iOS apps of the Apple ID's team (Apple makes a key scoped to apps for one environment; an app of another team is none of its). The notify module takes them as the environment's APNs provider: each environment's pushes are signed with its own key.
- **The In-App Purchase key**: for one of the environment's iOS apps (name it when there is more than one). The purchases module connects it, and asks the App Store Server API with it first.

In Studio, **App Distribution › Apple ID** lists them under **Keys**, what the environment lacks ticked: **Make and connect** makes them, with one confirmation. Over the API, `POST /stores/apple/keys` makes one kind a request: `{"kind": "asc" | "apns" | "iap", "bundle"}`; `GET /stores/apple/keys` lists them and where each stands (`waiting` for its module, `taken`, `refused`, `revoked`).

A key the environment connected itself is kept: making one is refused with `409 key_connected`, and the module that has one of its own refuses the one made, which is revoked at Apple at once. Each key's `.p8` is read from Apple once, sealed with the environment's key, and handed to its module over Palbase's internal network; once taken, the stores module drops its copy. `DELETE /stores/apple/keys/{key_id}`, or **Revoke** beside it in Studio, revokes an APNs or In-App Purchase key Palbase made.

Apple makes keys for an Admin or the Account Holder of the team: an Apple ID of another role is told `409 apple_role_insufficient`. Making and revoking keys is an owner's or an admin's of the environment, never an environment's token's (`403 token_out_of_scope`): a key outlives it. The App Store Connect key is made with the Admin role, as the key you would connect yourself is: it reaches the team's users too, so revoke it if you stop using Palbase for the app.

### App Review's messages

`GET /stores/apps/{app_id}/review` is the app's Resolution Center: each thread with its messages as plain text, the guidelines each rejection names, its attachments and the answer not sent yet. An attachment is read with `GET /stores/apps/{app_id}/review/threads/{thread_id}/attachments/{attachment_id}`. You answer with a draft, `PUT /stores/apps/{app_id}/review/threads/{thread_id}/draft`, which App Store Connect keeps as its website's, then send it with `POST /stores/apps/{app_id}/review/threads/{thread_id}/draft/send`. From a terminal: `palbase stores:app-review <app id>`, and `stores:app-review:answer` writes the draft (`--send` sends it).

While a version of the app is in App Review, or was rejected in the last 30 days, Palbase reads its Resolution Center every ten minutes. Each message it has not told yet is the environment's `stores.review.message` event, with its text, the guidelines (`reasons`) and the attachments. Your own answer is not told back.

### App Privacy

`GET /stores/apps/{app_id}/privacy` is the app's privacy details as App Store Connect has them. `PUT` writes them, in Apple's words, one line per kind of data and purpose, or `DATA_NOT_COLLECTED` alone. The lines it lacks are made and the ones not asked for removed, and `"publish": true` publishes them. Once published, the version's missing list stops asking for App Privacy. From a terminal: `palbase stores:privacy <app id>`, and `stores:privacy:set <app id> --file usages.json --publish` with the lines as a list.

```json
{
  "usages": [
    { "category": "USER_ID", "purpose": "APP_FUNCTIONALITY", "data_protection": "DATA_LINKED_TO_YOU" },
    { "category": "PURCHASE_HISTORY", "purpose": "APP_FUNCTIONALITY", "data_protection": "DATA_LINKED_TO_YOU" }
  ],
  "publish": true
}
```

### The app's record

An app [linked to the App Store](https://palbase.studio/docs/distribution/testflight#link-the-app) without its App Store Connect record gets one with `POST /stores/apps/{app_id}/record` and its App Store name (`{"name": "Shop"}`): Palbase makes the record and links the app to it. The team's first app also needs `company_name`, the seller's name. `DELETE` removes the record, as App Store Connect's **Remove App** does: Apple takes it for an app never approved. Each is the environment's `stores.app.changed` event (`record_made`, `record_removed`). From a terminal: `palbase stores:apps:record <app id> --name Shop`, and `stores:apps:record:remove <app id>`.

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and events
- [TestFlight](https://palbase.studio/docs/distribution/testflight): the Apple account, the build App Review gets, Beta App Review
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
