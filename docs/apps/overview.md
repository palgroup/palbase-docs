> The full documentation index: https://palbase.studio/llms.txt

# Client Apps

An app is one product on one platform that calls the project: an iOS app, an Android app or a web app. You register it once in the project, then say what it is in each environment: its bundle on iOS, its package and signing certificates on Android, its origins on the web. From that, each environment gives the app a publishable key of its own, publishes the files Apple and Google read before an app may use the environment's passkeys, and learns which sites may call it and where a sign-in may return to.

Apps are registered with the CLI, or with Studio's API as the CLI does. Studio lists each app's key, by its last characters, under **Settings › API keys**, but has no screen to register an app.

## Quick example

```sh
# Once per project.
palbase apps:create ios "Shop" --team-id ABCDE12345
palbase apps:create android "Shop Android" --slug shop-android
palbase apps:create web "Shop Web"

# In each environment the app runs against.
palbase apps:env:set shop --bundle com.acme.shop -E main
palbase apps:env:set shop --bundle com.acme.shop.staging -E staging
palbase apps:env:set shop-android --package com.acme.shop --sha256 play_signing=AB:CD:EF:… --sha256 debug=12:34:56:… -E main
palbase apps:env:set shop-web --origin https://shop.example.com --redirect https://shop.example.com/auth/callback -E main

# Write the settings into the app's repository, from its root.
palbase apps:sync shop
```

