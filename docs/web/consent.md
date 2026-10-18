> The full documentation index: https://palbase.studio/llms.txt

# Consent

`pb.consent` keeps what the person allowed the app to collect and use, key by key. A choice stands in the browser the moment it is made — a key refused stops its data at once, before anything else is sent — and goes to the project with when it was made, later if the browser is offline. The project keeps every choice with when and where it was made, and what the SDKs collect follows the keys: [analytics](https://palbase.studio/docs/web/analytics) sends events only with `analytics` granted, a flag's audience condition and an in-app campaign to an audience reach only who allowed `personalization`, and the project's marketing messages skip whoever refused a channel's marketing key.

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  analytics: true,
  consent: {
    // What is collected before the person chooses: nothing, until they say.
    start: { analytics: "denied", performance: "denied" },
    // The version of the consent text this app shows.
    textVersion: "2026-10",
    // The app's own keys, listed after the platform's.
    customKeys: ["custom.chat_transcripts"],
  },
});
```

```ts
// src/consent-banner.ts
import type { ConsentState } from "palbase/web";
import { pb } from "./lib/palbase";

/** Draws a choice for every key the person is still to be asked about. */
export async function showConsentBanner(root: HTMLElement): Promise<void> {
  const ask = new Set(await pb.consent.needsAsking());
  if (ask.size === 0) return;
  const keys = (await pb.consent.keys()).filter((k) => ask.has(k.key));
  const lang = navigator.language.startsWith("tr") ? "tr" : "en";
  const choices: Record<string, ConsentState> = {};
  for (const k of keys) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => { choices[k.key] = box.checked ? "granted" : "denied"; });
    choices[k.key] = "denied";
    const label = document.createElement("label");
    // The platform's keys come with their words; the app words its own.
    label.append(box, ` ${k.title[lang] ?? k.key}`);
    root.append(label);
  }
  const save = document.createElement("button");
  save.textContent = "Save";
  // One screen's choices, made together.
  save.addEventListener("click", () => { pb.consent.setMany(choices); root.replaceChildren(); });
  root.append(save);
}
```

```ts
// src/main.ts
import { pb } from "./lib/palbase";
import { showConsentBanner } from "./consent-banner";

await showConsentBanner(document.querySelector<HTMLElement>("#consent")!);

// Told of every change: here, in another tab, on another of the person's devices, or by the project.
pb.consent.onChange((key, state) => console.log(key, state ?? "not chosen"));
```

## The keys

The keys a consent screen lists come from the project, the same list for every SDK:

| Key | Category | What it covers |
|---|---|---|
| `analytics` | measurement | Events, page views, `identify` and person properties. |
| `performance` | measurement | Web vitals and request timings. |
| `diagnostics` | measurement | What went wrong when the app failed: errors and crashes. |
| `personalization` | personalization | Tailoring what the app shows by what the person does: a flag's audience condition, an in-app campaign to an audience. |
| `marketing_push`, `marketing_email`, `marketing_sms`, `marketing_whatsapp` | marketing | Messages that are not transactional, on that channel. |
| `ads_measurement`, `ads_personalization` | advertising | What US laws call selling or sharing (`ads: true`). |

`keys()` answers them in the order a screen shows them, each `{ key, category, title, description, ads }` with its words in English and Turkish (`title.en`, `title.tr`), then the app's own `customKeys` (`custom.<name>`: a–z, 0–9 and `_`, 48 at most), whose words are the app's (`category: "custom"`). The platform's list is read from the project once (`GET /auth/consents/keys`).

## `pb.consent`

| Member | What it does |
|---|---|
| `keys()` | The platform's keys with their words, then the app's own. |
| `state(key)` | `"granted"`, `"denied"`, or `undefined` when the person has not chosen and the app gave no starting value. While the person's choices are still to be read from the project, it answers `"denied"`. |
| `set(key, state)`, `setMany({ … })` | Records the person's choice, or a screen's choices together. It stands at once and goes to the project with when it was made. |
| `onChange(listener)` | Calls `listener(key, state)` for each key whose state changed: here, in another tab, on another of the person's devices, or by the project on their word. Returns the unsubscribe. |
| `region()` | `{ country?, jurisdiction }`, where `jurisdiction` is `gdpr` (the EU, the EEA, the UK, Switzerland: asked before anything is collected), `us` (collected until refused) or `other`, from the person's address. |
| `lastDeniedAt(key)` | When the key was last refused: here, on another of the person's devices, or by the project. |
| `needsAsking(keys?)` | The keys to ask about: never chosen, or chosen on the app's screen under another `textVersion`. In the US, an advertising key refused within the last twelve months is not asked again. |

## Starting values

`createClient({ consent: { start } })` says what is collected before the person chooses, key by key. The starting values are the app's, and they never leave the browser: only the person's own choices are sent, so a starting value can never undo a refusal the project holds. A key the SDK collects for with neither a choice nor a starting value collects nothing: give `analytics` and `performance` when the app uses them.

Where the law asks first — `region()` answers `gdpr` — start those keys `denied` and ask. An app whose people are all where data is collected until refused may start them `granted`, and still offers the choice. A choice made under one `textVersion` is asked again once the app shows a new text with a new version.

## Whose the choices are

The device's while no one is signed in. On sign-in the device's newer choices become the account's and the device takes the account's: the newest explicit choice wins, never a starting value. On sign-out the device goes back to the app's starting values, and the next person here is asked anew. A refusal made elsewhere — an unsubscribe link, another of the person's devices, the project on their word — reaches the signed-in person's open pages at once, and their keys change here.

A browser that sends Global Privacy Control refuses the advertising keys for the person once, recorded as `gpc`. A choice the person makes in the app after it is theirs.

## The calls under it

`pb.consent` makes these calls for you; an app that makes them itself sends what the client does:

| Call | What it is |
|---|---|
| `GET /auth/consents/keys` | The platform's keys with their words. |
| `GET /auth/consents?installation_id=…` | The choices and the region: the account's with a user's token, the device's with the publishable key alone. |
| `PUT /auth/consents` | `{ installation_id, text_version?, choices: [{ key, state, chosen_at }] }`: records choices, the account's or the device's as above. |
| `POST /auth/consents/link` | On sign-in: the device's newer choices become the account's. |

The last three name the install and prove they hold it with `X-Palbase-Installation-Secret`: the secret the client keeps in the browser, from which the install's id is made (`pb.installation.id`). The device's own choices, asked for or written without the secret it first named itself with, are refused `403 not_the_device`.

The project's server can only refuse, never grant: `POST /admin/consents/refuse` with the secret key (`{ user_id | installation_id, keys, reason }`, reason `email_unsubscribe`, `sms_stop` or `support`) records a refusal the person made elsewhere, and it reaches their apps at once. `GET /admin/users/{uid}/consents` and `GET /admin/installations/{installation_id}/consents` read the state and the proof of each choice. A deleted user's choices go with them.

## Related

- [Analytics](https://palbase.studio/docs/web/analytics) — what the `analytics` and `performance` keys hold back
- [Flags](https://palbase.studio/docs/web/flags) — audience conditions, which need `personalization`
- [Notifications](https://palbase.studio/docs/web/notifications) — in-app campaigns and the marketing keys
- [Notifications in your backend](https://palbase.studio/docs/backend/notifications) — sends the marketing keys skip
