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

## Claude Code, Codex or Gemini CLI as the agent

A chat on a machine of yours can run its turns on the CLI that machine's owner is signed in to (Claude Code, Codex or Gemini CLI) instead of Palbase's own engine. The model is then the owner's own subscription's: Palbase bills no model use for those turns. The chat's `target` says so: its `executor` is `{"kind": "acp", "harness": "claude-code"}` (or `"codex"`, `"gemini-cli"`) and its `compute` a machine or a pool of yours, given when the chat is started (`POST /ai/chats`) or moved (`POST /ai/chats/{chat_id}/handoff`). `GET /ai/chats/{chat_id}/execution` answers the chat's target and, under `harnesses`, the CLIs its machine has. Palbase calls such a CLI a **harness**.

A harness works as the chat's agent. It is given, at each turn:

- **The agent's tools.** Your backend's tools, your HTTPS tools, your MCP servers' tools and your app's client tools are listed to the harness by one MCP server, named `palbase`, that the agent on the machine serves on the loopback address for that turn alone. A call of one is not run on the machine: Palbase runs it as it runs any call of the chat (a backend tool runs in your backend, the agent's `max_tool_calls` counts it, a tool that asks for approval asks for it) and the harness's call returns the answer, its text and its pictures. A harness is held to the tools the agent declares: a call of any other is refused by Palbase, whatever the machine sent.
- **The agent's instructions.** Claude Code takes them appended to its own system prompt, read again at each turn. Codex takes them as its developer instructions, on its command line: on that machine a list of its processes shows them, and past 64 KB they lead each turn's message instead. Gemini CLI has no place for them beside its own prompt, so they lead each turn's message.
- **The agent's setup script and environment.** The setup script runs in the workspace before the harness starts, as it runs before an agent's first command. The harness is started with the project's and the agent's variables that are no secret, and with the open secrets. It is given no sealed secret, on a Linux machine with the proxy too: a harness's own requests do not pass that proxy. A key that was not set is named to the harness with why, and so is a setup script that failed. Every value the harness was started with is masked in what it says and in what its tools print, before any of it leaves the machine. The harness keeps the machine owner's home folder, where its sign-in is, while a setup script's `$HOME` is the session's own: what the harness must find, the script writes into the workspace.
- **Setup is held too, on a Mac.** Where the turn runs Claude Code or Codex, the setup script and every other command of that turn's start run inside a sandbox of the agent on the machine. It **writes** the session's workspace, each repository's `.git` among it (setup is what clones them), and the session's own folders; it **reads** what a session's commands read (below) and nothing of the owner's home; it connects to the unix sockets the machine's policy names, such as the one a credential helper asks its app over. **Its network is open and its files are not**: a list of hosts needs a proxy, and the agent has none on a Mac, so setup reaches any host. Where the sandbox cannot be applied, the turn fails at its start with the sentence that says why. The script is never run outside it.
- **Setup leaves nothing running, and what it made is read before the CLI starts.** Each setup command is a process group of its own, killed when the command ends, so a process it left in the background does not go on writing the workspace; one that leaves its group on purpose (a second `setsid`, a daemon's double fork) is not found by this. Then the agent reads every repository under the workspace itself, running no git and following no link: a `.git` folder wherever it is, a submodule's and a worktree's own, what a `.git` file names, and any folder laid out as a bare repository. The CLI runs git itself outside its sandbox, and git does what a repository's own directory says, so the turn fails at its start, naming the repository and the thing, when one holds anything that could run:
  - **`config` and `config.worktree`** may carry what git writes as it makes, fetches and checks out a repository: `core.repositoryformatversion`, `filemode`, `bare`, `logallrefupdates`, `ignorecase`, `precomposeunicode`, `symlinks`, `sparsecheckout`, `sparsecheckoutcone`, `untrackedcache`, `autocrlf`, `eol`, `safecrlf`, `quotepath`, `abbrev`, `commitgraph`, `multipackindex`, and `worktree` and `excludesfile` inside the workspace; `remote.<name>.url`, `pushurl`, `fetch`, `promisor`, `partialclonefilter`, `tagopt`; `branch.<name>.remote`, `merge`, `rebase`; `user.name`, `user.email`; `init.defaultbranch`; `extensions.objectformat`, `partialclone`, `worktreeconfig`; `submodule.<name>.url`, `active`, `update` (`checkout`, `rebase`, `merge` or `none`); `fetch.prune`, `prunetags`, `fsckobjects`, `unpacklimit`, `recursesubmodules`, `parallel`, `output`, `negotiationalgorithm`, `showforcedupdates`, `writecommitgraph`, `all`; `pull.rebase`, `pull.ff`; `push.default`, `autosetupremote`, `followtags`, `recursesubmodules`, `useforceifincludes`, `negotiate`, `usebitmaps`; `gc.auto`; a `pack.*` that is a number; and `credential.helper`, `credential.<url>.helper` and `useHttpPath`.
  - **A remote's and a submodule's address is `https://`.** `ssh://`, `git@host:path`, `http://`, `file:` and `ext::` are refused: an address can name a program git runs to reach it.
  - **A credential helper is empty or a bare name with plain arguments**: `helper = myapp --session ses_1 --repository acme/app`, which git runs as `git-credential-myapp` from the `PATH`. Not a path, not a leading `!`, and nothing a shell acts on anywhere in the line (quotes, `$`, `;`, `|`, `>`), because git hands the whole line to a shell.
  - **Everything else is refused**, an `include` or `includeIf`, an `alias`, a `filter` (a repository with git-lfs installed in its own config among them: install it for the account instead), `diff` and `merge` drivers, `core.fsmonitor`, `core.hooksPath`, `core.sshCommand`, `core.pager`, `core.editor`, `core.askPass`, `url.*.insteadOf`, `http.*`, and any setting not named above.
  - **`hooks/`** holds nothing but git's own `.sample` files, and **`info/attributes`** names no `filter=`, `diff=` or `merge=`. `info/exclude` and `info/sparse-checkout` are yours to write, and a repository's own `.gitattributes` stays: with no driver in the settings it names nothing that runs.

  A package's install script that writes one of these fails the turn like any other: husky sets `core.hooksPath` when `npm install` runs it, so a setup script that installs packages sets `HUSKY=0` for that command, or installs with `--ignore-scripts`.
- **What the agent's variables may not say.** A harness starts programs of its own outside its sandbox: git, and the ssh, editor and pager git starts; ripgrep; a shell. Each takes orders from the environment, so the variables that give them are not set, whichever harness runs: every `GIT_…` and `SSH_…` name, `RIPGREP_CONFIG_PATH`, a shell's (`SHELL`, `BASH_ENV`, `ENV`, `ZDOTDIR`, `PROMPT_COMMAND`), `EDITOR`, `VISUAL`, `PAGER`, `LESSOPEN`, and an interpreter's start-up (`PERL5OPT`, `PERL5LIB`, `PYTHONSTARTUP`, `PYTHONPATH`, `RUBYOPT`, `RUBYLIB`, `JAVA_TOOL_OPTIONS`), beside what loads code into the harness or sends its requests elsewhere (`NODE_OPTIONS`, `NODE_PATH`, `DYLD_…`, `LD_…`, the proxy variables). Each one left out is named to the harness with why. A command that needs one sets it for itself (`PYTHONPATH=src pytest`).

**The harness reads the turn's configuration and not the machine owner's.** Its sign-in stays the owner's own. Beyond that:

| Harness | What it is started with | What is left out |
| --- | --- | --- |
| Claude Code | The turn's MCP server alone (`--strict-mcp-config`) and no settings file but the turn's own (`--setting-sources ""`) | The owner's own settings, hooks, plugins and MCP servers, their `CLAUDE.md` files in the folders around the workspace, and the workspace's own `.claude/settings.json`: its hooks and helper commands would run on the machine outside any sandbox. The workspace's `CLAUDE.md` is words, and is still given |
| Codex | The turn's MCP server alone, under a permission profile of the turn's own | The owner's `config.toml` and rules (`--ignore-user-config`, `--ignore-rules`), and the workspace's own `.codex` config: the workspace is not a trusted project. Codex still reads the `AGENTS.md` of its own home folder |
| Gemini CLI | Of MCP servers, the turn's alone (`--allowed-mcp-server-names palbase`) | Nothing else: the owner's other settings and extensions are read, and so are the workspace's own `.gemini/settings.json` and `.env` |

What a harness is not given: Palbase's own tools (the engine's shell, files, commits and pushes, its subagents, memory, web search, the search that finds an MCP server's tools lazily). A harness works in the workspace with its own tools, and an agent's subagents and advisor are the engine's. The commands a harness runs are its own too: Palbase does not run them, so what Palbase does for an agent's command on that machine, such as the proxy that fills a sealed secret, is not done for a harness's.

### The harness's own calls are in the chat

A harness works with tools of its own: it runs commands, edits files, searches, calls the tools of other MCP servers its owner gave it. Each of those is a `tool` part of the chat, as a call of Palbase's own engine is: `running` as it starts, with what it was called with, then `completed` or `failed` with the end of what it printed, in its place in the answer's text. So a chat shows what its agent did wherever it is watched, and `GET /ai/chats/{id}/parts` and the reads of a call show it later.

Such a part says `origin: "harness"`: Palbase recorded the call and did not run it. It asks for no approval, no member answers it, it is not counted in the agent's `max_tool_calls`, and nothing is billed for it. Tell such a call by its `origin`, never by its `name`: a harness names its tools as it likes, and may name one as a tool of Palbase's is named.

A turn on a harness is its machine's word on what it did. Toward a goal, its harness's calls count as the turn's work and are among what the goal's judge reads, as an engine's calls are, though Palbase ran none of them.

| Harness | The part's `name` |
| --- | --- |
| Claude Code | Its tool: `Bash`, `Edit`, `Write`, `Read`, `Grep`, `WebSearch`, `Task`, or `mcp__<server>__<tool>` for another server's |
| Codex | `shell`, `file_change`, `web_search`, or `<server>.<tool>` for another server's |
| Gemini CLI | The call's kind (`execute`, `edit`, `read`, `fetch`), with the harness's own words for the call as `title` |

A call of one of the agent's own tools is one part: the one Palbase ran. A subagent's calls (Claude Code's `Task`) are parts of the turn like the rest.

What is kept of a call is bounded. Its input is whole up to 64 KiB, and past that the start of its text (`input_truncated`). Its output is kept by its end, the last 256 KiB, of which the stream's part shows the last 16 KiB; `omitted_bytes` says how much came before, in the part and in the whole read of the call. Secrets are masked as everything the harness says is.

So is what a turn keeps of them: 3,000 calls, and 48 MiB of them in all, past the longest and the heaviest turns of real coding work Palbase measured. Past either, the turn records no more of its harness's calls, and says so once, as it ends, in a `tool` part of its own: `origin: "harness"`, `unrecorded`, how many more calls the harness made as far as Palbase counted, and `output`, that in a sentence. That part is no call: it has no answer to read. A call still open then is closed `failed`, saying its result was not kept.

A call that had not ended when its turn ended is closed then, `failed`, or `canceled` where the turn was stopped before the harness's own turn had ended. Tell how a turn ended by the turn's own end, not by its calls. Nothing of a harness stays `running` after its turn.

### A harness is confined to its workspace

A harness is its owner's own CLI, signed in as them, on their own machine. On a Mac, the turn that starts Claude Code or Codex confines it with the CLI's own sandbox (Claude Code's sandbox and file blocks, a Codex permission profile):

- **Files.** Its file tools refuse a path outside the workspace. Its shell commands run in the CLI's own sandbox, which shuts the home folder, `/Users` and `/Volumes`. A command **writes** the workspace, a folder of the session's own beside it, and a folder of the session's own inside each of the two macOS hands every process of an account (the temporary one is its `$TMPDIR`): nothing of the owner's home, and nothing else of those two folders, where the owner's own tools keep what they run from (xcrun's cache of where each tool is, clang's module cache, Xcode's caches). One name there is written besides: what `xcodebuild` is saving (`TemporaryItems/NSIRD_xcodebuild_…`), which that program keeps nowhere else. It **reads**, besides those and the system, the toolchains a build runs and nothing else: `~/.cargo/bin`, `~/.rustup/toolchains` and `~/.rustup/settings.toml`, `~/.nvm/versions`, `~/.volta/bin` and `~/.volta/tools`, `~/.fnm/node-versions` and `~/.fnm/aliases`, `~/.mise/installs` and `~/.mise/shims`, `~/.bun/bin`, `~/.local/bin`, `~/Library/Android/sdk`, `~/Library/Java` and `~/Library/Developer/Toolchains`. No file or folder that holds a registry token, a signing key, a device key or another project's output is opened: not `~/.npmrc`, `~/.cargo`, `~/.gradle`, `~/.android`, `~/.swiftpm`, `~/.ssh`, the keychains, the shared derived data or the simulators' devices, nor the `etc/npmrc` a Node install keeps inside one of those toolchains.
- **Hosts.** A command reaches the hosts the machine allows and the hosts of the secrets the turn was given, and no other: the sandbox's own proxy refuses the rest. The list bounds where a command reaches, not what it sends there: GitHub's API and every registry take an upload under a token, and a token the turn was given, or one in the workspace, is the command's to use. What the sandbox keeps from a session is the owner's own credentials, so nothing is sent as them. It neither listens on a port of the machine nor reaches one, and it looks up no service of the machine but the one that checks a certificate.
- **Without asking.** Inside that, every command runs: a turn has nobody to ask, so a command that waits for a yes would be a command refused. No command leaves the sandbox, and a Claude Code that cannot sandbox does not start.

**What a build keeps is the session's own.** Each package manager is pointed at the session's folder by the variable it reads itself, so a later turn of the same session finds its caches warm and no other session, and nothing the owner runs later, reads them. The folder goes when the session's workspace does. These variables are the commands' and not the CLI's own: Claude Code runs a script of the turn's before each command, in the command's shell, and Codex sets them on its commands alone. The CLI itself, and the git it starts outside its sandbox, keep the machine's own environment, so nothing a session can write steers a program the CLI runs itself. Claude Code's background updater is off for the turn (`DISABLE_AUTOUPDATER`).

| Tool | Kept in the session's folder by |
| --- | --- |
| npm | `npm_config_cache`, and `npm_config_userconfig` (the owner's `~/.npmrc` is not read) |
| pnpm, Yarn, Bun | `PNPM_HOME`, `YARN_CACHE_FOLDER`, `BUN_INSTALL_CACHE_DIR` |
| Yarn 2 and later, Corepack | `YARN_GLOBAL_FOLDER`, `COREPACK_HOME` |
| node-gyp | `npm_config_devdir` (the headers of the Node an addon is built for) |
| clang, swiftc | `CLANG_MODULE_CACHE_PATH` |
| Cargo | `CARGO_HOME` |
| Gradle, Android | `GRADLE_USER_HOME`, `ANDROID_USER_HOME` |
| Go | `GOPATH`, `GOCACHE` |
| pip, CocoaPods | `PIP_CACHE_DIR`, `CP_HOME_DIR` |
| Xcode | Derived data, fetched packages and the package cache, by the turn's own `xcodebuild` |
| SwiftPM | Its cache, configuration and security folders, by the turn's own `swift` |

A registry that needs a token is given it as one of the agent's secrets, not from the owner's home.

**Xcode and SwiftPM.** They put their own work in a sandbox, and macOS nests none in another. The turn puts its own `xcodebuild`, `swift` and `xcrun` first on the `PATH` of what the harness runs: `xcodebuild …`, `swift build`, `swift test`, `swift run`, `swift package …`, `xcrun xcodebuild …` and `xcrun swift …`, with xcrun's own options before the tool too (`xcrun --sdk macosx swift build`), start Xcode's and SwiftPM's work without theirs, inside the harness's, with the session's folders. Called by its whole path (`/usr/bin/xcodebuild`) the same command fails in the sandbox.

Three things follow from a session not writing the account's temporary folder:

- `swift build`, `swift test` and `swift run` are given `--build-system native` unless the command names a build system. SwiftPM's newer one starts the linker with none of the session's environment, and the linker then keeps its files in the account's own temporary folder (`error: permissionDenied` at the link of every executable and test bundle). SwiftPM prints that the native one is deprecated; a command that says `--build-system swiftbuild` is run as written, and fails there.
- Xcode compiles a package's manifest with an empty environment. The turn's `xcodebuild` names the compiler of manifests (`SWIFT_EXEC_MANIFEST`), which starts the real one with the session's temporary folder.
- xcrun reads its cache of where each tool is and does not write it. For a tool the cache does not hold it prints `couldn't create cache file` on standard error and goes on: the command runs.

**What does not build in a session.** A step that fetches from a host the machine does not allow, such as a postinstall that downloads a binary from its own site: the proxy refuses it, and the host is added to the machine's policy or to a secret's hosts. Signing with the owner's identity, for a device or an archive: their keychain is not a session's (`security find-identity` finds none); a build signed to run locally passes. A test that writes outside the workspace, the session's folders and `$TMPDIR`.

**git.** A session's git reads a configuration of the turn's own, which it cannot write: who commits (the owner's `user.name` and `user.email`) and where git's ignore and attributes files are. The owner's own configuration files (`~/.gitconfig`, `~/.config/git/config` and every file they include) are not read, because a token is sometimes kept there. `git config --global` is refused; on a machine whose owner set no name for git, a commit names its author itself (`git -c user.name=… -c user.email=… commit`). While the CLI runs, what was read stays as it was read: a command cannot write a repository's `config`, `config.worktree`, `hooks`, `info/attributes` or `commondir`, for every repository the workspace has as the turn starts (up to 256) and for the workspace's own top folder whether or not it is a repository yet. `git add` and `git commit` in a repository the workspace already has work. A folder laid out as a bare repository is no repository to a session's git unless it is named as one (`--git-dir`).

**A repository made mid-turn.** Under Claude Code a command cannot make one: `git init` stops at the new repository's hooks, which `git clone` writes the same way. Under Codex a command can make one in a folder of the workspace (not at its top), and that repository's settings are the command's to write until the turn ends. The CLI's own git runs at the workspace's top (measured on both: with the shell's folder moved into another repository, every git the CLI started itself stood at the top), so what such a repository says is acted on by the session's own sandboxed commands alone; and it is read like any other as the next turn starts, which fails if a command left something there that could run. Clone repositories in the setup script.

**Codex differs in two things.** Its sandbox cannot open a folder's way down without the folders on the way, so a command can list the names in the folders above what the turn opens, the home folder's among them, and read none of what they name: `harnesses` says `folder_names_listed`. And it keeps the simulators shut whatever the machine's policy says.

**Gemini CLI is not confined.** Its own sandbox on a Mac wraps the whole CLI: its open profile keeps writes to the project but leaves the home folder read and every host reached, and it reads the workspace's own settings. A turn starts it as it always did, unless the machine's policy says `"confined_only": true`: then no turn is started on a CLI the machine does not confine, and one that asks for it fails at its start with the sentence that says so.

**On Linux** a harness is not given a sandbox of its own: none was measured there. It runs inside the agent's own boundary where the machine has one, which holds its files and not its hosts, and a command runs without asking only there. On a machine with neither, a command Claude Code would ask about is refused.

`harnesses` says which holds for each CLI of a machine: `confinement` is `workspace` (the CLI's own sandbox, as above), `runner` (the agent's boundary on Linux) or `none`, and `confinement_gaps` says what that leaves open, and `not_started_unconfined` beside a CLI that is not confined on a machine that starts only what it confines.

The harness itself is started by its whole path, found once as the turn starts. A CLI installed in a folder a session can write (the workspace, the session's own folders, Claude Code's temporary folder), or an agent whose `PATH` has such a folder in it, starts nothing: the turn ends with the sentence that names the folder. The agent does not ask such a CLI its version either: `harnesses` reports it as not installed. Claude Code is given a temporary folder of the session's own under `/tmp`, in place of the one every Claude Code of the account shares. So does a workspace whose path has a character a sandbox reads as a pattern (`* ? [ ] { }`).

Whoever starts the agent on a machine says what a session may reach of it besides its workspace, in `session-policy.json` in the agent's state directory (the folder of its `agent.json`; an app that embeds the agent gives that folder with `--state-dir`). The file is the owner's alone (mode `0600`) and is read as each turn starts:

```json
{
  "unix_sockets": ["/Users/me/Library/Application Support/MyApp/helper.sock"],
  "read_folders": ["/Applications/MyApp.app/Contents/Helpers"],
  "hosts": ["github.com", "*.githubusercontent.com", "api.myapp.example"],
  "simulators": false,
  "local_network": false,
  "confined_only": false
}
```

| Key | What a session's commands may do | Left out |
| --- | --- | --- |
| `unix_sockets` | Connect to these sockets, such as an embedding app's own helper | No socket |
| `read_folders` | Read these folders besides the workspace | The folder `palbase-agent` itself is in, where an embedding app puts the tools it wants on a session's `PATH` |
| `hosts` | Reach these hosts: a name, or `*.name` for every name under one | What a build fetches from: GitHub, the package registries of npm, Yarn (and `repo.yarnpkg.com`, where Corepack fetches Yarn itself), Maven, Gradle, CocoaPods, Swift, Cargo, Go, PyPI and RubyGems, and Apple's downloads |
| `simulators` | Use the simulators (`simctl`, a build that runs in one), on Claude Code | Shut: `xcrun simctl` is refused, and a build for the Mac itself still passes |
| `local_network` | Listen on a port of the machine, and reach the machine's own ports | Shut |
| `confined_only` | Nothing more: with `true`, a CLI the machine does not confine (Gemini CLI on a Mac; any CLI on a Linux machine with no boundary of the agent's) is not started | `false`: every installed CLI is started, and `harnesses` says which are not confined |

The last two open more than they name. What runs in a simulator, a repository's own code among it, runs under the simulator's launcher: outside the sandbox, with the owner's files and every host. A command that reaches the machine's own ports reaches every service that listens there, a database or a development server of the owner's. A machine that turns one on has it said under `harnesses` (`simulators_open`, `local_network_open`).

A machine nobody configured is not a machine with no network, since an agent that cannot fetch a dependency builds nothing; and it does not reach every host, since an agent that does can send the code to any of them. The hosts it does reach take uploads too (above): a machine whose code must not leave names fewer. `"hosts": []` allows none at all: the hosts of the turn's own secrets do not join it either.

The hosts of the secrets a turn was given join the machine's within bounds the machine keeps: at most 16 of them, a name or every name under one registered name (`*.example.com`, never `*.co.uk` or `*.github.io`), never an address. One that is left out is said to the agent with why.

What the file names is bounded too. A folder to read is never the home folder or one that holds it, nor the agent's state directory or one that holds it, where the device's key is; where the file names no folder, the folder `palbase-agent` is in is read only if it is neither. A socket's path that is already there must be a socket. A host is a name, not an address or a name that ends like one.

The file is read as the owner's word only if it is their own plain file (no link, mode `0600`) and one JSON object with nothing after it. A file that does not read (a key it does not know, a path that is not absolute, a folder it may not name) starts no harness: the turn ends at its start, failed, with the sentence that says which file and what is wrong with it.

A tool that answers later (`{ deferred: true }`) is waited for while the harness's own call waits, for up to eight and a half minutes: a harness waits ten for a call of the agent's tools. Its answer returns to the same call, and the turn goes on. A harness makes several calls at once and Palbase takes them one at a time: a call that waited behind another is as old as that one, so it is waited for only what is left of those minutes, and one with none left is not run. The harness is told so, and the call it makes again runs once.

A tool call that waits for a person (a tool that asks for approval, a client tool your app answers), or for an answer later still, ends the harness's turn where it is: no machine is held while a person decides. The harness's own conversation is kept. When the answer comes the harness resumes that conversation and is told what became of the call: the tool, its exact arguments, and to make that call again exactly so. With the same tool and the same arguments it is given what was decided, and the tool is not run twice. A call a person refused is named as refused, and is not run. Where there is no conversation to resume (a chat on a pool, whose turn may go on with another of its machines, or a Gemini CLI that does not offer to load one) the harness is started with the turn's message again, the same lines ahead of it.

The machine's `palbase-agent` must be one that carries the agent to a harness: an older one starts the harness with the message alone, with none of the above.

Every turn on a harness is started with the turn's configuration alone, as the table says, whether or not the agent has tools or instructions to give it. The CLI must be recent enough to be started so: Claude Code 2.1.314, Codex 0.163.0 or Gemini CLI 0.33.0, or later. An older one, and one whose `--version` says no version the agent can read, is listed under `harnesses` with the status `outdated` and the version it needs (`min_cli_version`). A turn starts a CLI only on a version it read from that very program as the turn starts: on any other it ends at its start, failed, with the sentence that says which CLI, what it printed and what is needed. That sentence is the turn's own reason, as your app reads it.

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
