> The full documentation index: https://palbase.studio/llms.txt

# Notifications

Every project has notify: email, push, SMS and WhatsApp to its users, one-time codes by text, topics users follow, and each user's preferences about what they take. Your backend sends with the secret key — `Palbase.notify` in a `palbase/backend` app, `createServer(…).notify` anywhere else. Apps only register their own devices and set their own user's preferences and topics, with the publishable key and the user's token.

## Quick example

```ts
// src/modules/orders/notify.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class OrderNotices {
  async shipped(userId: string, email: string, orderId: string): Promise<void> {
    // Through the project's own email provider: a message composed whole.
    await Palbase.notify.sendEmail({
      body: { to: email, user_id: userId, subject: `Order ${orderId} has shipped`, text: "It is on its way." },
    });
    // To every device of the user's, through the project's own push account.
    await Palbase.notify.sendPush({
      body: { to: { user_ids: [userId] }, title: "Shipped", body: `Order ${orderId} is on its way`, deep_link: `myapp://orders/${orderId}` },
    });
  }
}
```

A send is **queued**, not delivered: it answers `202` with the message's id, and the message ends `sent` or `failed` later — each emits `notification.sent` or `notification.failed` to the project's webhook ([Webhooks](https://palbase.studio/docs/server/webhooks)).

## Every channel but one needs a provider of yours

| Channel | Goes through |
|---|---|
| Email | The platform's **shared sender**, within the project's limits — for the platform's templates only (the auth emails: verify, reset, magic link, codes …, as the project overrode them). Anything else — a message composed whole, a template of your own — goes through **your own email provider**: Azure Communication Services, Amazon SES, SendGrid or SMTP. |
| Push | Your own FCM, APNs or Expo account — a browser's through its own push service, with the project's Web Push key (nothing to set up). |
| Inbox, in-app messages | Palbase itself: nothing to set up. |
| SMS | Your own SMS providers — Twilio, Vonage or Azure Communication Services — in failover order. |
| One-time codes | Your own verification service (Twilio Verify), or your SMS providers. |
| WhatsApp | Your own WhatsApp Business account (Meta). |

An email the shared sender may not send is refused with `403 own_provider_required`; past the shared sender's limits a send is `429 send_limit_reached`. A project with an active email provider sends all its email through it.

Providers are set in Studio (**Notifications › Providers**) or with `putNotifyProvider({ path: { channel, provider }, body: { credentials, priority, active } })`: the credentials are sealed with the project's own key, checked as the sender will use them, and never answered back. `getDeliverability()` says, per channel, whether it can send now, through what, why not and what to do.

From the CLI, the credentials are piped in as JSON — never written on the command line, where the shell would keep them:

```sh
palbase notify:providers:set email sendgrid < sendgrid.json   # {"api_key": "…", "from_domain": "example.com"}
palbase notify:providers:set sms twilio --priority 1 < twilio.json
palbase notify:deliverability                                  # can each channel send now, and through what
palbase notify:send email ada@example.com --template welcome --var name=Ada
palbase notify:messages --limit 20                             # what was sent, and what became of it
```

Templates (`notify:templates:*`), topics (`notify:topics:*`) and the message settings (`notify:settings:*`) have their commands too; every one is in the [CLI reference](https://palbase.studio/docs/cli/reference#notify).

## Email

```ts
// src/modules/accounts/welcome.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class WelcomeService {
  async send(userId: string, email: string, name: string, locale: string): Promise<string | undefined> {
    const queued = await Palbase.notify.sendEmail({
      body: {
        to: email,
        user_id: userId, // the user's preferences hold, and deleting them deletes the message
        template: "welcome", // a template of your own: your own provider
        variables: { name },
        locale,
        category: "news", // only users who did not turn "news" off get it
      },
    });
    return queued.data.skipped ? undefined : queued.data.message_id;
  }
}
```

| Field | What it says |
|---|---|
| `to` | One address. |
| `template`, `variables` | A template and what fills it — or `subject` with `html` and/or `text` (own provider only). Without a text part, the html's text is sent as one. |
| `locale`, `locales` | The language to render in; `locales` are more it would take, most wanted first: each, then its language alone, then the project's default and English. |
| `category` | `transactional` (the default) reaches every user; any other — `marketing`, `news` — only users who did not turn it off on this channel. |
| `user_id` | The user the message is for. |
| `from`, `reply_to` | The send's own sender (own provider only). |
| `priority` | `high` is tried again sooner when it could not leave. |
| `metadata` | Your own data about the message (a JSON object, 4 KiB), kept with its report. |

A send that the user's preferences turn off answers `{ skipped: true }`: nothing was queued or counted.

### Templates

Templates are Handlebars — `{{name}}`, `{{#if}}`, `{{#each}}` …; in an HTML body `{{name}}` is escaped and `{{{name}}}` is not. `listEmailTemplates()` answers every template the project's email renders from — the platform's defaults and your overrides — with the variables each uses. `putEmailTemplate({ path: { slug, locale }, body: { subject, html_body, text_body } })` overrides one in a locale, and `deleteEmailTemplate` brings the default back. SMS templates work the same way (`putSmsTemplate`), and WhatsApp slugs map to templates approved on your Meta account (`putWhatsAppTemplate`). Studio's **Notifications › Templates** screen edits them.

## Push

```ts
// src/modules/chat/push.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class ChatPush {
  async newMessage(to: string[], from: string): Promise<void> {
    const queued = await Palbase.notify.sendPush({
      body: {
        to: { user_ids: to },
        // A text, or one per locale: each device gets the one in its language.
        title: { en: "New message", tr: "Yeni mesaj" },
        body: { en: "{{from}} wrote to you", tr: "{{from}} size yazdı" },
        variables: { from },
        category: "chat",
        data: { kind: "message" },
      },
    });
    console.log(`queued ${queued.data.message_ids.length}, skipped ${queued.data.skipped_user_ids.length}`);
  }
}
```

A push is one message per user, delivered to **every device of theirs** — an Expo token through Expo, a VoIP token through APNs, an iOS token through APNs if the project has it (else FCM), Android through FCM, a browser through its own push service (Web Push, below). `to: { topic }` sends one message to a topic's followers instead. Fields beyond the title and body: `data` (4 KiB for the app), `deep_link`, `image` (https), `badge`, `sound`, `silent`, `content_available`, `mutable_content`, `collapse_key`, `ttl`, `priority`, and `push_type: "voip"` for a call ring to `ios_voip` devices.

**Devices are the app's to register**, and the iOS and Android SDKs do it for you: `POST /notify/devices` with the token its push SDK gave it (`device_id`, `platform` — `android`, `ios`, `ios_voip` or `web` — `token`, and the install's `installation_id`). With no one signed in, the publishable key alone registers it as the install's, proven with the install's secret (`X-Palbase-Installation-Secret`): a push that names the install — `to: { installation_ids }` — reaches it, so an app reaches people who never signed up. When someone signs in, their registration takes the device and it is theirs; signed out, the app registers it as the install's again. A user's device is the session's it was registered in: when the session ends — the user signed out or ended it from another device, its refresh token was revoked, an admin revoked it — the device is forgotten, and no push of theirs reaches it. A token another device held moves to this one. Your backend reads a user's devices (never their tokens) with `listUserDevices({ path: { user_id } })`.

**An app taken off a phone** shows when its next push goes: APNs answers `410`, FCM `UNREGISTERED`. The device is forgotten, and `notification.uninstalled` (`{ platform, provider, device_id, installation_id, user_id }`) goes into the person's timeline and to your webhook — the uninstall you can count and reach back for by other means.

**How a push went on each device** is the app's to say, and the SDKs say it: every push carries a sealed receipt (`pb_receipt` in its data), and the app reports with it, no sign-in needed (`POST /notify/receipts`): it reached the phone (`delivered` — on iOS from the app's Notification Service Extension, even with the app closed; on Android as the app draws the notification), it could not be shown (`not_shown`: the app's notifications or its channel are off), it was `opened`, `dismissed`, or a button tapped (`action`). A push no device reported on by the time it expired (its `ttl`, or the providers' four weeks) is `unconfirmed`: the phone may have been off, or its report lost — not "not delivered". Each stage reached for the first time is an event (`notification.delivered`, `notification.opened` …) in the person's timeline. On Android a push goes to FCM as data only (`pb_title`, `pb_body`, `pb_receipt` and your own keys), and the app's own messaging service draws it ([Android notifications](https://palbase.studio/docs/android/notifications)): a system-drawn notification runs no app code, and nothing of it could be told.

### Push templates

A push written once — a title and a body per language (Handlebars, as a push's own), a picture and a link — and sent by name: `PUT /notify/templates/push/{slug}/{locale}` (Studio: Notifications → Templates → Push), then `template` in place of a title and a body. Each device gets its person's language; one the template does not have gets the project's default language, else the template's first.

```ts
// src/modules/orders/shipped.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class OrderShipped {
  async tell(userId: string, order: string): Promise<void> {
    await Palbase.notify.sendPush({
      body: { to: { user_ids: [userId] }, template: "order.shipped", variables: { order }, category: "transactional" },
    });
  }
}
```

A send that names a template names no title or body of its own (`400 invalid_push`), and one the project has not is refused (`404 template_not_found`).

## Web push

A browser takes the project's pushes through **its own push service** (Chrome's, Firefox's, Safari's), with the standard Web Push and a VAPID key of the project's own — made as the first browser asks for it, sealed, nothing for you to set up or pay for. The web app subscribes with `pb.notify.push.subscribe()` (from a tap: browsers allow the prompt only then) and serves the SDK's service worker, `palbase/web/push-sw.js`, which shows each push, opens its link when it is tapped, and reports how it went — `delivered`, `opened`, `dismissed` — as the native SDKs do. A browser is a device like any other (`platform: "web"`): it is the signed-in user's, or the install's while no one is, and a push to the user reaches it with their phones. A subscription that ended — the person blocked the site, cleared it — is forgotten as it is next pushed, and `notification.uninstalled` goes into the timeline. `GET /notify/webpush` (Studio: Notifications → Providers) says how many browsers are subscribed.

## Inbox

Each person has an inbox: the messages your backend puts there, and — when a push says so (`inbox: true`), or the project's `inbox.push_copy` setting does — a copy of a push as it is delivered (once, however many devices took it). It is **the same on every device of theirs**: read on one, it is read on each; deleted, it is gone from each. A message stays its days — the project's `inbox.days` (90 unless set), or `expires_in_days` (1 to 365) — and an inbox keeps its newest 250. When the user is deleted, their inbox goes with them.

```ts
// src/modules/orders/inbox.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class OrderInbox {
  async receipt(userId: string, order: string): Promise<void> {
    await Palbase.notify.sendInbox({
      body: {
        to: { user_ids: [userId] },
        title: { en: "Your receipt", tr: "Fişiniz" },
        body: { en: "Order {{order}} is paid.", tr: "{{order}} numaralı sipariş ödendi." },
        variables: { order },
        deep_link: `myapp://orders/${order}`,
        expires_in_days: 30,
      },
    });
  }
}
```

A message is a title and a body (a text, or one per language: each reader gets theirs), with a picture, a link and `data` — or a designed card (`card`, a message definition as the in-app messages' below, `presentation: { type: "card" }`), drawn by the SDKs' renderer. The apps read the signed-in person's inbox (`GET /notify/inbox`, how many are unread with it), mark messages read (`POST /notify/inbox/read`, some or all) and delete one (`DELETE /notify/inbox/{id}`); the iOS, Android and web SDKs draw it ready (`InboxView`, `pb.notify.inbox.mount`). Your backend reads anyone's with `listInboxMessages({ query: { user_id } })` (Studio: Notifications → Log → Inbox).

## In-app messages

A message shown **in the app** — over it (a modal), across the whole screen, or as a banner at an edge — when something happens there. A campaign is what it shows, what shows it, whom it is for and how often:

```ts
// src/modules/growth/cart-reminder.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class CartReminder {
  async create(audienceId: string): Promise<string> {
    const { data } = await Palbase.notify.listInAppTemplates();
    const welcome = data.templates.find((t) => t.key === "welcome");
    if (!welcome) throw new Error("no welcome template");
    const { data: campaign } = await Palbase.notify.createInAppCampaign({
      body: {
        name: "Cart reminder",
        status: "active",
        definition: welcome.definition,
        // An event the app records — session_start as it opens — with properties it must have.
        trigger: { event: "cart_viewed", where: { plan: "pro" } },
        // None: everyone. An audience: its people who allowed personalization.
        audience_id: audienceId,
        // Beside the project's caps: at most this often for this campaign.
        limits: { per_day: 1, max_total: 3 },
        // The person's event within its hours of seeing it: counted as its conversion.
        conversion: { event: "purchase", hours: 24 },
      },
    });
    return campaign.id;
  }
}
```

- **What it shows** is a definition, the same kind as a paywall's: a theme and a free layout of components, in every language it has, drawn natively by the iOS, Android and web SDKs with their paywall renderer. Start from the module's designed messages (`listInAppTemplates`; Studio's editor shows each as the apps draw it). Its buttons go to a link, ask for push (the system's prompt, after the message's own ask; allowed, the device registers for pushes), show a paywall, or call the app's own code.
- **What shows it** is an event of the app's: one analytics records (`capture`, screens, page views) or the app names (`inApp.trigger`). Triggers are matched **on the device**: no event leaves it for them, whatever the person chose of analytics.
- **Whom it is for**: everyone, or an audience — and then only its people who **allowed personalization** (`personalization` consent). A message to everyone needs no consent to be shown.
- **How often**: the project's caps hold across every campaign — one a session, three a day, ten minutes apart unless its `in_app` settings say otherwise — and a campaign adds its own (`per_session`, `per_day`, `min_minutes`, `max_total`). The server counts each showing on every device of the person and refuses one past a cap (`409 frequency_capped`): two phones do not show it twice.
- **What it did**: each showing, button tapped and conversion is an event in the person's timeline (`notification.in_app_shown`, `notification.in_app_clicked`, `notification.in_app_converted`) and in the campaign's counts (`getInAppCampaignStats`: shown, people, clicked, dismissed, converted). A conversion is reported by the app while the person allows analytics.

The apps fetch the person's campaigns as each session starts (`GET /notify/in-app/messages`) and ask before showing one (`POST /notify/in-app/impressions`); the SDKs do both: `.palbaseInAppMessages(pb)` on iOS, `PalbaseInAppMessages(pb) { … }` on Android, `pb.notify.inApp.start()` on the web.

## Topics

```ts
// src/modules/teams/topics.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class TeamTopics {
  async create(teamId: string, members: string[]): Promise<void> {
    await Palbase.notify.createTopic({ body: { name: `team.${teamId}`, self_subscribe: false } });
    await Palbase.notify.addTopicSubscribers({ path: { name: `team.${teamId}` }, body: { user_ids: members } });
  }

  async announce(teamId: string, text: string): Promise<void> {
    await Palbase.notify.sendPush({ body: { to: { topic: `team.${teamId}` }, title: "Team", body: text } });
  }
}
```

A topic is **closed** unless `self_subscribe`: only your backend adds its followers, and a user asking is refused (`403 topic_closed`). An open topic is followed from the app — `POST /notify/topics/{name}/subscription` with the user's token — and any user may leave any topic. `changeTopic` opens or closes one, `removeTopicSubscriber` takes a user off, `deleteTopic` deletes it and who follows it.

## Preferences

A user's preferences are channel → category → whether they take it. `transactional` is always on and not theirs to turn off; a category they never set is on. The app reads and sets its own user's (`GET` and `PUT /notify/preferences`); your backend reads and sets anyone's with `getUserPreferences` and `setUserPreferences({ path: { user_id }, body: { email: { marketing: false } } })`. Every send with a `user_id` and a `category` honours them.

## When a message goes

A send may say when it goes, with `schedule`: `at`, a moment for everyone, or `local_time`, an hour on each recipient's own clock — a date and time with no zone. A recipient's clock is their newest device's time zone, which the iOS and Android SDKs register with the push token (`timezone` on `POST /notify/devices`); for one whose devices say none, it is the project's `default_timezone`. A local time already past on someone's clock goes to them at once.

```json
{
  "to": { "user_ids": ["usr_01a1…", "usr_01a2…"] },
  "title": { "en": "Good morning", "tr": "Günaydın" },
  "category": "marketing",
  "schedule": { "local_time": "2026-10-15T10:00" }
}
```

That push goes at 10:00 in New York to a user whose phone is in New York, and at 10:00 in Istanbul to one in Istanbul. Until then each message is `scheduled`, with `send_at` saying when.

A message that is not transactional also keeps to the project's **send rules**, set with `putNotifySettings` or in Studio (**Notifications › Settings › When marketing goes**). A settings write that names none of the three keeps them as they are, so a client written before them does not wipe them; one named `null` is taken off:

| Setting | What it does |
|---|---|
| `default_timezone` | The clock of a recipient whose devices say none, an IANA name (`Europe/Istanbul`); UTC when unset. |
| `quiet_hours` | `{ start, end }`, `HH:MM` on the recipient's clock (`22:00` to `08:00` spans midnight; on the night the clocks change they still end at `08:00`). A message that would arrive in them is `held` until they end, then sent. |
| `marketing_cap` | `{ count, hours }`: how many such messages one recipient gets at most in a window. One more is `skipped`, with `skip_reason: "frequency_cap"`. |

Transactional messages — codes, receipts, security notices — go at once, whatever the hour and however many. When a waiting message's time comes it is decided again: what the user chose meanwhile holds (a category turned off skips it, `preferences`), and it waits out quiet hours and keeps to the cap like a new send.

| Status | What it means |
|---|---|
| `scheduled` | Waiting for its time (`send_at`). |
| `held` | Waiting out its recipient's quiet hours (`send_at`: when they end). |
| `skipped` | Not sent, and never will be. `skip_reason` says why: `consent` (they refused this channel's marketing), `frequency_cap`, `preferences`, `iys` (İYS holds no consent for it). |
| `canceled` | Taken back while it waited. |

`POST /notify/messages/{id}/cancel` takes back a `scheduled` or `held` message; one already on its way answers `409 message_not_waiting`. Studio's **Notifications › Log** shows each waiting message with when it goes, and takes it back.

An email, text or WhatsApp message a rule skips answers `{ message_id, skipped: true, skip_reason }` — its message is in the log; one the user's preferences turned off answers `{ skipped: true }` alone, and nothing was queued. A skipped text does not count against its number's one text a minute and ten a day.

## To an audience

`to: { audience: "<id>" }` sends a push to each member of an analytics audience once ([Analytics › Audiences](https://palbase.studio/docs/web/analytics#audiences)): a member who signed in, as their user; one who never did, on each install of theirs. Each member's push keeps to their own clock, quiet hours, the cap and what they allowed, like a send to them alone. The audience's members are taken as the send is worked through, so a push to a large audience goes out over a little while rather than in one burst.

A push to an audience or a topic with `schedule.at` waits whole until that moment and is spread then; with `schedule.local_time` it is spread at once, each member's push waiting for their own hour. Either way, taking back the push (`POST /notify/messages/{id}/cancel`, its own id) takes it back whole: its spreading stops, and every member's push still waiting goes with it.

## Consent, İYS and texts that say stop

What a person allowed in the app ([consent](https://palbase.studio/docs/web/analytics#consent)) holds for messages too: a send that is not transactional to someone who refused this channel's marketing — `marketing_push`, `marketing_email`, `marketing_sms`, `marketing_whatsapp` — is skipped (`consent`).

**A text that says stop.** Point your Twilio number's "A message comes in" webhook at `https://<ref>.<domain>/notify/webhooks/sms/twilio/inbound`. A text that is `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END` or `QUIT` alone, or `DUR`, `İPTAL`, `IPTAL` or `RET` alone or with one word after it (your brand: `RET ACME`), in any case, is the refusal — "Cancel my order" is a question, not a refusal — of marketing texts of the user whose verified phone number sent it: recorded as their choice (`marketing_sms`, source `sms_stop`), it reaches their apps and your backend as any choice does, and their next marketing text is skipped. Twilio signs each call with your auth token and an unsigned one is refused; nothing is replied to the sender.

