> The full documentation index: https://palbase.studio/llms.txt

# Secrets

A project keeps its application secrets — a payment provider's key, a signing secret, the project's own secret key for its backend — in its **secrets**, sealed with the project's own key, versioned, and audited on every read and write. They are kept in two sets, `production` and `development`. A machine is started with one set: every secret in it is in the machine's environment by name, so your code reads `process.env.STRIPE_KEY` and nothing else. A machine reads them from its environment; a production value is never read back through the API — only the development set's are, for a backend on your computer ([A production value is never read back](#a-production-value-is-never-read-back)).

## Quick example

In Studio, open the environment's **Secrets** screen and add `STRIPE_KEY`. In the machine's settings (**Cloud › Machines › the machine › Edit settings**), choose the set its **Secrets** start with. The machine rolls out with the value, and the code reads it:

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

A machine names the set it starts with (`secrets`: `production`, `development`, or none) — in Studio on the machine's settings, `palbase machines:update <name> --secrets <set>`, or through the machines module (`PATCH /machines/{name}`). Studio's **Secrets** screen manages the set the environment's machines start with: `production` when none names one yet, and it refuses to choose for you when machines start with different sets.

### A set is not an environment

Every environment has both sets, whatever it is named: the machines of an environment called *Development* may start with its `production` set, or its `development` one. A value written to a set reaches only the machines that start with that set. `palbase secrets:set` says which of the environment's machines those are, and warns when there is none:

```text
$ printf %s "$OWNER_EMAILS" | palbase secrets:set OWNER_EMAILS -E development
Set OWNER_EMAILS v1 in the production set of Acme › koz › Development (development).
warning: no machine of Acme › koz › Development (development) starts with the production set (backend-dev starts with the development set): this value reaches none of them. palbase machines:update <name> --secrets production starts a machine with it; --dev writes the development set.
```

Write the set the machine starts with (`--dev` for `development`), or start the machine with the set you wrote (`palbase machines:update backend-dev --secrets production`). `palbase machines:env:list <name>` lists what a machine starts with, a secret of its set by its name among them — never its value.

## How a machine reads them

- **By name, in its environment.** Each secret of the set is an environment variable of the machine. A name the machine's own `env` also sets wins over the secret — keep a value in one place.
- **A change rolls the machine out.** Writing, rolling back or deleting a secret of the set starts the machine's copies again with the new values, beside the ones that serve, which stop once the new ones are up; nothing restarts in place, and no request meets a gap. The machine's **version does not change** for it: `palbase machines:list` shows `(new secrets or config rolling out)` beside the version until every copy runs with the new value, and `GET /machines/{name}` answers it as `running_config_version` below `config_version`. A machine asleep takes the new values when it wakes. Read a changed value once the note is gone, not by waiting for a new version.
- **A build can wait for them.** A machine's `.env.example` names what it needs: a build whose names the machine's env and secrets do not hold waits (`waiting_config`, with `missing_env`) and rolls out once they are there. See [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds).

A `palbase/backend` app on a machine needs none of its own keys here: the platform starts every machine with its own secret key (`PALBASE_SECRET_KEY`, listed under **Settings › API keys** as `machine: <name>`) and its webhook secret (`PALBASE_WEBHOOK_SECRET`), beside `PALBASE_URL` and `PALBASE_PROJECT_ID`. A secret of the same name set by hand gives way to them. A value missing or malformed stops the boot, naming it.

## Names and sizes

| Rule | Limit |
|---|---|
| Name | An environment-variable name: `A-Z`, `0-9` and `_`, starting with a letter, 128 characters at most. |
| Value | 64 KiB. |
| Secrets per set | 1000. |

## Reading a value while it runs

