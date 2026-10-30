> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` (`studio.palbase:palbase-calls`) is the signed-in person's voice and video calls on Android. A call rings the phone as a phone call does — over the lock screen and with the app closed, woken by a high-priority FCM message — and lives in the system's call integration (Telecom): its audio route, Bluetooth, a watch or a car answering. A `PBCall` is what the app draws, its state as `StateFlow`s. A direct call's media goes between the two phones (WebRTC); a group's — or a direct call a third person joined — through the project's media server. `palbase-calls-ui` draws the screens in Compose. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Install

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.14.1"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-notify")     // the FCM token, and the service a ring arrives through
    implementation("studio.palbase:palbase-calls")      // pb.calls, headless
    implementation("studio.palbase:palbase-calls-ui")   // the call screens and the activity a ring opens
}
```

Palbase's packages come from its own repository, as every module's do ([Android Overview](https://palbase.studio/docs/android/overview)).

- **Push.** A call rings through the project's FCM provider and the app's Firebase project, as every push does ([Notifications](https://palbase.studio/docs/android/notifications#setting-up-push)). palbase-notify's messaging service (`PalbaseMessagingService`, declared by its manifest) hands a call's push to the calls — no code. An app with a `FirebaseMessagingService` of its own subclasses `PalbaseMessagingService`, calling `super` first, or a ring never reaches the calls.
- **The client in the `Application`.** Make the client there and touch `pb.calls`: the person's calls channel is followed from then on, and a process FCM starts for a ring uses the app's own client.
- **What the manifests add.** palbase-calls declares its permissions (`RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS`, the foreground service types `phoneCall`, `microphone` and `camera` …), the foreground service a call holds the app with, and the receiver a notification's Decline and Hang up go to; palbase-calls-ui the activity a ring opens. An app that makes voice calls alone may remove `CAMERA` and the camera service type (`tools:node="remove"`). The app declares the foreground service types in Google Play's declaration (phone call, microphone, camera).

## A call rings the phone

The project rings an Android phone with a **high-priority FCM data message**. The SDK posts at once a **CallStyle** notification on its own channel — the ringtone, looping until the call is answered, declined, answered on another device or missed — with a **full-screen intent** that opens the call's screen over the lock screen. The call is in Telecom, and a foreground service of type `phoneCall` holds the app while it rings and goes on (with `microphone`, and `camera` in a video call, once it is answered).

- **Ask for the permissions.** On Android 13 and newer the app asks for `POST_NOTIFICATIONS` at runtime, as for any push: a missed call's notification needs it. The microphone (`RECORD_AUDIO`) — and the camera for a video call (`CAMERA`) — are asked before a call is made or answered: without the microphone, a call is refused with `microphone_denied`. palbase-calls-ui's Accept asks for them itself.
- **Full screen over the lock screen.** From Android 14, Google Play grants `USE_FULL_SCREEN_INTENT` to calling apps alone, and the person may turn it off. `pb.calls.canRingFullScreen` says whether it is granted — without it a ring is a heads-up notification with Answer and Decline — and `pb.calls.fullScreenSettings()` is the system's page where the person allows it.
- **A closed app rings; a force-stopped one does not.** A process the system ended — or `adb shell am kill` — still gets the ring: FCM starts it. An app the person force-stopped (Settings › Force stop, or `adb shell am force-stop`) gets no FCM message at all, Android's rule, until it is opened again.

```kotlin
// Before the first call: what the phone needs to ring.
if (!pb.calls.canRingFullScreen) {
    // Explain why, then:
    context.startActivity(pb.calls.fullScreenSettings())
}
```

## Making a call

```kotlin
val scope = rememberCoroutineScope()
Button(onClick = {
    scope.launch {
        // Rings every device of theirs; the media goes between the two phones.
        val call = pb.calls.call(userId, video = true)
        call.setMicrophone(false)
    }
}) { Text("Video call") }
```

| Call | What it does |
|---|---|
| `call(userId, video, conversationId, metadata, callerName, callerImageUrl)` | Rings one person: a direct call. `callerName` and `callerImageUrl` are what they see of the caller (else the caller's messaging profile's) |
| `callGroup(userIds, video, ring, conversationId, metadata, callerName, callerImageUrl)` | A group call, through the media server — several people, or one others may be asked to later. `ring = false` rings no one: the people asked join when they like (a huddle) |
| `join(callId)` | Comes into a group call the person was asked to — rung, missed, declined, or in before |
| `open(callId)` | The call on this device: the one held, or read from the server — what a notification's tap opens in a process that holds none. `null` when it is not this person's, or over |
| `history(limit, cursor, missedOnly)` | The person's calls, the newest first, with how each went for them; `missedOnly` the ones they missed or were busy for |

Each that makes or joins a call answers its `PBCall` and throws the module's refusal as a `PalbaseError`: `not_allowed`, `in_another_call`, `too_many_calls`, `quota_exceeded` and the rest of [Calls over HTTP](https://palbase.studio/docs/calls/http#making-a-call). A call to someone who is calling this person that very moment is their call, answered; their being in another call ends it at once (`endReason` `busy`).

`pb.calls.current` is a `StateFlow` of the call on this device — ringing here, calling out, going on — or `null`; `pb.calls.rung` a `SharedFlow` of each call as it starts ringing here. `deviceId` is this install's device, as notify registered it.

## The call

| `StateFlow` | What it is |
|---|---|
| `status` | `RINGING`, `CALLING`, `CONNECTING`, `CONNECTED`, `RECONNECTING` (the media was lost and is coming back), `ENDED` |
| `endReason` | Why it ended: the server's `hung_up`, `canceled`, `declined`, `missed`, `busy`, `failed`, `ended` — or this device's `answered_elsewhere` and `declined_elsewhere` |
| `snapshot` | The call as the server last told it ([A call](https://palbase.studio/docs/calls/http#a-call)); `null` until read, for a call rung by push |
| `peers` | The other people (and agents): `userId`, `name`, `imageUrl`, `state`, `bot`, and their `video` while their camera is on |
| `localVideo` | This phone's camera, while it is on |
| `microphoneOn`, `cameraOn` | The controls' state |
| `group` | Through the media server: more than two people, or a call people join |
| `connectedAt` | When the media first flowed: the call's clock starts here |
| `audioRoute`, `audioRoutes` | Where the sound plays now, and where it may: `EARPIECE`, `SPEAKER`, `WIRED_HEADSET`, `BLUETOOTH` … each with its name |

And as plain values: `id`, `incoming` (this device was rung for it), `video`, `caller` (`userId`, `name`, `imageUrl`).

| Action | What it does |
|---|---|
| `accept()` | Answers on this device; the person's other devices stop ringing. Needs the microphone |
| `decline()` | Turns it down on every device of the person's: a direct call ends; a group goes on without them |
| `hangUp()` | Leaves it: a direct call ends for both (`canceled` while it rings); a group goes on while someone is in it |
| `invite(userIds, ring)` | Asks more people in: a direct call becomes a group, going on |
| `setMicrophone(on)` | The microphone heard, or muted |
| `setCamera(on)`, `flipCamera()` | The camera on or off in a video call, and the front or the back one |
| `setSpeaker(on)`, `setAudioRoute(route)` | The speaker or the earpiece (a headset when one is connected), or any route of `audioRoutes` |

A camera is drawn by `PBVideoView` (a `View`: set its `track`) or palbase-calls-ui's `CallVideo(track, mirror = …)`.

## Ready-made screens

palbase-calls-ui draws a call in Compose: `IncomingCallScreen` (who calls, Accept and Decline — Accept asks for the microphone, and the camera for video, then answers), `InCallScreen` (the other's video filling the screen and this phone's camera in a corner, or their picture in a voice call; a group in a grid; the call's state and clock; `CallControls`: mute, camera, flip, speaker, hang up) and `CallEndedScreen`. `CallScreen(call)` shows the right one; each takes its parts as slots (`avatar`, `controls`, a person's tile) and `CallColors`.

**Over the app**, while it is open:

```kotlin
setContent {
    CallHost(pb.calls) {
        MyApp()
    }
}
```

**The activity a call opens** — over the lock screen as it rings, Answer from the notification, a tap on the call going on — is palbase-calls-ui's `PalbaseCallActivity`, declared for `Calls.ACTION_CALL`. It draws `CallScreen`, and ends itself a moment after the call does. To draw your own screen in it, set its content in the `Application`, before a ring can come:

```kotlin
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        pb.calls // the calls channel followed from launch
        PalbaseCallActivity.content = { call -> CallScreen(call, incoming = { MyIncoming(it) }) }
    }
}
```

**An activity of your own** replaces it: declare it for the action, and the SDK opens it instead. It reads the call's id and whether the person tapped Answer from its intent:

```xml
<activity android:name=".CallActivity" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true">
    <intent-filter>
        <action android:name="studio.palbase.calls.action.CALL" />
        <category android:name="android.intent.category.DEFAULT" />
    </intent-filter>
</activity>
```

```kotlin
val id = intent.getStringExtra(Calls.EXTRA_CALL_ID) ?: return finish()
val answer = intent.getBooleanExtra(Calls.EXTRA_ANSWER, false)
lifecycleScope.launch {
    val call = pb.calls.open(id) ?: return@launch finish()
    if (answer) call.accept()
}
```

**The words** the screens say are string resources: an app gives its own with strings of the same names (`values-tr/strings.xml`) — `palbase_calls_ui_accept`, `palbase_calls_ui_decline`, `palbase_calls_ui_incoming_voice`, `palbase_calls_ui_incoming_video`, `palbase_calls_ui_calling`, `palbase_calls_ui_connecting`, `palbase_calls_ui_reconnecting`, `palbase_calls_ui_ended`, `palbase_calls_ui_busy`, `palbase_calls_ui_declined`, `palbase_calls_ui_missed`, `palbase_calls_ui_elsewhere`, `palbase_calls_ui_failed`, `palbase_calls_ui_mute`, `palbase_calls_ui_camera`, `palbase_calls_ui_speaker`, `palbase_calls_ui_flip`, `palbase_calls_ui_hang_up`, `palbase_calls_ui_someone`.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Ringing](https://palbase.studio/docs/calls/ringing) — how a call rings each platform, and what its push carries
- [Notifications](https://palbase.studio/docs/android/notifications) — FCM and the app's pushes
