> The full documentation index: https://palbase.studio/llms.txt

# Connect Stripe

Your project sells its catalog on the web through your own Stripe account: Checkout, the customer portal, renewals and refunds all happen on it, and Palbase keeps each user's access in your app in step with them. Connect the account once per environment.

There are two ways. Use the first.

| | A. With one click | B. With a restricted key |
|---|---|---|
| What you do | Pick the account at Stripe and accept | Make a restricted key in the Stripe Dashboard and paste it |
| What Palbase holds | The access of Palbase's Stripe App, *Subscriptions by Palbase* | The key |
| Where Stripe's events go | Palbase's own endpoint, for every account that installed the App | An endpoint Palbase makes on your account |
| How to stop | Disconnect in Studio; uninstall the App in the Stripe Dashboard | Disconnect in Studio |

## A. With one click (Palbase's Stripe App)

**1. Open the environment's Stripe account.** In Studio, open the project and the environment, then **Purchases › Stores** and its Stripe account panel, and choose **Connect with one click**. From the command line:

```sh
palbase purchases:stripe:install -E staging
```

**2. Choose the mode.** Test mode sells in Stripe's sandbox, live mode takes real payments (`--live` on the command line). Connect a test environment in test mode first.

**3. Open Palbase's install page.** It names the Palbase project and environment the account will be connected to, then sends you to Stripe. The link works once, for 30 minutes.

**4. Pick the Stripe account and accept.** Stripe lists the accounts you can install apps on and shows what the App may do: write products, prices, customers, Checkout Sessions, subscriptions and customer portal sessions; read invoices, payment intents, charges, refunds, disputes and events. Accept, and Stripe sends you back to Palbase, which connects the account and says so.

**5. Check it.** Studio shows the account as active, connected through Palbase's Stripe App:

```sh
palbase purchases:stripe -E staging
```

Then bring the account to your catalog (Studio's catalog page, or `palbase purchases:catalog:plan` and `palbase purchases:catalog:confirm`): Palbase creates the catalog's products and prices on the account.

Nothing is made on your account for Stripe's events: they come to Palbase through the App.

## B. With a restricted key

In Studio, **Purchases › Stores** and its Stripe account panel, choose **Use a restricted key instead**, or run `palbase purchases:stripe:grant`. Make a restricted key in the Stripe Dashboard (**Developers › API keys › Create restricted key**) with **Write** on Products, Prices, Customers, Checkout Sessions, Customer portal, Subscriptions and Webhook Endpoints, and **Read** on Invoices, Payment Intents, Charges, Disputes, Events and Account; open the page Palbase gives you and paste it there. A key that cannot read its account is refused with `422 stripe_permission_missing`, and so is one missing a permission Palbase checks for — the answer names it. The key goes from that page straight to Palbase, never through Studio. A secret key that can do anything is refused.

## Disconnecting

**Disconnect** in Studio stops selling through the account; purchases already made stay. With the App, uninstall it from the account too in the Stripe Dashboard (**Settings › Installed apps**); uninstalling it alone disconnects every environment connected through it.

## Related

- [Web](https://palbase.studio/docs/purchases/web): selling on the web with `pb.purchases` — Checkout, the customer portal, redemption links
- [Catalog](https://palbase.studio/docs/purchases/catalog): the products and prices a plan writes to the account
- [Purchases](https://palbase.studio/docs/purchases/overview): how the catalog, the stores and the customers fit together
