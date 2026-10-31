> The full documentation index: https://palbase.studio/llms.txt

# Billing

Each environment is billed on its own, by the calendar month (UTC): it has its own plan and its own free quota, as a project of its own. What it owes is charged to a **payment account** — an organization's cards and billing details — which pays for every organization linked to it: its own, and others its owners or admins link to it. Nothing is paid ahead. Each environment is on one of two plans:

- **Free**: charged nothing. Every item has a free quota each month, and past it the environment is slowed or stopped ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits#what-a-free-project-gets)); its machines and databases are of the free sizes. Every environment starts on Free. Until the organization is paid for by a payment account that has paid a charge, a person opens at most 2 projects of 2 environments each — one deleted counts until the month is out, so deleting and opening again brings no new month of free quotas — and a Free project is opened by a person, not an organization's access token.
- **Pay as you go**: an owner or an admin moves the environment there, while a payment account with a card pays for its organization — never on its own. What it uses past its own free quota is priced and owed to that account as it is used; it may open every size of machine and database. There is no monthly fee.

When an environment's month reaches its limit, only it falls back to the free quotas; the organization's other environments go on. The prices, the free quotas and the terms are on the [billing terms](https://palbase.studio/legal/billing) page.

## Opening a payment account

An owner or admin opens it in Studio, on the organization's **Billing** page, by accepting the terms for the organization (Studio records who, when, and which version), then saves a card on Stripe's page (**Billing › Payment › Add card**), which asks for the billing address and, for a business, its VAT number. Nothing is charged. A prepaid card is refused. The organization is then paid for by its own account.

## Linking organizations to a payment account

One payment account pays for many organizations: an organization that opens an organization for each of its customers pays for all of them from one account, and bills each customer from the account's monthly report. On an organization's **Billing › Paid by**, an owner or an admin of it who also manages a payment account (an owner or an admin of the organization it is) links it to that account, or stops it being paid for. Stopped, its environments on Pay as you go go Free; what they owed until then stays the account's.

A linked organization's people see their own environments, plans and usage, never the account's cards or invoices. The account's **Billing › Paid organizations** lists every organization it pays for.

## How a payment account is charged

- **At the month's end**: on the first day of each month (UTC), what the environments it pays for owe of the month before is charged in one Stripe invoice, a line for each environment (past 250, one for each organization).
- **At its threshold**: during a month, as soon as what they owe and is not charged yet comes to the account's threshold, it is charged at once: **25 USD**, or **50 USD** once the account has paid every charge without fail for 3 months. The threshold grows no more.
- A charge of less than 0.50 USD waits for the next one. Tax is added on top as the billing address requires; a VAT-registered business in the EU is invoiced under the reverse charge. Stripe emails each invoice; **Billing › Invoices** lists them, an unpaid one with its page to pay it on.

The charge is taken from the default card; when it declines, the account's other cards are tried in turn.

## When a charge is not paid

A declined charge is tried again every day, and the account's owners and admins are emailed each time, with the day its environments go Free. If it is still unpaid **7 days** after it was first declined — or as soon as what the account owes, unpaid and not yet charged, comes to **twice its threshold** — the environments on Pay as you go it pays for are held to the free quotas: their machines and databases of a paid size stop (`402 machine_not_paid` while it lasts), Palbase's AI models past their month's free dollar are refused (`402 ai_payment_required`; a project's own provider key goes on), and their data is kept. Saving a card, or paying the invoice on its page, brings them back at once.

A payment disputed with the card's bank holds them at once, and the disputed card is taken off the account; a card saved again lets them go.

Credit loaded ahead under the earlier terms is carried to the account's balance at Stripe and applied to its next invoices: nothing of it is lost.

## Cards and billing details

**Billing › Payment** lists the account's cards. **Add card** saves one on Stripe's page — nothing is charged — and makes it the default unless you say otherwise; any other card can be made the default or removed. The default card is removed only when it is the last one; charges then wait for a card.

**Edit billing details** sets the name, address and tax number (a VAT number in the EU) the next invoices are made out to. The address is checked for tax at once: one that cannot be placed is refused, and nothing changes.

## What is charged

**Usage** shows the month: each environment's plan and what it used, and to an owner or an admin what that came to before its free quota (gross), what it was charged past it and what it owes. Any member reads what was used; the amounts are an owner's or an admin's. **Download CSV** gives it item by item.

