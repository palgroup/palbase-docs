> The full documentation index: https://palbase.studio/llms.txt

# Paywalls

A **paywall** is what an app shows to sell the catalog. It is designed once, as one JSON definition, and drawn natively from it — in SwiftUI on iOS (`PalbasePurchasesUI`), in the page on the web (`palbase/web`) — with each store's own prices filled in on the device.

A **placement** is a place in the app that shows a paywall: `onboarding`, `settings`, `out_of_credits`. The app asks for the placement, never for a paywall, so what it shows is decided in Studio or with the CLI — a new design, targeting rules, an experiment — and reaches the apps with no app update.

## Quick example

From a template to a placement the app asks for:

```sh
palbase purchases:paywalls:templates -E staging
palbase purchases:paywalls:new spring --template <key> -E staging
palbase purchases:paywalls:validate --file palbase/paywalls/spring.json -E staging
palbase purchases:paywalls:preview --file palbase/paywalls/spring.json --all -E staging
palbase purchases:paywalls:put spring --file palbase/paywalls/spring.json --revision 0 --publish -E staging
palbase purchases:placements:set settings --paywall spring -E staging
```

The web app draws it:

```ts
// app/settings.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function upgrade(container: HTMLElement): Promise<void> {
  const paywall = await pb.purchases.paywall("settings");
  paywall?.render(container, { successUrl: "https://app.example.com/thanks", cancelUrl: "https://app.example.com/settings" });
}
```

And the iOS app:

```swift
import PalbasePurchasesUI
import SwiftUI

struct SettingsView: View {
    @State private var showPaywall = false

    var body: some View {
        Button("Go Pro") { showPaywall = true }
            .paywall(placement: "settings", isPresented: $showPaywall)
    }
}

// Once, at the root of the app:
// RootView().palbasePurchases(pb.purchases).paywallLinks(terms: termsURL, privacy: privacyURL)
```

In Studio, **Purchases › Paywalls** does all of it: start from a template, edit its components, texts and colors with a live preview, publish, and give a placement its paywall.

## The definition

A paywall is a design system and a free layout of components that name it:

- **`theme`** — colors by name for light and dark (at least `background`, `surface`, `text`, `muted`, `accent` and `on_accent`), a type scale, radii and spacing.
- **`root`** — the part that scrolls, between a fixed **`header`** and **`footer`**; **`sheets`** it opens.
- **Components** — stacks, texts, icons, images, videos, dividers, spacers, buttons, packages, the purchase button, tabs, a switch, carousels, a countdown, a timeline, a features list, an HTML block — each with a style, a condition to be shown, a style for when it is selected, and an entrance animation.
- **Texts** — in each language the paywall has (`locales`), falling back to `default_locale`. A text holds variables the app fills from its store: `{{price}}`, `{{price_per_month}}`, `{{period}}`, `{{trial}}`, `{{savings}}`, `{{product_name}}`, `{{offer_price}}`. Prices are never in the definition. A text naming a variable its package has no value for — no trial, no savings — is not drawn.
- **Packages** — the catalog's plans it sells, as `product` and `plan`.

The least a paywall is — a title, a package that says its own price, the button that buys it, and the links App Review expects:

```json
{
  "schema": 2,
  "name": "Simple",
  "default_locale": "en",
  "theme": {
    "colors": {
      "light": { "background": "#FFFFFF", "surface": "#F2F2F7", "text": "#111114", "muted": "#6B6B70", "accent": "#5B5BD6", "on_accent": "#FFFFFF" },
      "dark": { "background": "#000000", "surface": "#1C1C1E", "text": "#F5F5F7", "muted": "#9A9AA0", "accent": "#8E8EF5", "on_accent": "#000000" }
    }
  },
  "root": {
    "type": "stack",
    "spacing": 16,
    "align": "stretch",
    "style": { "padding": 24, "background": "background" },
    "children": [
      { "type": "text", "text": "Go Pro", "size": 28, "weight": 700 },
      { "type": "spacer" },
      {
        "type": "package",
        "product": "pro",
        "plan": "monthly",
        "selected": true,
        "style": { "padding": 16, "corners": 14, "background": "surface" },
        "children": [{ "type": "text", "text": "{{product_name}} — {{price}} / {{period}}", "weight": 600 }]
      },
      {
        "type": "purchase_button",
        "style": { "height": 52, "corners": 14, "background": "accent" },
        "content": { "type": "text", "text": "Continue", "color": "on_accent", "weight": 600 }
      },
      {
        "type": "stack",
        "axis": "horizontal",
        "spacing": 24,
        "distribution": "center",
        "children": [
          { "type": "button", "action": { "type": "restore" }, "visible": { "platform": ["ios", "android"] }, "content": { "type": "text", "text": "Restore", "size": 13, "color": "muted" } },
          { "type": "button", "action": { "type": "terms" }, "content": { "type": "text", "text": "Terms", "size": 13, "color": "muted" } },
          { "type": "button", "action": { "type": "privacy" }, "content": { "type": "text", "text": "Privacy", "size": 13, "color": "muted" } }
        ]
      }
    ]
  }
}
```

