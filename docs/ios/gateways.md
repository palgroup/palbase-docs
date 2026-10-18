> The full documentation index: https://palbase.studio/llms.txt

# Gateways

Your backend's [gateways](https://palbase.studio/docs/backend/gateways) are its realtime channels, and an iOS app joins them through the client `palbase apps:sync` generates ([Calling Your Backend](https://palbase.studio/docs/ios/backend-calls)). `pb.backend.join(RoomGateway(roomId: "42"))` returns once the backend let the signed-in user in, with a handle: the gateway's events arrive on it as a Swift enum, and its messages go out through it, each answered with the backend's ack. The app writes no channel name, event name or payload type of its own, and a gateway that carries a chat holds the chat's state for SwiftUI.

## Quick example

The backend's `RoomGateway` ([Gateways](https://palbase.studio/docs/backend/gateways#quick-example)): its pattern `room:{roomId}`, the events `message` and `welcome`, and the message `say`, answered with the new message's id.

```swift
import Palbase
import Palbe

func enterRoom(_ roomId: String) async {
    do {
        // Throws PBGatewayError.unauthorized when the backend does not let this user in.
        let room = try await pb.backend.join(RoomGateway(roomId: roomId))

        let listener = await room.on { event in
            switch event {
            case .message(let m): print("\(m.from): \(m.text)")
            case .welcome(let w): print("\(w.members) in the room")
            }
        }

        // The ack the backend's @Subscribe returned, as the message's case.
        if case .say(let said) = try await room.send(.say(.init(text: "hello"))) {
            print("taken as", said.id)
        }

        // When the screen goes:
        await room.off(listener)
        await room.leave()
    } catch let e as PBGatewayError {
        print("not taken:", e.reason) // the backend's own word, or the platform's: forbidden, unavailable, …
    } catch {
        print(error)
    }
}
```

## The generated types

Each gateway of the backend is a struct named by its class, `RoomGateway`, made with a value for each `{param}` of its pattern: `RoomGateway(roomId: "42")` is the channel `room:42`. Inside it:

| Member | What it is |
|---|---|
| `Event` | The events it sends, one case each, with its payload type: `.message(RoomGatewayMessageEvent)`, `.welcome(RoomGatewayWelcomeEvent)`. |
| `Send` | The messages a member may send: `.say(RoomGatewaySayMessage)`. |
| `Reply` | The acks, one case per message: `.say(RoomGatewaySayReply)`. |
| `pattern`, `durable`, `topic` | Its pattern, whether it keeps what it sends, and the channel this value names. |

An event the generated code does not know, from a backend that moved ahead of the app, is not delivered. Run `palbase apps:sync` again when the backend changes a gateway: a payload it no longer takes is then a compile error.

## Joining

`join(_:history:)` takes the generated value, opens the project's socket if it is not open, and returns a `GatewayHandle` once the backend let the user in. A param that is empty or holds a `:` would name another channel, and is refused before anything is sent (`invalid params`).

| Member of the handle | What it does |
|---|---|
| `on(_:)` | Listens to every event the gateway declares, as its `Event` enum. Returns a token. |
| `off(_:)` | Stops the listener the token names. |
| `send(_:)` | Sends one message and waits for the backend to take it: returns its `Reply`, or throws `PBGatewayError`. |
| `leave()` | Drops the handle's listeners and lets go of the channel. |
| `topic` | The channel: `room:42`. |
| `seq` | A durable gateway's number of the last event the handle was sent; `nil` on one that keeps nothing. |
| `chat` | A chat gateway's chat: see [Chat gateways](#chat-gateways). |

`GatewayHandle` is an actor: its methods are awaited. Hold a handle for as long as its screen is on screen, and leave it when the screen goes (`.onDisappear`, or the end of a `.task`): a gateway with members is one its backend still runs for. Two handles of the same channel share one membership, and the channel is left with the last of them.

Only a signed-in user joins: the session the socket carries is who they are. The socket is one person's, and it closes when someone signs out or someone else signs in.

## Messages and acks

`send(_:)` returns what the backend's `@Subscribe` returned, as the message's `Reply` case. It throws `PBGatewayError`, whose `reason` says why the message was not taken:

| `reason` | What it means |
|---|---|
| The backend's own word | Its method threw `GatewayRefusal("…")`: `no_commands`, `not_your_turn`. Act on it. |
| `forbidden` (`.forbidden`) | The user may only listen on this channel, or the platform refused with no reason given. |
| `rate_limited` (`.rateLimited`) | Past the project's events per second. |
| `unavailable` (`.unavailable`) | The backend could not be asked just then. Worth trying again. |
| `no reply`, `socket closed` | No answer came. The message may have been taken. |
| `not joined` (`.notJoined`) | Nothing was sent: the handle was left, its socket closed for good, or the socket is being opened again. |
| `undecodable reply` | The backend took it, but its ack is not what the app's generated code reads: run `palbase apps:sync`. |

A join that is refused throws too: `unauthorized` when the backend did not let the user in, `unavailable` when it could not be asked (worth trying again). The values are static members of `PBGatewayError` to compare with: `catch let e as PBGatewayError where e == .unauthorized`.

A message goes to the backend alone, never to the other members. They hear what the backend emits.

## Durable gateways

