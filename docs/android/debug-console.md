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

`palbase-debug` brings Compose and `palbase-flags` with it. Compose is in no other artifact of the SDK, so an app that never shows the console does not take it, and its recording is the core's either way.

## Related

- [Flags](https://palbase.studio/docs/android/flags): the per-user value that opens the console
- [Analytics](https://palbase.studio/docs/android/analytics#diagnostics): the diagnostics a project collects, with consent
- [Logs](https://palbase.studio/docs/getting-started/logs): the environment's own record of every request