A machine reads the set it started with from its environment — `process.env.STRIPE_KEY`, or `Secrets.get("STRIPE_KEY")` of `palbase/backend` — and a value changed rolls the machine out with it (`secrets:set` says which machines start with the set). A production value is never read back through the API, by anyone ([A production value is never read back](#a-production-value-is-never-read-back)).

`Palbase.secrets` (or `createServer(…).secrets`) writes the secrets with the project's secret key, lists them, and reads the **development** set's values — what a backend on your computer reads at startup:

```ts
// src/modules/billing/rotation.service.ts
import { Injectable, Palbase } from "palbase/backend";

@Injectable()
export class RotationService {
  /** A new key for the machines: written, never read back; they roll out with it. */
  async rotate(name: string, value: string): Promise<number> {
    return (await Palbase.secrets.putSecret({ path: { environment: "production", name }, body: { value } })).data.version;
  }

  /** Every development value, in one call: what a backend on a developer's computer reads at startup. */
  async development(): Promise<Record<string, string>> {
    return (await Palbase.secrets.getEnvironmentValues({ path: { environment: "development" } })).data.values;
  }
}
```

| Call | What it does |
|---|---|
| `listSecrets({ path: { environment } })` | The set's secrets by name, with their version — never their values. |
| `getSecret({ path: { environment: "development", name } })` | One development secret's current value and version; a production one is `403 secret_write_only`. |
| `getEnvironmentValues({ path: { environment: "development" } })` | Every development value, and every version, in one call; the production set's is `403 secret_write_only`. |
| `putSecret({ path: { environment, name }, body: { value } })` | Writes the value as the secret's next version, creating it if it is new. |
| `listSecretVersions({ path: { environment, name } })` | Its versions, newest first, with the key that wrote each — never their values. |
| `rollbackSecret({ path: { environment, name }, body: { version } })` | Makes an earlier version's value the next version; the history stays whole. |
| `deleteSecret({ path: { environment, name } })` | Forgets the secret and every version of it. |
| `listSecretAudit({ query: { environment?, name? } })` | Every read and write, newest first, with the key that made it and the request id. |

Every write is a new version, so a rotation that goes wrong is a rollback away. A write, a rollback and a delete each emit `secret.changed` — the set, the name, the version and the change, **never the value** — to the project's webhook, so a receiver learns what changed ([Webhooks](https://palbase.studio/docs/server/webhooks)); the machines that start with the set roll out with it.

## Who can read them

A production value: only the machines that start with it — no key, no person, not Studio. A development value: the secret key — a backend on your computer reads the set with your own key. A publishable key ships in apps and is refused by every secrets route; a user's token opens none of them, nor does an environment's token (an agent's) read a value. Every read — a list, one value, the whole set, a machine started with them — is in the audit trail with the id of the key that made it, which is one more reason to give each server its own secret key: the audit then says which one read what, and revoking one shuts out only that server.

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

`--dev` acts on the development set — what a backend run on your computer with `palbase run` or `palbase env:pull` reads, and a machine started with it — and its absence on production, whichever environment `-E` names. `secrets:set`, `secrets:unset` and `secrets:rollback` then say which machines start with that set, and so roll out with the change, or warn that none does ([A set is not an environment](#a-set-is-not-an-environment)). A value is never taken from the command line, where the shell's history would keep it. `palbase secrets:unset <NAME>` takes a secret away. Every command is in the [CLI reference](https://palbase.studio/docs/cli/reference#secrets).

## A production value is never read back

A secret is written, never read again: a `production` value is given to the machines that start with it, and to no one else — not a person, not Studio, not the project's secret key. `GET /secrets/production/{name}` and `GET /secrets/production/values` answer `403 secret_write_only`, and a value is changed by setting it again. Keep where it came from (the payment provider's dashboard) to set it again; its versions, and who wrote each, are listed without their values (`secrets:versions`, `secrets:audit`).

The `development` set is what a backend on your computer reads — `palbase run` and `palbase env:pull` write `PALBASE_SECRETS=development`, and `palbase secrets:get <NAME> --dev` prints one of its values, for an admin. A backend on your computer reads no production secret: `PALBASE_SECRETS=production` is refused before anything is asked. What a running machine prints of its secrets is written over in its builds' tests and in [a command run in it](https://palbase.studio/docs/machines/builds#running-a-command-in-it).

## Related

- [Machines](https://palbase.studio/docs/machines/overview) — a machine's environment, and the secret set it starts with
- [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds) — `.env.example`, and a build that waits for its settings
- [Server SDK Overview](https://palbase.studio/docs/server/overview) — the secret key and `createServer`
- [Webhooks](https://palbase.studio/docs/server/webhooks) — `secret.changed`
