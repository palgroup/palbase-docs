> The full documentation index: https://palbase.studio/llms.txt

# Notifications

`pb.notify` is what a browser takes of the project's messages: its pushes (`pb.notify.push`, Web Push through the browser's own push service), the signed-in person's inbox (`pb.notify.inbox`), and the project's in-app campaigns shown in the page (`pb.notify.inApp`). The signed-in person's preferences and the topics they follow are two more calls. Sending is your backend's ([Notifications](https://palbase.studio/docs/backend/notifications)); the browser subscribes, reads and shows.

## Web push

```ts
// src/lib/palbase.ts
import { createClient } from "palbase/web";

export const pb = createClient({ url: "https://k3xq81w4m.palbase.studio", publishableKey: "pb_k3xq81w4m_cZ8yX7wV6uT5" });
```

```ts
// src/push-button.ts
import { pb } from "./lib/palbase";

export async function turnOnPush(): Promise<string> {
  // From a tap: a browser shows its prompt only then.
  if (pb.notify.push.permission() === "unsupported") return "This browser takes no notifications";
  const on = await pb.notify.push.subscribe();
  return on ? "Notifications are on" : "Notifications were not allowed";
}
```

```ts
// src/main.ts
import { pb } from "./lib/palbase";

// As the app starts: the browser's subscription registered again, without a prompt, when it has one.
await pb.notify.push.refresh();
```

| Member of `pb.notify.push` | What it does |
|---|---|
| `supported()` | Whether the browser takes pushes at all: a service worker, the Push API and notifications. |
| `permission()` | `granted`, `denied`, `default` (not asked yet) or `unsupported`. |
| `subscribe(options?)` | Asks the person (call it from a tap), registers the service worker, subscribes the browser with the project's key through its own push service, and registers the subscription as a device. `true` when the browser takes pushes now, `false` when the person refused or the browser has none. `options`: `serviceWorker`, the worker's path (`/palbase-sw.js` unless given), and `scope`. |
| `unsubscribe()` | Ends the browser's subscription. The project forgets the device as it next pushes it. |
| `refresh()` | Registers the subscription again, without a prompt, when the person allowed it and there is one. |

The device is the signed-in user's, or this install's (`pb.installation.id`) while no one is signed in: a push that names the install reaches it then. It is registered again by itself as people sign in and out, and a subscription that cannot be registered again ends, so one person's pushes are never shown to the next. The project's key for Web Push (VAPID) is its own, made as the first browser asks for it: no account of another provider is needed.

### The service worker

The pushes are shown by the SDK's service worker, served from your site's own origin. Copy `node_modules/palbase/dist/web/push-sw.js` (the package exports it as `palbase/web/push-sw.js`) into the folder your site serves as it is, as `palbase-sw.js`: `public/palbase-sw.js` in Next.js or Vite. Copy it again when you update `palbase`. To serve it elsewhere, name its path: `subscribe({ serviceWorker: "/sw/palbase.js" })`.

`subscribe()` registers it with the project's address and publishable key in its URL, which it reports with. The worker shows each push, opens its link when it is tapped (an `https` address, or one of your site's; a tab of your app at that address is focused rather than opened again), and tells the project how each went — delivered, opened, dismissed — with the push's own receipt as the credential. It tells your open pages too:

```ts
// src/push-events.ts
// What the service worker tells each open page of the app.
navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
  const m = e.data as { type?: string; event?: "received" | "opened"; url?: string; data?: Record<string, string> };
  if (m.type === "palbase.push" && m.event === "received") console.log("a push arrived", m.data);
});
```

## Inbox

```ts
// src/inbox.ts
import { pb } from "./lib/palbase";

const badge = document.querySelector<HTMLElement>("#inbox-badge")!;
const view = pb.notify.inbox.mount(document.querySelector<HTMLElement>("#inbox")!, {
  onUnread: (n) => { badge.textContent = n ? String(n) : ""; },
  onOpen: (_item, link) => { window.location.assign(link); },
  labels: { empty: "No messages yet" },
});

// Or its calls, for a list of your own:
const page = await pb.notify.inbox.list({ limit: 20 });
await pb.notify.inbox.markRead(page.items.filter((m) => !m.read_at).map((m) => m.id));
await pb.notify.inbox.markRead("all");
if (page.items[0]) await pb.notify.inbox.remove(page.items[0].id);
view.destroy();
```

The signed-in person's inbox is the same on every device of theirs: read here, it is read on their phone; deleted, it is gone there. `mount()` draws it ready — newest first, the unread marked, a designed card drawn by its definition — and asks for it again as the page comes back into view and as people sign in and out. A tap marks a message read and opens its link (an https address in a new tab, your app's in this page, unless `onOpen` takes it). No one signed in: an empty list.

