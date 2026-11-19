> The full documentation index: https://palbase.studio/llms.txt

# AI Variables & Secrets

Every command of every session of your project's agents has the project's **variables**: on Palbase's Linux machines and on your own pools ([AI on Your Own Machines](https://palbase.studio/docs/backend/ai-machines)), beside the agent's own (its definition's `env`). A variable is a **secret** or not. A secret says where it may go: the **hosts** a request may carry it to, **where** in that request it may be put, and whether the agent reads it **open** or only ever sees it **sealed**. When an agent sends a sealed secret to a host it is not allowed for, the organization's owners are asked to allow that host or dismiss it.

**What this changes today.** Palbase records what each secret says of itself and checks it as you write it. It does not act on it yet: until the proxy beside the machines ships, every session still gets each value as it does now, as an environment variable, whatever its hosts say, and no ask is recorded, so the list of hosts asked for stays empty. Say the hosts now, and nothing has to change when the proxy starts swapping sealed secrets in.

With the API, a write that carries the value:

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/env/STRIPE_KEY" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<your Stripe secret key>","hosts":["api.stripe.com"],"inject":["header"]}'
# → 200 { "key": "STRIPE_KEY", "secret": true, "hosts": ["api.stripe.com"], "inject": ["header"], "open": false, "updated_at": "…" }
```

Your backend and the CLI do the same ([From your backend and the CLI](#from-your-backend-and-the-cli)), and so does Studio ([In Studio](#in-studio)).

A name is upper-case letters, digits and `_`, starting with a letter, at most 128. `PALBASE_AI_…` is Palbase's own. A value is 1 byte to 32 KiB, with no NUL, and a project sets up to 256 variables. A value is never answered again, nor logged, and a refusal never repeats it. `GET /ai/env` lists every variable with what it says of itself, never a value. `DELETE /ai/env/{key}` removes one: sessions begun from then no longer have it, and the hosts it asked for go with it.

## A secret, or not

A variable is a secret unless you say `"secret": false`, and a write of its value says it again: one that is not a secret is written with `"secret": false` each time. One that is not a secret is given to the agent as it is, with no hosts and no class: a region, a build configuration, a feature switch. Studio shows it as **Not a secret: the agent reads it**. Every value is masked wherever a transcript would show it, a secret's or not.

A new variable written with `"secret": false` needs nothing more. A secret you keep that you make no secret does: the agent reads it from then on, so the write takes `"acknowledge_open": true`, as making a secret open does ([Sealed or open](#sealed-or-open)). Without it the write is refused with `400 open_not_acknowledged`.

## Sealed or open

A secret is **sealed** unless you say otherwise. A sealed secret is a placeholder in the session: the proxy puts the value in only on a request to one of its hosts, at the place it may be put. The agent never reads the value, so it cannot repeat it to anyone.

An **open** secret is one the agent reads as it is. Use it only for a value the agent itself must read, such as a licence key a build tool on the machine reads. It has no hosts and no place to be put.

> The agent reads an open secret's value as it is. Anyone who can drive this project's agents can get it: an app's user if you let them, or a prompt the agent reads (a web page, a file, an issue).

Making a secret open takes `"acknowledge_open": true` beside `"open": true`, your word that you read this. Without it the write is refused with `400 open_not_acknowledged`, its message the warning above. Once a secret is open, a later write that leaves `open` out keeps it open and asks nothing again.

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/env/LICENSE_KEY" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"value":"…","open":true,"acknowledge_open":true}'
```

