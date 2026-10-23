> The full documentation index: https://palbase.studio/llms.txt

# Android SDK

The Android SDK is `studio.palbase:palbase` and one artifact per module, in Kotlin, with coroutines. `palbase` holds the project's address and publishable key, the transport every call goes through, the signed-in user's session, the realtime socket, consent and auth. Each module (flags, analytics, realtime, notify, storage, purchases) is an artifact of its own that hangs off the same client, as `pb.flags`, `pb.notify` and so on. A backend of yours is a typed client that `palbase apps:sync` writes into the app, and it calls through the same client too.

The version on this page is **0.4.0**.

## Requirements

- `minSdk` 26.
- Kotlin 2.2 or newer in the app, the version AGP 9 builds an app with. The SDK is compiled for it.
- Java 17 in the app's `compileOptions`, as the SDK's own example app sets.

The SDK ships compiled, under the Palbase SDK License. Every file in the repository is signed, and the public key is the repository's `KEYS` file.

## Installing

The artifacts are in a Maven repository of their own, `https://palgroup.github.io/palbase-android/`, under the group `studio.palbase`. No account or credential is needed to read it. Take `studio.palbase` from there alone:

```kotlin
// settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        exclusiveContent {
            forRepository { maven("https://palgroup.github.io/palbase-android/") }
            filter { includeGroup("studio.palbase") }
        }
    }
}
```

The BOM gives every artifact one version. Add `palbase`, then the modules the app uses:

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.serialization") // the backend clients are kotlinx.serialization types
}

android {
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.4.0"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-flags")     // and the other modules the app uses
    implementation("studio.palbase:palbase-palbe")     // when the app calls a backend of yours
}
```

| Artifact | What it is | In the app |
|---|---|---|
| `palbase` | The address and key, the transport, the session, the realtime socket, consent, auth, the debug console's recording | `PalbaseClient`, `pb.auth`, `pb.socket`, `pb.consent`, `pb.debug` |
| `palbase-flags` | The project's flags, kept current | `pb.flags` ([Flags](https://palbase.studio/docs/android/flags)) |
| `palbase-analytics` | Events, screens, timings and diagnostics, each behind its consent | `pb.analytics(startingConsent)` ([Analytics](https://palbase.studio/docs/android/analytics)) |
| `palbase-realtime` | Channels: broadcasts and a shared state | `pb.realtime` ([Realtime](https://palbase.studio/docs/android/realtime)) |
| `palbase-notify` | This device's push token for the user, their preferences and topics, the inbox, in-app messages | `pb.notify` ([Notifications](https://palbase.studio/docs/android/notifications)) |
| `palbase-notify-ui` | The inbox and in-app messages, drawn in Compose | `InboxView`, `PalbaseInAppMessages` ([Notifications](https://palbase.studio/docs/android/notifications#the-inbox)) |
| `palbase-storage` | Files through URLs your backend signed, and public buckets | `pb.storage` ([Storage](https://palbase.studio/docs/android/storage)) |
| `palbase-purchases` | What the customer has, in any store, and buying on Google Play (Play Billing 9) | `pb.purchases` ([Purchases](https://palbase.studio/docs/android/purchases)) |
| `palbase-palbe` | Your backends' generated clients, their gateways and chats | `pb.<name>` ([Calling Your Backend](https://palbase.studio/docs/android/backend-calls), [Gateways](https://palbase.studio/docs/android/gateways)) |
| `palbase-debug` | The debug console's screens, in Compose | `PalbaseConsole(pb.debug)` ([Debug Console](https://palbase.studio/docs/android/debug-console)) |
| `palbase-voice` | A chat's live voice over WebRTC | `PBVoice.connect(…)` ([Voice](https://palbase.studio/docs/android/voice)) |
| `palbase-runtime` | The types every generated client calls into; `palbase` brings it | — |
| `palbase-bom` | One version for all of them | `platform(…)` |

WebRTC comes only with `palbase-voice`, Play Billing only with `palbase-purchases` and Compose only with `palbase-debug`, so an app that takes none of them carries none of them.

Each module is an extension of the client (a property, and for analytics a function), imported from the module's package: `import studio.palbase.flags.flags`, `studio.palbase.notify.notify`, `studio.palbase.storage.storage`, `studio.palbase.realtime.realtime`, `studio.palbase.purchases.purchases`, `studio.palbase.analytics.analytics`.

## Registering the app

An Android app is registered once in the project, and then set in each environment with its application ID and the SHA-256 of every certificate it is signed with:

```sh
palbase apps:create android "Shop" --slug shop-android
palbase apps:env:set shop-android --package com.example.shop --sha256 debug=AB:CD:… --sha256 play_signing=12:34:… -E staging
```

The slug is the app's name in a checkout. The certificates are labelled. Google's app signing key is in Play Console › App signing (not the upload key), and `./gradlew signingReport` prints a debug key's. The environment publishes them in its Digital Asset Links file (`GET /.well-known/assetlinks.json`), which Android's Credential Manager reads before the app may use the project's passkeys. See [`apps:create`](https://palbase.studio/docs/cli/reference#palbase-appscreate) and [`apps:env:set`](https://palbase.studio/docs/cli/reference#palbase-appsenvset).

## The environment in the build

Nobody types a URL or a key into the app. `palbase apps:sync`, run at the root of the app's repository, writes `palbase/` there and nothing else:

```text
palbase/
├── project.json                          the checkout's project and apps
└── environments/
    └── staging/
        ├── shop-android.json             the app's settings: address, publishable key, backends
        ├── contracts/backend.openapi.json each backend's contract
        └── palbe/backend.kt              each backend's Kotlin client (pb.backend)
