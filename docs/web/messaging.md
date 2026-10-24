> The full documentation index: https://palbase.studio/llms.txt

# Messaging

`pb.messaging` is the signed-in person's conversations in the browser: their list, each conversation's timeline and its threads, kept in IndexedDB between visits and current over the project's socket. An app subscribes to what it draws and writes; it opens no socket, appends nothing and syncs nothing itself. What the module is — history, encryption, files, timers, moderation, prices — is [Messaging](https://palbase.studio/docs/messaging/overview).

## Quick example

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({
  url: "https://k3xq81w4m.palbase.studio",
  publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5",
  // What the browser keeps of the person's conversations when they sign out: dropped unless true.
  messaging: { keepOnSignOut: false },
});
```

```ts
// src/inbox.ts
import { pb } from "./lib/palbase";

// The person's conversations, the latest first: drawn from the device at once, then kept current.
const list = pb.messaging.conversations();
const stopList = list.subscribe(() => {
  const { items, unread, synced } = list.state;
  console.log(`${unread} unread in ${items.length} conversations`, synced ? "" : "(catching up)");
});

// The direct conversation with someone: the one there is, or a new one (it shows to them with its first message).
const chat = await pb.messaging.direct("usr_01a1684c796e7394aa8ec75d893a8fe2");
const stopChat = chat.subscribe(() => {
  for (const entry of chat.state.entries) {
    if (entry.kind === "message") console.log(entry.message.sender_id, entry.message.text);
    else console.log("sending…", entry.item.request.text, entry.item.state);
  }
});

// Drawn at once, sent now or when the network is back — once.
await chat.send("Hi!");
await chat.markRead();

stopChat();
stopList();
```

## Conversations

| Call | What it is |
|---|---|
| `conversations()` | The person's conversations, the latest first: `items`, `unread` across them, and `synced` once the device's copy caught up |
| `conversation(id)` | One conversation: `conversation`, `entries` (its timeline, the oldest first, then what is on its way), `members`, `typing`, `hasEarlier` |
| `direct(userId)` | The direct conversation with someone |
| `group({ title, memberIds, description, photo, settings })` | A new group, the person its owner; `notAdded` names whom the project's hook kept out |
| `thread(conversationId, rootId)` | A message's thread: `root`, `entries`, `thread` (its count, its last answer, who answered, its unread count) |
| `threads()` | The threads the person follows |
| `scheduled()` | The person's messages for later |

Each view (`conversations()`, `conversation(id)`, `thread(…)`, `scheduled()`) is an `Observed`: `state` now and `subscribe(listener)`, which returns the call that stops it. It reads the device's copy while subscribed and as long as the person stays the same; when another person signs in, it reads theirs. `loadEarlier()` reads the page before the oldest message drawn.

```ts
// src/team.ts
import { pb } from "./lib/palbase";

const team = await pb.messaging.group({ title: "Design", memberIds: ["usr_01a1684c796e7394aa8ec75d893a8fe2"] });
const view = team.conversation;
view.subscribe(() => console.log(view.state.members.length, "members,", view.state.typing.length, "typing"));
if (view.state.hasEarlier) await view.loadEarlier();
await pb.messaging.update(view.id, { title: "Design team" });
```

## Writing

`send(conversationId, input)` — or a view's own `send(input)` — takes text or what a message carries:

```ts
// src/compose.ts
import { pb } from "./lib/palbase";

const conversationId = "0199f0c2-6a3e-7b1d-9f4e-2d1c8b7a6e50";
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
const photo = input.files![0];

// Answers a message inline, mentions someone, carries a file encrypted on this device before it is uploaded.
await pb.messaging.send(conversationId, {
  text: "Here it is, @bob",
  replyTo: "0199f0c2-7c11-7e2f-8a3b-4c5d6e7f8091",
  files: [{ data: photo, contentType: photo.type, name: photo.name }],
});

// In a thread, shown in the conversation too; gone a day after everyone read it.
await pb.messaging.send(conversationId, { text: "Agreed", threadId: "0199f0c2-7c11-7e2f-8a3b-4c5d6e7f8091", alsoInConversation: true, expiresIn: 86_400, expiresFrom: "read" });

// Seen once: its photo opens for ten seconds, once.
await pb.messaging.send(conversationId, { files: [{ data: photo, contentType: photo.type }], viewOnce: { limit: 1, seconds: 10 } });

// Sent tomorrow at nine by the server, the browser closed or not: scheduled() lists it until then.
const nine = new Date();
nine.setDate(nine.getDate() + 1);
nine.setHours(9, 0, 0, 0);
await pb.messaging.send(conversationId, { text: "Good morning", sendAt: nine });
```

A message waits in the outbox while the browser is offline or the server is away and goes once it can, once; an entry of kind `pending` is one on its way. `edit`, `remove` (for `everyone` or `me`), `react` and `unreact`, `markRead`, `typing`, `cancelScheduled` and `editScheduled` change what was said. `open(message, attachmentId)` downloads a file and decrypts it in the browser; a message seen once gives its files by `viewOnce(message)` alone, and the app holds them — the device keeps none.

## A message while the app is open

A push for a message is not shown as the browser's notification while a page of the app is in front: the service worker leaves it to the page. `onIncoming` tells the page a new message from someone else as it arrives, so it draws its own banner — skip the conversation already on the screen:

```ts
// src/banner.ts
import type { Message } from "palbase/web";
import { pb } from "./lib/palbase";

let open: string | null = null; // the conversation on the screen

const stop = pb.messaging.onIncoming((message: Message) => {
  if (message.conversation_id === open) return;
  console.log("banner:", message.sender_id, message.text ?? "sent a file");
});
stop();
```

## The person

`me()` and `updateMe({ name, image, read_receipts, show_last_seen, default_timer_seconds })` are the person's own profile and settings; `profiles(userIds)` others' names and pictures. `block(userId)`, `unblock(userId)` and `report({ … })` are theirs to use. `notifications(conversationId, { notify_level, muted_until })` mutes a conversation, or keeps only its mentions.

## Vanish mode and screenshots

A direct conversation in vanish mode (`update(id, { settings: { vanish: true } })`) drops what the person read when they leave it: call `close(conversationId)` as its screen goes. A browser cannot know of a screenshot; the phone apps tell the others ([Messaging](https://palbase.studio/docs/messaging/overview#screenshots)).

## Signing out

When the person signs out, what the browser kept of their conversations is dropped and nothing of theirs is followed — unless `keepOnSignOut` is true, when it is theirs again the next time they sign in here, and no one else who signs in reads it. `storage` replaces where it is kept (IndexedDB, unless given).