| Member of `pb.notify.inbox` | What it does |
|---|---|
| `list({ limit?, cursor?, locale? })` | A page of the inbox, newest first, with how many of it all are unread; `next_cursor` reads the next page. |
| `unread()` | How many messages are unread. |
| `markRead(ids \| "all")` | Marks messages read on every device of the person's; answers how many became read. |
| `remove(id)` | Deletes a message from every device of the person's. |
| `mount(container, options?)` | Draws the inbox into an element and keeps it current. `options`: `locale`, `appearance`, `limit` (50), `onOpen`, `onCustom` (a designed card's own buttons), `onUnread`, `labels`. |

## In-app messages

```ts
// src/in-app.ts
import { pb } from "./lib/palbase";

pb.notify.inApp.start({
  // A button's link of your app's: your router's, not a page load.
  onDeepLink: (link) => { window.history.pushState(null, "", new URL(link).pathname); },
  // A button that shows a placement's paywall: drawn here, bought through Stripe Checkout.
  onShowPaywall: async (placement) => {
    const paywall = await pb.purchases.paywall(placement);
    paywall?.render(document.querySelector<HTMLElement>("#paywall")!, {
      successUrl: "https://app.example.com/thanks",
      cancelUrl: window.location.href,
    });
  },
});

// Events analytics records come by themselves; name one of your own:
pb.analytics.capture("cart_viewed", { plan: "pro" });
pb.notify.inApp.trigger("level_completed", { level: 3 });
```

Once started, the person's campaigns are asked for as each session starts — the first page of one, the page back in view after half an hour away, a sign-in or out — and an event shows the first campaign it triggers that the caps let: the project's (one a session, three a day, ten minutes apart unless its settings say otherwise) and the campaign's own. The server counts each showing on every device of the person, so two tabs or a tab and a phone do not show it twice. The message is drawn by the SDK's screen renderer, the one paywalls are drawn with (`palbase/web/message` for an app that draws one itself), as a modal (the browser's own modal dialog), the whole page, or a banner at an edge that goes by itself when it says so.

Triggers are matched **in the page**: no event leaves it for them, and a message is shown whatever the person chose of analytics. A campaign to an audience reaches only who allowed personalization ([Consent](https://palbase.studio/docs/web/consent)), which the server holds to. A button that asks for push shows the browser's prompt and subscribes it (`pb.notify.push.subscribe()`) unless `onRequestPush` does it. A button that takes an offer claims it, or opens Stripe Checkout with it, unless `onOffer` does it. A tap is reported as a click and a close as a dismissal; a conversion — the campaign's event after it was seen — only while the person allows analytics.

`stop()` stops showing campaigns, `refresh()` asks for them again, and `settled()` waits for the events given so far to be taken, which a test or a page about to navigate awaits.

## Preferences and topics

The signed-in person chooses which kinds of message they take on which channel, and follows the topics the project opened to them. The client has no method for these four calls: make them through the client's own transport, which sends the user's access token and refreshes it as the client's own calls do (see [Overview](https://palbase.studio/docs/web/overview#calls-the-client-has-no-method-for)).

```ts
// src/lib/as-user.ts
import { pb } from "./palbase";

/** A notify call as the signed-in user; a refusal is thrown as a PalbaseError. */
export async function asUser<T>(method: "GET" | "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const reply = await pb.transport.send({
    op: `${method} ${path}`,
    method,
    path,
    auth: [["ApiKeyAuth", "userJWT"]],
    answers: { 200: "json", 204: "empty" },
    body: body === undefined ? undefined : { kind: "json", contentType: "application/json", value: body },
  });
  return reply.data as T;
}
```

```ts
// src/settings.ts
import { asUser } from "./lib/as-user";

/** channel (email, sms, whatsapp, push) → category → whether they take it. */
type Preferences = Record<string, Record<string, boolean>>;

const prefs = await asUser<Preferences>("GET", "/notify/preferences");
console.log(prefs.email?.marketing);

// Stop marketing email. The answer is all of their preferences.
await asUser<Preferences>("PUT", "/notify/preferences", { email: { marketing: false } });

// Follow a topic, and stop following it.
await asUser<void>("POST", "/notify/topics/product-updates/subscription");
await asUser<void>("DELETE", "/notify/topics/product-updates/subscription");
```

| Call | What it does |
|---|---|
| `GET /notify/preferences` | `{ channel: { category: on } }` for each channel (`email`, `sms`, `whatsapp`, `push`): `transactional` (always on), `marketing`, and every other category set for them. A category the user never set is on. |
| `PUT /notify/preferences` | Sets the ones it names, 100 at most in a write, and answers all of them. `transactional` is not theirs to turn off and is left as it is. A user keeps 50 categories. |
| `POST /notify/topics/{name}/subscription` | Follows a topic the project opened to its users (`self_subscribe`). `403` for any other. |
| `DELETE /notify/topics/{name}/subscription` | Stops following it. |

They are the signed-in user's: with no one signed in, the transport throws before anything is sent (`missing_credential`). What the person allowed in the app ([Consent](https://palbase.studio/docs/web/consent)) holds as well: a send that is not transactional is skipped for someone who refused that channel's marketing key (`marketing_push`, `marketing_email`, `marketing_sms`, `marketing_whatsapp`).

## Related

- [Notifications](https://palbase.studio/docs/backend/notifications) — sending pushes, inbox messages and in-app campaigns from your backend.
- [Analytics](https://palbase.studio/docs/web/analytics) — the events that trigger in-app messages.
- [Consent](https://palbase.studio/docs/web/consent) — the marketing keys, and personalization for audiences.
