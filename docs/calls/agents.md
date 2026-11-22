> The full documentation index: https://palbase.studio/llms.txt

# Agents & Native Transcription

A call can include **native speaker-attributed transcription** (cheap STT via `POST /calls/admin/calls/{call_id}/transcription`), **Palbase AI Live Voice agents** (`POST /ai/chats/{chat_id}/voice` with `transport.type: "call"`), or **your own external LiveKit agent** joined with a ticket (`POST /calls/admin/calls/{call_id}/tickets`). All three compose freely in the same call.

## Native speaker-attributed transcription

When you want live speaker-attributed transcripts without paying for a live voice LLM, enable transcription on the call:

```bash
curl -s -X POST "https://<ref>.palbase.studio/calls/admin/calls/$CALL_ID/transcription" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepgram/nova-3", "language": "auto", "save_to_storage": true}'
```

- Every spoken audio segment (`POST /calls/{call_id}/transcription/audio` or `POST /calls/admin/calls/{call_id}/transcription/audio`) is transcribed via Palbase AI STT (`audio.stt_seconds` billing) and emitted as **`calls.transcript.segment`** (outbox + Realtime) with the exact `speaker_user_id`.
- When transcription is stopped (`DELETE /calls/admin/calls/{call_id}/transcription`) or the call ends, Palbase finalizes the transcript, exports `calls/transcripts/<call_id>.json` and `.txt` to project Storage (when `save_to_storage: true`), and emits **`calls.transcript.completed`**.
- Read the transcript anytime with `GET /calls/{call_id}/transcription` (or `/calls/admin/calls/{call_id}/transcription`).

## Palbase AI Voice agents in a call

Attach any Palbase AI chat session directly to an active call using `transport.type: "call"`:

```bash
curl -s -X POST "https://<ref>.palbase.studio/ai/chats/$CHAT_ID/voice" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-live-2.5",
    "voice": "Aoede",
    "delegation": "chat",
    "transport": {
      "type": "call",
      "call_id": "'"$CALL_ID"'",
      "identity": "assistant",
      "name": "Assistant",
      "activation": {
        "mode": "manual",
        "wake_phrases": ["hey assistant"],
        "idle_close_seconds": 15
      }
    }
  }'
```

- **`activation.mode: "open"`** keeps the live voice model connected continuously (ideal for support lines or two AI agents speaking directly to each other on the same `call_id`).
- **`activation.mode: "manual"`** keeps the live voice model asleep at $0 live-LLM cost until woken by `wake_phrases` or an explicit `POST /ai/chats/{chat_id}/voice/{voice_id}/commands` (`activate` / `speak`), then automatically returns to sleep after `idle_close_seconds`.
- When the call ends, all bound AI voice sessions close automatically with `close_reason: "call_ended"`.

## Bringing your own LiveKit agent (tickets)

You can also connect your own external LiveKit agent (Python, Node.js, Go, Rust) to any call with a ticket:

## A ticket

`POST /calls/admin/calls/{call_id}/tickets`, with the secret key:

| Field | What it is |
|---|---|
| `identity` | The agent's identity in the call: 1 to 64 letters, digits, `_`, `.` or `-`, starting with a letter or a digit. It is in the call as `bot:<identity>` |
| `name` | Its name, as the call lists it |
| `can_publish` | It speaks (and shows) too — the default; `false`: it only listens |
| `metadata` | Its own words: 32 strings, 2 KiB at most |

```bash
curl -s "https://<ref>.palbase.studio/calls/admin/calls/$CALL_ID/tickets" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"identity": "notes", "name": "Notes", "can_publish": false}'
```

From TypeScript, `palbase/server`:

```ts
// src/agent-ticket.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

/** Lets the note taker into a call: the media server's address and a token it connects with. */
export async function letNotesIn(callId: string): Promise<{ url: string; token: string }> {
  const { data } = await palbase.calls.createCallTicket({
    path: { call_id: callId },
    body: { identity: "notes", name: "Notes", can_publish: false },
  });
  return { url: data.url, token: data.token };
}
```

It answers `201`:

| Field | What it is |
|---|---|
| `url` | The media server's address (`wss://`) |
| `token` | The access token the agent connects with |
| `room` | The call's room |
| `identity` | `bot:<identity>` |
| `expires_at` | When the token ends: 6 hours on, or sooner when the credential that asked for it ends sooner. Until then it lets the agent back in after a lost connection |
| `call` | The call, with the agent among its participants ([A call](https://palbase.studio/docs/calls/http#a-call)) |

- **A direct call stays one.** The agent joins the call's room beside its two people; the call goes on as it was.
- **It counts as a person** against the project's `max_participants` (`409 call_full`), and what the media server sends it is billed as a person's ([What it costs](https://palbase.studio/docs/calls/overview#what-it-costs)).
- **The same identity again** is the same agent: a new ticket for it is its way back in.
- Refused: `409 call_ended`; `409 invalid_identity` when the identity is a person's in the call; `400` for a field that is not one; `404 call_not_found`.

## In the call

The media server is LiveKit (open source), and the ticket is what its own client and agent libraries connect with, as they are: [LiveKit Agents](https://docs.livekit.io/agents/) for a voice agent, or its real-time SDKs (Python, Node.js, Go, Rust …) for anything else.

- **Each person's audio is a track of its own**, published by a participant whose identity is their user id: the agent knows who said what, and transcribes each speaker apart.
- **The agent publishes its own**: a voice that answers, a video, as `can_publish` allows.
- **It is in the call** from when it connects, and the call lists it so (`kind: "bot"`, `state: "joined"`); it has left when it disconnects. `calls.participant.joined` and `calls.participant.left` tell your backend, with `participant_kind: "bot"`.
- **It does not keep a call going.** A group ends when no person is in it or being rung, an agent still connected or not; your server may end a call itself (`POST /calls/admin/calls/{call_id}/end`).

```python
import asyncio
from livekit import rtc

async def listen(url: str, token: str) -> None:
    room = rtc.Room()

    @room.on("track_subscribed")
    def on_track(track: rtc.Track, publication: rtc.RemoteTrackPublication, participant: rtc.RemoteParticipant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            # participant.identity is the speaker's user id.
            asyncio.ensure_future(transcribe(participant.identity, rtc.AudioStream(track)))

    await room.connect(url, token)

async def transcribe(user_id: str, stream: rtc.AudioStream) -> None:
    async for event in stream:
        ...  # event.frame: this person's audio, to your speech-to-text
```

## When to send it

Your webhooks say when ([Your Server](https://palbase.studio/docs/calls/server#webhooks)):

- `calls.call.started` — a call was made: an agent that should hear it from the first word is sent in now.
- `calls.participant.joined` — someone answered or joined: send the agent in once a call has the people it is for — a support line's customer, a meeting's host.

A ticket is asked for a call that is not over; one asked for an ended call is `409 call_ended`.
