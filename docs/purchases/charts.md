> The full documentation index: https://palbase.studio/llms.txt

# Charts

The purchases module draws the project's revenue and subscription charts from its ledger — every purchase from every store, as the stores confirmed it. Each chart is computed when it is read, so a refund that arrives late, a renewal, a product change, a guest merged into an account or a change of the settings is in the next answer. Money is in one reporting currency.

In Studio, **Purchases › Charts** shows them, each with its definition, and the views of them the organization saved.

## Quick example

```sh
palbase purchases:charts:overview -E production
palbase purchases:charts:get mrr --resolution month --segment store -E production
palbase purchases:charts:get revenue --from 2026-09-01 --to 2026-09-30 --filter country:TR --revenue-type proceeds --csv --out palbase/revenue-tr.csv -E production
```

The overview is the project's figures at a glance: MRR, active subscriptions and active trials now; revenue, new customers and active customers over the last 28 days. From a server:

```ts
// server/report.ts
import { createServer } from "palbase/server";

const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

const { data } = await palbase.purchases.getChart({
  path: { chart: "mrr" },
  query: { resolution: "month", segment: "store" },
});
console.log(data);
```

## The charts

`palbase purchases:charts` lists every chart with its definition — what it counts, over which period, and how refunds, product changes, resubscriptions and test purchases count — and the dimensions it is split by.

| | Charts |
|---|---|
| Revenue | `revenue`, `mrr`, `mrr_movement`, `arr`, `non_subscription_purchases`, `refunds`, `refund_rate` |
| Subscriptions | `active_subscriptions`, `active_subscriptions_movement`, `active_trials`, `active_trials_movement`, `new_trials`, `paid_subscriptions`, `churn`, `subscription_status`, `subscription_retention` |
| Customers | `new_customers`, `active_customers`, `initial_conversion`, `conversion_to_paying`, `trial_conversion`, `realized_ltv_per_customer`, `realized_ltv_per_paying_customer`, `cohort_explorer` |

A **flow** counts what happened in a period; a **snapshot** is the state at its end (now, for the period now is in); a **ratio** divides its measures; a **cohort** follows what began in a period over its ages. A period marked `*` in the CLI is not over: its value may still change.

## Reading a chart

| Flag | Parameter | What it does |
|---|---|---|
| `--from`, `--to` | `from`, `to` | The first and last day, `YYYY-MM-DD`, both included, at most two years apart. By default the last 30 days, 12 weeks or 12 months. |
| `--resolution` | `resolution` | `day` (the default), `week` (ISO weeks, Monday to Sunday) or `month`. Days are UTC. |
| `--segment` | `segment` | Splits the chart by `store`, `platform`, `country`, `product`, `plan`, `duration`, `sandbox`, `paywall` or `experiment`: the 20 largest values each a segment, the rest together as `(other)`. |
| `--filter` | `filter` | Keeps what has one of the values given, one `dimension:value` each: `--filter store:app_store --filter country:TR`. |
| `--revenue-type` | `revenue_type` | `gross` (what customers paid, the default), `net_of_taxes`, or `proceeds` (net of taxes and of the store's commission or Stripe's fee). |
| `--currency` | `currency` | Money in another currency, for this answer. |
| `--window-days` | `window_days` | The conversion charts' timeframe and the lifetime charts' customer lifetime, in days from a customer's first day. |
| `--cohort` | `cohort` | The cohort explorer's cohorts: `new_customers` (by their first day) or `new_paying_customers` (by their first payment). |
| `--sandbox` | `sandbox` | Counts test purchases too; segment or filter by `sandbox` to tell them apart. |
| `--csv` | `Accept: text/csv` | The chart as CSV, a row a segment and period; `--out` writes it under `palbase/`. A value that would start a spreadsheet formula (`=`, `+`, `-`, `@`) begins with a quote. |

**Money** is converted to the reporting currency at the European Central Bank's reference rate of the day it was paid; an amount in a currency the Bank does not publish is left out, and named. The ledger keeps what was paid as it was paid. The stores' commission and Stripe's fee are not in the ledger: proceeds are estimated with the [settings](#settings), and so are taxes a store did not state — the answer says what was estimated.

**Paywalls and experiments.** The `paywall` and `experiment` dimensions credit each subscription once, when its first purchase is recorded: to the paywall — and the experiment's variant — its owner saw first within the 7 days before buying. One that followed none is `none`, its renewals included.

A cohort chart follows at most 120 cohorts. A customer holding more than 20,000 transactions makes a chart refuse (`422 chart_too_large`).

### How often

The same request within a minute is answered from a cache, which a change of the settings clears. A project's charts are computed 20 in a row, then one every 2 seconds; past that a chart is refused with `429 too_many_charts` and `Retry-After` — an answer from the cache is not counted. A chart that takes longer than 15 seconds to compute is refused with `503 charts_busy` and `Retry-After`.

## Settings

How the charts count money:

```sh
palbase purchases:charts:settings --currency EUR --commission small_business -E production
```

| Flag | Setting | Default | What it is |
|---|---|---|---|
| `--currency` | `reporting_currency` | `USD` | The currency the charts report money in: one the European Central Bank published a rate for in the last ten days. Changing it redraws every chart from its first day. |
| `--commission` | `store_commission` | `standard` | What proceeds take off App Store and Google Play payments: `standard` (30%; 15% of a subscription's renewals after its first paid year in the App Store, and of every Google Play subscription) or `small_business` (15%: the App Store Small Business Program, Google Play's first million). |
| `--stripe-percent`, `--stripe-fixed`, `--stripe-fixed-currency` | `stripe_fee_bps`, `stripe_fee_fixed_micros`, `stripe_fee_fixed_currency` | 2.9% + 0.30 USD | Stripe's fee of a web payment, its share and its fixed part. |
| `--app-store-link-percent`, `--app-store-link-days` | `app_store_link_fee_bps`, `app_store_link_attribution_days` | 0%, 7 days | What the App Store takes of a web purchase bought through a link out of an iOS app in its United States storefront, and for how many days after the link a purchase owes it. Nothing today; set it once Apple charges one. |

Without flags, the command prints the settings. They are the purchases module's settings, also read and changed in Studio (**Purchases › Settings**) and with `updateSettings` ([Customers › Settings](https://palbase.studio/docs/purchases/customers#settings)).

## Related

- [Customers](https://palbase.studio/docs/purchases/customers): one customer's purchases
- [Paywalls](https://palbase.studio/docs/purchases/paywalls): a placement's and an experiment's own results
- CLI: [`purchases:charts:get`](https://palbase.studio/docs/cli/reference#palbase-purchaseschartsget), [`purchases:charts:settings`](https://palbase.studio/docs/cli/reference#palbase-purchaseschartssettings)
