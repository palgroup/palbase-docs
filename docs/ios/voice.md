> The full documentation index: https://palbase.studio/llms.txt

# Voice

A chat of the project's agents can be talked to out loud ([AI › Voice](https://palbase.studio/docs/backend/ai#voice)). `PBVoice` (the `PalbaseVoice` product) is that voice on the device: the microphone goes to the platform's voice provider and its voice comes back, over WebRTC. The app makes the WebRTC offer, the app's own backend starts the voice with it, and the provider's key never leaves the platform.

## Install

`PalbaseVoice` is a package of its own, [github.com/palgroup/palbase-swift-voice](https://github.com/palgroup/palbase-swift-voice), because it brings WebRTC (LiveKit's build, [livekit/webrtc-xcframework](https://github.com/livekit/webrtc-xcframework)): an app that talks to no voice resolves none of it. Add it at the same version as `palbase-swift`:

```swift
.package(url: "https://github.com/palgroup/palbase-swift-voice", exact: "0.4.0")
```

Link `PalbaseVoice`; it brings the `Palbase` core of the same version. An app that also takes LiveKit's SDK resolves the one WebRTC package. The app's Info.plist says why it asks for the microphone, in `NSMicrophoneUsageDescription`.

## Quick example

The backend starts the voice for the signed-in member, from a route of its own:

```ts
// src/modules/support/voice.controller.ts
import { Body, Controller, Palbase, Param, Post, User, z, type UserT } from "palbase/backend";

const Offer = z.object({ sdp: z.string().min(1) });

@Controller("/voice")
export class VoiceController {
  // The app's WebRTC offer in; the voice's id and the provider's answer out.
  @Post("/{chatId}")
  async start(@Param("chatId") chatId: string, @Body(Offer) body: z.infer<typeof Offer>, @User() user: UserT): Promise<{ id: string; sdp: string }> {
    const voice = await Palbase.ai.chats.voice.start(chatId, { sdp: body.sdp, as: user.id });
    return { id: voice.id, sdp: voice.sdp };
  }

  @Post("/{chatId}/{voiceId}/close")
  async close(@Param("chatId") chatId: string, @Param("voiceId") voiceId: string, @User() user: UserT): Promise<{ seconds: number }> {
    const voice = await Palbase.ai.chats.voice.close(chatId, voiceId, { as: user.id });
    return { seconds: voice.seconds };
  }
}
```

The app connects, after `palbase apps:sync` wrote the backend's client:

```swift
import Palbase
import Palbe
import PalbaseVoice

@MainActor
func talk(chatId: String) async throws -> PBVoice {
    try await PBVoice.connect(start: { sdp in
        // The offer through the app's own backend; the voice it started and the provider's answer back.
        let started = try await pb.backend.voice.start(chatId: chatId, .init(sdp: sdp))
        return PBStartedVoice(id: started.id, sdp: started.sdp)
    }, onState: { state in
        print("voice:", state.rawValue)
    })
}
```

## Connecting

`PBVoice.connect(start:audioSession:iceTimeout:onError:onState:)` asks the person for their microphone, sets up the audio session, makes the peer connection and its offer, gathers its network candidates (for `iceTimeout`, 10 seconds at most by default), and hands the offer to `start`. `start` is the round trip to your backend; it returns a `PBStartedVoice(id:sdp:)`, the voice's id and the provider's answer. `connect` returns once the answer is set.

| Parameter | What it says |
|---|---|
| `start` | The offer (an SDP) in, the voice and its answer out, through your backend. |
| `audioSession` | `.managed` (the default): the voice sets the audio session up for voice chat, on the speaker unless something else is connected, and turns it off on close, letting other apps' sound come back. `.app`: the app set it up already and keeps it. |
| `iceTimeout` | How long the offer's candidates are gathered at most. |
| `onError` | The provider's word that something went wrong in the voice. |
| `onState` | The connection's state each time it changes. |

A microphone the person refuses throws `microphone_denied`. A refusal from your backend, or the connecting task cancelled, closes whatever was opened.

## The voice

`PBVoice` is on the main actor:

| Member | What it does |
|---|---|
| `id` | The voice your backend started: what it reads, tells and closes it by. |
| `state` | The connection's state: `new`, `connecting`, `connected`, `disconnected`, `failed` or `closed`. |
| `mute(_:)`, `muted` | Stops the provider hearing the microphone, and says whether it does not. |
| `close()` | Ends it here: the connection, the microphone, and the audio session it set up. |

Call `close()` when the voice is done, and close it on your backend too (`Palbase.ai.chats.voice.close`). A `PBVoice` the app lets go of without closing it is closed as it goes, so the microphone does not stay open behind it.

## What was said

What is said either way is the chat's. A member who has the chat's gateway joined sees it in the chat's state ([Gateways](https://palbase.studio/docs/ios/gateways#chat-gateways)): each line as a message of kind `.voice`, with `voice.role` `.user` or `.assistant`, and `state.voice` (its `status`, `started` or `closed`, `mine`, `seconds` and `closeReason`), with an item when it begins and when it ends.

## Related

- [AI › Voice](https://palbase.studio/docs/backend/ai#voice): starting, telling and closing a voice from your backend
- [Gateways](https://palbase.studio/docs/ios/gateways): the chat's state, where what was said arrives
- [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls): the generated client the offer goes through
