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
| `--review-file` | App Review's details. A field the file leaves out stays as it is. The password goes to Apple and is never printed or kept. |

What you prepare is written to App Store Connect at once: it is no plan. Studio's **Version** panel holds the same form.

### What is missing

`stores:version` lists what App Review would refuse the version for, one line each, as App Store Connect holds it now: a processed build with its export compliance answer, the copyright, a primary category, the content rights statement, a price, the age rating, App Review's contact and demo account, and each language's name, description, keywords, privacy policy and support URLs, What's New and screenshots. A draft page you saved but did not write yet does not count: plan it and confirm it first. Sending the version is refused while the list is not empty (`409 version_incomplete`).

App Privacy is not on the list. Its questions are answered in App Store Connect, and Palbase cannot read them: answer them there before you send the version.

### Send it to App Review

```sh
palbase stores:version:submit 4f6c2d10-… -E main
palbase stores:actions:confirm <action id> --hash <hash> -E main
```

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

When App Review approves or rejects the version, the owners of the environment's organization get an email from Palbase. An approved version is released as you set it: one that waits for you is released from Studio's **App Store** page, or with `stores:version:release`. Apple gives no reason for a rejection over its API: read it in App Store Connect's **Resolution Center**, fix what it names, and send the version again.

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

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and events
- [TestFlight](https://palbase.studio/docs/distribution/testflight): the Apple account, the build App Review gets, Beta App Review
- [CLI reference: `stores`](https://palbase.studio/docs/cli/reference#stores)
