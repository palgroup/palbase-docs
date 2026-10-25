> The full documentation index: https://palbase.studio/llms.txt

# Billing

Each environment is billed on its own, by the calendar month (UTC): it has its own plan, its own credit and its own free quota, as a project of its own. The organization holds only what pays — its cards, its billing details and its bank transfers — and an environment's credit is never another's unless an owner or an admin moves it. Each environment is on one of two plans:

- **Free**: charged nothing. Every item has a free quota each month, and past it the environment is slowed or stopped ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits#what-a-free-project-gets)); its machines and databases are of the free sizes. Every environment starts on Free. Until one of the organization's environments has paid a top-up, a person opens at most 2 projects of 2 environments each — one deleted counts until the month is out, so deleting and opening again brings no new month of free quotas — and a Free project is opened by a person, not an organization's access token.
- **Pay as you go**: the environment has credit, loaded ahead in US dollars; its first top-up by card moves it there. What it uses past its own free quota is priced and taken from its credit as it is used, every few minutes; it may open every size of machine and database. There is no monthly fee and no bill afterwards.

When an environment's credit runs out, or its month reaches its limit, only it falls back to the free quotas; the organization's other environments go on. The prices, the free quotas and the terms are on the [billing terms](https://palbase.studio/legal/billing) page.

## Opening the payment account

An owner or admin opens it in Studio, on the organization's **Billing** page, by accepting the terms for the organization (Studio records who, when, and which version). Nothing is charged. From then on each environment is moved to Pay as you go by its first top-up by card, of $10 or more: **Billing › Environments › Upgrade** on the environment, paid on Stripe's page the first time, which asks for the card, the billing address and, for a business, its VAT number, and saves the card for the organization. Tax is added on top as the billing address requires. Stripe emails an invoice for every top-up, naming its environment; **Billing › Invoices** lists them.

Once one of its environments has paid a top-up, the organization is not held to the Free limits on projects and environments.

## Top-ups

Each environment is topped up on its own, from **Billing › Environments › Manage**:

- **Now**: **Top up** — a usual amount or any other, from any of the organization's saved cards, or another card on Stripe's page (it is saved for next time).
- **Automatic**: when the environment's credit comes under a threshold, it is topped up by an amount, at most once an hour; on by default ($20 when under $5), and never past what the environment's monthly limit still needs. **Automatic top-up** changes both or turns it off. It is taken from the organization's default card; when that card declines, the same invoice is paid from the organization's other cards in turn — it is paid once at most. When every card declines, it is tried again once a day for two days, the owners and admins are emailed each time, and while a card declined today no other environment's automatic top-up tries it again that day. A declined invoice is voided (**Invoices** shows it as declined), and each try is a new one. A refund or a dispute of an environment's top-up turns its automatic top-up off.
- **By bank transfer**: **Top up › Bank transfer** makes an invoice with bank details of the organization's own; the environment gets the amount when the transfer arrives — one on Free is then moved to Pay as you go with **Manage › Move to Pay as you go**. What the organization's transfers paid past their invoices stays with it, and pays the next top-up of any of its environments first, when it covers the whole of it — a card is charged only otherwise; what is left of it 75 days after it arrived, Stripe returns to the account it came from. An organization with no card is topped up automatically from what its transfers left, while it covers the top-up.

Credit can be spent for 12 months; what is left of it then expires. The environment's sheet lists each top-up, bonus and credit moved in with what is left of it and when it expires; the one closest to expiring is spent first.

## Moving credit between environments

An owner or an admin moves an environment's credit to another environment of the same organization: all of it, or an amount (**Manage › Move credit**). Each part keeps its expiry. Credit never leaves the organization, and a member cannot move it. An environment whose credit is moved away entirely is moved to Free.

Deleting an environment, or a project and its environments, offers to move their credit to another environment first. A deleted environment keeps its credit until it is purged, 7 days after it was deleted — **Billing › Environments** offers to move it until then — and what is left of it is lost when it is purged. The organization's owners and admins are emailed when an environment is deleted holding credit, with how much and when it is lost.

## Cards and billing details

**Billing › Payment** lists the organization's cards, shared by its environments. **Add card** saves one on Stripe's page — nothing is charged — and makes it the default unless you say otherwise; any other card can be made the default or removed. The default card is removed only when it is the last one; the automatic top-ups then wait for a card, or a bank transfer.

**Edit billing details** sets the name, address and tax number (a VAT number in the EU) the next invoices are made out to. The address is checked for tax at once: one that cannot be placed is refused, and nothing changes.

## What is charged

**Usage** shows the month: each environment's plan and what it used, and to an owner or an admin what that came to before its free quota (gross) and what it was charged past it. Any member reads what was used; the amounts are an owner's or an admin's. **Download CSV** gives it item by item — a line per environment and item, units, gross and charged, with its total and what its credit gave — for an organization that bills its own customers per environment.

Palbase AI's models, on Palbase's own provider keys, are their provider's price and 10%, and each month brings each environment $1.00 of them free. A project may have a monthly AI budget of its own ([AI](https://palbase.studio/docs/backend/ai#what-it-costs)). A call under the project's own provider key is the provider's to bill. Requests, push notifications, and email, SMS and WhatsApp sent through the project's own provider are not charged.

## Each environment's own

For each environment, an owner or an admin can, on **Billing › Environments › Manage** or from the API:

- set a **monthly limit**: at it, the environment falls back to the free quotas until the month ends, while the others go on;
- move it to **Free**: it is charged nothing and held to the free quotas; its credit stays, spent once it is back on Pay as you go;
- **freeze** it: its requests are refused (`403 project_frozen`), its machines and databases stop, its data is kept, and only what it stores is charged. Unfreezing brings it back.

## When an environment's credit runs out

Nothing is owed. What it pays for stops: its machines and databases of a paid size stop (`402 machine_not_paid` while it lasts), Palbase's AI models past its month's free dollar are refused (`402 ai_payment_required`; a project's own provider key goes on), and it is held to its free quotas, as on Free; what is within them goes on. Usage measured in the few minutes before it stopped is taken from its next top-up; what it uses after it is not charged. The organization's other environments are not touched. A top-up brings it back by itself.

## Emails and webhooks

The organization's owners and admins are emailed when an environment's credit comes under the days of spend set for it (3 by default, in **Automatic top-up**) — at most once a day —, when it runs out, when its automatic top-up is declined, and when its month reaches its limit — and when an environment is deleted holding credit, a few minutes after, unless it was moved or the environment restored meanwhile. What happens at once to several environments comes in one email, naming each.

Each environment's own webhooks are told the same as it happens, as `billing.low_balance`, `billing.balance_exhausted`, `billing.topup_failed` and `billing.limit_reached` ([Webhooks](https://palbase.studio/docs/server/webhooks#the-events)) — an organization that runs its customers' apps tells them from there. They carry no amount: the amounts are the organization's owners' and admins', on its bill.

## From the terminal

The CLI does what the Billing page does, as you or with an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) in CI — save opening the payment account and paying on Stripe's page, which are a person's:

```bash
palbase billing                                   # each environment's plan, credit, month and limit
palbase billing:env shop/staging                  # an environment's own: its plan, credit, limit and automatic top-up
palbase billing:env shop/staging --limit 25 --auto-topup yes --threshold 10 --amount 50
palbase billing:env shop/staging --plan free      # or pay_as_you_go; --frozen yes|no
palbase billing:topup shop/staging 20             # from the saved card, $10 to $10,000; a Free one moves to Pay as you go
palbase billing:bank-transfer shop/staging 500    # an invoice to pay by bank transfer
palbase billing:transfer shop/staging shop/main 5 # credit moved, with its expiry; all of it when no amount is named
palbase billing:ledger shop/staging --limit 50    # every change of its credit, newest first
palbase billing:invoices                          # the top-ups' invoices, each with its environment
palbase billing:charges --period 2026-10 --csv    # the month's charges by environment and item, as the page downloads them
```

The environment is `project/environment` or its ref, else the one chosen for the directory; the organization is `--org`'s, else that environment's. Amounts are in US dollars, to the cent. A member reads the plans; the money is an owner's or an admin's.

## The API

What Studio's Billing page does, an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) does too — save opening the payment account and paying on Stripe's page, which are a person's. The calls are on Studio's API, under the organization:

| Call | What it does |
|---|---|
| `GET /v1/orgs/{id}/billing` | The payment account, and each environment's plan, credit, month and limit |
| `GET /v1/orgs/{id}/billing/environments/{ref}` | An environment's own: its plan, credit, automatic top-up, limit and month |
| `PATCH /v1/orgs/{id}/billing/environments/{ref}` | Its `plan` (`free`, `pay_as_you_go`), `frozen`, `monthly_limit_micros` (`null`: none), `auto_topup`, `auto_threshold_micros`, `auto_amount_micros`, `low_balance_days` |
| `POST /v1/orgs/{id}/billing/environments/{ref}/topups` | A top-up of it from what bank transfers left, else the default card or the one named: `{ "amount_micros": 20000000, "payment_method": "pm_…" }`; `"plan": "pay_as_you_go"` moves a Free one with it |
| `POST /v1/orgs/{id}/billing/environments/{ref}/bank-transfers` | An invoice to pay by bank transfer, for it |
| `GET /v1/orgs/{id}/billing/environments/{ref}/ledger` | Every change of its credit; `?kind=topup,bonus,transfer` for the credits alone |
| `POST /v1/orgs/{id}/billing/transfers` | Credit moved: `{ "from": "<ref>", "to": "<ref>", "amount_micros": 5000000 }`, all of it without `amount_micros` |
| `DELETE /v1/projects/{id}?move_credit_to=<ref>` | Deletes a project, its environments' credit moved first; `DELETE /v1/environments/{ref}?move_credit_to=<ref>` an environment |
| `GET /v1/orgs/{id}/billing/cards` | The cards, the default first |
| `PUT /v1/orgs/{id}/billing/cards/{card}/default` | Makes a card the default |
| `DELETE /v1/orgs/{id}/billing/cards/{card}` | Removes a card; the default only when it is the last |
| `GET` / `PUT /v1/orgs/{id}/billing/customer` | The name, `address` and `tax_id` (`{ "type": "eu_vat", "value": "…" }`, or `null`) the invoices are made out to |
| `GET /v1/orgs/{id}/billing/charges?period=2026-10` | The month's charges, by environment and item: units, gross and charged |
| `GET /v1/orgs/{id}/billing/charges.csv?period=2026-10` | The same, as CSV |
| `GET /v1/orgs/{id}/billing/invoices` | The top-ups' invoices, each with its environment; `?environment=<ref>` one's alone |

Amounts are in micro-dollars (1,000,000 is $1), in whole cents. A member reads the plans and what was used; amounts and money are an admin's.

## Related

- [Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits) — what is metered, and what a free environment gets
- [Organizations](https://palbase.studio/docs/getting-started/organizations) — roles, and who is emailed
- [Access Tokens](https://palbase.studio/docs/getting-started/access-tokens) — an admin token for the API
