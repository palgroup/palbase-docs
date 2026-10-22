> The full documentation index: https://palbase.studio/llms.txt

# App Health

Palbase follows each linked app in its store. An iOS app's App Store Connect webhook tells the environment each change of the app's version, builds and testers' feedback the moment it happens; an Android app's Play releases are read every 10 minutes; and both stores' crash data is read as they publish it. Each change is an event to the environment's [webhooks](https://palbase.studio/docs/server/webhooks) and to a backend's [`@On` handlers](https://palbase.studio/docs/backend/hooks).

Studio shows it under **App Distribution › Health**, for each linked app.

## The App Store Connect webhook

When an iOS app is linked and has its App Store Connect record, Palbase makes the app's webhook in App Store Connect, named `Palbase`, pointed at the environment's own address. Apple tells it:

| Apple's event | What Palbase tells |
|---|---|
| `APP_STORE_VERSION_APP_VERSION_STATE_UPDATED` | `stores.version.changed` |
| `BUILD_UPLOAD_STATE_UPDATED` | `stores.build.changed` |
| `BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED` | `stores.beta_review.changed` |
| `BETA_FEEDBACK_CRASH_SUBMISSION_CREATED`, `BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED` | `stores.feedback.received` |

Every delivery is checked against Apple's signature with the webhook's own secret, and one Apple sends again is told once.

**Making a webhook needs the connected key's Admin or App Manager role.** A key with another role is refused: the webhook is `refused`, and Palbase tries again every day. Give the key the role in App Store Connect (**Users and Access › Integrations**), then make it again: Studio's **Make again**, or `POST /stores/apps/{app_id}/webhook`. A webhook Apple refused for another reason, or that it did not answer for, is `failed`: Palbase tries it again by itself, and **Make again** tries now.

**Palbase's reads stay behind it.** While App Review has a version, or it waits for its release, Palbase reads its state every two minutes, webhook or not, and an in-app purchase's while App Review has it: a change the webhook did not tell still reaches the same event, minutes later. Each new state is told once, whichever learned it first; a read in the two minutes after a delivery does not tell the state before it again. The build, Beta App Review and feedback events come from the webhook alone.

| `state` | What it means |
|---|---|
| `on` | Apple tells the webhook each change |
| `refused` | The connected key's role may not make webhooks (Admin or App Manager may); `error` says so |
| `failed` | Apple refused it otherwise, or could not be reached; `error` says why |
| `none` | Not made yet |

`GET /stores/apps/{app_id}/webhook` reads it: its `state`, `error`, `url`, the `event_types` Apple tells it, when it was made (`installed_at`) and last checked (`checked_at`), and Apple's last delivery (`last_delivery_type`, `last_delivery_at`). `POST /stores/apps/{app_id}/webhook/ping` asks Apple to send it a ping (`202`); its arrival is the webhook's `pinged_at`. Studio's **Ping** does the same and reads the webhook again until the ping shows. From a terminal:

```bash
palbase stores:webhook <app id>           # its state, where it reports, Apple's last delivery
palbase stores:webhook <app id> --ping    # asks Apple for a ping and waits for it to arrive
palbase stores:webhook <app id> --make    # makes it again, with a new secret
```

Each change of the webhook's state is `stores.webhook.changed`: `{ app_id, state, asc_webhook_id, error }`, `state` one of `on`, `refused` or `failed`.

## Who said it: `source`

The events a store can tell carry `source`, where the change was learned:

| `source` | From |
|---|---|
| `apple_webhook` | App Store Connect's webhook, the moment it happened |
| `poll` | Palbase's own read of the store |
| `action` | One of Palbase's own [actions](https://palbase.studio/docs/distribution/overview#actions), as it ran: a version sent to App Review, withdrawn or released |

`stores.version.changed` has it beside its other fields: `{ app_id, bundle_id, name, version, asc_version_id, previous_state, state, result, source }`.

## The events

| Event | When | `data` |
|---|---|---|
| `stores.webhook.changed` | An app's App Store Connect webhook came on, or was refused (the key's role) or failed | `{ app_id, state, asc_webhook_id, error }` |
| `stores.version.changed` | An app's App Store version came to a new state: sent to App Review, in review, approved, rejected, withdrawn, released | `{ app_id, bundle_id, name, version, asc_version_id, previous_state, state, result, source }` |
| `stores.build.changed` | A build upload of the app came to a new state at App Store Connect (processing, complete, failed): a delivery's, or a build uploaded any other way | `{ app_id, asc_upload_id, asc_build_id, version, build_number, state, package_id, source }` |
| `stores.beta_review.changed` | A build's TestFlight state for external testers changed: in Beta App Review, approved, rejected, ready for testing… | `{ app_id, asc_build_id, state, previous_state, package_id, source }` |
| `stores.feedback.received` | A tester sent TestFlight feedback: a crash with its log, or a screenshot | `{ app_id, kind, feedback_id, created_at, comment, device_model, os_version, locale, asc_build_id, package_id, crash_log, crash_log_cut, screenshots, source }` |
| `stores.product.changed` | An in-app purchase's or a subscription's App Store state changed: sent to App Review with a version, approved, rejected, back to ready to submit | `{ app_id, store, product_id, apple_id, kind, state, previous_state, source }` |
| `stores.play_release.changed` | A release on one of an Android app's Play tracks came to a new state: draft, in review, approved, not approved, published | `{ app_id, package_name, track, release_name, version_codes, state, previous_state, source }` |
| `stores.vitals.changed` | The store published a new day of an app's crash data | `{ app_id, platform, through, store, versions, anomalies, issues, crash_days, testflight_crashes }` |

