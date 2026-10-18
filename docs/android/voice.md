> The full documentation index: https://palbase.studio/llms.txt

# Voice

A chat of the project's agents can be talked to out loud ([AI › Voice](https://palbase.studio/docs/backend/ai#voice)). `PBVoice` (`studio.palbase:palbase-voice`) is that voice on the device: the microphone goes to the platform's voice provider and its voice comes back, over WebRTC. The app makes the WebRTC offer, the app's own backend starts the voice with it, and the provider's key never leaves the platform.

WebRTC comes with this artifact alone, so an app that takes no voice carries none of it. Its native library is about 12 MB for each ABI.

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

```kotlin
import studio.palbase.generated.*
import studio.palbase.voice.PBStartedVoice
import studio.palbase.voice.PBVoice

// The person allowed RECORD_AUDIO first.
val voice = PBVoice.connect(context, start = { sdp ->
    val started = pb.backend.voice.start(chatId, VoiceStartRequest(sdp = sdp))
    PBStartedVoice(started.id, started.sdp)
})

voice.mute(true)
voice.mute(false)

// Done: here, then on the backend.
voice.close()
pb.backend.voice.close(chatId, voice.id)
```

## Connecting

`PBVoice.connect(context, start, audio, iceTimeoutMillis, onError, onState)` makes the offer, hands it to `start`, sets the answer it gets back and returns the voice. Its `state` then says when the connection is up:

| Argument | What it is |
|---|---|
| `start` | The round trip to the app's own backend: the offer (an SDP) in, the voice's id and the provider's answer out, as a `PBStartedVoice(id, sdp)`. |
| `audio` | Who holds the device's audio while the voice talks. `PBVoice.Audio.MANAGED` (the default): the voice sets it up (in communication, through the speaker unless a headset is connected, with the audio focus taken) and gives it back as it found it on close. `PBVoice.Audio.APP`: the app set it up already, and the voice leaves it as it is. |
| `iceTimeoutMillis` | How long the offer's network candidates are gathered at most before it is sent: 10 seconds by default, then `PalbaseError` `ice_timeout`. |
| `onError` | The provider's word that something went wrong in the voice, on WebRTC's thread. |
| `onState` | The connection's state each time it changes, on WebRTC's thread. |

The app asks the person for the microphone first: `RECORD_AUDIO` is a runtime permission, and without it `connect` throws `PalbaseError` `microphone_denied`. The artifact declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` in its manifest. When the coroutine that connects is cancelled, or the backend refuses, whatever was opened is closed.

A member starts at most 5 voices an hour, and one voice talks in a chat at a time: the backend's `start` throws `429 too_many_voices` or `409 voice_active` ([AI › Voice](https://palbase.studio/docs/backend/ai#voice)).

## The voice

| Member | What it is |
|---|---|
| `id` | The voice the backend started: what it reads, tells and closes it by. |
| `state` | The connection's state as a `StateFlow<PBVoice.State>`: `NEW`, `CONNECTING`, `CONNECTED`, `DISCONNECTED`, `FAILED`, `CLOSED`. |
| `muted`, `mute(on)` | Whether the microphone is heard. |
| `close()` | Ends it here: the connection, the microphone, and the audio it set up. Callable from any thread. |

Call `close()` when the voice is done, in a screen's `onDispose` or a ViewModel's `onCleared`. Ending it is the app's, and its backend's (`Palbase.ai.chats.voice.close`). A voice the app lets go of without closing it is closed once the garbage collector takes it, but not at once: the microphone stays open until then.

## What was said

Nothing of the conversation is read on the device. What is said either way is the chat's: on a [chat gateway](https://palbase.studio/docs/android/gateways#chat-gateways), the chat's state has the voice (`PBChat.State.voice`: when it began and ended), and each line said in it is among the messages, of kind voice, the person's and the voice's own.

## Related

- [AI › Voice](https://palbase.studio/docs/backend/ai#voice): starting, telling and closing a voice from the backend
- [Gateways](https://palbase.studio/docs/android/gateways#chat-gateways): the chat the voice talks in
- [Calling Your Backend](https://palbase.studio/docs/android/backend-calls): the generated client the offer goes through