A payment account's **Monthly report** gives the month of every organization it pays for — each environment, what it owes — and its CSV each item of each environment: what an organization that pays for its customers' organizations bills them by.

Palbase AI's models, on Palbase's own provider keys, are their provider's price and 10%, and each month brings each environment $1.00 of them free. A project may have a monthly AI budget of its own ([AI](https://palbase.studio/docs/backend/ai#what-it-costs)). A call under the project's own provider key is the provider's to bill. Requests, push notifications, and email, SMS and WhatsApp sent through the project's own provider are not charged.

## Each environment's own

For each environment, an owner or an admin can, on **Billing › Environments › Manage** or from the API:

- move it to **Pay as you go**, or back to **Free**: charged nothing more and held to the free quotas;
- set a **monthly limit**: at it, the environment falls back to the free quotas until the month ends, while the others go on;
- **freeze** it: its requests are refused (`403 project_frozen`), its machines and databases stop, its data is kept, and only what it stores is charged. Unfreezing brings it back.

## Emails and webhooks

A payment account's owners and admins are emailed when a charge is declined (each day it is tried again) and when the environments it pays for are held; an environment's organization's, when its month reaches its limit. What happens at once to several environments comes in one email, naming each.

Each environment's own webhooks are told the same as it happens, as `billing.payment_failed`, `billing.held` and `billing.limit_reached` ([Webhooks](https://palbase.studio/docs/server/webhooks#the-events)) — an organization that runs its customers' apps tells them from there. They carry nothing of the account's — no amount, no card's decline, not why it is held — but, for a declined charge, the day the environment goes Free (`free_on`).

## From the terminal

The CLI does what the Billing page does, as you or with an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) in CI — save opening the payment account and saving a card on Stripe's page, which are a person's:

```bash
palbase billing                                   # who pays, the account's standing, each environment's plan, month and limit
palbase billing:env shop/staging                  # an environment's own: its plan, limit and month
palbase billing:env shop/staging --plan pay_as_you_go --limit 25
palbase billing:env shop/staging --plan free      # --frozen yes|no
palbase billing:invoices                          # the account's charges' invoices
palbase billing:charges --period 2026-10 --csv    # the month's charges by environment and item, as the page downloads them
```

The environment is `project/environment` or its ref, else the one chosen for the directory; the organization is `--org`'s, else that environment's. Amounts are in US dollars, to the cent. A member reads the plans; the money is an owner's or an admin's.

## The API

What Studio's Billing page does, an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) does too — save opening the payment account and saving a card on Stripe's page, which are a person's. The calls are on Studio's API, under the organization:

| Call | What it does |
|---|---|
| `GET /v1/orgs/{id}/billing` | Who pays for it, its own payment account and how it stands, and each environment's plan, month and limit |
| `GET /v1/orgs/{id}/billing/environments/{ref}` | An environment's own: its plan, limit and month |
| `PATCH /v1/orgs/{id}/billing/environments/{ref}` | Its `plan` (`free`, `pay_as_you_go`), `frozen`, `monthly_limit_micros` (`null`: none) |
| `GET /v1/orgs/{id}/billing/cards` | The cards, the default first |
| `PUT /v1/orgs/{id}/billing/cards/{card}/default` | Makes a card the default |
| `DELETE /v1/orgs/{id}/billing/cards/{card}` | Removes a card; the default only when it is the last |
| `GET` / `PUT /v1/orgs/{id}/billing/customer` | The name, `address` and `tax_id` (`{ "type": "eu_vat", "value": "…" }`, or `null`) the invoices are made out to |
| `GET /v1/orgs/{id}/billing/charges?period=2026-10` | The month's charges, by environment and item: units, gross and charged, and what each owes |
| `GET /v1/orgs/{id}/billing/charges.csv?period=2026-10` | The same, as CSV |
| `GET /v1/orgs/{id}/billing/invoices` | The account's charges' invoices |

Amounts are in micro-dollars (1,000,000 is $1), in whole cents. A member reads the plans and what was used; amounts and money are an admin's.

## Related

- [Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits) — what is metered, and what a free environment gets
- [Organizations](https://palbase.studio/docs/getting-started/organizations) — roles, and who is emailed
- [Access Tokens](https://palbase.studio/docs/getting-started/access-tokens) — an admin token for the API