- **`package_id`** is the package a delivery of Palbase's sent the build of, and `null` for a build uploaded another way.
- **`stores.feedback.received`** never carries the tester's address. A crash's `crash_log` is cut at 32 KiB, the exception and the crashed thread first (`crash_log_cut` says it was), and a screenshot's `screenshots` are Apple's links to its images, `{ url, width, height, expires_at }`, which stop working at `expires_at`.
- **`stores.vitals.changed`** carries the day: an App Store app's `crash_days` (crashes by version) and how many TestFlight crashes Apple keeps; an Android app's `versions` (the newest ten version codes' rates), and how many `issues` and `anomalies`. The rest is read with the call below.

## Testers' feedback

`GET /stores/apps/{app_id}/feedback` lists the app's newest TestFlight feedback, newest first. `GET /stores/apps/{app_id}/feedback/{kind}/{feedback_id}` reads one, `kind` being `crash` or `screenshot`: the tester's comment and address, the device (`device_model`, Apple's model id such as `iPhone17,1`), `os_version`, `locale`, the build the tester ran (`asc_build_id`, `bundle_id`), and a crash's `crash_log` or a screenshot's `screenshots`. Both read Apple now, with the secret key:

```bash
curl -s "https://<ref>.palbase.studio/stores/apps/${APP_ID}/feedback/crash/${FEEDBACK_ID}" \
  -H "apikey: $PALBASE_SECRET_KEY"
```

```json
{
  "kind": "crash",
  "id": "AJ3k…",
  "created_at": "2026-10-21T08:12:40Z",
  "comment": "It closed when I opened the cart",
  "device_model": "iPhone17,1",
  "os_version": "26.0.1",
  "asc_build_id": "8d1c…",
  "crash_log": "Exception Type:  EXC_CRASH (SIGABRT)\n…",
  "crash_log_cut": false
}
```

Studio's **Health** lists them under **Testers' crashes and screenshots**; opening one shows its device, system, build and log, or its images. The CLI reads the same:

```bash
palbase stores:feedback <app id>                          # the newest, with their ids
palbase stores:feedback:get <app id> crash <feedback id>  # one, with its log
```

## An app's health

`GET /stores/apps/{app_id}/vitals` reads the app's health from its store now. `through` is the last day the store's crash data is of, and `null` while it has none.

```bash
curl -s "https://<ref>.palbase.studio/stores/apps/${APP_ID}/vitals" \
  -H "apikey: $PALBASE_SECRET_KEY"
```

or `palbase stores:vitals <app id>`, which prints the same as tables.

An iOS app's answer has `apple`. An app not yet on the App Store has its TestFlight counts alone: Apple publishes the App Crashes report and the metrics for App Store versions only, once enough people who share their data ran them (the report needs at least five).


| Field | What it is |
|---|---|
| `crash_days` | The App Store's crashes by day and version, the last 30 days, newest first: `{ date, version, crashes, devices }`, from Apple's App Crashes report |
| `metrics` | Its App Store versions' terminations, hangs and launches: `{ category, identifier, version, value, unit, device, percentile }`, published by Apple once enough people who share their data ran a version |
| `testflight_crashes` | The newest crashes testers sent from TestFlight; read one with its log as above |
| `testflight_builds` | The newest five builds' TestFlight counts, newest first: `{ asc_build_id, version, build_number, uploaded_at, expired, from, to, installs, sessions, crashes, feedback, invites }`, what Apple counted of each over `from`–`to` (its window, at most a year); a build Apple counted nothing of has no `from` |
| `crash_counts` | Whether the App Crashes report can be read: see below |

| `crash_counts` | What it means |
|---|---|
| `ok` | The report is read |
| `none_yet` | Apple's report has no day yet |
| `requested` | Palbase asked Apple for the report now; its first days come in a day or two |
| `not_requested` | Palbase asks for it with its next round |
| `admin_key_needed` | Only an Admin key may ask Apple for an app's analytics reports, and the connected key is not one: an App Manager key makes the webhook and reads the rest, not this |

An Android app's answer has `play`, Google Play's Android vitals:

| Field | What it is |
|---|---|
| `through` | The last whole day the rates are of, in Play's time zone (America/Los_Angeles); `null` while Play has none (the app has too few users) |
| `versions` | Each version code's `crash_rate`, `user_perceived_crash_rate`, `anr_rate` and `user_perceived_anr_rate`, fractions of its `users` over the seven days to `through`, weighted by users; a rate is `null` where Play has too few users |
| `issues` | The app's errors of the last day, most reports first: `{ type, cause, location, users, reports, last_report_at, first_version_code, last_version_code, uri }`, `type` being `CRASH`, `ANR` or `NON_FATAL` and `uri` the error in Play Console |
| `anomalies` | The rates Play saw go wrong against the 28 days before: `{ metric, value, version_code, from, to }` |

What to do about a rate is the project's: the answer is the store's.

## Google Play

Play sends no notifications of a release's review, so Palbase reads each linked Android app's releases on Play's tracks every 10 minutes. A release's new state is `stores.play_release.changed`, with `source: "poll"`; one Play no longer lists is forgotten.

The stores publish a day's crash data once a day. Palbase reads each app's health every six hours, and a day newer than the last one told is `stores.vitals.changed`, for an iOS app and an Android app alike.

## In Studio

**App Distribution › Health**, for each linked app:

| Panel | What it holds |
|---|---|
| Apple webhook | An iOS app's webhook: its state, why it is not on, its address, Apple's last delivery and the last ping; **Ping** and **Make again** |
| Testers' crashes and screenshots | What testers sent from TestFlight, newest first; one opens with its device, system, build and crash log, or its images |
| App Store health | The newest builds' TestFlight counts, the day the App Store's crash data is of, crashes by day and version, and Apple's metrics |
| Play vitals | An Android app's rates by version code, its errors of the last day and Play's anomalies |

## Related

- [App Distribution](https://palbase.studio/docs/distribution/overview): packages, deliveries, actions and the other `stores.*` events
- [TestFlight](https://palbase.studio/docs/distribution/testflight): the App Store Connect key and its role
- [App Store](https://palbase.studio/docs/distribution/app-store): the version App Review gets, and its states
- [Google Play](https://palbase.studio/docs/distribution/google-play): the Play connection
- [Webhooks](https://palbase.studio/docs/server/webhooks): receiving the events
