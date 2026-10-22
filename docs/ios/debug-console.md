> The full documentation index: https://palbase.studio/llms.txt

# Debug Console

Every app records from launch, on the device: the SDK's own requests and realtime frames, its modules' lines, and whatever the app adds. The `PalbaseDebug` product shows it, in an in-app console the project turns on for **one user at a time**. A build that already shipped can open it for the one person reporting a bug, with no release and no `#if DEBUG`.

## Quick example

```swift
import Palbase
import PalbaseDebug
import SwiftUI

struct SettingsView: View {
    @State private var showingConsole = false

    var body: some View {
        List {
            // False until the project turns it on for this user; drawn again when it flips.
            if pb.debug.isEnabled {
                Button("Debug console") { showingConsole = true }
            }
        }
        .sheet(isPresented: $showingConsole) { pb.debug.view }
    }
}
```

Turn it on for the user who reports the bug:

```sh
palbase flags:users:set <user id> palbase.debug_console true
```

It is the flag `palbase.debug_console`, given to that user as their own value ([Flags](https://palbase.studio/docs/ios/flags)). `pb.debug.isEnabled` is false until that value is known to be `true`: before the flags load, when their read fails, and for every other user. `pb.debug.view` shows nothing while it is false. Recording is not gated: what was recorded before the flag was turned on is there the moment it is.

## What it records

| What | How |
|---|---|
| The SDK's requests | Every request to the project and to your backend, with its timing, its status and its bodies. Credentials are masked before a record exists: tokens, keys, DPoP proofs, cookies. |
| Realtime | The socket's frames, opening and closing, and each channel's. |
| The modules | Each module's own lines, under `palbase.<module>` labels: a sign-in, a token refreshed, a flag change. |
| The app's lines | `pb.debug.log(_:level:label:metadata:)`, and `pb.debug.error(_:label:)` for an `Error` with its domain and code. |
| The app's own requests | Through `pb.debug.session(configuration:label:)`, a `URLSession`-shaped `PBDebugSession`, or `pb.debug.urlSessionDelegate(wrapping:label:)` around a delegate of the app's. |
| Anything else | `pb.debug.record(request:response:data:label:)` (and `error:`) for an exchange the SDK did not make. |

```swift
import Foundation
import Palbase

func checkout(items: Int) async throws {
    pb.debug.log("checkout tapped", level: .warning, label: "checkout", metadata: ["items": "\(items)"])

    // The app's own traffic, recorded beside the SDK's under its label.
    let (_, response) = try await pb.debug.session(label: "app").data(from: URL(string: "https://example.com/ping")!)
    print((response as? HTTPURLResponse)?.statusCode ?? 0)
}
```

A backend call's [encrypted field](https://palbase.studio/docs/backend/request-encryption) is recorded as it went, sealed (`pbt1.…`); **Reveal** beside it in the body shows its value. The values are kept in memory alone, only while the console is on for the user and recording, and are gone when the console is cleared, another user signs in or the console is turned off.

`label` is the category the console filters by. Levels are `.trace`, `.debug`, `.info`, `.notice`, `.warning`, `.error` and `.critical`. The SDK does not swizzle `URLSession`: traffic it did not make is recorded only through these calls.

## Where it is kept

On the device alone: nothing of the console is sent anywhere. It keeps the last 20 launches, within 32 MB, the oldest swept first; a body over 5 MB keeps its first 5 MB and says how large it was. The console is the signed-in user's: when someone else signs in, the last user's records are wiped.

| Member | What it does |
|---|---|
| `pb.debug.isRecording` | Whether it is recording. It is from launch. |
| `pb.debug.stop()`, `pb.debug.start()` | Stops recording, and starts it again. What was recorded is kept. |
| `pb.debug.clear()` | Discards every record, on disk and in the screens. |

## The screens

`pb.debug.view` is a `PalbaseConsoleView`, to place in a sheet, a tab or a pushed screen: the timeline of every record, filters by label and level, each request's headers, bodies (as JSON, text, a cURL command or a hex dump) and timing, the realtime inspector, metrics, and the launches kept.

## Related

- [Flags](https://palbase.studio/docs/ios/flags): `palbase.debug_console`, a user's own value
- [Logs](https://palbase.studio/docs/getting-started/logs): what the project records on its side, in Studio
- [`flags:users:set`](https://palbase.studio/docs/cli/reference#palbase-flagsusersset)
