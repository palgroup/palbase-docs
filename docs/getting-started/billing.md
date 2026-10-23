> The full documentation index: https://palbase.studio/llms.txt

# Billing

An organization is billed for its projects' use by the calendar month (UTC). It is on one of two plans:

- **Free**: no card. Every item has a free quota each month; a person with no payment account opens at most 2 projects of 2 environments each — one deleted counts until the month is out, so deleting and opening again brings no new month of free quotas; a Free project is opened by a person, not an organization's access token — and machines and databases are of the free sizes.
- **Pay as you go**: the organization opens a payment account and loads a balance ahead, in US dollars. Its projects use the free quota once for the whole organization; what they use past it is priced and taken from the balance as it is used, every few minutes. There is no monthly fee and no bill afterwards.

The prices, the free quotas and the terms are on the [billing terms](https://palbase.studio/legal/billing) page.

## Opening the payment account

An owner or admin opens it in Studio, on the organization's **Billing** page: they accept the terms for the organization (Studio records who, when, and which version), choose a first top-up of $10 or more, and pay it on Stripe's page, which asks for the card, the billing address and, for a business, its VAT number. Tax is added on top as the billing address requires. Stripe emails an invoice for every top-up; **Billing › Invoices** lists them.

From then on the organization's projects may open every size of machine and database ([Machines](https://palbase.studio/docs/machines/overview#sizes), [Databases](https://palbase.studio/docs/machines/databases#sizes)) and are not held to the Free limits on projects and environments.

## Top-ups

- **Automatic**: when the balance comes under a threshold, the default card is charged an amount, at most once an hour; on by default ($20 when under $5). A refund or a dispute turns it off. **Billing › Automatic top-up** changes both, sets a monthly cap on what it takes in a calendar month (the last top-up of a month is what is left of the cap, when that is at least $10), or turns it off, and the balance is then the ceiling. When the cap holds a top-up back, the owners and admins are emailed, once a month (again only if the cap is changed). When the default card declines, the same invoice is paid from the organization's other cards in turn — it is paid once at most. When every card declines, it is tried again once a day for two days, and the owners and admins are emailed each time; its invoice is voided (**Invoices** shows it as declined), and each try is a new one.
- **Now**: **Top up** on the Billing page — a usual amount or any other, from any saved card, or another card on Stripe's page (it is saved for next time).
- **By bank transfer**: **Top up › Bank transfer** makes an invoice with bank details of the organization's own; the balance gets the amount when the transfer arrives.

A top-up can be spent for 12 months; what is left of it then expires. **Billing › Credits** lists each top-up and bonus with what is left of it and when it expires; the one closest to expiring is spent first.

## Cards and billing details

**Billing › Payment** lists the organization's cards. **Add card** saves one on Stripe's page — nothing is charged — and makes it the default unless you say otherwise; any other card can be made the default or removed. The default card is removed only when it is the last one, and the automatic top-up turns off with it.

**Edit billing details** sets the name, address and tax number (a VAT number in the EU) the next invoices are made out to. The address is checked for tax at once: one that cannot be placed is refused, and nothing changes.

## What is charged

**Usage** shows the month: what each environment used of each item and what it would cost on its own (gross), and the organization's charge for each item, its free quota taken once. Any member reads what was used; the amounts are an owner's or an admin's. **Download CSV** gives the same, a line per environment and item, for an organization that bills its own customers per project.

Palbase AI's models, on Palbase's own provider keys, are their provider's price and 10%, and each month brings $1.00 of them free, once for the organization's projects. A project may have a monthly AI budget of its own ([AI](https://palbase.studio/docs/backend/ai#what-it-costs)). A call under the project's own provider key is the provider's to bill. Requests, push notifications, and email, SMS and WhatsApp sent through the project's own provider are not charged.

The owners and admins are emailed when the balance comes under the days of spend they choose (3 by default, in **Automatic top-up**), and when it runs out.

## Each environment's place in the bill

For each environment, an admin can, on the Usage page (**Change**) or from the API:

- set a **monthly cap**: at it, the environment is Free until the month ends, while the others go on;
- pull it to the **Free plan**: it is charged nothing and held to the free quotas;
- **freeze** it: its requests are refused (`403 project_frozen`), its machines and databases stop, its data is kept, and only what it stores is charged. Unfreezing brings it back.

## When the balance runs out

Nothing is owed. What is paid for stops: machines and databases of a paid size stop (`402 machine_not_paid` while it lasts), Palbase's AI models past the month's free dollar are refused (`402 ai_payment_required`; a project's own provider key goes on), and the projects are held to the free quotas, as on the Free plan; what is within them goes on. Usage measured in the few minutes before it stopped is taken from the next top-up; what the projects use after it is not charged. While the balance is out, the organization's projects share one free quota, as the account's bill does. A top-up brings everything back by itself.

## From the terminal

The CLI does what the Billing page does, as you or with an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) in CI — save opening the payment account and the first top-up, which saves the card on Stripe's page:

```bash
palbase billing                                   # the plan, the balance, the card, the automatic top-up, this month, each environment's place
palbase billing:charges --period 2026-10 --csv    # the month's charges by environment and item, as the page downloads them
palbase billing:invoices                          # the top-ups' invoices
palbase billing:ledger --limit 50                 # every change of the balance, newest first
palbase billing:settings --auto-topup yes --threshold 10 --amount 50 --monthly-cap 200
palbase billing:env shop/staging --cap 25         # an environment's monthly cap; --free yes|no, --frozen yes|no
palbase billing:topup 20                          # from the saved card, $10 to $10,000; it asks first, -y does not
palbase billing:bank-transfer 500                 # an invoice to pay by bank transfer
```

The organization is `--org`'s, else the one of the environment chosen for the directory. Amounts are in US dollars, to the cent. A member reads the plan and the environments; the money is an owner's or an admin's.

## The API

What Studio's Billing page does, an admin's [access token](https://palbase.studio/docs/getting-started/access-tokens) does too — save opening the payment account and paying on Stripe's page, which are a person's. The calls are on Studio's API, under the organization:

| Call | What it does |
|---|---|
| `GET /v1/orgs/{id}/billing` | The plan, the balance, the settings, and each environment's place in the bill |
| `PATCH /v1/orgs/{id}/billing` | Automatic top-up (`auto_topup`, `auto_threshold_micros`, `auto_amount_micros`, `monthly_cap_micros`) and `low_balance_days` |
| `POST /v1/orgs/{id}/billing/topups` | A top-up from the default card, or the one named: `{ "amount_micros": 20000000, "payment_method": "pm_…" }` |
| `GET /v1/orgs/{id}/billing/cards` | The cards, the default first |
| `PUT /v1/orgs/{id}/billing/cards/{card}/default` | Makes a card the default |
| `DELETE /v1/orgs/{id}/billing/cards/{card}` | Removes a card; the default only when it is the last |
| `GET` / `PUT /v1/orgs/{id}/billing/customer` | The name, `address` and `tax_id` (`{ "type": "eu_vat", "value": "…" }`, or `null`) the invoices are made out to |
| `POST /v1/orgs/{id}/billing/bank-transfers` | An invoice to pay by bank transfer |
| `GET /v1/orgs/{id}/billing/charges?period=2026-10` | The month's charges, by environment and item |
| `GET /v1/orgs/{id}/billing/charges.csv?period=2026-10` | The same, as CSV |
| `GET /v1/orgs/{id}/billing/invoices` | The top-ups' invoices |
| `GET /v1/orgs/{id}/billing/ledger` | Every change of the balance; `?kind=topup,bonus` for the credits alone |
| `PATCH /v1/orgs/{id}/billing/environments/{ref}` | An environment's `cap_micros` (`null`: none), `free`, `frozen` |

Amounts are in micro-dollars (1,000,000 is $1), in whole cents. A member reads the plan and what was used; amounts and money are an admin's.

## Related

- [Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits) — what is metered, and what a free project gets
- [Organizations](https://palbase.studio/docs/getting-started/organizations) — roles, and who is emailed
- [Access Tokens](https://palbase.studio/docs/getting-started/access-tokens) — an admin token for the API
