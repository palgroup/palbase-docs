> The full documentation index: https://palbase.studio/llms.txt

# AI on Your Own Machines

A chat that works in a [workspace](https://palbase.studio/docs/backend/ai#workspaces) runs its agent's commands on a machine. By default that is one of Palbase's own Linux machines, and nothing is set up. When the work needs a machine of yours (a Mac that builds an iOS app, a Linux box with a GPU or a toolchain of its own), make a **runner pool**, enrol your machines into it with the `palai` agent, and start the chat on that pool. You run the machines and decide how many there are. Palbase tells you what they hold.

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

Each machine enrols with a single-use key. `POST /ai/pools/{pool}/keys { label? }` mints one and says it once, with where the machine enrols: `enroll_url`, and `enroll` (its `url`, and a `server_name` and `ca_certificate` when the door's certificate needs them). Install the `palai` agent on the machine (the same binary on macOS and Linux, arm64 and amd64; it goes into `~/.local/bin` and needs no root):

```sh
curl -fsSL https://palgroup.github.io/palai/install.sh | sh
```

Save the key to a file on the machine, then enrol it:

```sh
palai enroll --url "$ENROLL_URL" --key-file pool.key --capacity 3
```

`palai enroll` installs the service that runs the agent (launchd on macOS, a systemd user unit on Linux), starts it and returns. On a machine with no service manager, such as a container, the machine is enrolled all the same and the command says its service was not installed: run `palai` there in the foreground, as the container's command.

When `enroll` has a `server_name`, add `--server-name <server_name>`. When it has a `ca_certificate`, save it to a file and add `--ca-file <file>`.

`--capacity` is how many sessions the machine runs at once: 1 or more, 1 when not given. Each session is one chat's workspace, so size it by what one build takes (on a 64 GB Mac, 3 to 6). The key is used up as the machine enrols. A key used a second time is refused, and so is a machine whose type is not the pool's. `GET /ai/pools/{pool}/keys` lists a pool's keys (never the key itself; `last_used_at` is when a machine last enrolled with one), and `POST /ai/pool-keys/{key}/revoke` revokes one nobody used. Your project's key never goes to the machine.

A session's files are kept on the machine under the agent's own state directory (`~/.local/state/palai/workspaces` on Linux, `~/Library/Application Support/Palai/workspaces` on macOS).

On macOS the sessions of one machine are **not isolated from each other**: one session's commands can reach another's files. On Linux each session runs in a sandbox of its own. Put a machine into a pool only for work that may share it.

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

Every command of every session of the project's agents has the project's variables, on every pool: Palbase's Linux machines and your own Linux and Mac machines alike. They are masked wherever a transcript would show them.

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/env/NPM_TOKEN" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"value":"npm_…","secret":true}'
```

A name is upper-case letters, digits and `_`, starting with a letter. `PALAI_…` is reserved. A value is up to 32 KiB, and a project sets up to 256 variables. A value is sealed where the sessions run and is never answered again, nor logged. `GET /ai/env` lists the names, whether each is a secret, and when each was set. `DELETE /ai/env/{key}` removes one. From your backend: `Palbase.ai.env.set("NPM_TOKEN", value)`, `Palbase.ai.env.list()`, `Palbase.ai.env.unset("NPM_TOKEN")`. With the CLI, give the value on standard input so it never sits on a command line: `palbase ai:env:set NPM_TOKEN --value-stdin < token.txt`, and `palbase ai:env:unset NPM_TOKEN`.

On a machine of yours a value reaches that machine, and the session's commands read it there. Give a pool's machines only what their work needs.

**An agent's own.** An agent's definition carries its own variables (`env`, name → value, 64 at most) and a **setup script** (`setup`), which each of its sessions runs once at its start, before the agent's first command, on every pool. Use it to install what the work needs (`brew bundle`, `npm ci`) on a machine you did not prepare.

```json
{
  "instructions": "You build the iOS app and fix what fails.",
  "model": "claude-sonnet-5-5",
  "env": { "SENTRY_AUTH_TOKEN": "sntrys_…", "CONFIGURATION": "Debug" },
  "setup": "brew bundle --file=Brewfile && bundle install"
}
```

An agent's variables sit beside the project's: give them names of their own. Palbase keeps a definition's values sealed with your project's own key, never readable in its database, and opens them only for the sessions that run with them. A value is never answered again: an agent read back (`GET /ai/agents/{name}`) shows each name with an empty value. An agent written back with an empty value keeps the value it has, so a definition read, changed and put again loses nothing. A new name needs its value. Each definition's variables and script are written once, where its sessions run: an agent the project keeps as it is published or rolled back, an agent your backend defines at each turn (or a chat's own definition) at its first turn. Two definitions that differ, such as two chats' own or a version a chat stays on and the one published, never share them: each turn runs with its own definition's.

## Related

- [AI](https://palbase.studio/docs/backend/ai): agents, chats and their workspaces
- [Workspace Sync](https://palbase.studio/docs/backend/ai-workspace-sync): a chat's workspace on a machine of yours, both ways, and what a tool sees of it
- [Secrets](https://palbase.studio/docs/backend/secrets): your backend's own secrets
