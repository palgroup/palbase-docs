> The full documentation index: https://palbase.studio/llms.txt

# Journeys

A journey takes each person who does something — signs up, stops opening the app, buys, joins an audience — through the steps you set: messages, waits, branches, A/B splits, coupons and grants. It is built in Studio's **Journeys** or kept as a JSON file and handled with the CLI, tried on a test user, published, and then reported on: who entered, what each step came to, how many reached its goal.

Journeys are the project's server's: their API takes the secret key (or a member's session in Studio), never the publishable key.

## Quick example

A journey that welcomes a new user, checks a day later whether they finished setting up, and A/B tests the reminder for those who did not:

```json
{
  "name": "Onboarding",
  "entry": { "event": { "name": "sign_up" } },
  "goal": { "event": { "name": "onboarding_completed" }, "within": "P7D" },
  "start": "welcome",
  "steps": {
    "welcome": { "inbox": { "title": { "en": "Welcome aboard" }, "body": { "en": "Here is how to get the most out of the app." } }, "next": "wait_1d" },
    "wait_1d": { "wait": { "for": "P1D" }, "next": "finished" },
    "finished": { "branch": { "if": { "event": { "name": "onboarding_completed" } }, "then": "end", "else": "tip" } },
    "tip": { "split": [{ "name": "push", "weight": 50, "next": "tip_push" }, { "name": "inbox", "weight": 50, "next": "tip_inbox" }] },
    "tip_push": { "push": { "title": { "en": "One step left" }, "body": { "en": "Finish setting up in under a minute." } }, "next": "end" },
    "tip_inbox": { "inbox": { "title": { "en": "One step left" }, "body": { "en": "It is all in one place." } }, "next": "end" }
  }
}
```

```bash
palbase journeys:validate onboarding.json            # every problem, at its path, with what to do about it
palbase journeys:push onboarding.json --publish      # save it as a draft (key: the file's name) and publish it
palbase journeys:stats onboarding                    # who entered, each step, the goal's conversions, each A/B way
```

## A journey

A definition has who enters (`entry`), the steps by id with the first one (`start`), what the journey is for (`goal`), what takes a person out early (`exit`) and whether a person enters again (`reentry`). Each step does one thing and names the step after it in `next`; `end`, or no `next`, ends the person's run. A person is in a journey once at a time.

| Who enters (`entry`, one of) | |
|---|---|
| `event: { name, where }` | A person who does the event — an app's own (`sign_up`), or a module's: `purchases.purchase.completed`, `purchases.coupon.redeemed`, `audience.entered` — with the properties `where` names, each equal. |
| `audience: "<id>"` | A person who comes to be in an analytics audience. |
| `inactive: { event, for }` | A person who has not done the event for a while (1 hour to 90 days): the moment it passes since their last one. `$session_start` is someone who has not opened the app. |
| `members_of: "<id>"` | An audience's members, once, as the journey is published. |

`goal: { event, within }` — a run that sees the event within `within` of entering (30 days unless it says, 90 at most) ends **converted**; a run that completed before it is counted converted too. `exit: { events, audience_left }` takes a person out when they do one of the events or leave the audience. `reentry.mode` is `once` (the default: never again), `always` (each time, once their run ended) or `after` (once `after` has passed since they last entered). Whatever it says, a person enters one journey 20 times a day at most, so a journey whose own steps cause its entry event does not loop.

Durations are ISO 8601: `PT30M`, `PT2H`, `P2D`, `P1W`.

## Steps

| Step | What it does |
|---|---|
| `push` | A push to the person's devices: `title` and `body` by locale (`en`, `tr`, `pt-BR`), or one of the project's push `template`s; `deep_link`, `image`, `data`, `category`; `inbox: true` keeps a copy in their inbox. |
| `inbox` | A message in the person's inbox: `title` and `body` by locale, `deep_link`, `image`, `expires_in_days`. |
| `email` | An email from one of the project's email templates, with its `variables`. |
| `in_app` | One of the project's in-app campaigns made for journeys, shown the next time it is triggered in their app (waiting up to `days`, 7 unless it says). |
| `coupon` | Gives the person their code of one of the project's coupons; `{{coupon}}` in the messages after it is that code. |
| `offer` | Gives the person one of the catalog's grant offers: an entitlement for a while. |
| `set` | Writes properties of the person's (analytics' people): 1 to 20. |
| `event` | Tells your backend: a `journey.event` with the step's `name` and `data` — a webhook, or an `@On`. |
| `wait` | Holds the person: `for` a while (1 minute to 90 days), `until` a time of day where they are (`"09:00"`, in their `$timezone`), or until they do an `event`, at most `timeout` — then `next`, or `timeout_next` when it timed out. |
| `branch` | Sends the person to `then` when `if` holds of them, else to `else`. A condition asks a `property` of theirs (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`, `missing`), whether they are in an `audience`, whether they did an `event` (since entering, or `within` a while), or `all`, `any` or `not` of others. |
| `split` | An A/B split: 2 to 5 ways whose `weight`s add up to 100. Each person takes one way by chance — the same one every time — and the report counts each way's conversions. |

A message step is sent by the project's send rules ([Notifications › When a message goes](https://palbase.studio/docs/backend/notifications#when-a-message-goes)): quiet hours, the marketing cap and what the person allowed. A message they did not allow is skipped and the run goes on. A journey has 100 steps at most, every one reachable from `start`, and no way back to a step already taken but through a wait.

## From your backend

A step your backend sees — a document approved, a first upload — moves a journey when your server tells it as the user's event: `POST /analytics/capture` with the secret key and `user_id`. It enters them into a journey of that event, takes them past a wait for it, counts toward a goal, and answers a branch that asks whether they did it, as an event their app sent would.

```bash
curl -s -X POST "https://<ref>.palbase.studio/analytics/capture" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event": "crew_verified", "user_id": "usr_123", "properties": {"airline": "TK"}}'
```

## In Studio

**Journeys** lists the environment's journeys with their status and who enters. **New journey** starts one from a template — *Onboarding*, *Win back* (a customer who has not bought for 30 days) or *Didn't come back* (a user who has not opened the app for a week) — or from a blank page.

A journey's page draws it top to bottom: who enters at the top, each step under the one before, a branch's or a split's ways side by side until they meet, the goal at the bottom. A step opens its form in the side panel; the **+** between two steps adds one there. The module checks the draft a moment after each change, and each problem shows under the field it is about (`steps.welcome.inbox.title.en` under the welcome step's English title) and in the problems list, which takes you to it. **JSON** shows the definition the CLI pushes; a change there is the flow. **Preview** walks a made-up person through what is on screen — their properties, audiences, time zone and what they do after entering — and shows each step they would take and when; nothing is sent.

## Trying a journey on a test user

`POST /journeys/{key}/test` with `{ "user_id": "…" }` runs the saved journey — a draft too — for one of the project's [test users](https://palbase.studio/docs/backend/test-users) from its first step. Its messages really go to that user, each wait is a minute long, and the try is counted in no report and no month's people; its `journey.*` events carry `test: true`. Studio's **Try on a test user** does the same, and follows the run beside what landed in the person's inbox. A user who is not a test user is refused (`422 not_a_test_user`), and so is a stopped journey (`409 journey_stopped`). A new try of the same journey ends that user's try still running.

## Publishing, stopping and copying

`POST /journeys/{key}/publish` makes a draft live: people enter it from then on (a `members_of` journey enrolls the audience's members now). A live journey does not change (`409 journey_published`): copy it into a new draft (`POST /journeys/{key}/copy` with `{ "key": "…", "name": "…" }`), publish that, and stop the old one. `POST /journeys/{key}/stop` lets no one in any more and ends the runs in it; its report stays. `DELETE /journeys/{key}` deletes a journey with its runs and its report.

A project keeps 500 journeys and runs 50 at once. An environment without its paid rights — on Free, out of credit, or at its monthly limit — runs 2 at once (`402 live_journeys_limit`); on Pay as you go, the people who enter its journeys are billed by the month ([Billing](https://palbase.studio/docs/getting-started/billing)): the first 1,000 people a month are free, then $2 for each 1,000 more.

## The report

`GET /journeys/{key}/stats` answers who entered (`entered`), how many reached the goal (`converted`), who is in it now (`in_progress`: `active`, `waiting`, `held`), how the runs ended (`ended`: `completed`, `converted`, `exited`, `stopped`, `failed`, `erased`), each step's outcomes from the start (`steps[].outcomes`: `sent`, `skipped`, `waited`, `then`, `else`, a split's way …) and, for a split, each way's conversions (`steps[].converted`). `GET /journeys/{key}/runs` pages each person's run — its state, the step it is at, each step it took and what came of it — filtered by `user_id` or `state`; `GET /journeys/people/{user_id}` is one person's runs in every journey. Studio's **Report** shows the same.

People who enter while the organization's monthly people are used up are held (`held`) until it has them again.

## Events

Each run tells the project's backend as it goes — a [webhook](https://palbase.studio/docs/server/webhooks#the-events), or an `@On`:

| Type | Sent when |
|---|---|
| `journey.entered` | A person entered a journey. |
| `journey.step` | A person's run took a step. |
| `journey.event` | A journey's `event` step told the project's backend. |
| `journey.converted` | A person's run reached the journey's goal. |
| `journey.ended` | A person's run ended: completed, converted, exited, stopped. |

## The API

| Call | What it does |
|---|---|
| `GET /journeys` | The project's journeys, newest first: `status`, `limit`, `cursor`. |
| `POST /journeys` | A new draft: `{ key, definition }`. |
| `GET /journeys/{key}` | A journey whole, with its definition. |
| `PUT /journeys/{key}` | A draft's definition, written whole: `{ definition }`. |
| `DELETE /journeys/{key}` | Deletes it with its runs and its report. |
| `POST /journeys/validate` | Every problem of a definition, each at its path: `{ definition }` → `{ valid, problems }`. Nothing is kept. |
| `POST /journeys/simulate` | A made-up person's way through a journey — the project's (`key`) or one not saved (`definition`) — with each step and when. Nothing is sent. |
| `POST /journeys/{key}/test` | Tries the saved journey on a test user: `{ user_id }`. |
| `POST /journeys/{key}/publish` | Makes a draft live. |
| `POST /journeys/{key}/stop` | Stops a live journey. |
| `POST /journeys/{key}/copy` | Copies a journey into a new draft. |
| `GET /journeys/{key}/stats` | Its report. |
| `GET /journeys/{key}/runs` | Each person's run. |
| `GET /journeys/people/{user_id}` | One person's runs in every journey. |

```bash
curl -s -X POST "https://<ref>.palbase.studio/journeys/onboarding/test" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "usr_test_1"}'
```

## From the CLI

A journey is kept as a file and handled with the CLI: saved as a draft, published, then followed.

```bash
palbase journeys:validate winback.json             # every problem, at its path, with what to do about it
palbase journeys:simulate winback.json --event purchases.purchase.completed@P1D   # walk a made-up person through it; nothing is sent
palbase journeys:push winback.json --publish       # save it as a draft (key: the file's name) and publish it
palbase journeys                                   # the environment's journeys: key, name, status, way in
palbase journeys:stats winback                     # who entered, how their runs ended, the goal's conversions
palbase journeys:runs winback                      # each person's run: its state, the step it is at
palbase journeys:stop winback                      # no one enters it any more, the runs in it end
```

`journeys:get` prints a journey's definition to edit and push again, `journeys:copy` copies one into a new draft, `journeys:publish` publishes a draft, and `journeys:delete` deletes one with its runs and its report. Every command is in the [CLI reference](https://palbase.studio/docs/cli/reference#journeys).

## Related

- [Notifications](https://palbase.studio/docs/backend/notifications) — the send rules a journey's messages keep to, push templates and inboxes
- [Analytics › Audiences](https://palbase.studio/docs/web/analytics#audiences) — the audiences a journey enters people from, and asks about
- [Test Users](https://palbase.studio/docs/backend/test-users) — the users a journey is tried on
- [Webhooks](https://palbase.studio/docs/server/webhooks) — `journey.entered`, `journey.step`, `journey.event`, `journey.converted`, `journey.ended`
