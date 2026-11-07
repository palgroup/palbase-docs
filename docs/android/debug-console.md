> The full documentation index: https://palbase.studio/llms.txt

# Debug Console

Every app records what happened on the device from launch: the SDK's own requests and realtime frames, its modules' lines, and whatever the app adds. `studio.palbase:palbase-debug` shows that record, in Compose, and only while the project has turned the console on for the signed-in user. So a build that already shipped can open it for the one person reporting a bug, and what it shows includes everything recorded before it was turned on.

## Quick example

```kotlin
import studio.palbase.debug.PBLogLevel
import studio.palbase.debug.ui.PalbaseConsole
import studio.palbase.debug.ui.enabled

@Composable
fun Settings() {
    var showing by remember { mutableStateOf(false) }
    val on by pb.debug.enabled.collectAsState()          // followed as the flag flips

    if (showing && on) {
        // A whole screen: its round × and system back close it.
        PalbaseConsole(pb.debug, Modifier.fillMaxSize(), onClose = { showing = false })
        return
    }
    if (on) Button({ showing = true }) { Text("Debug console") }
    Button({ pb.debug.log("cart is empty", PBLogLevel.WARNING, label = "checkout") }) { Text("Log a line") }
}
```

Turn it on for one user:

```sh
palbase flags:users:set <user-id> palbase.debug_console true
```

## What is recorded

Recording runs from launch whether or not the console is on, and stays on the device: in the app's no-backup files, up to 32 MB, the last 20 launches. Credentials are masked before anything is written. When someone else signs in, the last user's records are wiped.

| What | How it gets there |
|---|---|
| The SDK's requests to the project and to your backends | By itself, measured in full: the phases (DNS, connect, TLS, waiting), the connection, the bytes. |
| The realtime socket | By itself: the connection, the channels and the last frames, on the console's Realtime tab. |
| The modules' own lines | By itself, under `palbase.<module>`: a sign-in, a flag change, a purchase reported. |
| The app's log | `pb.debug.log(message, level, label, metadata)` and `pb.debug.error(throwable, label)`. The `label` is the line's category, any word the app likes, and the console filters by it. |
| The app's own OkHttp traffic | `pb.debug.client(appClient, label)` returns a client that records and measures each request like the SDK's own, keeping `appClient`'s settings and connection pool. `pb.debug.interceptor(label)` goes in a client built by hand, and records without the phases. |
| Anything else | `pb.debug.record(method, url, requestHeaders, requestBody, statusCode, responseHeaders, responseBody, error, durationMs, label)`: an exchange the SDK did not make, masked on the way in like a captured one. |

A backend call's [encrypted field](https://palbase.studio/docs/backend/request-encryption) is recorded as it went, sealed (`pbt1.…`); **Reveal** beside it in the body shows its value. The values are kept in memory alone, only while the console is on for the user and recording, and are gone when the console is cleared, another user signs in or the console is turned off.

`PBLogLevel` is `TRACE`, `DEBUG`, `INFO`, `NOTICE`, `WARNING`, `ERROR` or `CRITICAL`.

```kotlin
import okhttp3.OkHttpClient
import okhttp3.Request

// One client for the app's own requests: recorded beside the SDK's, under the label "app".
val http: OkHttpClient = pb.debug.client(OkHttpClient(), label = "app")
// Off the main thread, as any OkHttp call:
http.newCall(Request.Builder().url("https://api.example.com/v1/feed").build()).execute().use { println(it.code) }
```

| Member of `pb.debug` | What it does |
|---|---|
| `isRecording`, `start()`, `stop()` | Whether it records. Recording is on from launch, and `stop()` keeps what was recorded. |
| `clear()` | Discards every record, on the device and in the console's screens. |
| `export()` | This launch's records as JSON lines, already masked: what to attach to a bug report. |
| `sessions()` | Every launch on the device, newest first. |
| `realtime` | The socket, inspected, as a `StateFlow`: the connection, the channels and the last frames. |

## Who sees it

`PalbaseConsole(pb.debug)` draws nothing unless the project has turned the console on for the signed-in user: the flag `palbase.debug_console`, given to that user as their own value. It is decided by the project, never by the build. `pb.debug.isEnabled` is the same answer (`import studio.palbase.debug.ui.isEnabled`), and `pb.debug.enabled` follows it as it changes. Gate your own way in on it: a row in a settings screen, a long press. It is `false` until it is shown to be true: before the flags load, when they cannot be read, and when nobody turned it on.

Turning it off again is `palbase flags:users:unset <user-id> palbase.debug_console`. The flag reaches the device on the user's own flags channel, so the console opens or shuts without a relaunch ([Flags](https://palbase.studio/docs/android/flags#keeping-up-to-date)).

## The screens

The console has two tabs, Console and Realtime, under a floating tab bar, each with its own back stack: the list of records, a network inspector, a body viewer, filters, the launches, and the realtime inspector. It draws edge to edge and keeps its own bars clear of the system's, so give it the whole screen. With `onClose`, each tab's root shows a round ×, and system back (predictive on Android 14 and newer) walks a tab's pages before it closes the console. Without `onClose`, there is no close button, and back at a root is the host's.

### Copying records out

Every page of a record copies what it shows in one tap: the request and response bodies (JSON pretty-printed, text as it came), the headers and cookies as `Name: value` lines, the cURL command. The record's own menu copies its URL, its cURL command, either body or the whole record.

To take several records at once, choose **Select** in the list's menu, tick the records (or **Select All**, which takes the ones the filters and the search show), then:

| Action | What it gives |
|---|---|
| **Copy Responses** | Each answer with the request line it answers. |
| **Copy Requests & Responses** | The same, with each request's headers and body. |
| **Share Responses**, **Share Requests & Responses** | The same JSON as a `.json` file, through the system's share sheet, for a selection too big to paste. |

A copy holds at most 128 KB, as every copy the console makes: past it, it ends at a whole record, the array closed, and its note says so ("Copied 12 of 300 records — Share takes them all"); a share takes the whole selection. The file is served by the console's own provider (`ConsoleShareProvider`, merged from `palbase-debug`'s manifest under `<application id>.palbase.console.share`), from one folder of the app's cache, to the app chosen in the sheet alone.

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

`palbase-debug` brings Compose and `palbase-flags` with it. Compose is in no other artifact of the SDK, so an app that never shows the console does not take it, and its recording is the core's either way.

## Related

- [Flags](https://palbase.studio/docs/android/flags): the per-user value that opens the console
- [Analytics](https://palbase.studio/docs/android/analytics#diagnostics): the diagnostics a project collects, with consent
- [Logs](https://palbase.studio/docs/getting-started/logs): the environment's own record of every request
