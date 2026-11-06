> The full documentation index: https://palbase.studio/llms.txt

# Calls

`pb.calls` (`studio.palbase:palbase-calls`) is the signed-in person's voice and video calls on Android. A call rings the phone as a phone call does — over the lock screen and with the app closed, woken by a high-priority FCM message — and lives in the system's call integration (Telecom): its audio route, Bluetooth, a watch or a car answering. Palbase gives the data, not the screens: a `PBCall` is what the app draws, in its own design, its state as `StateFlow`s — and the activity a ring opens over the lock screen is the app's own. Every call's media — one to one or in a group — goes through the platform's media server (LiveKit): a third person or the project's agent comes into the same room, and where UDP is shut it goes over TCP to port 443. What the module is — kinds of call, who may call whom, ringing, history, prices — is [Calls](https://palbase.studio/docs/calls/overview).

## Install

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(platform("studio.palbase:palbase-bom:0.17.0"))
    implementation("studio.palbase:palbase")
    implementation("studio.palbase:palbase-notify")     // the FCM token, and the service a ring arrives through
    implementation("studio.palbase:palbase-calls")      // pb.calls
}
```

Palbase's packages come from its own repository, as every module's do ([Android Overview](https://palbase.studio/docs/android/overview)).

- **Push.** A call rings through the project's FCM provider and the app's Firebase project, as every push does ([Notifications](https://palbase.studio/docs/android/notifications#setting-up-push)). palbase-notify's messaging service (`PalbaseMessagingService`, declared by its manifest) hands a call's push to the calls — no code. An app with a `FirebaseMessagingService` of its own subclasses `PalbaseMessagingService`, calling `super` first, or a ring never reaches the calls.
- **The client in the `Application`.** Make the client there, touch `pb.calls` and register the app's call activity (`pb.calls.callActivity`, [The app's call activity](#the-apps-call-activity)): the person's calls channel is followed from then on, and a process FCM starts for a ring uses the app's own client.
- **What the manifests add.** palbase-calls declares its permissions (`RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT`, `MANAGE_OWN_CALLS`, the foreground service types `phoneCall`, `microphone` and `camera` …), the foreground service a call holds the app with, the receiver a notification's Decline and Hang up go to, and LiveKit's screen capture service (type `mediaProjection`, with `FOREGROUND_SERVICE_MEDIA_PROJECTION`) for [sharing a screen](#sharing-a-screen). An app that makes voice calls alone may remove `CAMERA` and the camera service type, and one that shares no screen the screen capture service and its permission (`tools:node="remove"`). The app declares the foreground service types in Google Play's declaration (phone call, microphone, camera, media projection).

## A call rings the phone

The project rings an Android phone with a **high-priority FCM data message**. The SDK posts at once a **CallStyle** notification on its own channel — the ringtone, looping until the call is answered, declined, answered on another device or missed — with a **full-screen intent** that opens the app's own call activity over the lock screen ([The app's call activity](#the-apps-call-activity)). The call is in Telecom, and a foreground service of type `phoneCall` holds the app while it rings and goes on (with `microphone`, and `camera` in a video call, once it is answered).

- **Ask for the permissions.** On Android 13 and newer the app asks for `POST_NOTIFICATIONS` at runtime, as for any push: a missed call's notification needs it. The microphone (`RECORD_AUDIO`) — and the camera for a video call (`CAMERA`) — are asked before a call is made or answered: without the microphone, a call is refused with `microphone_denied`.
- **Full screen over the lock screen.** From Android 14, Google Play grants `USE_FULL_SCREEN_INTENT` to calling apps alone, and the person may turn it off. `pb.calls.canRingFullScreen` says whether it is granted — without it a ring is a heads-up notification with Answer and Decline — and `pb.calls.fullScreenSettings()` is the system's page where the person allows it.
- **A closed app rings; a force-stopped one does not.** A process the system ended — or `adb shell am kill` — still gets the ring: FCM starts it. An app the person force-stopped (Settings › Force stop, or `adb shell am force-stop`) gets no FCM message at all, Android's rule, until it is opened again.

<!-- given: context: Context -->

```kotlin
import studio.palbase.calls.calls

