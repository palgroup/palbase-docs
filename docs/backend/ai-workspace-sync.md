> The full documentation index: https://palbase.studio/llms.txt

# Workspace Sync

A chat's [workspace](https://palbase.studio/docs/backend/ai#workspaces) is not only on the machine its agent works on. Any machine you choose can hold it too, synced live and always both ways: what the agent writes appears there within a second, and what that machine writes (a build's product, a generated source) appears to the agent. Your backend reads the workspace, hears what changes in it, and writes it too.

## Syncing a machine

Mint a **workspace token** for the chat, with the secret key or as a member who may write the chat:

```sh
curl -X POST "https://<ref>.palbase.studio/ai/chats/$CHAT_ID/workspace/tokens" \
  -H "apikey: $PALBASE_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"access":"write","ttl_seconds":86400,"label":"build-mac-3"}'
# → 201 { "id": "wst_…", "access": "write", "expires_at": "…", "token": "pwt_…",
#         "sync_url": "https://<ref>.palbase.studio/ai/workspace-sync", … }
```

From your backend it is `Palbase.ai.chats.workspace.tokens.create(chatId, { access: "write", ttlSeconds: 86400, label: "build-mac-3" })` (its `token` and `syncUrl`, said once), and with the CLI `palbase ai:chats:workspace:token <chat id> --access write --ttl 86400 --label build-mac-3`. `tokens.list(chatId)` and `tokens.revoke(chatId, tokenId)` (`palbase ai:chats:workspace:tokens <chat id>`, `palbase ai:chats:workspace:revoke <chat id> <token id>`) list and revoke them.

`access` is `write` (both ways) or `read` (the machine follows the workspace and writes nothing back). A token lives `ttl_seconds`: an hour when none is given, 7 days at most, and no longer than an environment token it is minted with. The token is said once, here. It opens this one workspace and nothing else of the project. A chat whose first turn has not opened its workspace has it opened now. A chat that works in no workspace is refused with `409 no_workspace`.

