> The full documentation index: https://palbase.studio/llms.txt

# Ringing

A call rings every device of the people called — the app open, in the background or closed, the phone locked — through the project's notifications. Set up an APNs key for iOS, and Firebase for Android and the web, first ([Notifications](https://palbase.studio/docs/backend/notifications)); with neither, a call rings only the apps that are open and listening on their channel. The SDKs register each device for its pushes and draw the call on it: this page is what they rely on.

## iOS

A call rings an iPhone with a **VoIP push** (PushKit). The app registers its PushKit token as an `ios_voip` device (`POST /notify/devices`), beside its notification token, and the push wakes it even when it was closed.

The app hands the call to **CallKit** the moment the push arrives, and iOS draws it: on the lock screen it is Apple's own call screen, with the caller's name, the app's name and icon, and its ringtone. Apple stops sending VoIP pushes to an app that does not report each one to CallKit at once, so the app does so even for a call it then ends — one already answered elsewhere, or over.

Answering or declining from CallKit is `POST /calls/{call_id}/accept` or `/decline` from that iPhone. How the app sets it up — the background modes, `configure`, the APNs key — is [iOS Calls](https://palbase.studio/docs/ios/calls#a-call-rings-the-phone). When the call is answered on another of the person's devices, or the caller gives up, the app hears it on its channel and ends the CallKit call: the phone stops ringing.

## Android

A call rings an Android phone with a **high-priority data message** (FCM). It carries no notification of its own: the app's messaging service wakes, and the SDK draws a **CallStyle** notification with a **full-screen intent** — the incoming-call screen over the lock screen — and its answer and decline buttons. From Android 14, the full-screen intent needs its own permission, which Google Play gives apps whose core function is calling and the person may take back; without it, Android shows the call as a heads-up notification.

When the call is answered on another of the person's devices, or the caller gives up, a second data message tells the phone to stop ringing. The permissions it needs, and the full-screen intent's, are [Android Calls](https://palbase.studio/docs/android/calls#a-call-rings-the-phone).

## The web

A call rings a browser with a **notification** — the caller's name, and "Incoming voice call" or "Incoming video call" in the person's language — through the browser's push service, as the project's web pushes go ([Notifications](https://palbase.studio/docs/backend/notifications)). While a tab of the app is in front, no notification is shown: the page hears the call itself (`pb.calls.onIncoming`) and rings — `palbase/web/calls-ui` draws the call and plays a soft ring ([Web Calls](https://palbase.studio/docs/web/calls#ringing-while-the-page-is-away)). A tap on the notification brings a tab of the app forward, where the person answers.

## A missed call

A person rung for 45 seconds without answering — or whose caller gave up before they answered, or who was busy in another call — is sent a missed-call notification on every device: the caller's name, and "Missed voice call" or "Missed video call". The call is in their history as one they missed — their participant's `state` is `missed`, or `busy` (`GET /calls?missed=true`).

## What a push carries

An app that draws calls itself reads them from the push's data:

| Key | What it is |
|---|---|
| `pb_call` | `incoming` (ring), `silence` (stop ringing: answered elsewhere, or over) or `missed` |
| `call_id` | The call |
| `caller_id`, `caller_name`, `caller_image_url` | Who is calling, as those rung see them |
| `video` | `true` or `false` |
| `kind` | `direct` or `group` |
| `conversation_id` | The conversation it was made from, when it was |
| `ring_until` | When the ring ends, unanswered (RFC 3339) |

A ring push is worth delivering only until the ring ends: a phone that comes online later is not rung for a call that is over. A call's ring and the push that silences it replace each other on the device.

An app woken by a push reads the call (`GET /calls/{call_id}`) before it draws it: it may have been answered elsewhere, or ended, meanwhile. Once it is up, it hears the call change on its channel ([The channel](https://palbase.studio/docs/calls/http#the-channel)).
