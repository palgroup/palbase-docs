> The full documentation index: https://palbase.studio/llms.txt

# Secrets

A project keeps its application secrets — a payment provider's key, a signing secret, the project's own secret key for its backend — in its **secrets**, sealed with the project's own key, versioned, and audited on every read and write. They are kept in two sets, `production` and `development`. A machine is started with one set: every secret in it is in the machine's environment by name, so your code reads `process.env.STRIPE_KEY` and nothing else. A program that wants a value while it runs — or one that is not a machine — reads it with the secret key through the secrets module, `Palbase.secrets`.

## Quick example

In Studio, open the environment's **Secrets** screen and add `STRIPE_KEY`. In the machine's settings (**Backend › Machines › the machine › Edit settings**), choose the set its **Secrets** start with. The machine rolls out with the value, and the code reads it:

```ts
// src/modules/billing/billing.service.ts
import { Injectable } from "palbase/backend";

@Injectable()
export class BillingService {
  // Read once, at boot: a secret that changes rolls the machine out with the new value.
  private readonly stripeKey = required("STRIPE_KEY");

  authorization(): string {
    return `Bearer ${this.stripeKey}`;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: add it to the project's secrets and start the machine with them`);
  return value;
}
```

## The two sets

| Set | What it is for |
|---|---|
| `production` | What the machines that serve your users start with. |
| `development` | A second set, for machines and programs that must not see production's values. |

A machine names the set it starts with (`secrets`: `production`, `development`, or none) — in Studio on the machine's settings, or through the machines module (`PATCH /machines/{name}`). Studio's **Secrets** screen manages the set the environment's machines start with: `production` when none names one yet, and it refuses to choose for you when machines start with different sets.

## How a machine reads them

- **By name, in its environment.** Each secret of the set is an environment variable of the machine. A name the machine's own `env` also sets wins over the secret — keep a value in one place.
- **A change rolls the machine out.** Writing, rolling back or deleting a secret of the set starts the machine's new version with the new values beside the version that serves; nothing restarts in place, and no request meets a gap.
- **A build can wait for them.** A machine's `.env.example` names what it needs: a build whose names the machine's env and secrets do not hold waits (`waiting_config`, with `missing_env`) and rolls out once they are there. See [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds).

A `palbase/backend` app on a machine needs none of its own keys here: the platform starts every machine with its own secret key (`PALBASE_SECRET_KEY`, listed under **Settings › API keys** as `machine: <name>`) and its webhook secret (`PALBASE_WEBHOOK_SECRET`), beside `PALBASE_URL` and `PALBASE_PROJECT_ID`. A secret of the same name set by hand gives way to them. A value missing or malformed stops the boot, naming it.

## Names and sizes

| Rule | Limit |
|---|---|
| Name | An environment-variable name: `A-Z`, `0-9` and `_`, starting with a letter, 128 characters at most. |
| Value | 64 KiB. |
| Secrets per set | 1000. |

## Reading a value while it runs

`Palbase.secrets` (or `createServer(…).secrets`) reads and writes the secrets with the project's secret key:

```ts
// src/modules/billing/rotation.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class RotationService {
  /** The current value, read now rather than at boot. */
  async current(name: string): Promise<string> {
    return (await Palbase.secrets.getSecret({ path: { environment: "production", name } })).data.value;
  }

  /** Every value of the set, in one call: what a program outside a machine reads at startup. */
  async all(): Promise<Record<string, string>> {
    return (await Palbase.secrets.getEnvironmentValues({ path: { environment: "production" } })).data.values;
  }
}
```

| Call | What it does |
|---|---|
| `listSecrets({ path: { environment } })` | The set's secrets by name, with their version — never their values. |
| `getSecret({ path: { environment, name } })` | One secret's current value and version. |
| `getEnvironmentValues({ path: { environment } })` | Every value of the set, and every version, in one call. |
| `putSecret({ path: { environment, name }, body: { value } })` | Writes the value as the secret's next version, creating it if it is new. |
| `listSecretVersions({ path: { environment, name } })` | Its versions, newest first, with the key that wrote each — never their values. |
| `rollbackSecret({ path: { environment, name }, body: { version } })` | Makes an earlier version's value the next version; the history stays whole. |
| `deleteSecret({ path: { environment, name } })` | Forgets the secret and every version of it. |
| `listSecretAudit({ query: { environment?, name? } })` | Every read and write, newest first, with the key that made it and the request id. |

Every write is a new version, so a rotation that goes wrong is a rollback away. A write, a rollback and a delete each emit `secret.changed` — the set, the name, the version and the change, **never the value** — to the project's webhook, so a receiver learns what changed and reads it with its own key ([Webhooks](https://palbase.studio/docs/server/webhooks)).

## Who can read them

Only the secret key. A publishable key ships in apps and is refused by every secrets route; a user's token opens none of them. Every read — a list, one value, the whole set — is in the audit trail with the id of the key that made it, which is one more reason to give each server its own secret key: the audit then says which one read what, and revoking one shuts out only that server.

## The `Secrets` service

A backend reads a secret with `await Secrets.get("NAME")`: the value or `null`. It reads the machine's environment — the set the machine starts with — so a changed secret arrives with the machine rolled out again. A name the platform puts there itself (`PALBASE_URL`, `PALBASE_SECRET_KEY`, `PALBASE_DB_URL` …) is not the project's secret, and answers `null`.

The names it takes are the ones the project holds: the CLI's `types:pull` writes them into `palbase/palbase-env.d.ts`, and a name the project does not hold does not compile.

```ts
// palbase/palbase-env.d.ts
declare module "palbase/backend/stack" {
  interface Secrets {
    STRIPE_KEY: true;
  }
}

export {};
```

```ts
// src/modules/billing/stripe-key.service.ts
import { Injectable, Secrets } from "palbase/backend";

@Injectable()
export class StripeKey {
  async get(): Promise<string> {
    const key = await Secrets.get("STRIPE_KEY");
    if (!key) throw new Error("STRIPE_KEY is not among the secrets this machine started with");
    return key;
  }
}
```

## From the CLI

```sh
printf %s "$STRIPE_KEY" | palbase secrets:set STRIPE_KEY   # production: the value is read from stdin
printf %s "sk_test_…" | palbase secrets:set STRIPE_KEY --dev
palbase secrets:list                                       # names and versions, never values
palbase secrets:versions STRIPE_KEY
palbase secrets:rollback STRIPE_KEY --version 3            # a new version with version 3's value
palbase secrets:audit --name STRIPE_KEY                    # who read and wrote it, and when
```

`--dev` acts on the development set — what a backend run on your computer with `palbase run` or `palbase env:pull` reads — and its absence on production. A value is never taken from the command line, where the shell's history would keep it. `palbase secrets:get <NAME>` prints one value, for an admin; `palbase secrets:unset <NAME>` takes a secret away. Every command is in the [CLI reference](https://palbase.studio/docs/cli/reference#secrets).

## Related

- [Machines](https://palbase.studio/docs/machines/overview) — a machine's environment, and the secret set it starts with
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — `.env.example`, and a build that waits for its settings
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — the secret key and `createServer`
- [Webhooks](https://palbase.studio/docs/server/webhooks) — `secret.changed`
