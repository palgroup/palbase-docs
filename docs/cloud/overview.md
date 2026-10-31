> The full documentation index: https://palbase.studio/llms.txt

# Overview

`palbase/cloud` is Palbase run from your own server: one client, made with your **organization's access token**, that does everything Studio and the CLI do through the API — open organizations, projects and environments, put them on Pay as you go and have your payment account pay for them, read their usage and invoices, build machines and databases — and reaches every project's modules at its own address: its users, files, analytics, purchases and their charts, AI, messaging and the rest. It is for a product that opens a Palbase project for each of its own customers and keeps Palbase out of their sight: your customers sign in to your product, and your server does the rest with one token.

Use it from a server you control. It refuses to run in a browser — the token can open, change and pay for every project of your organization, so it never belongs in an app or a web page. An app keeps using `palbase/web`, the iOS or Android SDK, with its project's publishable key.

## The token

Make an access token in Studio (**Organization → Access tokens**) with the **admin** role, or **member** for a server that only reads. Making one is a person's to do — a token never makes another — as are accepting the terms and saving the organization's card. Keep it in your server's secrets, as `PALBASE_TOKEN`:

- It starts with `pbo_` and ends in a checksum: `palbase/cloud` refuses one that is cut short, mistyped or of another kind before anything is sent (`tokenIsWellFormed(token)` asks the same). Tokens made before 2026-10-25 carry no checksum: make a new one.
- It does what its role does, in your organization alone. Another organization's project answers `404`, the same as a project that does not exist.
- It ends on its date, when it is removed, and when the person who made it leaves the organization or is made less than its role.

## An organization for each customer: account tokens

An **account token** (`pbu_…`) is yours, not one organization's: with it your server opens an organization for each of your customers, and their projects in it. Make one in Studio (**Account → Tokens**) or with the CLI — it is shown once — and keep it in your server's secrets:

```bash
palbase account:tokens:create my-product --days 365
palbase account:tokens:list      # each by its hint (pbu_…a1b2), with the organizations it opened
palbase account:tokens:revoke <id>
```

- It reaches the organizations it opened, and only those: you are their owner, the token an admin of each. Every other organization answers `404`.
- In them it does what an admin does — projects, environments, their modules, billing — and renames an organization or deletes an empty one; never more than your own role there now. Members, invitations, tokens and project keys stay yours, in person.
- It stops at once, everywhere, when you delete it, when you leave one of its organizations (there, for good), or when your account is deleted. The keys of the environments it opened go with it.

One payment account pays for every organization you link to it: you are charged once a month for all of them, and its report is each organization's month, item by item — what you bill your own customers by.

```ts
// customers.ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_ACCOUNT_TOKEN! });

// An organization for a new customer, paid for by your own organization's payment account.
const { data: customer } = await cloud.orgs.create({ body: { name: "Customer 1042" } });
await cloud.billing.payer({ path: { id: customer.id }, body: { account: process.env.PALBASE_PAYER_ORG_ID! } });
const { data: made } = await cloud.projects.create({ path: { id: customer.id }, body: { name: "shop" } });
await cloud.projects.addEnvironment({ path: { id: made.project.id }, body: { name: "main", slug: "main" } });

// At the month's end: what each customer's organization owed, environment by environment.
const { data: month } = await cloud.billing.report({ path: { id: process.env.PALBASE_PAYER_ORG_ID! }, query: { period: "2026-11" } });
for (const org of month.organizations) console.log(org.name, org.owed_micros / 1_000_000);
```

## Quick example

```ts
// server.ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });

// One project for one of your customers, and its environment — Free until you move it to Pay as you go.
// A project opened by the API has no environment yet; its keys are shown once, as the environment is added.
const org = process.env.PALBASE_ORG_ID!;
const { data: made } = await cloud.projects.create({ path: { id: org }, body: { name: "customer-1042" } });
const { data: added } = await cloud.projects.addEnvironment({ path: { id: made.project.id }, body: { name: "main", slug: "main" } });
const ref = added.environment.ref;

// On Pay as you go: what it uses past its free quota is charged to the payment account that pays for the organization,
// at the month's end — at most $200 a month.
await cloud.billing.steer({ path: { id: org, ref }, body: { plan: "pay_as_you_go", monthly_limit_micros: 200_000_000 } });

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
| `billing` | the bill, cards, invoices and charges; an environment's plan and monthly limit; the payment account that pays for the organization |
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

## Confirming for your users

A few steps are a person's to confirm — sending an app to App Review, releasing it, expiring a build ([Actions](https://palbase.studio/docs/distribution/overview#actions)). Your users have no Palbase account, so your server confirms for them with your organization's token, once an owner or an admin turns on **Confirms for people** for it in Studio (**Organization › Access tokens**). Each confirmation names the person, and the action keeps them as its decider:

```ts
import { PalbaseCloud } from "palbase/cloud";

const ref = "abcd1234efgh"; // the customer's environment
const forAda = new PalbaseCloud({
  token: process.env.PALBASE_TOKEN!,
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    request.headers.set("Palbase-For", "yourplatform:user_42"); // who clicked, in your product
    return fetch(request);
  },
});
const stores = forAda.project(ref).stores;
const { data: action } = await stores.getAction({ path: { action_id: "the planned action's id" } });
// Shown to your user first: action.summary. Then, on their yes:
await stores.confirmAction({ path: { action_id: action.id }, body: { hash: action.hash } });
```

Ask your user before you confirm, with the plan's own summary: the hash makes sure what runs is what they read. A token without **Confirms for people** that names anyone is refused (`403 token_does_not_confirm`).

## Billing events to your server

Register your organization's endpoint once, and each of your projects' billing events reaches it as it happens — with its `ref`, its name and the amounts:

```ts
import { PalbaseCloud } from "palbase/cloud";

const cloud = new PalbaseCloud({ token: process.env.PALBASE_TOKEN! });
const org = process.env.PALBASE_ORG_ID!;

const { data: endpoint } = await cloud.orgWebhooks.add({
  path: { id: org },
  body: { url: "https://api.example.com/palbase/billing", events: ["org.billing.limit_reached"] },
});
// endpoint.secret is shown once: verify each delivery's Palbase-Signature with it.
```

They are signed as a project's events are ([Webhooks](https://palbase.studio/docs/server/webhooks)). An environment's own endpoints get its `billing.*` events with its `ref` and never an amount: the amounts are the organization's.
