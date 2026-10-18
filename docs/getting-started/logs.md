> The full documentation index: https://palbase.studio/llms.txt

# Logs

Studio's **Logs** page lists what happened in an environment, newest first, one category at a time:

| Category | A line is | Its source | Its level |
|---|---|---|---|
| **Requests** | A request to the environment's address, whichever module it went to, as the platform's edge answered it — refused ones too | The module: `auth`, `storage`, `realtime`, `flags`, `notify`, `analytics`, `secrets`, `machines` (databases included), `stores`, or `other` for a path no module answers | Info below 400, warn a 4xx, error a 5xx or no answer at all |
| **Auth** | An event of auth's audit trail: a sign-in, a sign-up, a password or session change | The event, such as `auth.login.success` | Warn a failure |
| **Notifications** | An email, SMS, WhatsApp message or push sent, and what became of it | The channel | Error one that did not arrive (failed, bounced, rejected, expired) |
| **Machines** | What a machine wrote, its migration runs included ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds#logs)) | The machine | The level the line says of itself |
| **Builds** | A build of a machine's commit | The machine | Error a failed build, warn a cancelled one |

Each category is narrowed by text, by source and by level, over the last 15 minutes up to the last 7 days. **Live** reads again every 5 seconds; **Paused** holds the list still while you read it. A line opens whole, each of its fields with a copy button. The address of the page carries the category and the filters, so a view can be shared.

## Request lines

A request line holds what the edge knows of the request, and nothing it carried:

| Field | |
|---|---|
| `ts` | When the request arrived |
| `module` | The module it went to |
| `method`, `path` | The path **without its query**: a signed URL's signature and a token travel in the query, so it is never kept. Past 2,048 bytes it is cut |
| `status` | What the client was answered; `0` when it got no answer |
| `duration_ms` | Until the last byte of the answer was sent |
| `client_ip`, `user_agent` | Who asked: the client's address as the edge saw it, and its user agent (its first 512 bytes) |
| `request_id` | The `X-Request-Id` the client was answered with — the one to quote when asking about a request |
| `flags` | Present when the request ended short of a module's answer: `UAEX` the key or rate check refused it, `NR` no module answers its path, `UF` or `UH` the module could not be reached, `UT` it did not answer in time, `DC` the client went away |

Not its headers, not its body. A line is kept **7 days** and deleted within a day after; only the project it was made for reads it. Anyone can send a project requests, and a refused one is a line too: under a flood, each of the platform's edges keeps about 1 MiB of a project's lines a second and drops the rest, so a flood to one project does not cost the others their lines.

From a server, `GET /analytics/requests` with the project's secret key answers the same lines, newest first:

| Query | |
|---|---|
| `window_seconds` | How far back, 1 to 604,800 (a week); an hour when left out |
| `module` | One module's requests only |
| `level` | `info`, `warn`, `error`, one or more, comma-separated |
| `q` | Text found in the path or the user agent, or a request id or a client address, exactly |
| `limit` | How many lines at most, 1 to 500 (100 by default) |
| `cursor` | The `next_cursor` of the page before; absent on the last page |

```ts
// scripts/errors.ts
type RequestLine = { ts: string; module: string; method: string; path: string; status: number; request_id: string };

const res = await fetch(`${process.env.PALBASE_URL}/analytics/requests?window_seconds=600&level=error`, {
  headers: { apikey: process.env.PALBASE_SECRET_KEY! },
});
const { requests } = (await res.json()) as { requests: RequestLine[]; next_cursor?: string };

for (const r of requests) console.log(r.ts, r.status, r.module, r.method, r.path, r.request_id);
```

A secret key never goes in a browser: a call that carries one from a web page is refused (`401 secret_key_in_browser`).