The work your developers and your server start (a chat your server starts, a turn it sends, a try in Studio) has the open secrets. The work an app's user starts (a member's message, goal or voice) has them only when the project lets it ([App users and open secrets](#app-users-and-open-secrets)).

## A sealed value

The proxy finds a sealed value again in what a host sends back, and hides it there. That sets two rules for a value kept sealed:

- **8 bytes at least, with no line break.** A shorter value could not be found again reliably, and no request header can carry a line break. Either is refused with `400 secret_unusable`. Keep such a value open, or make it no secret.
- **A value a person may have chosen needs your word.** A value of fewer than 16 characters, or of one kind of character only (digits only, lower-case letters only, upper-case letters only, or other characters only), is refused with `400 secret_guessable` unless the write says `"acknowledge_guessable": true`. The proxy hides a sealed value that an allowed host echoes back. An agent can use that to test a guess there: when its guess comes back hidden, the guess was right. Use a random key, keep the value sealed anyway with the acknowledgement, or make it an open secret.

An open secret and a variable that is no secret are the agent's to read anyway: these rules are not asked of them. Only the value a write gives is judged, never one Palbase keeps: an open secret, or a variable that is no secret, is made sealed with its value given again in the same write, or it is refused with `400 value_required`. No answer says anything about a value you cannot read.

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/env/ADMIN_PIN" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"value":"…","hosts":["admin.example.com"],"acknowledge_guessable":true}'
```

## Hosts

`hosts` names where a request may carry a sealed secret, 32 at most. Each is an exact DNS name or `*.` and a name:

| You write | It matches | It does not match |
|---|---|---|
| `api.stripe.com` | `api.stripe.com` | `stripe.com`, `files.stripe.com` |
| `*.stripe.com` | `api.stripe.com`, `files.stripe.com` (one label more) | `stripe.com`, `a.b.stripe.com` |

A host is kept in lower-case ASCII: a name in another script is kept in its punycode form (`bücher.example` is kept as `xn--bcher-kva.example`). These are refused, with `400 invalid_request`:

- **An IP address** (`10.0.0.1`, `::1`): a secret goes to a name a TLS certificate proves.
- **A port, a scheme or a path** (`api.stripe.com:443`, `https://api.stripe.com`): a host is the name alone.
- **A single label** (`localhost`, `intranet`): no public host has one.
- **A public suffix, or a wildcard over one** (`com`, `co.uk`, `github.io`, `vercel.app`, `*.github.io`, `*.vercel.app`): anyone may register a name under it, an attacker too.
- **A wildcard over `palbase.studio` or `palbase.app`** (`*.palbase.studio`, `*.app.palbase.studio`, `*.palbase.app`): every Palbase customer's addresses are under them, an attacker's own project too. Name your own exactly: your environment's address `<ref>.palbase.studio`, a machine's `<name>-<ref>.app.palbase.studio`, a site's `<name>.palbase.app`.

`"hosts": []` takes them all away. Once the proxy ships, a sealed secret with no host goes to none: a request carries its placeholder, and its host is asked about ([Hosts asked for](#hosts-asked-for)). Until then it is delivered as it is, as every value is.

What is a public suffix, and which domain a host is registered under, is decided by one copy of the [public suffix list](https://publicsuffix.org) that Palbase keeps, refreshed with each release of the CLI. The platform and the CLI read the same copy, so they always agree. A suffix added to the list after Palbase's copy is judged as an ordinary name until the next refresh.

## Where a secret is put

`inject` says where in a request to one of its hosts a sealed secret may be put: `header` (the default), `query`, `body`, one or more. A secret is never put in a request over plain `http`, whatever this says.

## Who changes where a secret goes

**With its value**, a write says where the secret goes as before: your server with the secret key, an environment's token (`PALBASE_TOKEN`), or a person. Whoever gives the value may say where it goes.

**Without its value**, changing where a secret you keep goes is a person's change alone: an owner or an admin of the organization, signed in to Studio or to the CLI as themselves. A key or a token never makes it, your project's secret key included: a stolen server key that could allow a host would be one prompt injection away from the secret. These are refused to every key and token with `403 person_required` (an environment's token, on the calls closed to it, with `403 token_out_of_scope`):

- **Changing what a secret says without its value**: its hosts, where it is put, its class, whether it is a secret.
- **Allow** and **Dismiss** of a host asked for ([Hosts asked for](#hosts-asked-for)).
- **Taking an allowance away** ([Agents' allowed hosts](#agents-allowed-hosts)).
- **The setting** `open_secrets_for_app_users` ([App users and open secrets](#app-users-and-open-secrets)).

A member of the organization reads all of it and changes none.

A change without the value is `PUT /ai/env/{key}` with the fields that change, the value left out. A field you leave out keeps what the variable has. That works for a variable set before: one never set is `404 not_found`. Hosts or `inject` given to an open secret seal it, and `"open": false` seals it with the hosts it is given. A variable that stays no secret is refused hosts, `inject` and `open` (`409 not_a_secret`): say `"secret": true` with them to make it one.

## Hosts asked for

Once the proxy ships, an agent that sends a sealed secret to a host it is not allowed for sends the placeholder, not the value, and goes on without it. Palbase keeps each secret and host once, counted, as an **ask**. Until then none is recorded:

```sh
curl "https://<ref>.palbase.studio/ai/env/host-requests?status=asked" -H "apikey: $PALBASE_SECRET_KEY"
# → { "requests": [ { "request_id": "shr_…", "key": "STRIPE_KEY", "agent": null, "origin": null,
#      "host": "api.stripe.com.evil.io", "domain": "evil.io",
#      "status": "asked", "asks": 3, "first_asked_at": "…", "last_asked_at": "…", "decided_at": null } ] }
```

`status` is `asked` (the default), `allowed` or `dismissed`, newest first. `agent` names the agent whose own secret it is (its definition's `env`); `null` is one of the project's variables. `origin` says whose that agent's definition is: `kept` (an agent the project keeps), `chat` (a chat's own definition) or `backend` (your backend's, at each turn). An ask, and an Allow of it, are that agent's alone: a chat's own definition under a kept agent's name is another agent's, and allowing its ask allows nothing for the kept agent.

`domain` is the registrable domain the host is under: its public suffix and one label more, so `api.stripe.com.evil.io` is `evil.io`'s, not Stripe's (a name under `palbase.studio` or `palbase.app` is its own). Whoever holds that domain runs every name under it, so it is what an Allow hands the secret to, and Studio shows it first, the full host under it.

A project keeps 500 asks still asked, 50 of them for one secret and 100 for one agent's own secrets together. An ask past one of these makes room by forgetting an asked one: the secret's own oldest, or else the oldest of the secret that holds the most, and of secrets that hold as many, the one asked last. An agent led to send one secret to host after host, or each of many secrets once, pushes out only its own asks, never an older one of another's, and never a dismissed or an allowed one. A project keeps 500 dismissed and 500 allowed asks; a decision past those forgets the oldest of its kind.

**The owners are emailed.** The organization's owners get an email that names the project and the secret, with a link to the environment's **AI › Secrets** in Studio, where the host is shown. The email does not name the host: the agent chose it, and Palbase sends no text an agent chose under its own name. The email allows nothing itself. They are told at most once a day for each secret and host, at most 3 times a day for one secret, and a project's owners at most 10 times a day, however many asks come and go: a secret sent everywhere does not use up the day another secret's ask is told on. The same ask is the event `ai.secret_host_requested` your backend can take ([Event Hooks](https://palbase.studio/docs/backend/hooks), [Webhooks](https://palbase.studio/docs/server/webhooks)).

**Allow** is `POST /ai/env/host-requests/{request_id}/allow`, for any ask. For one of the project's variables, the host joins its hosts (`POST /ai/env/{key}/hosts` with `{"host": …}` does the same for a host you name). For an agent's own secret, the host joins the project's list of the agents' allowed hosts. Either way the asks it now allows are marked allowed.

Allow a host only when you know the secret is a key for it. An agent can be led by what it reads to send a secret anywhere, and Palbase has not checked who holds the host's domain: once it is allowed, anyone who can drive your agents can use the secret there. A variable that is open or no secret is `409 not_a_sealed_secret`. One with 32 hosts is `409 too_many_hosts`, and a project with 500 allowances `409 too_many_allowances`. An ask is allowed once: allowed again it is `409 already_allowed`, and a host taken away since is asked about again by its next request, which you allow from that new ask.

**Dismiss** is `POST /ai/env/host-requests/{request_id}/dismiss`. It says you do not know why the agent sent the secret there: the ask is never told again, and is still counted. An allowed ask is not undone by a dismiss (`409 already_allowed`): take the host away from the variable's hosts (`PUT /ai/env/{key}`), or take the agent's allowance away, and the next request there is asked about again.

Allow and Dismiss are a person's ([Who changes where a secret goes](#who-changes-where-a-secret-goes)): in Studio, or with the CLI signed in as yourself.

## Agents' allowed hosts

An agent's own secret may go to the hosts its definition names (`env.<KEY>.hosts`, [AI on Your Own Machines](https://palbase.studio/docs/backend/ai-machines#environment-variables-and-secrets)) and to those an owner allowed on its asks. Palbase keeps the second kind as the project's **allowances**, 500 at most, apart from the definition: a definition is the code's or the version published, and Allow does not change it.

```sh
curl "https://<ref>.palbase.studio/ai/env/allowances" -H "apikey: $PALBASE_SECRET_KEY"
# → { "allowances": [ { "allowance_id": "sha_…", "origin": "kept", "agent": "support", "key": "GH_TOKEN",
#      "host": "uploads.github.com", "domain": "github.com", "allowed_at": "…", "allowed_by": "usr_…" } ] }
```

`DELETE /ai/env/allowances/{allowance_id}` takes one away, a person's change: a request the agent sends there carries the placeholder again, and is asked about again.

An allowance belongs to the agent's secret, not to its value: a new value keeps it, so rotating a key does not lose where it may go. It goes with its key. For an agent the project keeps, that is once neither its draft nor its version published has the key, and deleting the agent deletes them all. For a chat's own definition, it is when the last chat whose definition has the key is deleted; one allowance covers every chat whose own definition has that name and key, the name your server gave them. For your backend's agent, which is defined anew at each turn, it is after 30 days with no turn: a key its backend stops naming keeps its allowance until then, and it does nothing while no turn carries the key. A key added again starts with no allowed host, and its asks start over.

## App users and open secrets

`open_secrets_for_app_users` in the AI settings (`PUT /ai/settings`) says whether the work an app's user starts has the project's open secrets. Off (the default), only the work your developers and your server start has them. Turned on, anyone who signs in to your app can drive an agent to read them: keep a key the agent must not give away sealed, with its hosts.

It is a person's setting: in Studio it is **Let app users' work use open secrets**, under an environment's **AI › Settings**. The CLI shows the warning and asks for your yes wherever it is turned on.

## Once the proxy ships

What the proxy does, as measured against it before it ships:

- **The list of allowed hosts is the protection.** Hiding a value a host echoes back is a second line only. It cannot catch a value the host returns changed (reversed, encoded another way) or in pieces. Allow only the hosts a secret belongs to.
- **What a host does with the value is beyond the proxy.** The proxy hides a value only in what the secret's own hosts send back through it. A host that shows the value somewhere else (a public page, another of its names) lets an agent read it there. And what a host gives for the value is no secret Palbase knows: a session token the agent gets by signing in with the key reaches it as it is, and works as the key does until it expires. Every proxy that puts secrets into requests has this limit. Give a key only the rights the agent's work needs.
- **The machine sets it up itself.** Each machine sets the proxy's environment variables and its certificate authority for the session: you set none.
- **A placeholder looks like the key.** It keeps a vendor's known prefix where there is one, so an SDK that checks the prefix works, and never contains a character of the secret.
- **A sealed value's length is not hidden.** An agent can learn how long a value is, never what it is: from where an allowed host, or the proxy's own limits (`431`, `413`), start refusing a request that carries the placeholder many times. Most API keys' lengths are public anyway; a value inside a longer one shows its own (a password inside a `DATABASE_URL`).
- **Some clients need a line of setup.** `stripe-python` brings its own certificate bundle, and its requests get no value until the code sets `stripe.ca_bundle_path = "/etc/ssl/certs/ca-certificates.crt"`. `stripe-node` uses its own HTTPS agent and goes around the proxy until it is given one that follows it, on Node 24: `new Stripe(key, { httpAgent: new https.Agent({ proxyEnv: process.env }) })`.
- **WebSockets.** Node's built-in `WebSocket` and Python's `websockets` go through the proxy. The npm `ws` package ignores it and fails closed: it never reaches the host.
- **The proxy reads the agent's HTTPS traffic to find placeholders.** A client that pins its own certificates fails once for a host, and the proxy then passes that host through untouched for a while: a placeholder sent to a host being passed through is not noticed, and no ask is made. A host one of the project's secrets may go to is never passed through unless you name it, so a pinned client fails there every time.
- **ssh and `git://`** go through as they are: a secret is never put in them.
- **Four ports, each held to its protocol.** A machine reaches the internet on four ports: 22 for ssh, 9418 for `git://`, 80 for HTTP and 443 for TLS. A connection must speak its port's protocol, and its client must speak first, within 30 seconds; anything else is closed.
- **ssh over port 443 is not carried.** Settings written for networks that close port 22 — `ssh.github.com` on port 443, `altssh.gitlab.com:443`, `altssh.bitbucket.org:443` in `~/.ssh/config` — fail. The same repositories answer on port 22: remove the alternate host from `~/.ssh/config`. If a machine needs that host, an owner can name it as a host the machine's traffic goes to untouched.
- **Limits.** A session may hold 256 connections and 256 requests at once. A request whose body carries a secret is held in memory while the secret is put in, up to 4 MiB a body and 32 MiB a machine at once. Past a limit the answer is `503` with `Retry-After`, and a client retries after the time it says. A body over 4 MiB is `413`, and secrets put into a request's headers and query that add more than 64 KiB are `431`.

## In Studio

An environment's **AI › Secrets** lists its variables, each as a sealed secret, an open one or no secret, with its hosts and where it is put, and never a value. An owner or an admin of the organization adds one, sets a new value (the field is written, never filled in), changes its hosts, where it is put and its class without retyping it, and removes one. Adding hosts offers those of common services (Stripe, GitHub, npm, OpenAI, Anthropic, Vercel, Slack) and the environment's own addresses: its project address and each of its machines'. Making a secret open, or a kept secret no secret, shows the warning above with a box to tick before it saves. A sealed value under 8 bytes is not saved, with the open class offered instead, and one that looks chosen by a person shows the warning of [A sealed value](#a-sealed-value) with a box to keep it sealed anyway.

Below, **Hosts asked for** lists the asks by status, each by the domain its host is under with the full host beneath, and says whose secret it is: a project variable, an agent you keep, your backend's agent, or a chat's own definition. An owner or an admin allows an ask, after a confirmation that names the domain and says nobody has checked who holds it, or dismisses it, a project variable's and an agent's own alike. **Agents' allowed hosts** lists the allowances, each with who allowed it and when, and an owner or an admin takes one away. A member of the organization reads every list and changes nothing.

## From your backend and the CLI

Your backend writes a variable with its value, and reads the lists, with the project's secret key:

```ts
import { Palbase } from "palbase/backend";

await Palbase.ai.env.set("STRIPE_KEY", process.env.STRIPE_SECRET_KEY!, { hosts: ["api.stripe.com"], inject: ["header"] });
await Palbase.ai.env.set("LICENSE_KEY", process.env.LICENSE_KEY!, { open: true, acknowledgeOpen: true });
await Palbase.ai.env.set("ADMIN_PIN", process.env.ADMIN_PIN!, { hosts: ["admin.example.com"], acknowledgeGuessable: true });
await Palbase.ai.env.set("REGION", "eu-west-1", { secret: false });

const variables = await Palbase.ai.env.list(); // each key, secret, hosts, inject, open and updatedAt: never a value
const asked = await Palbase.ai.env.hostRequests.list({ status: "asked" }); // requestId, key, agent, origin, host, domain, asks, firstAskedAt, lastAskedAt
const allowances = await Palbase.ai.env.allowances.list(); // allowanceId, origin, agent, key, host, domain, allowedAt, allowedBy
```

The SDK's `Palbase.ai.env.update(key, change)`, `Palbase.ai.env.hostRequests.allow(requestId)`, `Palbase.ai.env.hostRequests.dismiss(requestId)` and `Palbase.ai.env.allowances.remove(allowanceId)` make the person's calls. Made with the secret key, they are refused with `403 person_required`.

With the CLI, the value goes on standard input so it never sits on a command line. Signed in as yourself, the CLI also makes a person's changes:

```sh
palbase ai:env:set STRIPE_KEY --value-stdin --host api.stripe.com --inject header < stripe-key.txt
palbase ai:env:set LICENSE_KEY --value-stdin --open --acknowledge-open < license.txt
palbase ai:env:set ADMIN_PIN --value-stdin --host admin.example.com --acknowledge-guessable < pin.txt
palbase ai:env:set REGION --value-stdin --not-secret < region.txt
palbase ai:env:list

palbase ai:env:set STRIPE_KEY --host api.stripe.com --host '*.stripe.com'
palbase ai:env:hosts:requests --status asked
palbase ai:env:hosts:allow shr_…
palbase ai:env:hosts:dismiss shr_…
palbase ai:env:hosts:allowances
palbase ai:env:hosts:allowances:remove sha_…
palbase ai:settings:set --open-secrets-for-app-users yes
```

Without `--value-stdin`, `--host`, `--inject` and `--open` change what a variable says and keep its value. `--host` names all its hosts, replacing those it had, and `--host none` takes them all away. `--not-secret` is said with the value: a secret made no secret is `--value-stdin --not-secret --acknowledge-open`. At a terminal, making a secret open or no secret without `--acknowledge-open`, or keeping sealed a value a person may have chosen without `--acknowledge-guessable`, shows the warning and asks for your yes. `-y` does not give it.

## Refusals

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_request` | A name, a value or a host that is not one (see [Hosts](#hosts)), more than 32 hosts, an `inject` other than `header`, `query`, `body`, or an open secret given hosts or `inject`. |
| 400 | `open_not_acknowledged` | `open: true`, or a kept secret made no secret, without `acknowledge_open: true`. Its message is the warning. |
| 400 | `secret_unusable` | A sealed value under 8 bytes, or with a line break or a NUL. |
| 400 | `secret_guessable` | A sealed value a person may have chosen, without `acknowledge_guessable: true`. |
| 400 | `value_required` | An open secret, or a variable that is no secret, made sealed without its value in the same write. |
| 403 | `person_required` | A key or a token changed what a secret says without its value, allowed or dismissed an ask, took an allowance away, or named `open_secrets_for_app_users`. |
| 403 | `token_out_of_scope` | An environment's token made one of those calls where it is closed to it. |
| 404 | `not_found` | A change without a value to a variable never set, or an Allow, a dismiss or a removal of what is not there. |
| 409 | `not_a_secret` | A variable that stays no secret given hosts, `inject` or `open`. |
| 409 | `not_a_sealed_secret` | Allow of a variable that is open or no secret. |
| 409 | `too_many_hosts` | Allow of a secret that has 32 hosts. |
| 409 | `too_many_allowances` | Allow of an agent's ask when the project has 500 allowances. |
| 409 | `already_allowed` | Allow or dismiss of an ask that was allowed. |
| 409 | `too_many_variables` | A new variable past the project's 256. |

## Related

- [AI on Your Own Machines](https://palbase.studio/docs/backend/ai-machines): runner pools, and an agent's own variables and setup script
- [AI](https://palbase.studio/docs/backend/ai): agents, chats and their workspaces
- [Event Hooks](https://palbase.studio/docs/backend/hooks): `ai.secret_host_requested` in your backend
- [Secrets](https://palbase.studio/docs/backend/secrets): your backend's own secrets, kept apart from these
