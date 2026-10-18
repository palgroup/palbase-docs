> The full documentation index: https://palbase.studio/llms.txt

# Consent

`pb.consent` is what the person allowed the app to collect and use, key by key. It is in the core product, and every module that collects asks it first: analytics records nothing for a key that is not granted, and a marketing message goes only where its channel's key is. A choice is kept on the device and stands the moment it is made, and it goes to the project with when it was made. The app's starting values never leave the device, so they can never override a refusal the project holds.

## Quick example

```swift
import Palbase

// What the app starts with until the person chooses, and the version of the text its screen shows.
let pb = PalbaseClient(try! .environment.with(consent: ConsentOptions(
    start: ["analytics": .granted, "performance": .granted, "diagnostics": .granted],
    textVersion: "2026-10",
    customKeys: ["custom.newsletter"]
)))

func consentScreen() async throws {
    let region = try await pb.consent.region()     // .gdpr asks first; .us collects until refused
    let ask = try await pb.consent.needsAsking()   // never chosen, or chosen under another text
    if region.jurisdiction == .gdpr || !ask.isEmpty {
        // … show the screen, then:
        try pb.consent.setMany(["analytics": .granted, "marketing_push": .denied, "custom.newsletter": .granted])
    }
    print(pb.consent.state("analytics")?.rawValue ?? "no choice and no starting value")
}
```

## The keys

| Key | What it allows |
|---|---|
| `analytics` | Events, screens, identify and the person's properties ([Analytics](https://palbase.studio/docs/ios/analytics)). |
| `performance` | Timings and request traces. |
| `diagnostics` | The log sent with a report. |
| `personalization` | Placing the person in analytics audiences, which flag conditions and in-app campaigns read. |
| `marketing_push`, `marketing_email`, `marketing_sms`, `marketing_whatsapp` | Marketing messages on each channel ([Notifications](https://palbase.studio/docs/backend/notifications)). |
| `ads_measurement` | Measuring ads: Apple's attribution token with `$install`. |
| `ads_personalization` | Personalized ads. |
| `custom.<name>` | The app's own (`a`–`z`, `0`–`9` and `_`, 48 at most), named in `customKeys`. |

`keys()` lists them in the order a consent screen shows them: the platform's with their words, in English and Turkish (`title` and `description` by language), then the app's own, which the app words itself. Each `ConsentKeyInfo` has its `key`, its `category` (`measurement`, `personalization`, `marketing`, `advertising`, or `custom`) and `ads`, true for what the US laws call selling or sharing.

## Reading and choosing

| Member | What it does |
|---|---|
| `state(_:)` | The key's state: `.granted` or `.denied`, the person's choice, else the app's starting value; `nil` when there is neither, and a module collects nothing then. |
| `set(_:_:)` | Records one choice: it stands at once and is sent to the project. |
| `setMany(_:)` | Records the choices of one screen, made together. A key that is not one throws `invalid_consent_key`. |
| `onChange(_:)` | Told every key whose state changes: the person's choice, a refusal from the project, a sign-in or a sign-out. Returns what stops it. |
| `lastDeniedAt(_:)` | When the key was last refused: here, on another of the person's devices, or by the project on their word. |
| `region()` | Where the person is, as the project tells from their address: `country`, and `jurisdiction`, `.gdpr` (the EU, the EEA, the UK, Switzerland), `.us` or `.other`. |
| `needsAsking(_:)` | The keys the app is to ask about (all, unless given): those never chosen, and those chosen on the app's screen under another `textVersion`; in the US, not an ads key the person refused within twelve months. |

What the app starts with until the person chooses is the app's to say, through `ConsentOptions.start`: where the law asks first (`region()` is `.gdpr`), start the collecting keys denied or not at all, and ask. A key the SDK collects for with no starting value and no choice collects nothing.

A choice that cannot be sent now is sent later, still saying when it was made: after 5 seconds, 30 seconds, 2 minutes, then every 10 minutes, and when the app returns to the foreground or the network comes back. A choice the project refuses never stands: the key is read again, and until it can be, reads `.denied`, as it does while what the device kept cannot be read.

## Whose the choices are

- With no one signed in, the choices are the device's: this install's, which proves itself with a secret kept in the keychain.
- On sign-in, the device's newer choices become the account's, and the device takes the account's.
- Signed in, a refusal made elsewhere (an unsubscribe link, an SMS STOP, another of the person's devices) arrives on the person's own realtime channel and stands at once.
- On sign-out, the device goes back to the app's starting values.

The app's extensions read the same choices through the keychain group the app shares with them ([Overview](https://palbase.studio/docs/ios/overview#connect-the-app-to-the-project)).

## The install

`pb.installation.id` is the install's id: the first 16 bytes of the SHA-256 of a secret made on the device (32 random bytes, kept in the keychain), base64url. The secret goes only with the device's own consent calls, its push registration and its flag reads with no one signed in. A keychain that outlived the app's deletion keeps the install, and analytics' `$install` says `$reinstall`.

## Related

- [Analytics](https://palbase.studio/docs/ios/analytics): what the measurement keys hold back
- [Notifications](https://palbase.studio/docs/ios/notifications): marketing push, and the person's preferences
- [Web Consent](https://palbase.studio/docs/web/consent): the same keys in a browser
