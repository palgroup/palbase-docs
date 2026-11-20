> The full documentation index: https://palbase.studio/llms.txt

# Workspaces

A **workspace** is a synchronized network disk for your project: a versioned file tree with low-latency multi-way file sync (`palbase-agent workspace sync`), a full S3-compatible gateway (`https://s3.palbase.studio`), optimistic concurrency with zero-loss conflict records, advisory locks, and optional Bring Your Own S3 (BYOS) storage.

Use **Storage** ([Storage](https://palbase.studio/docs/backend/storage)) for user uploads, public media buckets, and image renditions. Use **Workspaces** when Linux cloud agents, macOS build VMs, CI runners, or S3 clients share a live working directory and need changes on one machine to reach every other attached machine immediately.

## Quick example

Create a workspace from a `palbase/backend` controller, seed `.palbasesync`, mint a scoped sync token for a machine, and coordinate exclusive steps with an advisory lock:

```ts
// src/modules/builds/builds.controller.ts
import { Body, Controller, Palbase, Post, z } from "palbase/backend";

const StartBuildInput = z.object({
  name: z.string().min(3).max(63),
  machineId: z.string().min(1),
});

type StartBuildInput = z.infer<typeof StartBuildInput>;

@Controller("/builds")
export class BuildsController {
  @Post("/workspaces")
  async prepare(@Body(StartBuildInput) body: StartBuildInput) {
    const ws = await Palbase.workspaces.createWorkspace({
      body: { name: body.name },
    });

    await Palbase.workspaces.putWorkspaceFile({
      path: { id: ws.data.id },
      query: { path: ".palbasesync" },
      body: "DerivedData/\nnode_modules/\nbuild/\n",
      contentType: "text/plain; charset=utf-8",
    });

    const syncToken = await Palbase.workspaces.createWorkspaceToken({
      path: { id: ws.data.id },
      body: { kind: "sync", access: "rw", label: body.machineId, ttl_seconds: 3600 },
    });

    const lock = await Palbase.workspaces.acquireWorkspaceLock({
      path: { id: ws.data.id },
      body: { scope: "xcode-build", owner_id: body.machineId, ttl_seconds: 600 },
    });

    return {
      workspaceId: ws.data.id,
      name: ws.data.name,
      syncToken: syncToken.data.token,
      syncUrl: syncToken.data.sync_url,
      lockToken: lock.data.token,
    };
  }
}
```

## Live multi-way sync

Run `palbase-agent workspace sync` on every machine that shares the workspace (Linux cloud sandboxes, macOS Tart VMs, or developer laptops). Each agent watches the local directory natively — `inotify` on Linux and `FSEvents` on macOS — and listens for remote commits over Server-Sent Events (`GET /workspaces/sync/events`).

```bash
PALBASE_WORKSPACE_URL="https://<ref>.palbase.studio/workspaces/sync" \
PALBASE_WORKSPACE_TOKEN="$PALBASE_WORKSPACE_TOKEN" \
palbase-agent workspace sync ./workspace
```

Key sync capabilities:

- **Inline fast path:** Files up to 128 KiB travel inline in `POST /workspaces/sync/publish` and `GET /workspaces/sync/changes`, avoiding extra object-store round-trips for source edits.
- **Chunked large files:** Files larger than 64 MiB are split into content-addressed chunks and transferred directly to object storage through presigned grants (`POST /workspaces/sync/blobs/upload-grants` and `POST /workspaces/sync/blobs/download-grants`).
- **`.palbasesync` ignore rules:** Every new workspace is seeded with a `.palbasesync` template using gitignore-style patterns. Edit it from Studio, the API, or any synced machine.
- **Barrier synchronization:** Use `--flush` on a writer machine to wait until all local edits are published, and `--wait <seq>` on a build host (for example before running `xcodebuild`) to ensure the local tree has caught up to that exact sequence number.
- **Execution guard:** Pass `--deny-exec` on untrusted build receivers to strip execute bits from synced files.

## S3 Gateway (`s3.palbase.studio`)

Every workspace is exposed as an S3 bucket at `https://s3.palbase.studio/<workspace-name>/<key>` with AWS Signature Version 4 (header and presigned URLs), `aws-chunked` streaming checksums (SHA-256 / CRC32), multipart uploads, and `ListObjectsV2`.

Any write made through the S3 gateway commits a new workspace sequence number and notifies all attached `palbase-agent` machines immediately.

Two scopes of S3 keys are available:

| Key scope | Prefix | Access | Endpoints |
|---|---|---|---|
| **Workspace S3 key** | `pbwk_…` | Scoped to a single workspace | `POST /workspaces/{id}/tokens` (`kind: "s3"`) |
| **Project S3 key** | `pbpk_…` | Lists and accesses every workspace in the project | `POST /workspaces/s3-keys` |

```bash
AWS_ACCESS_KEY_ID=pbpk_... \
AWS_SECRET_ACCESS_KEY=... \
aws s3 sync ./artifacts s3://ios-build/artifacts/ \
  --endpoint-url https://s3.palbase.studio
```

```ini
# rclone.conf
[palbase-workspaces]
type = s3
provider = Other
access_key_id = pbpk_...
secret_access_key = ...
endpoint = https://s3.palbase.studio
force_path_style = true
```

## Bring Your Own S3 (BYOS)

By default, workspaces store content-addressed blobs in platform-managed Cloudflare R2 (`storage_kind: "managed"`). You can also bind a workspace to your own S3-compatible bucket — Cloudflare R2, AWS S3, or MinIO — with `storage.kind: "byos"`.

- **SSRF protection:** BYOS endpoints are validated against private, loopback, link-local, and cloud metadata IP ranges before any request is made, and HTTP redirects are disabled.
- **Live connectivity probe:** Call `POST /workspaces/byos/test` to verify Put, Head, Delete, and Presign operations without persisting credentials.
- **Sealed credentials & rotation:** Access keys are envelope-encrypted at rest and never returned in full (only `access_key_preview`). Rotate keys seamlessly with `PUT /workspaces/{id}/storage` without interrupting sync.
- **Billing exclusion:** BYOS blobs are stored strictly in your own bucket and excluded from Palbase storage metering and managed quota ceilings.

```ts
// scripts/byos-workspace.ts
import { createServer } from "palbase/server";

const pb = createServer({
  url: process.env.PALBASE_URL!,
  secretKey: process.env.PALBASE_SECRET_KEY!,
});

const byosStorage = {
  kind: "byos" as const,
  endpoint: "https://account-id.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "acme-workspaces",
  prefix: "prod/",
  access_key_id: process.env.BYOS_ACCESS_KEY_ID!,
  secret_access_key: process.env.BYOS_SECRET_ACCESS_KEY!,
  force_path_style: true,
};

const probe = await pb.workspaces.testWorkspaceByos({ body: byosStorage });
if (!probe.data.ok) throw new Error("BYOS bucket probe failed");

const ws = await pb.workspaces.createWorkspace({
  body: { name: "acme-ios-disk", storage: byosStorage },
});

// Later, rotate credentials in place without recreating the workspace:
await pb.workspaces.updateWorkspaceStorage({
  path: { id: ws.data.id },
  body: {
    ...byosStorage,
    access_key_id: process.env.BYOS_NEXT_ACCESS_KEY_ID!,
    secret_access_key: process.env.BYOS_NEXT_SECRET_ACCESS_KEY!,
  },
});
```

Switching an existing workspace between `managed` and `byos`, or changing the `bucket` or `prefix` of a non-empty BYOS workspace, is refused with `409` to protect existing manifests.

## Concurrency, conflicts, locks & safe deletion

- **Optimistic concurrency (CAS):** Every commit increments a monotonic `seq` number per workspace. When two writers race on the same path from the same base revision, the first writer wins and the losing content is preserved as a conflict record — zero bytes are lost.
- **Advisory locks:** Coordinate exclusive phases (such as an Xcode build or codegen pass) with `POST /workspaces/{id}/locks` (TTL-based), `GET /workspaces/{id}/locks`, and `DELETE /workspaces/{id}/locks`.
- **Safe deletion:** `DELETE /workspaces/{id}` returns `409 workspace_attached` naming active attachments if a machine or module is still bound to the workspace. Pass `force: true` (`DELETE /workspaces/{id}?force=true`) to force deletion.

## Webhook events

Workspaces emit three platform events you can handle with `@On` ([Event Hooks](https://palbase.studio/docs/backend/hooks)) or receive via webhooks ([Webhooks](https://palbase.studio/docs/server/webhooks)):

| Event | Payload fields | When it fires |
|---|---|---|
| `workspace.published` | `workspace_id`, `seq`, `manifest_id`, `writer`, `changed_count` | A sync publish, HTTP file write, or S3 write committed a new `seq`. |
| `workspace.conflict` | `workspace_id`, `conflict_id`, `seq`, `path`, `winner_digest`, `loser_digest`, `loser_writer` | Two concurrent writers raced on the same path and the losing content was preserved. |
| `workspace.deleted` | `workspace_id`, `name` | A workspace was deleted from the project. |

```ts
// src/modules/builds/workspace-events.ts
import { Injectable, Log, On, type WebhookEvent } from "palbase/backend";

type WorkspaceConflictData = {
  workspace_id: string;
  conflict_id: string;
  seq: number;
  path: string;
  winner_digest: string;
  loser_digest: string;
  loser_writer: string;
};

@Injectable()
export class WorkspaceEvents {
  @On("workspace.conflict")
  onConflict(event: WebhookEvent<WorkspaceConflictData>): void {
    Log.warn("workspace edit conflict preserved", {
      workspaceId: event.data.workspace_id,
      path: event.data.path,
      seq: event.data.seq,
      loserWriter: event.data.loser_writer,
    });
  }
}
```

## CLI commands

Manage workspaces, BYOS storage, sync tokens, and S3 keys directly from the `palbase` CLI (see the full [CLI Reference](https://palbase.studio/docs/cli/reference)):

```bash
palbase workspaces:list
palbase workspaces:create ios-disk
palbase workspaces:byos:test --endpoint https://acct.r2.cloudflarestorage.com --bucket acme-ws --access-key-id "$AK"
palbase workspaces:tokens:create ws_01J... --kind sync --access rw --label mac-vm
palbase workspaces:s3-keys:create --access rw --label ci-runner
palbase workspaces:delete ws_01J... --force
```

## HTTP endpoints

| Method & path | Purpose |
|---|---|
| `GET /workspaces` / `POST /workspaces` | List or create a workspace (managed R2 or BYOS). |
| `GET /workspaces/{id}` / `DELETE /workspaces/{id}` | Inspect or delete a workspace (`?force=true` overrides `409`). |
| `POST /workspaces/byos/test` | SSRF-checked live probe of a BYOS S3 bucket. |
| `PUT /workspaces/{id}/storage` | Rotate BYOS credentials or update connection settings. |
| `GET /workspaces/{id}/files` | List tracked files, or read one file (`?path=…`). |
| `PUT /workspaces/{id}/files` / `DELETE /workspaces/{id}/files` | Write or delete one file (`?path=…`) and notify synced machines. |
| `GET /workspaces/{id}/tokens` / `POST /workspaces/{id}/tokens` | List or mint workspace sync tokens and workspace S3 keys. |
| `DELETE /workspaces/{id}/tokens/{token_id}` | Revoke a workspace sync token or S3 key. |
| `GET /workspaces/s3-keys` / `POST /workspaces/s3-keys` | List or mint project-wide S3 keys. |
| `DELETE /workspaces/s3-keys/{token_id}` | Revoke a project-wide S3 key. |
| `GET /workspaces/{id}/locks` / `POST /workspaces/{id}/locks` / `DELETE /workspaces/{id}/locks` | List, acquire/renew, or release TTL advisory locks. |
| `GET /workspaces/sync/head` / `GET /workspaces/sync/changes` / `POST /workspaces/sync/publish` | Sync engine protocol endpoints (Bearer sync token). |
| `POST /workspaces/sync/blobs/upload-grants` / `POST /workspaces/sync/blobs/download-grants` | Direct presigned object-store blob transfer grants. |
| `GET /workspaces/sync/events` | Real-time SSE notification stream for connected sync agents. |
