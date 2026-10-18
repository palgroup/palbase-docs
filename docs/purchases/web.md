> The full documentation index: https://palbase.studio/llms.txt

# Web

The catalog's `web` products are sold through the environment's own Stripe account: Stripe Checkout takes the payment, Stripe's customer portal manages what was bought, and Stripe's events keep the ledger current — renewals, cancellations, refunds, disputes. Connect the account first: [Connect Stripe](https://palbase.studio/docs/purchases/connect-stripe).

In a browser, `pb.purchases` — the `palbase/web` client's purchases module — reads the offerings, opens Checkout and the portal, and keeps what the signed-in customer has current. Every call here takes the publishable key; what is the customer's takes their session too.

## Quick example

A pricing page: the web's plans with their prices, a button that buys one, and the page kept in step with what the customer has.

```ts
// app/pricing.ts
import { createClient } from "palbase/web";
import { formatPrice } from "palbase/web/paywall";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

/** Every plan the web sells, priced in the catalog's currency. */
export async function plans(locale: string): Promise<{ product: string; plan: string; label: string }[]> {
  const { products } = await pb.purchases.offerings("web");
  return products.flatMap((p) =>
    (p.channels.web?.plans ?? []).map((plan) => ({
      product: p.key,
      plan: plan.key,
      label: `${p.channels.web?.locales[locale]?.name ?? p.key} — ${formatPrice(plan.price.amount, plan.price.currency, locale)}`,
    })),
  );
}

export async function buy(product: string, plan: string): Promise<void> {
  const url = await pb.purchases.checkout({
    product,
    plan,
    successUrl: "https://app.example.com/thanks",
    cancelUrl: "https://app.example.com/pricing",
  });
  location.assign(url);
}

// Told what the customer has once it is read, then whenever it changes; null while no one is signed in.
export const stop = pb.purchases.onCustomerInfo((info) => {
  document.body.dataset.pro = String(info?.entitlements["pro"]?.active === true);
});
```

## The offerings

`pb.purchases.offerings(channel)` is the catalog as a paywall shows it — each product's text in every language, its plans and their prices on a channel (the web's unless another is named), and the id each store sells a plan by. Nobody's purchases are in it: the publishable key reads it with no one signed in. Amounts are in the currency's minor units (`999` is 9.99); `formatPrice(amount, currency, locale)` from `palbase/web/paywall` writes one as the language writes it.

## Buying

`pb.purchases.checkout({ product, plan, successUrl, cancelUrl })` opens a Stripe Checkout session for one of the catalog's web plans, at its price on the environment's Stripe account, and answers its URL: send the buyer there. Stripe sends them back to `successUrl` once they paid, or to `cancelUrl`.

Both addresses go back to one of the project's registered apps — a web app's origin (`palbase apps:env:set <app> --origin https://app.example.com`), or a native app's own scheme — and nowhere else.

With a customer signed in — a guest too — the purchase is theirs once Stripe reports it, and `onCustomerInfo` hears it then: the success page shows the change when it arrives, not before.

| Refusal | Why |
|---|---|
| `409 already_entitled` | The customer already has the product, or a subscription of its group, from any store. Nothing is charged twice; the error's body names the `store` it is managed in. Credits can always be bought again. |
| `429 too_many_checkouts` | Checkouts are limited per address and per project with the publishable key alone, per customer and per address with a session. |

A free trial is given once per customer, across every channel — and on the web not to a guest, nor to a buyer with no account.

### A buyer with no account

With no one signed in, the buyer is no one yet: Checkout asks their email, and what they buy waits for the app user who redeems it. Put `{CHECKOUT_SESSION_ID}` in `successUrl` — Stripe writes the session's id there — and the success page asks for the purchase's **redemption link**:

```ts
// app/thanks.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

// successUrl was "https://app.example.com/thanks?session={CHECKOUT_SESSION_ID}".
const session = new URLSearchParams(location.search).get("session");
if (session) {
  // Stripe may not have told of the payment yet: it is asked again for up to 20 seconds.
  const link = await pb.purchases.redemptionLink(session);
  document.querySelector("#redeem")!.setAttribute("href", link.url);
}
```

The link works once, within an hour; the buyer is emailed one too. Opened on a phone, its page hands it to the app (`<scheme>://palbase/redeem?token=…`); opened on a computer, it shows a QR code to scan with the phone. The app — signed in, or a guest — redeems it, and the purchase is that customer's:

```ts
// app/redeem.ts
import { createClient, PalbaseError } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function redeem(link: string): Promise<string> {
  try {
    const info = await pb.purchases.redeem(link);
    return info.entitlements["pro"]?.active ? "Pro is yours" : "Redeemed";
  } catch (e) {
    if (e instanceof PalbaseError && e.code === "redemption_expired") {
      // Past its hour: a new link goes to the buyer's email, once.
      const resent = (e.body as { resent?: boolean } | undefined)?.resent === true;
      return resent ? "That link expired: a new one is on its way to your email" : "That link expired";
    }
    if (e instanceof PalbaseError && e.code === "already_redeemed") return "That link was used already";
    throw e;
  }
}
```

