> The full documentation index: https://palbase.studio/llms.txt

# AI on Your Own Machines

A chat that works in a [workspace](https://palbase.studio/docs/backend/ai#workspaces) runs its agent's commands on a machine. By default that is one of Palbase's own Linux machines, and nothing is set up. When the work needs a machine of yours (a Mac that builds an iOS app, a Linux box with a GPU or a toolchain of its own), make a **runner pool**, enrol your machines into it with `palbase-agent`, and start the chat on that pool. You run the machines and decide how many there are. Palbase tells you what they hold.

Pools, keys and machines are managed through the API (with the secret key), from your backend (`Palbase.ai.pools`, `Palbase.ai.machines`) or with the CLI (`palbase ai:pools:create`, `palbase ai:pools:state`, `palbase ai:machines:cordon` and the rest below). Studio has no page for them.

```ts
import { Palbase } from "palbase/backend";

await Palbase.ai.pools.create({ name: "mac-builds", os: "macos", arch: "arm64" });
const minted = await Palbase.ai.pools.keys.create("mac-builds", { label: "mac-mini-1" }); // minted.key and minted.enrollUrl, said once
const state = await Palbase.ai.pools.state("mac-builds"); // machines, capacityTotal, capacityUsed, waiting
await Palbase.ai.machines.cordon(state.machines[0].id);
```

```sh
palbase ai:pools:create mac-builds --os macos --arch arm64
palbase ai:pools:keys:create mac-builds --label mac-mini-1
palbase ai:pools:state mac-builds
palbase ai:machines:cordon <machine id>
palbase ai:machines:delete <machine id>
```

## Pools

A pool is of one type: an operating system (`linux` or `macos`) and an architecture (`amd64` or `arm64`). A machine of another type cannot enrol into it. Keep Macs and Linux machines in pools of their own.

```sh
curl -X POST "https://<ref>.palbase.studio/ai/pools" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"name":"mac-builds","os":"macos","arch":"arm64"}'
# → 201 { "id": "rpl_…", "name": "mac-builds", "os": "macos", "arch": "arm64", "created_at": "…" }
```

A pool is named in the API by its id or its name. `GET /ai/pools` lists the project's pools, each with its machines, the sessions they take at once (`capacity_total`), the sessions they hold now (`capacity_used`) and the sessions waiting for a place (`waiting`). `DELETE /ai/pools/{pool}` deletes a pool with no machine left in it. One that still has machines is refused with `409 pool_not_empty`.

## Enrolling a machine

Each machine enrols with a single-use key. `POST /ai/pools/{pool}/keys { label? }` mints one and says it once, with where the machine enrols: `enroll_url`, and `enroll` (its `url`, and a `server_name` and `ca_certificate` when the door's certificate needs them). Install `palbase-agent` on the machine (the same binary on macOS and Linux, arm64 and amd64; it goes into `~/.local/bin` and needs no root):

```sh
curl -fsSL https://get.palbase.studio/agent/install.sh | sh
```

Save the key to a file on the machine, then enrol it:

```sh
palbase-agent enroll --url "$ENROLL_URL" --key-file pool.key --capacity 3
```

`palbase-agent enroll` installs the service that runs the agent (launchd on macOS, a systemd user unit on Linux), starts it and returns. On a machine with no service manager, such as a container, the machine is enrolled all the same and the command says its service was not installed: run `palbase-agent` there in the foreground, as the container's command.

When `enroll` has a `server_name`, add `--server-name <server_name>`. When it has a `ca_certificate`, save it to a file and add `--ca-file <file>`.

`--capacity` is how many sessions the machine runs at once: 1 or more, 1 when not given. Each session is one chat's workspace, so size it by what one build takes (on a 64 GB Mac, 3 to 6). The key is used up as the machine enrols. A key used a second time is refused, and so is a machine whose type is not the pool's. `GET /ai/pools/{pool}/keys` lists a pool's keys (never the key itself; `last_used_at` is when a machine last enrolled with one), and `POST /ai/pool-keys/{key}/revoke` revokes one nobody used. Your project's key never goes to the machine.

A session's files are kept on the machine under the agent's own state directory (`~/.local/state/palbase-agent/workspaces` on Linux, `~/Library/Application Support/Palbase Agent/workspaces` on macOS).

On macOS the sessions of one machine are **not isolated from each other**: one session's commands can reach another's files. On Linux each session runs in a sandbox of its own. Put a machine into a pool only for work that may share it.

### The network and secrets on your Linux machines

On a Linux machine of yours, a session's commands have no network of their own. The agent runs a proxy for each workspace, and that workspace's commands reach the internet through it alone: public hosts only, never your local network or the machine's own ports. A sealed secret stays in that proxy. The commands see a placeholder, and the proxy puts the value into a request to one of the secret's hosts. An open secret is in the command's environment, as on a Mac ([Sealed or open](https://palbase.studio/docs/backend/ai-env#sealed-or-open)). A placeholder sent to a host its secret does not allow is sent as it is, and the host is asked about ([Hosts asked for](https://palbase.studio/docs/backend/ai-env#hosts-asked-for)).

The machine configures standard proxy environment variables (`HTTPS_PROXY`) and its session certificate bundle (`SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`) automatically for each command. Clients that bring their own certificate bundle should point to `$SSL_CERT_FILE` (see [Outbound proxy behavior](https://palbase.studio/docs/backend/ai-env#outbound-proxy-behavior)). HTTP and HTTPS reach allowed public hosts through the proxy; SSH and `git://` require explicit proxy configuration if needed.

The proxy requires Linux 5.14 or newer and `bubblewrap`. On an older kernel, or when `palbase-agent` runs inside a container without sandboxing support, sessions run without network access and receive open secrets only; the agent logs this at startup.

What a session's commands write is masked with the open values its turn's commands were given: a command's output, a background task's log, and a file read or searched through the agent. Three things are not masked:

- A value first given after a background task started is not masked as that task writes its log. It is masked when the log is read.
- After the agent restarts, a value is masked again once a command carries it.
- A workspace's changes (its diff, and a pull request made from it) show files as they are. A value written into a tracked file goes with them.

A background task's output that can no longer be masked stops reaching its log, and the task's status says so. The next line the task writes may end it, as when a terminal closes.

On Linux, `palbase-agent` runs as a systemd user unit: stopping, restarting or updating the agent ends the background tasks its sessions started. On a Mac they keep running, and their output keeps being masked after the agent restarts: what masks a task's output lives as long as the task, and as long as anything the task started (even outside its process group) keeps writing to that output.

## Starting a chat on a pool

Name the pool when the chat is started:

```sh
curl -X POST "https://<ref>.palbase.studio/ai/chats" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"agent":"ios-builder","pool":"mac-builds","workspace":{"repos":[{"repo":"shop-app","branch":"agent/42"}]},"members":[{"user_id":"usr_…","owner":true}]}'
```

Every turn of the chat runs on that pool's machines, and so does every fork of it. A pool the project does not have is `400`. A chat that names a pool works in a workspace. A chat that names none runs on Palbase's own Linux machines. When every machine of the pool is full, the session waits for a place. It shows in the pool's `waiting` until one frees or you add a machine.

## Scaling the pool

Palbase sends no signal to scale on. Your own loop reads the pool's state, as often as you like, and adds or removes machines. A run it misses is put right by the next one.

`GET /ai/pools/{pool}/state` answers:

| Field | What it is |
| --- | --- |
| `machines[]` | Each machine: `id`, `label`, `os`, `arch`, `state` (`online`, `offline`, `cordoned`), `capacity`, `used`, `idle_since` (null while it holds a session), `last_seen_at`, `registered_at`. |
| `capacity_total`, `capacity_used` | The sessions the pool's machines take at once, and hold now. |
| `waiting` | Sessions waiting for a place: parked until a machine of the pool has room. |
| `oldest_waiting_since` | Since when the oldest has waited (null: none waits). |

To grow, enrol another machine. To shrink, **cordon** a machine first: `POST /ai/machines/{machine}/cordon`, and it takes no new session while the ones it holds run on. Once its `used` is 0, `DELETE /ai/machines/{machine}` removes it from the pool. A machine not cordoned is refused with `409 machine_not_cordoned`, and one that still holds a session with `409 machine_busy`. `POST /ai/machines/{machine}/resume` lets a cordoned machine take sessions again. Nothing is lost when a machine goes: a workspace's files are kept in its store, not on the machine.

A loop of your backend's, run every minute:

```ts
// src/modules/builds/scale.ts
const base = process.env.PALBASE_URL!; // https://<ref>.palbase.studio
const key = process.env.PALBASE_SECRET_KEY!;

type Machine = { id: string; state: "online" | "offline" | "cordoned"; used: number; idle_since: string | null };
type PoolState = { machines: Machine[]; waiting: number; oldest_waiting_since: string | null };

async function call(method: string, path: string): Promise<Response> {
  const res = await fetch(base + path, { method, headers: { apikey: key } });
  if (!res.ok && res.status !== 409) throw new Error(`${method} ${path}: ${res.status}`);
  return res;
}

/** Adds a machine while sessions wait; cordons one idle for 15 minutes, and returns it once it holds nothing. */
export async function scale(pool: string, rent: () => Promise<void>, giveBack: (machineId: string) => Promise<void>): Promise<void> {
  const state = (await (await call("GET", `/ai/pools/${pool}/state`)).json()) as PoolState;
  if (state.waiting > 0) {
    await rent(); // a new machine, enrolled with a key from POST /ai/pools/{pool}/keys
    return;
  }
  const idleSince = Date.now() - 15 * 60_000;
  for (const m of state.machines) {
    if (m.state === "cordoned" && m.used === 0) {
      if ((await call("DELETE", `/ai/machines/${m.id}`)).status === 204) await giveBack(m.id);
    } else if (m.state === "online" && m.idle_since !== null && Date.parse(m.idle_since) < idleSince) {
      await call("POST", `/ai/machines/${m.id}/cordon`);
    }
  }
}
```

## Environment variables and secrets

Every command of every session of the project's agents has the project's variables, on every pool: Palbase's Linux machines and your own Linux and Mac machines. They are masked wherever a transcript would show them. A secret also says where it may go: the hosts a request may carry it to, where in that request it is put, and whether it is sealed or open ([AI Variables & Secrets](https://palbase.studio/docs/backend/ai-env)). A sealed secret is a placeholder in a command's environment, and the proxy beside the machine puts its value in only on a request to one of its hosts: Palbase's Linux machines have that proxy, and so do your own Linux machines whose agent runs it; a Mac has none, and neither has a Linux machine whose agent does not run it (an older agent, or one without bubblewrap), so a command there gets the variables that are no secret and the open secrets, and no sealed secret (the agent is told which key was not set, and why).

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/env/NPM_TOKEN" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"value":"npm_…","secret":true,"hosts":["registry.npmjs.org"]}'
```

A name is upper-case letters, digits and `_`, starting with a letter. `PALBASE_AI_…` is reserved. A value is up to 32 KiB, and a project sets up to 256 variables. A value is sealed where the sessions run and is never answered again, nor logged. `GET /ai/env` lists the names, whether each is a secret, its hosts, where it is put, whether it is open, and when each was set. `DELETE /ai/env/{key}` removes one. From your backend: `Palbase.ai.env.set("NPM_TOKEN", value)`, `Palbase.ai.env.list()`, `Palbase.ai.env.unset("NPM_TOKEN")`. With the CLI, give the value on standard input so it never sits on a command line: `palbase ai:env:set NPM_TOKEN --value-stdin < token.txt`, and `palbase ai:env:unset NPM_TOKEN`. A secret's hosts, its class and the rest, from your backend and the CLI: [From your backend and the CLI](https://palbase.studio/docs/backend/ai-env#from-your-backend-and-the-cli).

On a machine of yours a value reaches that machine, and the session's commands read it there. Give a pool's machines only what their work needs.

**An agent's own.** An agent's definition carries its own variables (`env`, 64 at most) and a **setup script** (`setup`), which each of its sessions runs once at its start, before the agent's first command, on every pool. Use it to install what the work needs (`brew bundle`, `npm ci`) on a machine you did not prepare.

```json
{
  "instructions": "You build the iOS app and fix what fails.",
  "model": "claude-sonnet-5-5",
  "env": {
    "SENTRY_AUTH_TOKEN": { "value": "sntrys_…", "hosts": ["sentry.io", "*.sentry.io"], "inject": ["header"] },
    "CONFIGURATION": { "value": "Debug", "secret": false }
  },
  "setup": "brew bundle --file=Brewfile && bundle install"
}
```

Each variable of `env` is a value alone, or an object that says what it says of itself, as a project's variable does: `{ "value", "hosts", "inject", "open", "secret", "acknowledge_open", "acknowledge_guessable" }`.

- **A value alone** is a sealed secret with no host yet. Its value follows a sealed value's rules: 8 bytes at least, with no line break, and one a person may have chosen only with `"acknowledge_guessable": true` ([A sealed value](https://palbase.studio/docs/backend/ai-env#a-sealed-value)). A short value that is no secret, such as `"Debug"`, is refused written alone (`400 secret_unusable`): write it with `"secret": false`.
- **`"secret": false`** is a variable that is no secret: the agent reads it as it is, with no hosts and no class, and none of those rules apply. Making a secret the definition kept no secret takes `"acknowledge_open": true`, as making one open does: the agent reads it from then on. Making one the definition kept open or no secret sealed again takes its value in the same write (`400 value_required`): only a value given is judged.
- **`hosts` and `inject`** are a sealed secret's ([Hosts](https://palbase.studio/docs/backend/ai-env#hosts), [Where a secret is put](https://palbase.studio/docs/backend/ai-env#where-a-secret-is-put)). **`"open": true`** makes it one the agent reads as it is, written with `"acknowledge_open": true` the first time ([Sealed or open](https://palbase.studio/docs/backend/ai-env#sealed-or-open)).

A host one of these secrets is sent to and not allowed for is asked about as a project variable's is. Allow puts the host on the project's list of the agents' allowed hosts, beside the definition's `env.<KEY>.hosts`, without changing the definition; deleting the agent deletes them ([Agents' allowed hosts](https://palbase.studio/docs/backend/ai-env#agents-allowed-hosts)). The variables and setup script of one definition are prepared once for the sessions that use them, at their first turn in a workspace. A chat started with a definition of its own that has variables or a setup script gets its own, as each version of an agent does: one per chat, shared with the chat's forks, never with another chat whose definition holds the same values, and forgotten after a week unused. Each takes a few calls at that first turn, before the agent's first command; a backend that starts many chats with definitions of their own pays that once per chat. In a backend's `Palbase.ai.agent(name, define)`, the same entry is `{ value, hosts, inject, open, secret, acknowledgeOpen, acknowledgeGuessable }`:

```ts
// src/modules/builds/builder.agent.ts
import { Palbase } from "palbase/backend";

export const builder = Palbase.ai.agent("builder", () => ({
  instructions: "You build the iOS app and fix what fails.",
  env: {
    SENTRY_AUTH_TOKEN: { value: process.env.SENTRY_AUTH_TOKEN!, hosts: ["sentry.io", "*.sentry.io"], inject: ["header"] },
    CONFIGURATION: { value: "Debug", secret: false },
  },
  setup: "brew bundle --file=Brewfile && bundle install",
}));
```

An agent's variables sit beside the project's: give them names of their own. Palbase keeps a definition's values sealed with your project's own key, never readable in its database, and opens them only for the sessions that run with them. A value is never answered again: an agent read back (`GET /ai/agents/{name}`) shows each name with an empty value. An agent written back with an empty value keeps the value it has, so a definition read, changed and put again loses nothing. What such a kept secret says of itself (its hosts, where it is put, its class, whether it is a secret) is changed without its value by a person alone: an owner or an admin signed in to Studio or the CLI. A key or a token is refused it (`403 person_required`) and gives the value with the change instead; rolling an agent back to a version that says otherwise is a person's too ([Who changes where a secret goes](https://palbase.studio/docs/backend/ai-env#who-changes-where-a-secret-goes)). A new name needs its value. Each definition's variables and script are written once, where its sessions run: an agent the project keeps as it is published or rolled back, an agent your backend defines at each turn (or a chat's own definition) at its first turn. Two definitions that differ, such as two chats' own or a version a chat stays on and the one published, never share them: each turn runs with its own definition's.

## macOS VM Profiles & Key Rotation

On Apple Silicon macOS hosts, `palbase-agent` can run isolated VM profiles (`macos-xcode` for native `xcodebuild` / SwiftPM builds — up to 2 concurrent macOS VMs per host — and `linux-vm` for Linux builds):

```bash
palbase-agent vm init --profile macos-xcode
palbase-agent vm status
```

Each enrolled runner rotates its client credentials in place without changing its `runner_id`:

```bash
palbase-agent rotate-key
```

## Related

- [AI](https://palbase.studio/docs/backend/ai): agents, chats, runtime environments and workspaces
- [Workspaces](https://palbase.studio/docs/backend/workspaces): standalone workspaces, sync and S3 access
- [AI Variables & Secrets](https://palbase.studio/docs/backend/ai-env): a secret's hosts, sealed or open, its value's rules, the hosts it asked for and the agents' allowed hosts
- [Secrets](https://palbase.studio/docs/backend/secrets): your backend's own secrets