```

There is a directory for every environment the app is set in. Commit it; `palbase apps:sync --check` exits 1 in CI when it is not what the project gives now ([`apps:sync`](https://palbase.studio/docs/cli/reference#palbase-appssync)).

The app's build compiles one environment into each build variant. There is no Gradle plugin: this task, in `app/build.gradle.kts`, reads `palbase/environments/` and writes the variant's sources. It reaches nothing on the network. Map each variant to an environment, and set `app` to the app's slug:

```kotlin
// app/build.gradle.kts — the environment each build variant compiles in.
val palbaseEnvironments = mapOf(
    "debug" to "staging",
    "release" to "main",
)

abstract class PalbaseEnvironment : DefaultTask() {
    /** palbase/environments: what `palbase apps:sync` writes, a directory per environment. */
    @get:InputFiles abstract val environments: ConfigurableFileCollection
    @get:Input abstract val app: Property<String>
    @get:Input abstract val variant: Property<String>
    @get:Input @get:Optional abstract val environment: Property<String>
    @get:OutputDirectory abstract val out: DirectoryProperty

    @TaskAction
    fun write() {
        val root = environments.singleFile
        val known = root.listFiles().orEmpty().filter { it.resolve("${app.get()}.json").isFile }.map { it.name }.sorted()
        if (known.isEmpty()) throw GradleException("palbase/environments has no environment of ${app.get()}: run `palbase apps:sync` (it writes palbase/)")
        val name = environment.orNull
            ?: throw GradleException("the build variant ${variant.get()} names no Palbase environment: map it in palbaseEnvironments (build.gradle.kts) to one of ${known.joinToString()}")
        if (name !in known) throw GradleException("no environment $name of ${app.get()} in palbase/environments (it has ${known.joinToString()}): register the app in $name and run `palbase apps:sync`")
        val dir = root.resolve(name)
        val target = out.get().asFile.apply { deleteRecursively(); mkdirs() }
        // The environment's client document, as the build's PalbaseConfiguration.environment.
        val document = buildString {
            append('"')
            for (c in dir.resolve("${app.get()}.json").readText()) when (c) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '$' -> append("\\$")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(c)
            }
            append('"')
        }
        target.resolve("PalbaseEnvironment.kt").writeText(
            """
            |// Written by the build from palbase/environments/$name/${app.get()}.json — DO NOT EDIT.
            |package palbase
            |
            |import studio.palbase.PalbaseConfiguration
            |
            |/** The environment this build was made for: $name. */
            |public val PalbaseConfiguration.Companion.environment: PalbaseConfiguration
            |    get() = environmentConfiguration
            |
            |private val environmentConfiguration: PalbaseConfiguration by lazy {
            |    try {
            |        PalbaseConfiguration.fromClientDocument($document)
            |    } catch (e: Exception) {
            |        throw IllegalStateException("palbase/environments/$name: " + e.message, e)
            |    }
            |}
            |""".trimMargin(),
        )
        // The environment's backends' Palbe clients: pb.<name>.
        dir.resolve("palbe").listFiles { f -> f.extension == "kt" }.orEmpty().forEach { it.copyTo(target.resolve(it.name)) }
    }
}