`redemptionLink` keeps the key it needs in the tab's `sessionStorage` from the checkout on; the redirect to Stripe and back keeps it. Each call makes a new link, ten at most within an hour of the payment; past it, the email's is the one. Your server can make one for a buyer whose email went astray, with the secret key (`createCheckoutRedemption`, any time).

## What the customer has

`pb.purchases.me()` reads everything the signed-in customer has now — entitlements, subscriptions, one-time purchases, credits, quota use — whatever store they bought in. The first read makes the user a customer.

`pb.purchases.onCustomerInfo(listener)` tells the listener once it is read, then each time it changes — a purchase in any store, a renewal or its end, a refund, credits spent — and `null` while no one is signed in; it answers the function that stops it. The first listener joins the customer's own realtime channel, the last one's stop leaves it. A new user signing in is read anew.

What a page shows from it is for the page. The content a purchase opens is served by your server, which checks the entitlement itself: [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements).

## Managing what was bought

```ts
// app/account.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function manage(): Promise<void> {
  const info = await pb.purchases.me();
  const pro = info.entitlements["pro"];
  if (pro?.manage?.store === "stripe") {
    location.assign(await pb.purchases.portal("https://app.example.com/account"));
  } else if (pro?.manage?.url) {
    location.assign(pro.manage.url); // the App Store's or Google Play's own page
  }
}
```

`portal(returnUrl)` opens Stripe's customer portal for the signed-in customer, where they change, cancel or renew what they bought on the web and how they pay. A subscription bought in the App Store or on Google Play is managed there: its `manage.url` is the store's page.

## A paywall on the web

`pb.purchases.paywall(placement)` is the paywall the project published at a placement — designed in Studio, drawn by the SDK — and `render()` puts it in the page:

```ts
// app/upgrade.ts
import { createClient } from "palbase/web";

const pb = createClient({ url: "https://<ref>.palbase.studio", publishableKey: "pb_<ref>_c…" });

export async function showPaywall(container: HTMLElement): Promise<void> {
  const paywall = await pb.purchases.paywall("settings", { attributes: { plan: "free" } });
  if (!paywall) return; // the web sells nothing
  const view = paywall.render(container, {
    successUrl: "https://app.example.com/thanks",
    cancelUrl: "https://app.example.com/settings",
    links: { terms: "https://example.com/terms", privacy: "https://example.com/privacy" },
    onClose: () => view.destroy(),
  });
}
```

Its purchase button opens Checkout for the package selected. The web has no restore button: a web purchase is the account's, wherever it signs in. See [Paywalls](https://palbase.studio/docs/purchases/paywalls).

## Offers and coupons

`pb.purchases.offers()` lists the catalog's offers the signed-in customer may take now. A discount or a free trial is bought with `checkout({ …, offer: key })`; a grant is taken with `claimOffer(key)`; a code the customer typed is `redeemCoupon(code)`; `offerShown(key)` counts an offer seen. See [Offers & Coupons](https://palbase.studio/docs/purchases/offers).

## Guests

A guest — a user signed in with no account yet — buys like anyone else, and what it buys goes with it:

- A guest that **becomes** an account keeps its id, and its purchases with it: nothing to do.
- A guest that **signs in to an existing account** hands its purchases over. Before signing in, ask for the proof (`pb.purchases.mergeGrant()`, good for 5 minutes); once signed in, spend it (`pb.purchases.merge(grant)`): everything the guest bought goes to the account, for good.

See [Customers › Guests](https://palbase.studio/docs/purchases/customers#guests).

## From a native app

**On iOS**, an app may link out to buy on the web beside In-App Purchase in the App Store's United States storefront (App Review Guideline 3.1.1(a)). `PalbasePurchases` checks the storefront and opens Checkout in the system browser for the signed-in customer; back in the app, what they have is read again:

```swift
import PalbasePurchases

// Show the web button only where Apple lets the app link out.
if await pb.purchases.canOpenWebCheckout() {
    try await pb.purchases.openWebCheckout(product: "pro", plan: "yearly")
}
```

Elsewhere `openWebCheckout` throws `web_checkout_not_allowed` and asks nothing. Stripe sends the customer back to the app's own scheme, its bundle id. The checkout records where it was opened — iOS and the storefront — so the [charts](https://palbase.studio/docs/purchases/charts) can take off what the App Store may charge on such a purchase (nothing today).

**A redemption link** opens the app with `<scheme>://palbase/redeem?token=…`: hand it to `pb.purchases.redeem(_:)` on iOS, `pb.purchases.redeem(link)` on Android, and the web purchase is the app user's.

## Related

- [Connect Stripe](https://palbase.studio/docs/purchases/connect-stripe): the environment's Stripe account
- [Paywalls](https://palbase.studio/docs/purchases/paywalls) · [Offers & Coupons](https://palbase.studio/docs/purchases/offers)
- [Entitlements, Credits & Limits](https://palbase.studio/docs/purchases/entitlements): checking access on your server
- [Web SDK](https://palbase.studio/docs/web/overview): `createClient` and its options
