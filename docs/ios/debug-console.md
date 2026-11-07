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
        // onClose: the × on each tab's root dismisses it.
        .sheet(isPresented: $showingConsole) {
            pb.debug.view.onClose { showingConsole = false }
        }
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

| Member of `PalbaseConsoleView` | What it does |
|---|---|
| `onClose(_:)` | For a console the app presented (a sheet, a full-screen cover, a controller of its own): each tab's root shows an × that runs the action, where a pushed page has its back button. A pushed console needs none, its back button is the way out, and neither does a console that is a tab of the app. |
| `embedded()` | Drops the console's own navigation stacks, for a place that already has one. |

### Copying records out

Every page of a record copies what it shows in one tap: the request and response bodies (JSON pretty-printed, text as it came), the headers and cookies as `Name: value` lines, the cURL command. The record's own menu copies its URL, its cURL command, either body or the whole record.

To take several records at once, choose **Select** in the list's menu, tick the records (or **Select All**, which takes the ones the filters and the search show), then:

| Action | What it gives |
|---|---|
| **Copy Responses** | Each answer with the request line it answers. |
| **Copy Requests & Responses** | The same, with each request's headers and body. |
| **Share Responses**, **Share Requests & Responses** | The same JSON as a `.json` file, through the system's share sheet, for a selection too big to paste. |

A copy holds at most 4 MB: past it, it ends at a whole record, the array closed, and its note says so ("Copied 12 of 300 records — Share takes them all"); a share takes the whole selection, written a record at a time into the console's own folder, which goes with the records.

Both give a JSON array, in the list's order, the same on iOS and Android:

```json
[
  {
    "durationMs": 138,
    "method": "POST",
    "requestId": "8bd341a7-c920-467b-a415-a5a769ddd811",
    "response": {
      "body": { "expires_in": 1800, "token_type": "Bearer" },
      "headers": { "content-type": "application/json" }
    },
    "startedAt": "2026-11-06T10:22:09.121+03:00",
    "state": "success",
    "status": 200,
    "url": "https://<ref>.palbase.studio/auth/login"
  }
]
```

A JSON body is JSON, its numbers as the server wrote them, a text body is text, anything else is `"<binary: N bytes>"`. A body the console kept only the size of reads `"<not kept: N bytes>"`, one swept to stay within the disk budget `"<no longer available: N bytes>"`, and a body kept only in part carries `"truncated": true`. A failed request has `error` in place of `status`; a log line is `{ "log": { "level", "label", "message", "at", "metadata" } }`. Everything is as recorded, with the credentials already masked (`***`).

## Related

- [Flags](https://palbase.studio/docs/ios/flags): `palbase.debug_console`, a user's own value
- [Logs](https://palbase.studio/docs/getting-started/logs): what the project records on its side, in Studio
- [`flags:users:set`](https://palbase.studio/docs/cli/reference#palbase-flagsusersset)
