> The full documentation index: https://palbase.studio/llms.txt

# Agents

Your project's own agent can be in a call: a bot that transcribes it, takes notes, answers in a support line, translates. Your server lets it in with a ticket, and it joins as a participant everyone in the call hears (and sees), listed as an agent. Palbase runs no agent of its own: what the agent does with what it hears — and which model or service it uses — is yours.

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

- **A direct call moves for it.** A call between two devices moves to the media server as the ticket is given, going on: the two devices are told, and move without dropping the call.
- **It counts as a person** against the project's `max_participants` (`409 call_full`), and its minutes are billed as a person's ([What it costs](https://palbase.studio/docs/calls/overview#what-it-costs)).
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
