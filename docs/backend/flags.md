> The full documentation index: https://palbase.studio/llms.txt

# Flags

Every project has feature flags and remote configuration: typed values, targeted by conditions, given to single users, read by its apps and kept up to date in them as they change. Apps **read** flags with the publishable key ([Web Flags](https://palbase.studio/docs/web/flags)). Your backend **defines** them, gives users their own values, and reads what any user would see — with the secret key: `Palbase.flags` in a `palbase/backend` app, `createServer(…).flags` anywhere else.

## Quick example

```ts
// src/modules/checkout/checkout.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class CheckoutService {
  /** Turns the new checkout on for one user — a beta tester, a support case. */
  async enableNewFlow(userId: string): Promise<void> {
    await Palbase.flags.putUserValue({ path: { user_id: userId, key: "checkout.new_flow" }, body: { value: true } });
  }

  /** What that user's app reads for the flag now. */
  async newFlowFor(userId: string): Promise<boolean> {
    const { data } = await Palbase.flags.getUserValues({ path: { user_id: userId } });
    return data.values["checkout.new_flow"] === true;
  }
}
```

## How a value is resolved

For each flag, a reader gets, in order:

1. **its own value**, if the user has one (`source: "override"`);
2. else the value of the **first condition that matches**;
3. else the flag's **default**.

A reader with no signed-in user has no values of its own and no percentile, so only the conditions that need neither can match it.

## Defining a flag

`PUT /flags/system/{key}` (`putDefinition`) defines a flag, or changes one:

```ts
// src/modules/checkout/flags.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class FlagsService {
  async onStart(): Promise<void> {
    await Palbase.flags.putDefinition({
      path: { key: "checkout.new_flow" },
      body: {
        value_type: "bool",
        value: false,
        description: "The one-page checkout",
        conditions: [
          { when: "client.platform == 'ios' && client.app_version >= '2.10.0'", value: true },
          { when: "percentile <= 10", value: true },
        ],
      },
    });
    await Palbase.flags.putDefinition({
      path: { key: "home.theme" },
      body: { value_type: "string", value: "light", variants: ["light", "dark", "contrast"] },
    });
  }
}
```

| Field | What it says |
|---|---|
| `value_type` | `bool`, `number`, `string` or `object`. |
| `value` | The default (8 KB at most). |
| `variants` | A string flag's allowed choices: every value — the default, a condition's, a user's — is one of them. |
| `conditions` | Targeting, in order, first match wins; 8 at most, each `{ when, value }`. |
| `description` | What the flag is for. |

A key is dot-separated segments, each a letter then letters, digits and underscores, 128 characters at most. A project defines **200 flags** at most. A write that would change the type under users' values, or leave a user's value outside the choices, is refused; so is a direct write while publishing is on (below). `listDefinitions`, `getDefinition` and `deleteDefinition` read and remove them; deleting a flag removes every user's value of it. Every reader is told of a change at once.

Studio's **Feature flags** screens edit the same definitions and users' values.

### Conditions

A condition's `when` is a small expression language: comparisons over a fixed set of variables, combined with `&&`, `||` and parentheses — no functions, no arithmetic. 512 characters and 16 comparisons at most.

| Variable | Where it comes from | Compared as |
|---|---|---|
| `client.platform` | the `X-Platform` header the app sends | a string |
| `client.locale` | the first language of `Accept-Language` | a string |
| `client.app_version` | `X-Palbase-Client-Version` | a version (`'2.10.0'` is above `'2.9.0'`) |
| `client.os_version` | `X-OS-Version` | a version |
| `percentile` | the signed-in user, hashed with the flag's key: 1 to 100 | a number |
| `server.country` | the country of the address the edge saw | a string (`'TR'`) |
| `server.now` | the server's clock | a time (`'2026-01-01T00:00:00Z'`) |

Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in ['ios', 'android']`, and for strings `startsWith`, `endsWith`, `contains`.

- **A variable outside the table** (`client.foo`) is refused when the flag is written — it could never match.
- **A variable the client did not send** does not match, and the flag falls back to its default.
- **`client.*` is what the client says.** Anyone can send any header, so a `client.*` condition chooses an experience, never access.
- **`percentile` is per flag:** `percentile <= 10` is a different tenth of users for each flag, so one unlucky user is not outside every experiment. It needs a signed-in user.
- **An unresolved country matches nothing**, `!=` included: "not Turkey" is never true of a caller whose country is unknown.
- **`server.now`** cannot be moved by a client's clock, which is what makes a scheduled change real.

## Users' own values

| Call | What it does |
|---|---|
| `putUserValue({ path: { user_id, key }, body: { value } })` | Gives one user their own value for one flag. |
| `putUserValues({ path: { user_id }, body: { values } })` | Many flags for one user (1000 at most). |
| `batchUserValues({ body: { operations: [{ user_id, values }] } })` | Many users at once, 1000 operations at most: all of them, or none. |
| `deleteUserValue({ path: { user_id, key } })` | Removes one; the answer is what resolves for them now. |
| `deleteUserValues({ path: { user_id } })` | Removes all of theirs; their flags resolve as anyone's again. |

Each value is checked against the flag's type and choices. The user's apps are told at once, on the user's own channel (`flags:<ref>:<user_id>`); everyone's are told of a definition change on `flags:<ref>`. The web SDK side of that is in [Web Flags](https://palbase.studio/docs/web/flags).

## Reading as a user

```ts
// src/modules/checkout/preview.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class PreviewService {
  /** What an iOS 2.10 user would read — the conditions see this request's headers as the client's. */
  async asIosUser(userId: string): Promise<Record<string, unknown>> {
    const { data } = await Palbase.flags.getUserValues({
      path: { user_id: userId },
      headers: { "X-Platform": "ios", "X-Palbase-Client-Version": "2.10.0" },
    });
    return data.values;
  }
}
```

`getUserValues` resolves every flag for one user, as their client would read it: their own values and their percentiles, with the client context taken from the call's headers. `getValues` with the secret key resolves for nobody in particular — the defaults and the conditions that need no user.

## Publishing

By default a definition changes the moment it is written. A project that wants changes reviewed turns **publishing** on, once and for good: the live flags become version 1, and from then on a definition changes only through a published draft — a direct `putDefinition` is refused with `409 publish_required`.

| Step | Call |
|---|---|
| Turn publishing on | `activateTemplates({ body: {} })` |
| Start the shared draft from the active version | `createTemplateDraft({ headers: { "If-Match": "flags-active-<version>" }, body: {} })` |
| Write or remove a parameter | `putTemplateParameter` / `removeTemplateParameter`, each with the draft's `If-Match` |
| See what publishing would do | `reviewTemplateDraft()` — each change, how many users' values it touches, and the issues that block it |
| Publish | `publishTemplate({ headers: { "If-Match": "<draft etag>", "Idempotency-Key": "<key>" }, body: { note } })` |
| Go back | `restoreTemplateVersion({ path: { version }, … })` starts a draft from an earlier version |

Every step names the revision it read (`If-Match`), so two people editing the one shared draft never overwrite each other. A draft with issues is refused with `409 template_validation_failed` and the issues. The same `Idempotency-Key` answers the first publication again, and `getPublishReceipt` reads a publication's answer back for a client that lost it.

## Palbase-managed flags

Flags under `palbase.` are the platform's: their type is fixed and they are not deleted.

## Which builds are in use

Apps' reads are counted by installation: `getCurrentInstallations()` answers the builds that read their flags in the last day, by platform and app version, and `getInstallationsDaily({ query: { days } })` the curve, kept 90 days.

## The `Flags` service

A backend reads flags with `Flags`, **for the request's user**: the signed-in caller a handler serves, or a gateway's member. Their own value comes first, then the flag's. `isEnabled` is a plain boolean — a flag that cannot be read is off, and why is logged — and the other reads answer `{ data, error, status }`. A context names another user (`{ userId }`), or nobody (`{ userId: null }`): the flag's own value.

| Call | What it answers |
|---|---|
| `isEnabled(key, context?)` | Whether its value is truthy |
| `get(key, default?, context?)` | Its value; the default stands in when it is absent or cannot be read |
| `getVariant(key, context?)` | `{ name }` of a string value |
| `getAll(context?)` | Every flag: `{ name, enabled, variant? }` |
| `setOverride(key, value)` | The request's user's own value (400 without one) |
| `$asService().setOverrideForUser(userId, key, value)` … | Any user's, by id: `setOverridesForUser`, `clearOverrideForUser`, `clearAllOverridesForUser`, `batchSetOverrides` |

```ts
// palbase/palbase-env.d.ts
declare module "palbase/backend/stack" {
  interface Flags {
    new_checkout: true;
  }
}

export {};
```

```ts
// src/modules/checkout/checkout-flow.controller.ts
import { Controller, Flags, Get } from "palbase/backend";

@Controller("/checkout")
export class CheckoutFlowController {
  @Get("/flow")
  async flow(): Promise<{ flow: "new" | "classic" }> {
    return { flow: (await Flags.isEnabled("new_checkout")) ? "new" : "classic" };
  }
}
```

## Related

- [Web Flags](https://palbase.studio/docs/web/flags) — reading flags in the browser, and their live updates
- [Realtime](https://palbase.studio/docs/backend/realtime) — the socket the updates travel on
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — calls, refusals and retries
- [Test Users](https://palbase.studio/docs/backend/test-users) — users to give values to while you try a flag
