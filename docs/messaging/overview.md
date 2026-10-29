> The full documentation index: https://palbase.studio/llms.txt

# Messaging

Messaging is chat between a project's people: direct conversations and groups, with answers, threads, reactions, mentions, files, messages for later, messages that go after a while, photos seen once and vanish mode. It is a module every project has, like auth: there is no server to run. The web, iOS and Android clients keep each person's conversations on the device, current over the project's socket, so an app draws them and writes — sending, syncing and catching up are the client's.

- **Web**: `pb.messaging` ([Web Messaging](https://palbase.studio/docs/web/messaging))
- **iOS**: the `PalbaseMessaging` product ([iOS Messaging](https://palbase.studio/docs/ios/messaging))
- **Android**: `studio.palbase:palbase-messaging` ([Android Messaging](https://palbase.studio/docs/android/messaging))

## A person's history is their account's

What a person said and read is kept by the project, not by a phone. Signing out, deleting the app or opening it on a new phone loses nothing: when they sign in again, every conversation comes back from the server.

- **On the device.** Each client keeps a copy of the signed-in person's conversations so the app opens on them at once, without the network. When the person signs out, the copy is dropped, unless the app asks to keep it (`keepOnSignOut`). Kept or not, it is that person's alone: whoever signs in next on the same device never reads it — and, unless copies are kept, a person who signs in drops any another left there.
- **Written offline.** A message written without the network is drawn at once and waits in the device's outbox; it goes once the network is back — once, however often the app retries (each message carries its own `client_message_id`).
- **The socket drops.** What came meanwhile is read from the server's record of what changed for the person (`GET /messaging/sync`) as the socket comes back: nothing is missed.

## Kept encrypted

Every conversation has a key of its own, kept wrapped by the project's key: its messages' words, its title and its files' keys are stored sealed, and a copy of the database or a backup holds none of them in the clear. A file is encrypted on the device, with a key of its own, before it is uploaded: storage holds only what it cannot read. This is not end-to-end encryption: Palbase opens a conversation's messages to deliver them, your server reads them with the secret key, and your organization's owners and admins read them in Studio — each read recorded, with who read it ([Your server](#your-server)). Your team's members see the conversations and the reports, not what was said.

## What people do

- **Direct conversations and groups.** The direct conversation of two people is one, whoever opens it (`POST /messaging/conversations/direct`); a group has up to 1,000 members, an owner, admins, and policies for who writes, who adds people and who changes it.
- **Answers and threads.** A message answers another inline, or in its thread: one level deep, with its count of answers, its last one and who answered, each thread's unread count, and the threads a person follows (`GET /messaging/threads`). A thread's answer may be shown in the conversation too.
- **Changing what was said.** A message is edited within 15 minutes, and removed for everyone by its writer within 48 hours (by a group's admin at any time), or for oneself.
- **Reactions**, several a person to a message; **mentions**; **read receipts** and **typing**; **presence** (online, last seen).
- **Files**: pictures, videos, voice notes and any file, encrypted on the device.
- **For later.** A message scheduled for a time is sent then by the server, the writer's phone off or not; until then only its writer sees it, and may change or take it back. A scheduled message carries text alone.
- **Messages that go.** A conversation's timer (a day, a week, 90 days or any number of days) makes each new message go after it; a message of its own goes after its seconds, counted from when it was sent or from when everyone it was for read it. When a message's time is up it goes from the server and from every device.
- **Seen once.** A photo or a video sent to be seen once (or twice) opens for its seconds and is gone: its file's key is dropped on the server, and the app holds the opened bytes, never the device's copy.
- **Vanish mode** (a direct conversation's): a message read goes once its reader leaves the conversation.
- **Muting** a conversation, or its mentions alone: a muted one sends no push.
- **Blocking** a person: what they send does not reach whoever blocked them (to their writer it looks sent). **Reporting** a conversation, a person or messages: the report is the project's ([Moderation](#moderation)).

**Kept for a report.** What goes from people's screens without their choosing is kept on the server for 14 days, sealed as it was, for a report alone — Messenger reviews a deleted message reported within 14 days, Instagram keeps a vanish-mode message as long:

- a message seen once, its time up, in vanish mode, or taken back by its writer or a group's admin: one who saw it can still report it, and what it said, its files too, goes with the report. Only someone who was in the conversation when it went — and, for a photo or video seen once, who opened it — reports what it said;
- what an edited message said before each change: a report of the message shows its earlier versions, those changed while the reporter was in the conversation. The people in it see the last version alone;
- a group a person deleted — its owner or an admin, or the last to leave: it goes from everyone's list at once, and stays sealed 14 days; those who were in it, when it went or before, report it (the app has it as deleted until then), and the last 30 messages each saw go with their report. Then it is gone.

Nothing else reads what is kept, and after 14 days it is gone — even when the project's retention or a deleted account takes the message sooner: with `deleted_user_messages: delete`, a person deleting their account does not wipe what they took back before. Say so in your app's privacy policy. What the project itself removes — its server, its retention — is kept for nothing: a conversation the project's server deletes goes at once, a group still sealed too.

A person may hide their read receipts (`PATCH /messaging/me`, `read_receipts: false`): in direct conversations they then show no one what they read and see no one's; in groups receipts are always shown.

## Search

A person finds their messages by their words — in one conversation, or across all of theirs — the newest first (`GET /messaging/search`). A word's beginning finds it: "toplanti" finds "Toplantıda", as capitals, accents and the Turkish i's are one. Every word asked must be there, in what was said or in a file's name. Each message found comes with the conversation it is in, the people it shows (who wrote it, and the other person of a direct conversation) and where it says what was asked, to highlight. The app opens the conversation at that message (`around`) and pages back and forward from there. The clients also list, first, the conversations whose name matches.

- **Only what the person sees.** Nothing from before they joined a group that keeps its history from new members, nor after they left; nothing they cleared or removed for themselves, nor an answer in the thread of one; nothing a person they block sent them since, in their direct conversation; nothing removed.
- **Never found.** Messages seen once, and those of vanish mode. A message changed is found by what it says now.
- **Kept encrypted.** The words are kept as marks the conversation's key makes of their beginnings: never readable in the database, and one word said in two conversations leaves unrelated marks. Within one conversation the marks do show which of its messages share a word's beginning, and how often — not what the word is: the price of searching encrypted words on the server. A word's middle ("plantı") finds nothing, and a single letter finds only a word of one letter.

The 2,000 conversations a person spoke in last are searched. Search costs nothing extra: its marks are not counted in what the messages weigh.

### By meaning

With the project's `search_by_meaning` on, a person also finds their messages by what they mean, in none of the words asked: "uçuş saati" finds "THY 14:30'da kalkıyor" (`GET /messaging/search?by=meaning`). What is found is what is near the question, the nearest first, each with how near (`score`, 0.3 to 1) — one page; a message about something else may still come, further down. The same people see the same messages as by words, and a message changed is found by what it means now.

- **Your choice, off until you turn it on.** Each message's text — not a system message's, nor one seen once, nor one of vanish mode — goes to OpenAI to be embedded (`text-embedding-3-large`), billed to the project as its AI use ([AI](https://palbase.studio/docs/backend/ai#what-it-costs)): about $2.90 a million short messages (about twenty tokens each), and each question a person asks. OpenAI keeps what it is sent up to 30 days for abuse monitoring and never trains on it; say so in your app's privacy policy. Turned on, the messages written before are embedded too, in the background; turned off, nothing more goes to OpenAI and the vectors are removed.
- **Kept encrypted.** A message's vector says nearly what its text said, so it is kept sealed with the conversation's key, as the message is: a copy of the database holds none readable. A search opens the vectors of the person's conversations in the server's memory alone.
- **Within reason.** A person asks 30 questions by meaning at once and one more a minute (`429 too_many_searches`, with `Retry-After`); a question asked again within ten minutes is not asked of OpenAI again. Of each conversation, its newest 100,000 messages are searched by meaning. When the project's AI allowance or budget is spent (`402 ai_payment_required`), messages are sent as ever and found by their words; those written meanwhile are embedded once it is renewed.
- **Short messages.** A message of one word ("tamam") is found by its word, not embedded.

## Screenshots

A browser does not say when someone takes a screenshot, and a phone cannot always stop one:

| | A photo or video seen once | Vanish mode |
|---|---|---|
| **Android** | The screen is kept out of screenshots and recordings (`FLAG_SECURE`): they come out black | Taken, and the others are told |
| **iOS** | Taken (iOS cannot stop one), and the others are told | Taken, and the others are told |
| **Web** | Not known | Not known |

"Told" is a line in the conversation, as WhatsApp's and Instagram's (`POST /messaging/conversations/{conversation_id}/screenshot`). No app can stop a second phone's camera.

## Pushes and the app in front

A message to someone who is not in the app reaches them as a push, through the project's notifications ([Notifications](https://palbase.studio/docs/backend/notifications)): set up an APNs key and Firebase for the apps first. The push says who wrote and what (`push_preview: false` for "a new message" alone), the app's badge is the person's unread count, and a conversation's messages group together.

While the app is in front, a message's push is not drawn as the system's banner: the client tells the app instead (web `onIncoming`, iOS `incoming()`, Android `incoming`), and the app draws its own banner — none for the conversation already on the screen.

On iOS and Android, the push also brings the message into the device's copy while the app is closed: open it with no network and it is there. On iOS this is the `PalbaseMessagingNotificationService` extension and an App Group ([iOS Messaging](https://palbase.studio/docs/ios/messaging#messages-that-arrive-while-the-app-is-closed)); on Android, the push itself ([Android Messaging](https://palbase.studio/docs/android/messaging#messages-that-arrive-while-the-app-is-closed)).

## Your server

With the secret key, your server makes conversations for people, adds and removes them, says something in a conversation (a booking's confirmation, a support agent), removes a message, and reads what was said — for moderation, support or an export (`GET /messaging/admin/conversations/{conversation_id}/messages`; a file's link: `GET …/messages/{message_id}/attachments/{attachment_id}`, the file opened with the key in its message).

Your organization's owners and admins read the same in Studio (**Messaging › Conversations**, a person's conversations by their user ID) and with the CLI (`palbase messaging:conversations:list --user <id>`, `palbase messaging:messages:list <conversation_id>`). A member of your team sees the conversations, not what was said: the platform refuses them. Every read of people's messages — a file opened too — is recorded with who read it: a developer by name, a key or a token by its id. Studio's **Access log** and `GET /messaging/admin/access-log` (`palbase messaging:access-log`) list them, 400 days.

**Who may write to whom** is everyone, unless the project's hook says otherwise: set `hook` in the settings and the project's endpoint is asked, signed as a webhook is, before a direct conversation is opened or someone is added to a group — `messaging.can_message`, answering whether they may. When it does not answer, `on_error` says what happens: deny (the default; the app tries again) or allow. The hook is not asked for each message: a conversation already open stays open until your server closes it.

**Closing a conversation.** When what let two people write ends — one unfollows the other, a booking is over, an event ended — your server makes their conversation read-only: its people still read what was said in it, and nobody writes in it — no message, reaction, edit, file or screenshot notice, no change to its title, picture, timer or vanish mode, nobody added to it or given a role, and a message scheduled in it fails (`read_only`) — while your server still may say and change anything in it, and a group's admins still remove people from it. It is told in the conversation, and undone the same way:

- the direct conversation of two people: `GET /messaging/admin/conversations?user_id=<one>&with=<the other>`;
- read-only, or writable again: `PATCH /messaging/admin/conversations/{conversation_id}` with `{"read_only": true}` (or `false`); the app sees `settings.read_only`, and a write answers `403 read_only`;
- the same call changes what a group's admins may: its title, description, picture and timer, and who writes in it, edits it and adds people (`send_policy`, `edit_policy`, `add_policy`) — a group your server made, too.

## Moderation

A person reports a message, someone or a conversation from your app. What the reported messages say when reported — their files too, and a message already gone from the screen while it is kept for a report — is copied into the report, sealed, and kept with it whatever becomes of the message.

- **You hear of it**: the `messaging.report.created` event reaches your webhook, and your organization's owners and admins are mailed — at most once an hour for the whole organization, one mail with each environment's reports of the hour. The mail says how many and why, never what was reported; an organization that runs its customers' apps passes each report on to them from the event.
- **Studio**: **Messaging › Reports** lists them. An owner or admin opens one — its reporter's words, the messages and their files — removes the messages for everyone, and marks it resolved in their own words; a member sees the list alone. App stores expect reports to be looked at in good time.
- **The CLI**: `palbase messaging:reports:list`, `palbase messaging:reports:get <id>`, `palbase messaging:reports:resolve <id> --resolution removed`.
- **Your server**: `GET /messaging/admin/reports`, `GET /messaging/admin/reports/{report_id}` (a file's link: `…/attachments/{attachment_id}`), `POST /messaging/admin/reports/{report_id}/resolve`.

A report is kept 190 days once resolved — the EU's Digital Services Act keeps a decision open to complaint at least six months, and six calendar months reach 184 days — and two years when never resolved; its copies and files go with it.

## A deleted account

When a person's account is deleted, messaging forgets them at once: their profile, their blocks, their reactions, their scheduled messages and what they hid for themselves go, and they leave every conversation. Their id goes from everything that is kept: where it stood — their messages, what others' messages say of them (a mention, "added", "left"), what a report copied of their messages, the access log's reads — a deleted user stands, `deleted_…`, the same one everywhere, with nothing personal kept. What is kept, for your privacy policy:

| What | Kept | How long |
|---|---|---|
| Their messages | as `deleted_user_messages` says: kept with no one's name on them, or removed | `keep`: as long as the project keeps messages; `delete`: gone at once |
| What went from screens before | what it said, for a report alone | 14 days |
| Reports of their messages | what the messages said, the writer a deleted user | 190 days once resolved, two years when never resolved |
| The access log | reads of their messages, naming a deleted user | 400 days |
| The answer to a request an app sent again (its retry) | as it was given, sealed | 2 days |
| That the account was deleted | its id, so nothing brings them back: a profile, a conversation, a group, a block or a mention for them is refused (`409 user_deleted`, or `user_deleted` among those a group did not take) — a backend syncing as the deletion runs too | 7 days |

## The project's settings

In Studio (**Messaging**), with the CLI (`palbase messaging:settings:set`, `palbase messaging:hook:set`; `palbase config:diff` and `palbase config:copy` compare and copy them between environments), or with the secret key (`GET` and `PUT /messaging/settings`):

| Setting | What it does |
|---|---|
| `retention_days` | Messages older are removed; none (the default): kept for good |
| `push_preview` | Pushes say what a message says (the default), or only that one came |
| `deleted_user_messages` | A deleted user's messages: `keep` (the default), their writer shown as a deleted user with nothing personal kept, or `delete` — save what went from screens before, kept its 14 days for a report |
| `hook` | Who may write to whom (above); none: anyone to anyone |
| `search_by_meaning` | Messages are found by what they mean too ([Search](#by-meaning)); off (the default): by their words alone, and no message goes to a model |

## What it costs

| | Free each month | Past it |
|---|---|---|
| Messages sent | 1 million | $5.25 a million |
| What the messages weigh where they are kept | 1 GiB | $1.05 a GiB-month |

A message weighs its sealed text and 768 bytes for its row and indexes: a GiB holds over a million short messages. Its files are the project's storage, its deliveries to people's sockets realtime messages, and its pushes push notifications — each on the bill as they are ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)). A message sent again with the same `client_message_id` is one.

A free project past either is slowed, never stopped: its messages go at about one a second, all its people together. A send waits its turn, 10 seconds at the most; one that would wait longer is `429 slowed` with `Retry-After`, and the clients keep it in their outbox and send it again. Reading, syncing and everything else go on at full speed.