A token a member mints (when the project lets its app's users talk to its agents) lives an hour at most. It is that member's alone: they list and revoke their own, and the secret key lists and revokes every token. It stops working when the member is taken out of the chat, or when the project turns `clients` off.

On the machine, with the same `palai` binary that runs a pool's agent (`curl -fsSL https://palgroup.github.io/palai/install.sh | sh` installs it, see [AI on Your Own Machines](https://palbase.studio/docs/backend/ai-machines#enrolling-a-machine)), give the token in the environment:

```sh
PALAI_WORKSPACE_TOKEN="$WORKSPACE_TOKEN" palai workspace sync --url "$SYNC_URL" ./shop-app
```

Or pipe it in with `--token-file -` (a file the token is in works too: `--token-file <path>`). There is no `--token` flag: a secret on the command line is readable by every process on the machine.

The folder is brought to the workspace's tree and then kept in step with it while the command runs. A change on either side is sent as soon as the files are quiet, and a change that came from the other side is not sent back. The machine talks only to `sync_url`, your project's own address. No Palbase key goes to it.

The first sync into a folder that already has files, and holds no record of this workspace, is refused, so a checkout with uncommitted edits is never overwritten. Add `--force` to sync it anyway. The folder's files that differ from the workspace are sent first, and kept in the workspace's history if they lose, and then the workspace's tree is laid out. A token minted with `read` access makes the sync read-only: the folder follows the workspace and sends nothing.

On a machine that runs a sync, set `git config --global safe.bareRepository explicit`, so that git never runs a repository it finds inside a synced folder.

Two flags serve a script that runs beside the sync, in the same folder:

- `palai workspace sync --wait <tree>` returns once the folder holds that tree (a `manifest_id`, or its `seq`) or a newer one.
- `palai workspace sync --flush` sends everything on disk now and prints the tree that holds it.

`GET /ai/chats/{id}/workspace/tokens` lists the workspace's tokens (never a token itself). `DELETE /ai/chats/{id}/workspace/tokens/{token}` revokes one at once: the machine's sync stops, and an event stream open with it ends. An expired or revoked token is refused with `401 invalid_token`, and so is a token of another project. Each of the platform's servers that answer your project's address holds up to 4 event streams of one token open at once, 16 of one workspace and 64 of your project's tokens together, and refuses one more with `429 too_many_streams`. The bounds are each server's, not your project's whole, and are counted apart from your project's response streams.

**What is carried.** A workspace carries what git tracks: a path the repository's `.gitignore` excludes stays on the machine that made it. A `.palaisync` file beside it, written the same way, is read first and overrides it. `!` carries what `.gitignore` excludes, and a plain pattern keeps out what it does not:

```text
# .palaisync
!App/Generated/
!*.generated.swift
DerivedData/
```

A path you name by itself is carried even when `.gitignore` excludes its directory: with `gen/` in `.gitignore`, `!gen/out.txt` carries `gen/out.txt` and nothing else in `gen/`, and `!gen/keep/` carries that directory whole. A pattern with a wildcard keeps git's limit: `!gen/*.json` brings nothing back from inside `gen/`, because a walk does not enter an excluded directory to match it. Name the file's path, or the directory (`!gen/`). As it starts, `palai workspace sync` prints the `!` rules in force, and says which of them reach into an excluded directory and bring nothing back.

Some files are never carried to or from a machine of yours, and no rule brings them back:

- the session's own files, and git's internals (`.git`)
- secrets and signing material: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p8` (App Store Connect keys), `*.p12`, `*.pfx`, `*.mobileprovision`, `*.jks`, `*.keystore`, `*.keychain`, `*.keychain-db`, `*.ppk`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `service-account*.json`, `credentials.json`, `auth.json`, `*.tfstate`, `*.tfvars`, the folders `.ssh/`, `.aws/`, `.azure/`, `.gnupg/`, `.config/gcloud/`, and credential files such as `.netrc`, `.npmrc`, `.pypirc`, `.pgpass`, `.yarnrc.yml`, `.git-credentials`, `.docker/config.json`, `.kube/config`, `.cargo/credentials`, `.gem/credentials`, `.bundle/config`
- configuration that runs commands: `.husky/`, `.envrc`, `.vscode/tasks.json`, `lefthook*.yml` (and its other forms), `.pre-commit-config.yaml`

The rules a machine starts from are the ones it attaches with: the directory's own when it already holds files (`--force`), read before the workspace's tree is laid over them, and the workspace's when the directory is empty. A `.palaisync` or `.gitignore` that another writer changes narrows what is carried at once. A change that would carry more is held — while the sync runs and after every restart — and the sync prints which files it holds and the command that lets them go, `palai workspace sync --accept-rules <fingerprint> <dir>`. The fingerprint names the rule files and the held files as that notice printed them: if either changed before you run it, nothing is accepted, and the command prints what is held now with the fingerprint that accepts it. So no one else's rule makes your machine send a file it was keeping. A rule file you edit on that machine is accepted once the workspace takes it, unless another writer had changed it since you accepted it: then what their change carries stays held with your edit. A rule file the store sends under another spelling of its name (`.GITIGNORE` on a Mac) is refused.

A machine reads its tree's rule files up to 8 MiB in all; each rule file past that is read as `*`, so its directory stays on that machine, and the sync says so. A directory the machine cannot read is left as it is and is not carried.

A path longer than 2048 bytes, or with a segment longer than 255, is skipped, and the sync says which.

## Writing from your backend

Your backend reads a file of the workspace with `GET /ai/chats/{id}/workspace/files?path=` (see [AI](https://palbase.studio/docs/backend/ai#workspaces)) and writes one with `PUT` on the same path. `path` is 1 to 2048 bytes, each segment 255 at most, as the workspace keeps every path. The body is the file's bytes, up to 64 MiB. A body sent with its length (`Content-Length`) is passed on as it arrives, and one sent in chunks, with no length, is read whole first, to the same 64 MiB:

```sh
curl -X PUT "https://<ref>.palbase.studio/ai/chats/$CHAT_ID/workspace/files?path=shop-app/Config/Flags.json" \
  -H "apikey: $PALBASE_SECRET_KEY" --data-binary @Flags.json
# → 200 { "path": "shop-app/Config/Flags.json", "manifest_id": "…", "seq": 42 }
```

`DELETE` on the path removes the file. Each server that answers your project writes 2 of its files at once, and a write past that is told to ask again (`429 too_many_reads`). A write of your backend's is deliberate: it is applied over whatever the workspace holds, and makes no conflict. It reaches every machine that holds the workspace, the agent's own before its next command. The answer is the tree the workspace is at now.

## Events and conflicts

Each tree the workspace publishes is an `ai.workspace.published` event, whoever wrote it: the agent, a synced machine or your backend. The events are told while the chat's turns run, while a token of its workspace lives, and for 20 minutes after the last write.

When two writers change the same path at once, **the first to reach the workspace's store wins**. The other's version is kept aside, in the workspace's history, for 30 days. The losing machine is given the winner's version, and the agent is told when it lost. No `.conflict` file is ever written into the tree, so a build is not broken by one. Each lost change is an `ai.workspace.conflict` event:

```json
{
  "chat_id": "chat_…",
  "conflict": {
    "id": "wcf_…",
    "path": "shop-app/App/Info.plist",
    "lost": { "kind": "file", "digest": "sha256:…", "size": 2210 },
    "winner": { "kind": "file", "digest": "sha256:…", "size": 2234 }
  },
  "manifest_id": "…",
  "seq": 57,
  "writer": "build-mac-3",
  "metadata": { "task": "42" }
}
```

`winner` is null when the path was removed. `writer` names who wrote the version that lost: the agent's machine, a synced machine by its token's label, or your backend. The version that lost is read with the token at `GET /ai/workspace-sync/conflicts/{conflict_id}`, which answers the conflict and a signed request for its bytes.

## Tools see the workspace as the agent left it

A tool that runs away from the agent's machine (your backend's tool, or an HTTPS tool or MCP server you put as your own) sees the workspace as the agent last wrote it. What the tool writes there is what the agent's next command sees.

Before the call, the agent's machine sends everything it has written, and the call names that tree in its context:

```json
{
  "tool": "build_ios",
  "call_id": "call_…",
  "input": { "scheme": "Shop" },
  "context": { "chat_id": "chat_…", "turn_id": "resp_…", "workspace": { "chat_id": "chat_…", "manifest_id": "man_…", "seq": 57 } }
}
```

The tool works on that tree. It can read files of it with `GET /ai/chats/{chat_id}/workspace/files?path=&manifest=<manifest_id>`, or bring a synced folder to it with `palai workspace sync --wait 57`. A tool that writes the workspace answers the tree its writes are in. That is the `PUT`'s answer, or what `palai workspace sync --flush` printed:

```json
{
  "output": [{ "type": "text", "text": "Built Shop.app (Debug)." }],
  "is_error": false,
  "workspace_tree": { "manifest_id": "man_…", "seq": 58 }
}
```

`workspace_tree` carries `manifest_id`, `seq` or both. The agent's machine takes that tree before its next command. A tool that wrote nothing leaves it out. An answer with `is_error: true` may carry it too: a tool that wrote and then failed wrote all the same. Your backend's tools are always told the workspace: they run on your own machines. An HTTPS tool or an MCP server is told it only when you say the endpoint is your own: put it with `"workspace": true` (`PUT /ai/endpoints/{name} {"kind":"https",…,"workspace":true}`, or `"kind":"mcp"`). Such an HTTPS tool is given the tree in its `context.workspace` and answers `workspace_tree`, as above. Such an MCP server is given the same tree in its `tools/call`'s `_meta` (`"palbase/workspace"`), and answers it in its result's `_meta` (`"palbase/workspace_tree"`). Any other endpoint, a third party's API or MCP server, is told nothing of the workspace (an HTTPS tool still gets the turn's `chat_id`), and a tree it answers is ignored. An endpoint put before HTTPS tools took the setting is not told the workspace until you put it again with `"workspace": true`. A chat that works in no workspace has no `workspace` in the context, and a `workspace_tree` in its answer is ignored.

## Related

- [AI](https://palbase.studio/docs/backend/ai): chats, their workspaces and their tools
- [AI on Your Own Machines](https://palbase.studio/docs/backend/ai-machines): pools of your own machines, environment variables and setup scripts
- [Event Hooks](https://palbase.studio/docs/backend/hooks): `ai.workspace.published` and `ai.workspace.conflict` in your backend