**İYS.** A brand that sends commercial messages in Turkey must hold each recipient's consent in İYS (İleti Yönetim Sistemi). Give notify your brand's own İYS API user — `putNotifyProvider({ path: { channel: "iys", provider: "iys" }, body: { credentials, priority: 0, active: true } })`, with `credentials` `{ username, password, iys_code, brand_code, recipient_type }` (`recipient_type` is `BIREYSEL` unless your recipients are traders, `TACIR`) — and then:

- a text to a Turkish number (`+90…`) or an email that is not transactional goes only where İYS holds an `ONAY`; one it does not is skipped (`iys`), and so is one İYS refuses to answer about as it stands. İYS out of reach, the message waits and is tried again. A number abroad is not İYS's, and is not asked about.
- each choice a user makes of `marketing_sms` or `marketing_email` from then on — in the app, by a stop text, through your server — is written to İYS as `ONAY` or `RET`, with where it was made (`HS_MOBIL` in the app, `HS_MESAJ` by a text, `HS_EPOSTA` by an email's link, `HS_CAGRI_MERKEZI` through your support), for their verified Turkish number (`+90…`) or their verified address. The choice holds for your messages at once; İYS is told by a job of your project's, tried again for about three days while İYS is out of reach.

Palbase is not an İYS integrator: the account is yours, and İYS's records are your brand's.

## SMS, codes and WhatsApp

| Call | What it does |
|---|---|
| `sendSms({ body: { to, body } })` | A text to one number in E.164 form (`+14155551212`): a body, or a `template` with `variables`. A number gets one text a minute and ten a day. It answers the segments and encoding the text takes. |
| `startVerification({ body: { to } })` | Has your verification service generate a one-time code and text it. |
| `checkVerification({ body: { to, code } })` | `{ approved }`: whether the code is the one it sent. |
| `sendWhatsApp({ body: { to, template_slug, variables } })` | A WhatsApp message: a text inside a conversation the user opened in the last 24 hours, a template approved on your Meta account, or one of your slugs. |

The project's message settings say where texts may go: `putNotifySettings` sets the default locale, the sender of email through your own provider, the countries texts may (`sms_countries`) and may not (`sms_blocked_countries`) reach, and the send rules ([When a message goes](#when-a-message-goes)).

## Reports

`listNotifyMessages({ query })` answers the project's messages, newest first — their delivery reports, never what they said — filtered by channel, status, user, category or a window. `getNotifyMessage({ path: { id } })` reads one: its status, attempts, provider, and what the provider reported after it left (delivered, bounced, opened …) when its credential lets it report — and, a push, how it went on each device and when it got to each stage. `getMetricsSummary()` counts them per channel, status and day. Studio's **Notifications** screens show the same reports, devices and metrics.

## The `Notifications` service

A backend sends with `Notifications`, and each send answers `{ data, error, status }`:

- `Notifications.email.send({ to, subject?, html?, text?, templateSlug?, locale?, variables?, from?, reply_to?, category? })` — `to` one address, or several: one message each, in order, the first refusal ending them.
- `Notifications.push.send({ to, title?, body?, data?, deep_link?, category?, priority?, … })` — `to` a user's id, several, or `{ topic }`.

```ts
// src/modules/invites/invite-mail.service.ts
import { Injectable, Log, Notifications } from "palbase/backend";

@Injectable()
export class InviteMail {
  async send(to: string, link: string): Promise<boolean> {
    const { error } = await Notifications.email.send({ to, subject: "You're invited", html: `<a href="${link}">Join</a>`, category: "invite" });
    if (error) Log.warn("the invitation was not sent", { code: error.code });
    return error === null;
  }
}
```

## Related

- [Webhooks](https://palbase.studio/docs/server/webhooks) — `notification.sent`, `notification.failed`, `notification.received`, `notification.uninstalled`
- [Analytics](https://palbase.studio/docs/web/analytics#audiences) — the audiences a push can go to, and each person's consent
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals, retries and `Idempotency-Key`
- [Secrets](https://palbase.studio/docs/backend/secrets) — the values your own code reads (a provider's credentials are kept by notify, sealed)
- [Test Users](https://palbase.studio/docs/backend/test-users) — users to send to while you try a flow

## Journeys from the CLI

A journey is kept as a file and handled with the CLI: saved as a draft, published, then followed. A published journey
does not change — push its file under a new key, publish it, and stop the old one.

```bash
palbase journeys:validate winback.json             # every problem, at its path, with what to do about it
palbase journeys:simulate winback.json --event purchases.purchase.completed@P1D   # walk a made-up person through it; nothing is sent
palbase journeys:push winback.json --publish       # save it as a draft (key: the file's name) and publish it
palbase journeys                                   # the environment's journeys: key, name, status, way in
palbase journeys:stats winback                     # who entered, how their runs ended, the goal's conversions
palbase journeys:runs winback                      # each person's run: its state, the step it is at
palbase journeys:stop winback                      # no one enters it any more, the runs in it end
```

`journeys:get` prints a journey's definition to edit and push again, `journeys:copy` copies one into a new draft, and
`journeys:delete` deletes one with its runs and its report.