androidComponents.onVariants { variant ->
    val task = tasks.register<PalbaseEnvironment>("palbaseEnvironment${variant.name.replaceFirstChar { it.uppercase() }}") {
        environments.from(rootProject.layout.projectDirectory.dir("palbase/environments"))
        app = "shop-android"
        this.variant = variant.name
        palbaseEnvironments[variant.name]?.let { environment = it }
    }
    variant.sources.kotlin?.addGeneratedSourceDirectory(task, PalbaseEnvironment::out)
}
```

A variant that names no environment, or one the app is not set in, stops the build and says which environments there are. The variant then has `PalbaseConfiguration.environment` (package `palbase`) and the backends' clients as `apps:sync` wrote them.

## The client

Make one client for the process, with the application context:

```kotlin
// app/src/main/kotlin/com/example/shop/ShopApp.kt
package com.example.shop

import android.app.Application
import palbase.environment
import studio.palbase.PalbaseClient
import studio.palbase.PalbaseConfiguration

lateinit var pb: PalbaseClient

class ShopApp : Application() {
    override fun onCreate() {
        super.onCreate()
        pb = PalbaseClient(this, PalbaseConfiguration.environment)
    }
}
```

`PalbaseClient(context, configuration, sessionStorage, retry)` takes two more arguments with defaults:

| Argument | Default | What it is |
|---|---|---|
| `sessionStorage` | `PalbaseClient.SessionStorage.DEVICE` | Where the session is kept between launches: encrypted with an AES key the Android keystore holds, in the app's no-backup files, so a backup restored on another device carries no session. `PalbaseClient.SessionStorage.MEMORY` keeps it for this process alone. |
| `retry` | `RetryPolicy.DEFAULT` (`studio.palbase.transport.RetryPolicy`) | How a call is sent again when the answer says "not now" ([Errors and retries](#errors-and-retries)). |

`PalbaseConfiguration.environment` reads the document `apps:sync` wrote: the address, the publishable key, the passkeys' relying party and the environment's backends. `environmentInfo` says which environment it is (`ref`, `slug`, `name`, `production`). A configuration can also be given in code, for a test or a tool:

```kotlin
val configuration = PalbaseConfiguration.of(url = "https://k3xq81w4m.palbase.studio", publishableKey = "pb_k3xq81w4m_cZ8yX7wV6uT5")
```

The configuration is refused with a `ConfigurationException` when the key is a secret key (`pb_<ref>_s…`): a secret key never goes into an app. The address must be an origin with no path. A release build reaches the project and its backends over https only. A debuggable build may also use http to this machine: `localhost`, `127.0.0.1`, `::1`, or `10.0.2.2`, the emulator's address for the computer it runs on.

### Languages

Every request says the user's languages in `Accept-Language`, the device's in their order. Auth's emails and pages, flags' and paywalls' rules and a backend's translations read them. An app with a language setting of its own names its languages instead:

```kotlin
pb.setPreferredLanguages(listOf("tr", "en"))   // null goes back to the device's
```

Requests also carry `X-Palbase-SDK: android/0.4.0` (`PalbaseClient.VERSION`).

### Observable state

What an app shows is collected from the SDK's `StateFlow`s. A composable that collects one with `collectAsState()` is drawn again when it changes, so no listener is needed:

| State | What it holds |
|---|---|
| `pb.auth.isSignedIn`, `pb.auth.userId`, `pb.auth.user`, `pb.auth.state` | Who is signed in, and their session ([Auth](https://palbase.studio/docs/android/auth#who-is-signed-in)) |
| `pb.flags.values` | Every flag's value ([Flags](https://palbase.studio/docs/android/flags)) |
| `pb.socket.status` | The realtime socket's connection ([Realtime](https://palbase.studio/docs/android/realtime#the-socket)) |
| `pb.debug.isEnabled` | Whether the debug console is on for this user — with `palbase-debug`, whose extension it is ([Debug Console](https://palbase.studio/docs/android/debug-console)) |

```kotlin
@Composable
fun Account() {
    val signedIn by pb.auth.isSignedIn.collectAsState()
    val user by pb.auth.user.collectAsState()
    Text(if (signedIn) "Signed in as ${user?.email ?: "a guest"}" else "Signed out")
}
```

### Consent and the installation

`pb.consent` is what the user allowed the app to collect, by category: `Consent.Category.ANALYTICS`, `PERFORMANCE` and `DIAGNOSTICS`. Every module that collects asks it, and while a category is not granted nothing of it is made. [Analytics](https://palbase.studio/docs/android/analytics#consent) shows it at work.

`pb.installation.id` is this install of the app: 16 random bytes, kept across launches and updates, that carry nothing of the device or the user. Flags' percentages and a push token are an installation's.

## Errors and retries

A module call that is refused throws `PalbaseError` (package `studio.palbase.runtime`):

| Member | What it is |
|---|---|
| `status` | The HTTP status; `0` when the request was never answered. |
| `code` | A stable code: the server's (`invalid_credentials`, `rate_limited`, …) or the client's (`network_error`, `missing_credential`, …). |
| `message` | What happened, for a log. |
| `requestId` | The request's id, to find it in the environment's [Logs](https://palbase.studio/docs/getting-started/logs). |
| `retryAfter` | The seconds the server asked to wait, when it said. |
| `body` | The refusal's body as it was sent. |

`error.isNetworkError` (`import studio.palbase.isNetworkError`) says whether the request was never answered: no network, the host unreachable, no answer in time. A refusal made on the device, such as a bad configuration, also has status `0` and is not one, so ask this rather than `status == 0`.

The client sends a call again only when that cannot do the work twice: a read, or a write whose contract takes an `Idempotency-Key`, which the client makes once and sends with every attempt. It is sent again on a `429`, `502`, `503` or `504`, or when it never reached the server: after the server's `Retry-After` when it gave one, and otherwise after half a second, then a second, then twice that, each jittered. `RetryPolicy(attempts = 3, maxWaitSeconds = 30.0)` is the default: three attempts in all, the first included. A `Retry-After` longer than `maxWaitSeconds` is not waited for: the error goes to the caller. Every other write is sent once.

A call refused with a `401` about the token (`invalid_token`, `token_expired`, `session_expired`, `session_revoked`, `missing_token`) is refreshed once and sent again, and only for the user whose session sent it.

Your backend's refusals are a typed error of their own: [Calling Your Backend](https://palbase.studio/docs/android/backend-calls#errors).

## The pages of this section

- [Auth](https://palbase.studio/docs/android/auth): sign-up, sign-in, second factors, magic links, phone codes, guests and the session
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the generated client, its typed errors and retries
- [Gateways](https://palbase.studio/docs/android/gateways): a backend's realtime gateways, and the chats piped into them
- [Realtime](https://palbase.studio/docs/android/realtime): the project's channels, broadcasts and a shared state
- [Flags](https://palbase.studio/docs/android/flags): flags read without waiting, kept current
- [Analytics](https://palbase.studio/docs/android/analytics): events, screens, timings and diagnostics behind consent
- [Notifications](https://palbase.studio/docs/android/notifications): FCM push for the signed-in user, preferences and topics
- [Storage](https://palbase.studio/docs/android/storage): files through signed URLs, and public buckets
- [Purchases](https://palbase.studio/docs/android/purchases): what the customer has, and buying on Google Play
- [Voice](https://palbase.studio/docs/android/voice): a chat's live voice over WebRTC
- [Debug Console](https://palbase.studio/docs/android/debug-console): the in-app console, opened for one user

## Related

- [Introduction](https://palbase.studio/docs/getting-started/introduction): the modules, the keys and the environments
- [CLI](https://palbase.studio/docs/cli/overview): `apps:create`, `apps:env:set` and `apps:sync`
- [Machines](https://palbase.studio/docs/machines/overview): where the backends the app calls run