// Before the first call: what the phone needs to ring.
if (!pb.calls.canRingFullScreen) {
    // Explain why, then:
    context.startActivity(pb.calls.fullScreenSettings())
}
```

## Making a call

<!-- given: userId: String -->

```kotlin
val scope = rememberCoroutineScope()
Button(onClick = {
    scope.launch {
        // Rings every device of theirs; the media goes through the media server.
        val call = pb.calls.call(userId, video = true)
        call.setMicrophone(false)
    }
}) { Text("Video call") }
```

| Call | What it does |
|---|---|
| `call(userId, video, conversationId, metadata, callerName, callerImageUrl)` | Rings one person: a direct call. `callerName` and `callerImageUrl` are what they see of the caller (else the caller's messaging profile's) |
| `callGroup(userIds, video, ring, conversationId, metadata, callerName, callerImageUrl, place)` | A group call — several people, or one others may be asked to later. `ring = false` rings no one: the people asked join when they like (a huddle); `place` holds it at a place, no one need be asked |
| `join(callId, name, imageUrl)` | Comes into a group call: one the person was asked to — rung, missed, declined, or in before — or, unasked, one held at a place that lets them in ([A call at a place](#a-call-at-a-place)); `name` and `imageUrl` are what the others see of them there |
| `place(name)` | A place of the app (`channel:42`) and the call going on there ([A call at a place](#a-call-at-a-place)) |
| `open(callId)`, `open(intent)` | The call on this device: the one held, or read from the server — what the app's call activity opens in a process that holds none, from its intent. `null` when it is not this person's, or over |
| `history(limit, cursor, missedOnly)` | The person's calls, the newest first, with how each went for them; `missedOnly` the ones they missed or were busy for |

Each that makes or joins a call answers its `PBCall` and throws the module's refusal as a `PalbaseError`: `not_allowed`, `in_another_call`, `too_many_calls`, `quota_exceeded` and the rest of [Calls over HTTP](https://palbase.studio/docs/calls/http#making-a-call). A call to someone who is calling this person that very moment is their call, answered; their being in another call ends it at once (`endReason` `busy`).

`pb.calls.current` is a `StateFlow` of the call on this device — ringing here, calling out, going on — or `null`; `pb.calls.rung` a `SharedFlow` of each call as it starts ringing here. `deviceId` is this install's device, as notify registered it.

## The call

| `StateFlow` | What it is |
|---|---|
| `status` | `RINGING`, `CALLING`, `CONNECTING`, `CONNECTED`, `RECONNECTING` (the media was lost and is coming back), `ENDED` |
| `endReason` | Why it ended: the server's `hung_up`, `canceled`, `declined`, `missed`, `busy`, `failed`, `ended` — or this device's `answered_elsewhere` and `declined_elsewhere` |
| `snapshot` | The call as the server last told it ([A call](https://palbase.studio/docs/calls/http#a-call)); `null` until read, for a call rung by push |
| `peers` | The other people (and agents): `userId`, `name`, `imageUrl`, `state`, `bot`, their `video` while their camera is on, their `screen` while they share one (apart from the camera), and whether they are `speaking` now |
| `localVideo` | This phone's camera, while it is on |
| `microphoneOn`, `cameraOn` | The controls' state |
| `screenSharing` | This phone shares its screen |
| `speaking` | This person is heard speaking now |
| `group` | A group call: more than two people, or a call people join |
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
| `setScreenShare(on, permission)` | Shares this phone's screen, or stops sharing it ([Sharing a screen](#sharing-a-screen)) |

A camera — or a shared screen — is drawn by `PBVideoView` (a `View`: set its `track`), in Compose through `AndroidView`:

```kotlin
import studio.palbase.calls.PBCall
import studio.palbase.calls.PBVideoTrack
import studio.palbase.calls.PBVideoView

@Composable
fun Video(track: PBVideoTrack?, modifier: Modifier = Modifier) {
    AndroidView(factory = { PBVideoView(it) }, update = { it.track = track }, modifier = modifier)
}

@Composable
fun InCall(call: PBCall) {
    val peers by call.peers.collectAsState()
    val other = peers.firstOrNull()
    // A shared screen fills the screen; else the other's camera.
    Video(other?.screen ?: other?.video, Modifier.fillMaxSize())
    Text(if (other?.speaking == true) "${other.name} is speaking" else "")
}
```

## The app's call activity

A ring over the lock screen — the app closed, the screen off — opens the app's own activity, full screen: register it in the `Application`, before a ring can come. The ring's full-screen intent, its Answer and a tap on a call's notification open it, the call's id in its intent.

<!-- given: class CallActivity : android.app.Activity() -->

```kotlin
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        pb.calls.callActivity = CallActivity::class.java
    }
}
```

```xml
<activity android:name=".CallActivity" android:exported="false" android:launchMode="singleTop"
    android:showWhenLocked="true" android:turnScreenOn="true" />