A [durable gateway](https://palbase.studio/docs/backend/gateways#durable-gateways) keeps what it sends. A handle that joins one is sent what it keeps first, in order, then what comes after; `join(_:history: false)` asks for only what comes after the join. The channel's first handle decides: a second handle of the same channel gets the events from where it joins.

When the socket drops, it is opened again by itself and every gateway joined again; a durable one after its `seq`, so the handle is sent what it missed, in order, and nothing twice. Meanwhile `send` throws `not joined`. When the socket closes for good (a sign-out, another user's sign-in) every handle on it ends: its listeners are dropped, and `send` throws `not joined`. Join again as the user who is there now.

## Chat gateways

A gateway declared with `chat: true` carries a chat of the project's agents, which the platform writes into its channel ([AI](https://palbase.studio/docs/backend/ai#a-chat-in-an-app)). Its handle's `chat` is a `PBChat`, the chat's state folded from what the platform writes: from the chat's start, since the channel keeps it, and then each change as it comes. In SwiftUI, hold it as a `PBChatModel`, an `@Observable` on the main actor:

```swift
import Palbase
import Palbe
import SwiftUI

struct SupportChat: View {
    let chatId: String
    @State private var support: GatewayHandle<SupportGateway>?
    @State private var chat: PBChatModel?
    @State private var text = ""

    var body: some View {
        List {
            if let chat {
                ForEach(chat.state.items) { item in
                    switch item {
                    case .message(let m): Text(m.text).frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
                    case .response(let r): Text(r.text)
                    case .goal, .voice: EmptyView()
                    }
                }
                TextField("Message", text: $text)
                Button("Send") {
                    Task { _ = try? await support?.send(.say(.init(text: text))); text = "" }
                }
            }
        }
        .task {
            guard let joined = try? await pb.backend.join(SupportGateway(chatId: chatId)) else { return }
            support = joined
            chat = PBChatModel(joined.chat)
        }
        .onDisappear { Task { [support] in await support?.leave() } }
    }
}
```

`SupportGateway` and its `say` message are the backend's own, as [AI](https://palbase.studio/docs/backend/ai#a-chat-in-an-app) declares them. What the member does in the chat goes through the gateway's messages, and the backend does it as them: `say`, `decide` (an approval's yes or no), `answer` (a client tool's output) and `stop`.

| Member of `PBChat` | What it is |
|---|---|
| `state` | The chat now: the same value until something changes. |
| `onChange(_:)` | Told each time the state changes; a burst of parts is one change. Returns what stops it. |
| `updates` | An `AsyncStream` of the state now, then each change (the newest, for a reader that falls behind), until the gateway is left. |
| `hasOlder`, `loadOlder(_:chatId:limit:)` | The channel keeps a day of the chat. `loadOlder(pb, chatId:)` reads the page before what the state holds, with the member's own session (the project's AI settings let its users' sessions reach their chats: `clients`), and folds it in front; it returns whether there is more, `false` once a page reached the chat's start. `loadOlder(limit:load:)` reads the page through your backend instead: `load` is given a `PBChat.PartsQuery` and returns a `PBChat.PartsPage`. |

What `state` holds:

| Field | What it is |
|---|---|
| `items` | The conversation in order, an `Item` each: `.message(Message)`, `.response(Response)`, `.goal(GoalEvent)` and `.voice(VoiceEvent)`. Each has an `id` for `ForEach`. A subagent's answer is a part of its parent's. |
| `messages` | Each member's (or the server's) message: `clientId`, `id`, `text`, `author` (`nil`: the server), `authorName`, `status` (`.pending` until the agent has it, then `.delivered`, or `.failed` with its `error`), `kind` (`.text`, or `.voice` for a line said in the chat's voice), `attachments`, `metadata`, `createdAt`, and `mine`. |
| `responses` | Each answer, the subagents' too: `id`, `status` (`running`, `waiting`, `completed`, `failed`, `canceled`, `timed_out`, `budget_exceeded`), `end` and `error` once it ended, `text` so far, `parts`, `thinking`, `goal`, `startedBy`, and `mine`. |
| `turn` | The last turn's state: its `status`, and in `waiting.reason` what it waits for: `approval`, `tool_output`, `subagents` or `message`. |
| `waiting` | What waits for the signed-in user: `approvals`, the tool calls of their own turns waiting for their yes, and `outputs`, their client tool calls waiting for the app's answer. |
| `goal` | The chat's goal once one was set: `objective`, `status`, its stop code and reason, and its `events`. |
| `voice` | The chat's live voice, the last that began, live or ended: `status` (`started`, `closed`), `mine`, `seconds`, `closeReason`. See [Voice](https://palbase.studio/docs/ios/voice). |
| `forkedFrom` | A fork's: the `chatId` it was forked from and the message it was cut before. |

An answer's `parts` are its pieces in order: `.text(String)`, `.tool(Tool)` (a tool call: `callId`, `name`, `status`, `input`, `output`, and `approvalId` while it waits for a yes), `.agent(Agent)` (a subagent handed work) and `.thinking(Thinking)` (a step's reasoning, when the agent shows it). A tool call's `output` is its last 16 KiB, `omittedBytes` how much came before; `pb.chatToolCall(chatId:callId:)` reads the whole answer.

A picture or a file a message carries is read back with `pb.chatAttachment(chatId:message:_:)`, as `Data` of the attachment's `contentType`. A file is attached by your backend, which sends the message naming it. Both reads go with the member's own session, as `loadOlder(pb, chatId:)` does.

`PBChat(parts:me:)` makes a chat from parts you give it, through the same fold: what a SwiftUI preview or a test shows a chat with.

## Related

- [Calling Your Backend](https://palbase.studio/docs/ios/backend-calls): the generated client the gateways are in
- [Gateways in your backend](https://palbase.studio/docs/backend/gateways): patterns, who may join, events, messages, durable gateways
- [AI](https://palbase.studio/docs/backend/ai): the chats a chat gateway carries
- [Realtime](https://palbase.studio/docs/ios/realtime): the project's channels, and the socket they share
- [Voice](https://palbase.studio/docs/ios/voice): a chat's live voice
