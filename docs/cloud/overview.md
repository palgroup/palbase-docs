> The full documentation index: https://palbase.studio/llms.txt

# Overview

`palbase/cloud` is Palbase run from your own server: one client, made with your **organization's access token**, that does everything Studio and the CLI do through the API — open projects and environments, put them on Pay as you go and top up their credit from your card, read their usage and invoices, build machines and databases — and reaches every project's modules at its own address: its users, files, analytics, purchases and their charts, AI, messaging and the rest. It is for a product that opens a Palbase project for each of its own customers and keeps Palbase out of their sight: your customers sign in to your product, and your server does the rest with one token.

Use it from a server you control. It refuses to run in a browser — the token can open, change and pay for every project of your organization, so it never belongs in an app or a web page. An app keeps using `palbase/web`, the iOS or Android SDK, with its project's publishable key.

## The token

Make an access token in Studio (**Organization → Access tokens**) with the **admin** role, or **member** for a server that only reads. Making one is a person's to do — a token never makes another — as are accepting the terms and saving the organization's card. Keep it in your server's secrets, as `PALBASE_TOKEN`:

- It starts with `pbo_` and ends in a checksum: `palbase/cloud` refuses one that is cut short, mistyped or of another kind before anything is sent (`tokenIsWellFormed(token)` asks the same). Tokens made before 2026-10-25 carry no checksum: make a new one.
- It does what its role does, in your organization alone. Another organization's project answers `404`, the same as a project that does not exist.
- It ends on its date, when it is removed, and when the person who made it leaves the organization or is made less than its role.

## Quick example

```ts
// server.ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });

// One project for one of your customers, and its environment — Free until its first top-up.
// A project opened by the API has no environment yet; its keys are shown once, as the environment is added.
const org = process.env.PALBASE_ORG_ID!;
const { data: made } = await cloud.projects.create({ path: { id: org }, body: { name: "customer-1042" } });
const { data: added } = await cloud.projects.addEnvironment({ path: { id: made.project.id }, body: { name: "main", slug: "main" } });
const ref = added.environment.ref;

// Its first top-up, from the organization's default card, moves it to Pay as you go.
await cloud.billing.topUp({ path: { id: org, ref }, body: { amount_micros: 20_000_000, plan: "pay_as_you_go" } });

// Topped up again by itself: $20 whenever it falls under $5.
await cloud.billing.steer({ path: { id: org, ref }, body: { auto_topup: true, auto_threshold_micros: 5_000_000, auto_amount_micros: 20_000_000 } });

// What it used, and its users — at the project's own address.
const usage = await cloud.projects.usage({ path: { ref } });
const users = await cloud.project(ref).auth.adminListUsers({ query: { limit: 50 } });
console.log(usage.data, users.data.users.length);
```

Every call takes `{ path, query, headers, body }` as its operation needs them and answers `{ status, data, headers }`; a refusal is thrown as a `PalbaseError` with its `status` and `code`, as in [palbase/server](https://palbase.studio/docs/server/overview). Writes take an `Idempotency-Key` header and are safe to send again with the same one.

## What is in it

The client's own namespaces are Studio's API — the same calls Studio's screens make:

| Namespace | What it does |
| --- | --- |
| `orgs`, `projects` | the organization, its members and audit log; projects and their environments, usage, keys' hints, GitHub installations shared to a new environment |
| `billing` | the bill, cards, invoices and charges; an environment's plan, monthly limit, automatic top-up, balance and ledger; top-ups and bank transfers |
| `webhooks`, `orgWebhooks` | an environment's webhook endpoints and deliveries; the organization's own endpoints for its projects' billing events |
| `environmentTokens` | tokens for one environment: an agent's, or one of your users' (below) |
| `apps`, `snippets`, `chartViews`, `accessRequests`, `docs` | client apps, saved database snippets and chart views, access requests, the docs' search |

`cloud.project(ref)` is one environment's modules: `auth`, `storage`, `analytics`, `purchases`, `ai`, `messaging`, `notify`, `flags`, `journeys`, `secrets`, `stores`, `realtime` and `machines` (its machines and databases) — every call of theirs a server makes, by the names their API reference gives them. What only an app's user calls — signing in, signing up, a password reset — is not there: that is the apps' SDKs'.

## Your users: a token each

Your customers' people never get a Palbase account. When one of them works in your product — your dashboard, an AI agent acting for them — mint them a token for their project alone, in their role, for the time they need it:

```ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });
const ref = "abcd1234efgh"; // the customer's environment

const { data: minted } = await cloud.environmentTokens.mint({
  path: { ref },
  body: { name: "dashboard", role: "member", on_behalf_of: "ada@customer-1042.com", expires_in_minutes: 60 },
});
// minted.token (pbe_…) reads that environment alone: another answers 404, a member's write 403.
```

The token is shown once. It does at most what its role does and never more than what minted it; it makes no token and does no organization's work; `on_behalf_of` is recorded beside its every call in the environment's audit. It ends after `expires_in_minutes` (5 to 240), when it is revoked, and when what minted it ends.

## Billing events to your server

Register your organization's endpoint once, and each of your projects' balance events reaches it as it happens — with its `ref`, its name and the amounts:

```ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });
const org = process.env.PALBASE_ORG_ID!;

const { data: endpoint } = await cloud.orgWebhooks.add({
  path: { id: org },
  body: { url: "https://api.example.com/palbase/billing", events: ["org.billing.low_balance", "org.billing.balance_exhausted", "org.billing.limit_reached", "org.billing.topup_failed"] },
});
// endpoint.secret is shown once: verify each delivery's Palbase-Signature with it.
```

They are signed as a project's events are ([Webhooks](https://palbase.studio/docs/server/webhooks)). An environment's own endpoints get its `billing.*` events with its `ref` and never an amount: the amounts are the organization's.