Every component and field, their bounds and two more examples to start from are in the CLI's guide — `palbase purchases:paywalls:guide`, made from the definition's JSON Schema, which `palbase purchases:paywalls:schema` writes for an editor to check a file against. A definition is held to bounds: 128 KiB of JSON, 400 components, 16 deep, 500 characters a text, 40 languages.

## Drafts and versions

A paywall has a **draft** and its **published versions**. The apps see only what is published.

| Command | What it does |
|---|---|
| `palbase purchases:paywalls` | The paywalls: each one's draft revision, the version published, and the placements that show it. |
| `palbase purchases:paywalls:get <name>` | Writes the draft — or `--version <n>` — to `palbase/paywalls/<name>.json`, with its revision. The file's first line names its JSON Schema, written beside it. |
| `palbase purchases:paywalls:validate --file <file>` | Checks it as publishing would, saving nothing: every rule of the schema, and every package against the catalog. |
| `palbase purchases:paywalls:put <name> --file <file> --revision <n>` | Saves it as the draft, on the revision it was edited from; `--revision 0` makes a new paywall. `--publish` publishes it too. |
| `palbase purchases:paywalls:publish <name>` | Publishes the draft as the next version. |
| `palbase purchases:paywalls:delete <name>` | Deletes the paywall and its versions — not one a placement or a running experiment shows. |

A problem's path is where it is in the file (`root.children[2].content.text`). A **warning** — what App Review expects of a subscription's paywall: a restore button, the legal links — does not stop a save or a publish; a broken rule does (`422 invalid_paywall`, every problem listed). Of two people editing at once, the second is told (`412 paywall_changed`), never overwritten. Publishing checks the paywall as the apps will get it: every package must be one the catalog sells, every asset still the bytes registered. A draft the same as the newest version publishes nothing new.

The newest 50 versions are kept. Each publish emits `purchases.paywall.published`; the apps asking for a placement that shows the paywall get the new version at once.

**Look before saving.** `palbase purchases:paywalls:preview` draws the file with the SDK's own renderer in a headless browser — Chrome, Chromium, Edge or Brave — as a PNG of the platform's screen; `--all` draws every platform in both appearances at both text sizes. `palbase purchases:paywalls:check` measures what is drawn on every screen and lists what is wrong — text cut off, a purchase button not on the first screen, contrast under WCAG's, targets too small — and exits 1 while anything is.

## Assets

A definition names the project's images, videos, fonts and HTML blocks as `asset:<id>`:

```sh
palbase purchases:paywalls:assets:upload hero.webp --kind image -E staging
```

The file goes to the project's public bucket `paywall-assets` — made when there is none — and is registered: the environment reads it there, says what it is by its bytes, and keeps their SHA-256. An app draws an asset only when what it downloaded is those bytes, and a paywall naming an asset whose file was since changed or removed is refused when published.

| Kind | Formats | At most |
|---|---|---|
| `image` | PNG, JPEG, WebP | 2 MiB |
| `video` | MP4, MOV | 50 MiB |
| `font` | TTF, OTF, WOFF2 | 5 MiB |
| `html` | A zip with `index.html` at its root | 5 MiB |

`palbase purchases:paywalls:assets` lists them; `:assets:delete` forgets one no paywall names. A project has at most 500 assets and 100 paywalls.

## Placements

