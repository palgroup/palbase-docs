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
| `conversations({ spaces })` | The person's conversations, the latest first: `items`, `unread` across them, and `synced` once the device's copy caught up — of some spaces alone when it names any ([Spaces and open groups](#spaces-and-open-groups)) |
| `conversation(id)` | One conversation: `conversation`, `entries` (its timeline, the oldest first, then what is on its way), `members`, `typing`, `hasEarlier`; opened at a message (`{ at }`), `focus` and `hasLater` too ([Search](#search)) |
| `direct(userId, { space })` | The direct conversation with someone — in a space, when it names one |
| `group({ title, memberIds, description, photo, settings, space, visibility })` | A new group, the person its owner; `notAdded` names whom the project's hook kept out |
| `openGroups(space, { limit, cursor })` | A space's open groups, each with whether the person is in it (`joined`) |
| `join(conversationId)` | Joins an open group: the conversation, the person in it |
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

## Spaces and open groups

A person is often in several places of your app's — organizations, workspaces, projects. A conversation belongs to one when it is made with a `space` your app names (`org:<id>`, `project:<id>`; 1 to 128 letters, digits and `: _ . / @ -`), and stays there: the same two people have one direct conversation in each space, and one with none. `conversations({ spaces: [...] })` is a space's list, its `unread` that space's; `search(q, { space })` searches it. Each conversation says its `space` (`null`: none).

A group made with `visibility: 'open'` is found in its space's open groups and joined by the person themselves — a channel; a closed one (the default) is joined when someone adds you. Your server decides who may make one, find a space's groups and join them: the project's hook is asked (`open_group`, `list_open`, `join`, the space named) and its refusal is a `PalbaseError`, code `not_allowed`. An open group names its `space` (`space_required` otherwise). One an admin removed does not join again by themselves (`removed`); a full group is `group_full`.

```ts
// src/channels.ts
import { pb } from "./lib/palbase";

const org = "org:2f6c0c1e-8a3b-4c1d-9e5f-0a1b2c3d4e5f";
const sidebar = pb.messaging.conversations({ spaces: [org] });
const general = await pb.messaging.group({ title: "general", space: org, visibility: "open" });
const channels = await pb.messaging.openGroups(org);
for (const c of channels.items) if (!c.joined) await pb.messaging.join(c.id);
const dm = await pb.messaging.direct("usr_01a1684c796e7394aa8ec75d893a8fe2", { space: org });
```

A message your server wrote as someone (an assistant sending their words) says so: `message.via` names what wrote it (`"pal"`) — draw it beside the message, as "sent by Pal".

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

## Search

`search(query, { conversationId, space, limit, cursor })` finds the person's messages that say every word asked — a word's beginning finds it, "toplanti" finds "Toplantıda" — the newest first, across their conversations or in one. Each hit carries what a result row draws: the conversation's `title` and `photo` (a group's, or the other person's in a direct one), its `sender`, `peer`, and its `matches` — where its text or a file's name says what was asked, in UTF-16 code units, as a string's. The first page also lists the person's conversations whose name says it (`conversations`), from their own list. What the module finds and never finds: [Messaging](https://palbase.studio/docs/messaging/overview#search).

A find opens where it was said: `conversation(id, { at })` is the conversation's stretch around the message, `focus` naming it to scroll to and mark. `loadEarlier()` reads back from there and `loadLater()` forward; once it reaches the newest, `hasLater` is false and it is the conversation's timeline again. An answer the conversation's timeline does not show has a `threadRootId`: open its thread at it.

```ts
// src/search.ts
import { pb } from "./lib/palbase";

const found = await pb.messaging.search("toplanti");
for (const c of found.conversations) console.log(c.title); // their names say it: draw them first

const mark = (text: string, at: { offset: number; length: number }[]) =>
  at.reduceRight((t, m) => `${t.slice(0, m.offset)}<b>${t.slice(m.offset, m.offset + m.length)}</b>${t.slice(m.offset + m.length)}`, text);
for (const hit of found.messages) {
  console.log(hit.title, mark(hit.message.text ?? "", hit.matches.filter((m) => m.field === "text")));
}

// Tapped: opened at the message, the message marked.
const hit = found.messages[0];
const at = hit.threadRootId
  ? pb.messaging.thread(hit.conversation.id, hit.threadRootId, { at: hit.message.id })
  : pb.messaging.conversation(hit.conversation.id, { at: hit.message.id });
at.subscribe(() => console.log(at.state.entries.length, "around", at.state.focus));

// More: while nextCursor is not null.
const more = found.nextCursor ? await pb.messaging.search("toplanti", { cursor: found.nextCursor }) : null;
```

### By meaning

With the project's `search_by_meaning` on ([Messaging](https://palbase.studio/docs/messaging/overview#by-meaning)), `search(query, { by: "meaning" })` finds the messages nearest what the question means, in none of its words: "uçuş saati kaçta" finds "Uçağımız sabah dokuzda Sabiha Gökçen'den kalkıyor". The nearest come first, one page (`nextCursor` is null), each with `score` — how near, 0.3 to 1 — and no `matches`; `conversations` is empty. A hit opens as any does: `conversation(id, { at })`.

```ts
// src/search-meaning.ts
import { pb } from "./lib/palbase";

try {
  const found = await pb.messaging.search("uçuş saati kaçta", { by: "meaning" });
  for (const hit of found.messages) console.log(hit.score?.toFixed(2), hit.title, hit.message.text);
} catch (e) {
  // search_by_meaning_off (409): the project searches by words alone — offer that.
  // too_many_searches (429): a person asks 30 at once, one more a minute; e.retryAfter says when.
  // ai_payment_required (402): the project's AI use is spent for the month.
  console.log((e as { code?: string }).code);
}
```

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

## A deleted group

When a group's owner or an admin deletes it — or its last member leaves — it goes from everyone's `conversations()` at once, and those who were in it can still report it for 14 days ([Messaging](https://palbase.studio/docs/messaging/overview#moderation)). `deletedGroups()` lists them while they can, the latest to stop first: `state.items` are `{ id, title, deletedBy, reportableUntil }`, and one goes at its `reportableUntil`. `report` names it by its id with no message; the last 30 messages the person saw in it go with the report. A group the project's server deleted is not among them.

```ts
// src/deleted.ts
import { pb } from "./lib/palbase";

const deleted = pb.messaging.deletedGroups();
const stop = deleted.subscribe(() => {
  for (const g of deleted.state.items) console.log(g.title ?? "a group", "reportable until", g.reportableUntil);
});

const [group] = deleted.state.items;
if (group) await pb.messaging.report({ conversation_id: group.id, reason: "harassment", user_id: group.deletedBy ?? undefined });
stop();
```

The title is the one the device had; it is null when the device no longer had the group as the word came — on the deleter's own device now and then.

## Vanish mode and screenshots

A direct conversation in vanish mode (`update(id, { settings: { vanish: true } })`) drops what the person read when they leave it: call `close(conversationId)` as its screen goes. A browser cannot know of a screenshot; the phone apps tell the others ([Messaging](https://palbase.studio/docs/messaging/overview#screenshots)).

## Signing out

When the person signs out, what the browser kept of their conversations is dropped and nothing of theirs is followed — unless `keepOnSignOut` is true, when it is theirs again the next time they sign in here, and no one else who signs in reads it. `storage` replaces where it is kept (IndexedDB, unless given).