```

<!-- given: @Composable fun MyCallScreen(call: PBCall, onEnded: () -> Unit) -->

```kotlin
import studio.palbase.calls.Calls
import studio.palbase.calls.PBCall

class CallActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            val call = pb.calls.open(intent) ?: return@launch finish()
            if (Calls.answerTapped(intent) && call.status.value == PBCall.Status.RINGING) call.accept()
            setContent { MyCallScreen(call, onEnded = { finish() }) }
        }
    }
}
```

The activity is the app's, drawn as it likes: who calls, Accept and Decline while it rings, then the call. `showWhenLocked` and `turnScreenOn` put it over the lock screen; `singleTop` brings the next call's intent to it (`onNewIntent`). With no activity registered, a call rings as a heads-up notification alone — Answer and a tap open the app's launch activity, the call's id in its intent all the same.

## Sharing a screen

Android asks the person each time before an app captures the screen (MediaProjection): launch `Calls.screenShareIntent(context)` for a result, and pass the result's `Intent` to `setScreenShare(true, it)` — Android 14 and newer let one yes serve one share alone. The others get the screen as their `PBCallPeer`'s `screen`, apart from the camera. `setScreenShare(false)` stops it, and so does the system's own "Stop sharing" (the capture's notification, on the calls channel); `screenSharing` says which.

<!-- given: call: PBCall, scope: CoroutineScope, context: Context -->

```kotlin
val share = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    val grant = result.data
    if (result.resultCode == Activity.RESULT_OK && grant != null) scope.launch { call.setScreenShare(true, grant) }
}
val sharing by call.screenSharing.collectAsState()
Button(onClick = {
    if (sharing) scope.launch { call.setScreenShare(false) } else share.launch(Calls.screenShareIntent(context))
}) { Text(if (sharing) "Stop sharing" else "Share screen") }
```

While it shares, the capture runs in LiveKit's foreground service of type `mediaProjection`, with a notification the person may stop it from. The screen goes through the media server as the camera does, and its data is the call's ([What it costs](https://palbase.studio/docs/calls/overview#what-it-costs)). Its refusals: `screen_permission_required` (no yes passed), `not_in_call`, `screen_share_failed`.

## A call at a place

`pb.calls.place(name)` is a place of the app — a channel (`channel:42`), a conversation of Palbase's messaging (`conversation:<id>`) — and the call going on there ([A call at a place](https://palbase.studio/docs/calls/overview#a-call-at-a-place)). Its `call` is a `StateFlow` of that call (`null` for none): while the app collects it, the place is watched — told as a call starts there, changes and ends, on the person's calls channel, the watch renewed — and the watch stops a few seconds after the last collector goes. `error` is the last refusal of reading or watching it: `not_allowed` where the project's rule does not let this person into the place.

| On the place | What it does |
|---|---|
| `call`, `error` | The call going on there, and the last refusal |
| `refresh()` | Reads the place's call as it is now |
| `watch()`, `unwatch()` | Watches it without collecting `call`, and stops |
| `start(video, userIds, ring, metadata, callerName, callerImageUrl)` | Starts a call at the place: no one need be asked |
| `join(name, imageUrl)` | Comes into the call going on there, unasked |

<!-- given: myName: String -->

```kotlin
import studio.palbase.calls.CallsAPI

@Composable
fun ChannelMeeting(channelId: String) {
    val place = remember(channelId) { pb.calls.place("channel:$channelId") }
    val call by place.call.collectAsState()   // watched while this is on screen
    val scope = rememberCoroutineScope()
    if (call != null) {
        Button(onClick = { scope.launch { place.join(name = myName, imageUrl = null) } }) {
            Text("Join the meeting (${call!!.participants.count { it.state == CallsAPI.Participant.State.JOINED }} in it)")
        }
    } else {
        Button(onClick = { scope.launch { place.start(ring = false) } }) { Text("Start a meeting") }
    }
}
```

One call goes on at a place at a time: starting another there is refused with `place_busy` (409), and the place's `call` then shows the one going on, to join. A place with no rule — no hook answering places, not a conversation — is the call's label alone: its call is seen by the people asked into it only.

## Related

- [Calls](https://palbase.studio/docs/calls/overview) — kinds of call, who may call whom, a call's life, prices
- [Ringing](https://palbase.studio/docs/calls/ringing) — how a call rings each platform, and what its push carries
- [Notifications](https://palbase.studio/docs/android/notifications) — FCM and the app's pushes