The first `apps:env:set` in an environment prints the app's publishable key there. `palbase apps:sync` writes the app's settings and its backends' clients under `palbase/` in its repository: [Syncing an App's Settings](https://palbase.studio/docs/apps/sync).

## Registering an app

```sh
palbase apps:create ios|android|web <name> [--slug <slug>] [--team-id <id>] [--app-id-prefix <prefix>]
```

| | |
|---|---|
| Name | What it is called, 1 to 100 characters. `palbase apps:update <app> --name <name>` renames it. |
| Slug | Its name in a checkout and on the command line: `palbase/environments/<env>/<slug>.json`. Lower-case letters, digits and dashes, starting with a letter, 2 to 40 characters; made from the name unless `--slug` gives it. One per project. |
| Platform | `ios`, `android` or `web`, for good. The same product on another platform is another app. |
| Apple team | An iOS app's: `--team-id`, the 10 characters under **Apple Developer › Membership**. Required. `--app-id-prefix` only when the app's App ID prefix is not the team's: an app made before 2011, or one moved from another team. |

An app's widgets, notification service and other extensions are not apps of their own. Apple gives them bundles under the app's, and they share its sign-in.

A registered app is in no environment yet. `palbase apps:list` lists the project's apps with what each is in every environment; `palbase apps:get <app>` shows one, with its publishable key in each. The `apps:` commands name an app by its slug or its id. The id is a UUID, printed with `--json` and kept in the app's settings; the [App Distribution](https://palbase.studio/docs/distribution/overview) commands take it.

## What an app is in an environment

```sh
palbase apps:env:set <app> [--bundle <id> [--app-clip <id>] [--watch <id>]] [--package <id> --sha256 <label>=<fingerprint>…] [--origin <url>… --redirect <url>…] -E <env>
```

| Platform | Flags | What is checked |
|---|---|---|
| iOS | `--bundle`; `--app-clip`, `--watch` | A bundle identifier (`com.acme.shop`). An App Clip's and a watch app's bundle is the app's followed by one more part (`com.acme.shop.Clip`): Apple installs them under no other. |
| Android | `--package`; `--sha256 <label>=<fingerprint>`, once per certificate | The application ID, and the SHA-256 of every certificate the app is signed with, as Play Console and `keytool` print it (hex, with or without colons). A label is a short lower-case name: `play_signing`, `upload`, `debug`. At most 20 certificates. |
| Web | `--origin`, `--redirect`, each given again for more (or comma-separated) | 1 to 20 origins and at most 20 redirects. |

On Android, the certificate that matters on a device is the one the installed build is signed with: Google's app signing key for a build from Play (**Play Console › App signing**, not the upload key), and your debug key for a build from your computer (`./gradlew signingReport`). Give each.

A web origin is `https://` and a domain name a passkey can be used from: a registrable one, written in ASCII (punycode for an international name), with a port when it is not 443 and no path. `http://` is taken only for `localhost` or a loopback address. A redirect is an `https` address (`http` only on this computer) without a fragment; a wildcard in its host names part of one site's names, `https://*-preview.example.com/**`, never a whole site.

Setting an app again replaces what it is in that environment; its key stays. A value that is not one of these is refused with the field and why (`400 invalid_app`). The environment also refuses:

- a bundle, package or origin another app of the same platform has in the environment (`409 identity_taken`): Apple, Google and the browser could not tell the two apart;
- web origins across the environment's web apps on more than five registrable domains (`409 too_many_web_domains`): a browser takes related origins from five at most and skips the rest without a word;
- a 51st app in the environment (`409 too_many_apps`).

The same bundle, package or origin in two environments is said, not refused. Two builds can then not be installed side by side, and a device with both mixes their sign-ins: Apple and Google suggest a bundle of its own per environment.

`palbase apps:env:unset <app> -E <env>` takes the app out of one environment: its key there is revoked, and the environment's files stop naming it.

## Its publishable key

Each app has its own publishable key in each environment it is set in, `pb_<ref>_c…`, made the first time it is set there. It is a publishable key like any other: it ships in the app, its role is `anon`, and the signed-in user's token decides whose data a request reaches ([The keys](https://palbase.studio/docs/getting-started/introduction#the-keys)).

- **It is kept, not shown once.** Every copy of the app carries it, so `palbase apps:get <app>` prints it, `palbase apps:sdkconfig <app> -E <env>` prints the environment's settings with it, and `palbase apps:sync` writes it into the checkout.
- **An app has one live key.** `palbase keys:list` names it `app: <name>`. Revoking it (`palbase keys:revoke <key id>`) refuses the old key from then on and gives the app a new one in the same step, which `apps:sync` and `apps:sdkconfig` hand out. A build that carries the old key stops reaching the environment until it is rebuilt.
- One app's key is replaced, or taken out of an environment, without touching another app's.

The environment also has the publishable key it was made with, and any made under **Settings › API keys › Create publishable key** (`palbase keys:create --kind publishable`). Those are shown once, when they are made.

## What the environment publishes

Every environment serves three files at its address, `https://<ref>.palbase.studio`, with no key, the way Apple, Google and browsers fetch them:

| Path | What it holds | Who reads it |
|---|---|---|
| `GET /.well-known/apple-app-site-association` | `webcredentials.apps`: `<App ID prefix>.<bundle>` for each iOS app, its App Clip and its watch app | iOS, before the app may use the environment's passkeys |
| `GET /.well-known/assetlinks.json` | One statement per Android app with a certificate: `delegate_permission/common.get_login_creds` for its package and the SHA-256 of each certificate | Android's Credential Manager, before the app may use the environment's passkeys and saved passwords |
| `GET /.well-known/webauthn` | `origins`: the web apps' `https` origins, sorted | A browser on one of those sites, before it uses a passkey whose relying party is the environment's address |

Each answers `200` with `application/json` and `Cache-Control: public, max-age=300`, and an empty list when the environment has no such app, so a device that is not associated says "not associated" rather than failing to fetch. Universal Links and App Links are not claimed: links on the environment's address are not an app's to open.

Apple's CDN caches its file: an iOS device sees a change in a day or so. Android 15 checks again within a week. The app's own half on iOS is the **Associated Domains** entitlement `webcredentials:<ref>.palbase.studio`, which its settings name in `auth.associated_domains` ([iOS SDK](https://palbase.studio/docs/ios/overview#connect-the-app-to-the-project)).

## What else an app decides

| Platform | What the environment does with it |
|---|---|
| iOS | Accepts App Attest keys from the app and its watch app (an App Clip attests as its app). Matches an App Store purchase, and a purchase made in Xcode with its StoreKit file, to the registered bundle. The app's settings name the keychain group its sign-in is kept in: `<App ID prefix>.<bundle>.palbase`. |
| Android | Accepts a passkey ceremony from the app as signed with one of its certificates. Reads a Google Play purchase the app reports from Play under its package. |
| Web | Accepts a passkey ceremony from its `https` origins. Starts every [machine](https://palbase.studio/docs/machines/overview) of the environment with its origins, and a `palbase/backend` app answers their browsers' cross-origin requests by itself ([Calling Your Backend](https://palbase.studio/docs/web/backend-calls)); a change rolls the machines out again with the new list. Adds its redirects to the addresses an auth email's link may return to ([Web Auth](https://palbase.studio/docs/web/auth#where-email-links-land)). |
| Every platform | A web checkout's `success_url` and `cancel_url` return to a web app's origin, or to an iOS or Android app's own scheme: its bundle or its package. |

While App Attest is in `monitor` or `enforce` in an environment, its last iOS app cannot leave it, by `apps:env:unset` or `apps:delete`: a gate with no app would refuse every client. Turn App Attest off there first (`palbase auth:settings:set app_attest_mode=off -E <env>`).

## Deleting and restoring an app

```sh
palbase apps:delete shop
palbase apps:restore shop
```

A deleted app is suspended in every environment for 30 days: its keys are refused and the environments stop publishing it, so every build of it stops reaching the project at once. `apps:delete` asks first; `-y` confirms without asking. `palbase apps:restore` brings it back as it was, with the same keys, until the 30 days are out. Then it is removed for good, its keys revoked. `apps:list` shows a deleted app with the day it is removed, and `apps:sync` refuses to write a checkout that builds it meanwhile.

`palbase apps:update <app> --team-id <id>` moves an iOS app to another Apple team, and `--app-id-prefix ""` sets its prefix back to the team's; every environment it is in is told.

## Who can do what

| | Registers, changes, deletes apps | Reads apps and their settings |
|---|---|---|
| A member of the organization | — | Yes |
| An admin, signed in or with an admin [access token](https://palbase.studio/docs/getting-started/access-tokens) | Yes | Yes |
| An environment token | — | Its own environment's alone, with the `apps:sync` scope or none |

An admin access token registers a product's apps with no one signed in, as a Firebase service account adds an app. Studio's API, which the CLI calls:

| Call | What it does |
|---|---|
| `GET /v1/projects/{id}/apps` | The project's apps, each with what it is and its key in every environment |
| `POST /v1/projects/{id}/apps` | Registers one: `{ "platform", "name", "slug"?, "team_id"?, "app_id_prefix"? }` |
| `GET`, `PATCH`, `DELETE /v1/projects/{id}/apps/{app}` | Reads, changes (`name`, `team_id`, `app_id_prefix`) or deletes one |
| `POST /v1/projects/{id}/apps/{app}/restore` | Restores a deleted one |
| `PUT /v1/environments/{ref}/apps/{app}` | What it is in the environment: `{ "ios": { "bundle", "app_clip"?, "watch"? } }`, `{ "android": { "package", "fingerprints": [{ "label", "sha256" }] } }` or `{ "web": { "origins": [], "redirects"? } }`; the answer has its key and any `warnings` |
| `DELETE /v1/environments/{ref}/apps/{app}` | Takes it out of the environment |
| `GET /v1/environments/{ref}/apps/{app}/config` | Its settings in the environment, as `apps:sdkconfig` prints them |

`{id}` is the project's id, `{ref}` the environment's, `{app}` the app's id.

## Related

- [Syncing an App's Settings](https://palbase.studio/docs/apps/sync): what `palbase apps:sync` writes into the app's repository
- [App Distribution](https://palbase.studio/docs/distribution/overview): an app's builds to TestFlight and Google Play
- [Web Auth](https://palbase.studio/docs/web/auth#passkeys): passkeys from a web app
- [CLI reference: `apps`](https://palbase.studio/docs/cli/reference#apps)