```sh
palbase purchases:placements:set onboarding --paywall spring -E staging
```

gives a placement its **default paywall** — what it shows whoever none of its rules holds for — and makes the placement when it is new. A placement's key is lowercase letters, digits, `_` and `-`, 64 at most; a project has at most 200.

When an app asks for a placement, what it gets is decided in this order:

1. An **experiment** running for everyone at the placement: the viewer's variant.
2. The placement's **rules**, in order: the first in effect whose conditions all hold shows its paywall, or the variant of the experiment it sends to.
3. The placement's **default** paywall.

Each app gets the newest version it can draw: it says the newest paywall schema its SDK draws, and an app on an older SDK keeps getting the last version written in one it knows. With nothing published there — or no such placement — the SDK draws its own paywall from the catalog: every plan the store sells (the first six) with its price and period, the purchase button, the legal links and — in an app — restore, in the system's colors.

`palbase purchases:placements` lists them; `palbase purchases:placements:delete <placement>` forgets one, and the apps asking for it draw their own.

### Targeting rules

A placement's rules are one file, every rule in the order they are read:

```sh
palbase purchases:placements:rules:get onboarding --out palbase/onboarding-rules.json -E staging
```

```json
{
  "rules": [
    {
      "name": "Turkey, not yet Pro",
      "state": "live",
      "conditions": [
        { "field": "country", "op": "in", "values": ["TR"] },
        { "field": "entitlement", "op": "lacks", "values": ["pro"] }
      ],
      "target": { "paywall_id": "<a published paywall's id>" }
    },
    {
      "name": "Black Friday",
      "state": "scheduled",
      "starts_at": "2026-11-27T00:00:00Z",
      "ends_at": "2026-12-01T00:00:00Z",
      "conditions": [{ "field": "app_version", "op": "gte", "value": "2.4.0" }],
      "target": { "paywall_id": "<a published paywall's id>" }
    }
  ]
}
```

```sh
palbase purchases:placements:rules:put onboarding --file palbase/onboarding-rules.json --revision 4 -E staging
```

A rule is `live`, `scheduled` (in effect from `starts_at`, until `ends_at`) or `inactive`. Its target is a published paywall (`paywall_id`) or the experiment running on the placement for the rules (`experiment_id`). At most 50 rules of at most 10 conditions; a rule with none holds for everyone.

| `field` | `op` | What it reads |
|---|---|---|
| `country` | `in`, `not_in` | The store's country the app sends, else the country of the request's address. ISO 3166-1 codes. |
| `platform` | `in`, `not_in` | `ios`, `android`, `web`. |
| `app` | `in`, `not_in` | The registered app's id. |
| `app_version` | `eq`, `neq`, `gt`, `gte`, `lt`, `lte` | The app's version, ordered as Semantic Versioning orders them. |
| `sdk_version` | the same, with `sdk` | The version of the SDK named (`palbase-swift`): a viewer on another SDK does not meet it. |
| `locale` | `in`, `not_in` | The first language the request asks for: `tr` covers `tr-TR`, `en-GB` covers `en-GB` alone. |
| `entitlement` | `has` (any of `values`), `lacks` (none of them) | The signed-in user's active entitlements, as the server knows them. |
| `first_seen_days` | `gt`, `gte`, `lt`, `lte` | Whole days since the user was first seen, as the server knows it. |
| `attribute` | `in`, `not_in`, `exists`, `not_exists`, `gt`, `gte`, `lt`, `lte`, with `key` | What the app says of the viewer: `pb.purchases.paywall("onboarding", { attributes: { plan: "free", sessions: 12 } })`. |

A value the request does not carry meets no condition on it, `not_in` included (`not_exists` aside). An app sends at most 20 attributes — texts, numbers or yes/no — of 2 KiB together.

**Targeting picks what to show; it is not access control.** The country, the attributes and the versions are what the app says of itself: no price or entitlement may hang on them.

| Command | What it does |
|---|---|
| `palbase purchases:placements:preview <placement>` | What the placement shows a viewer and why — the experiment, the rule that decided with every rule condition by condition, or the default — for `--platform`, `--country`, `--app-version`, `--locale`, `--attr`, `--user`, at `--at`; `--rules <file>` tries rules not yet saved. Nothing is counted. |
| `palbase purchases:placements:results <placement>` | What each rule, each variant and the default showed, and what its viewers did: exposures, viewers, purchases, conversion, revenue. |
| `palbase purchases:placements:attributes` | The attribute keys the apps sent, the most used first: suggestions for conditions. The keys are kept, never the values. |

## Experiments

An experiment splits a placement between 2 to 4 published paywalls, by weight. Each viewer — the signed-in user, a guest included, else the installation — sees the same variant every time, and the results say which sells best.

```sh
palbase purchases:experiments:start onboarding --variants spring=50,classic=50 -E staging
palbase purchases:experiments:results <experiment> -E staging
palbase purchases:experiments:winner <experiment> --variant a -E staging
```

| Audience | Who is in it |
|---|---|
| `placement` (the default) | Everyone at the placement, decided before its rules. The placement keeps its default for when the experiment ends. |
| `rules` | Only the viewers the placement's rules send to it: a rule's target names the experiment. |

One experiment runs on a placement at a time. Variants are keyed `a`, `b`, `c`, `d` unless `--variants` names them (`control:classic=50`); the **first** is what a stop keeps.

**The results** count, for each variant, its exposures and viewers, and the purchases its viewers made within the window after first seeing it (7 days unless `--window-days` says): the purchases the stores confirmed, never what an app reports — each counted once, for the first variant its buyer saw. Revenue is what was paid to date, renewals in, refunds out. Each variant's chance to convert best is Bayesian; the leader is called **confident** once every variant has been seen enough and its chance is high enough, and until then the results say why not. Test purchases count with `--sandbox`.

| Command | What it does |
|---|---|
| `palbase purchases:experiments:stop <experiment>` | Stops it at once: what it showed becomes its first variant's paywall. |
| `palbase purchases:experiments:winner <experiment> --variant <key>` | Ends it with a winner: for everyone at the placement, the winner becomes the placement's default — or, `--as-rule`, a live rule at the top of its rules shows it to everyone, to narrow later. For the rules, the rules that sent to it show the winner. |

Results stay after an experiment ends. In Studio, **Purchases › Experiments** starts one, shows its results and gives the winner to everyone in one step.

## In the app

The SDK asks for the placement in the newest schema it draws, with the app's version, its platform, its language and the attributes it is given; keeps the answer on the device, to ask again with its ETag and to show offline; downloads the assets and checks each; and counts the paywall shown, for the results. Purchases are never reported with it: the results read the ledger.

| Platform | How |
|---|---|
| Web | `pb.purchases.paywall(placement, { attributes })`, then `render(container, { successUrl, cancelUrl, links, onClose })`. The purchase button opens Stripe Checkout; the web has no restore button. See [Web › A paywall on the web](https://palbase.studio/docs/purchases/web#a-paywall-on-the-web). |
| iOS | `PaywallView(placement:)`, `.paywall(placement:isPresented:)`, or `.presentPaywallIfNeeded(entitlement:placement:)`, under `.palbasePurchases(pb.purchases)`. Its purchase button buys with StoreKit, its restore button restores, and it closes after a purchase. `.paywallComponent(id)` draws the app's own view in place of a component Studio named. See [iOS › Purchases](https://palbase.studio/docs/ios/purchases). |
| Android | The Android SDK does not draw paywalls: an Android app shows the products from `pb.purchases.products()` in its own screen. |

Any other client reads the placement with the publishable key: `GET /purchases/placements/{placement}/paywall` answers the definition and what it sells, or `204` when the app is to draw its own.

## Related

- [Catalog](https://palbase.studio/docs/purchases/catalog): the packages a paywall sells
- [Offers & Coupons](https://palbase.studio/docs/purchases/offers): a package sold with an offer shows `{{offer_price}}`
- [Charts](https://palbase.studio/docs/purchases/charts): revenue and subscriptions by paywall and experiment
- CLI: [`purchases:paywalls`](https://palbase.studio/docs/cli/reference#palbase-purchasespaywalls), [`purchases:placements`](https://palbase.studio/docs/cli/reference#palbase-purchasesplacements), [`purchases:experiments`](https://palbase.studio/docs/cli/reference#palbase-purchasesexperiments)
