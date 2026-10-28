> The full documentation index: https://palbase.studio/llms.txt

# Testing

A backend is tested where it runs, and the same tests run in three places: on your computer (`bun test`), against your app as test users made for the run (`palbase test`), and on the platform against **each new build before it takes traffic**. `palbase/backend/test` is the kit they are written with:

| Name | What it is for |
|---|---|
| `isolated()` | a service built with the dependencies the test chooses, nothing else |
| `withServices()` | the services the code reads (`Database`, `Cache`, `Storage`, …) given by the test |
| `fakeDatabase()` | a database in memory, for `withServices({ Database })` |
| `api`, `testRun` | the app over HTTP, as the run's test users (`api.signInAs("alice")`) |
| `createTestApi`, `TestApiError` | a client of your own; what a refusal throws |

The HTTP half is `palbase/server/testing` — the same names, for a backend written with any framework (NestJS, Express, …). The tests run with **Bun's test runner** (`bun:test`), as the platform runs them: Bun keeps the decorator metadata `isolated()` reads a constructor's dependencies from. `palbase init` starts a backend with its tests in `tests/` and `"test": "bun test ./tests"`.

## Unit tests: `isolated()`

A service takes its dependencies by constructor. `isolated()` builds the class the test asks for, with what `.with()` gives in place of a dependency — however deep it is — and every other one built as the app builds it:

```ts
// src/modules/mail/mailer.ts
import { Injectable, Log } from "palbase/backend";

export abstract class Mailer {
  abstract send(to: string, subject: string): Promise<void>;
}

@Injectable()
export class LogMailer extends Mailer {
  async send(to: string, subject: string): Promise<void> {
    Log.info("mail", { to, subject });
  }
}
```

```ts
// src/modules/mail/welcome.service.ts
import { BadRequest, Injectable } from "palbase/backend";
import { Mailer } from "./mailer";

@Injectable()
export class WelcomeService {
  constructor(private readonly mailer: Mailer) {}

  async welcome(email: string): Promise<void> {
    if (!email.includes("@")) throw new BadRequest({ fields: [{ field: "email", message: "not an address" }] });
    await this.mailer.send(email, "Welcome");
  }
}
```

```ts
// tests/welcome.test.ts
import { describe, expect, it } from "bun:test";
import { BadRequest } from "palbase/backend";
import { isolated } from "palbase/backend/test";
import { Mailer } from "../src/modules/mail/mailer";
import { WelcomeService } from "../src/modules/mail/welcome.service";

class RecordingMailer extends Mailer {
  readonly sent: string[] = [];
  async send(to: string): Promise<void> {
    this.sent.push(to);
  }
}

describe("WelcomeService", () => {
  it("mails the address it is given", async () => {
    const mailer = new RecordingMailer();
    await isolated().with(Mailer, mailer).get(WelcomeService).welcome("ada@example.com");
    expect(mailer.sent).toEqual(["ada@example.com"]);
  });

  it("refuses what is not an address, naming the field", async () => {
    const welcome = isolated().with(Mailer, new RecordingMailer()).get(WelcomeService);
    await expect(welcome.welcome("ada")).rejects.toBeInstanceOf(BadRequest);
  });
});
```

Each `isolated()` is a container of its own: one instance of each class within it, nothing shared with another test or with the app. Two classes that need each other to be built are refused, naming the circle; `.with()` one of them and there is none.

## The services the code reads: `withServices()`

`Database`, [`Cache`](https://palbase.studio/docs/backend/cache), `Secrets`, `Storage`, `Notifications`, `Flags`, `Realtime` and `Log` are read where the code needs them, not passed in. `withServices(given, fn)` runs `fn` as a request does, with the services given: `Database` is the client given (`fakeDatabase().raw`), each other service the object given. A service the code reads and the test did not give is refused **by name** — its real calls would reach a platform no test serves — and `Log` writes as it always does.

```ts
// src/modules/notes/notes.service.ts
import { Cache, Database, Injectable } from "palbase/backend";

@Injectable()
export class NotesService {
  async count(owner: string): Promise<number> {
    const cached = await Cache.get<number>(`notes:${owner}`);
    if (cached !== null) return cached;
    const n = await Database.$count("notes", { owner });
    await Cache.set(`notes:${owner}`, n, 60);
    return n;
  }
}
```

```ts
// tests/notes.service.test.ts
import { describe, expect, it } from "bun:test";
import { fakeDatabase, isolated, withServices, type RuntimeServices } from "palbase/backend/test";
import { NotesService } from "../src/modules/notes/notes.service";

describe("NotesService", () => {
  it("counts a user's notes, and keeps the count for a minute", async () => {
    const db = fakeDatabase();
    db.seed("notes", [
      { id: "n1", owner: "ada", title: "one" },
      { id: "n2", owner: "ada", title: "two" },
      { id: "n3", owner: "bob", title: "three" },
    ]);
    const kept = new Map<string, unknown>();
    const cache = {
      get: async (key: string) => kept.get(key) ?? null,
      set: async (key: string, value: unknown) => void kept.set(key, value),
    } as unknown as RuntimeServices["Cache"];

    const n = await withServices({ Database: db.raw, Cache: cache }, () => isolated().get(NotesService).count("ada"));
    expect(n).toBe(2);
    expect(kept.get("notes:ada")).toBe(2);
  });
});
```

`withServices` also carries a string table for `t()` ([Translations](https://palbase.studio/docs/backend/translations)): `withServices(given, fn, { strings, acceptLanguage: "en" })`, with `loadStringsTable(root)` reading the project's `palbase/strings`.

### A database in memory: `fakeDatabase()`

`fakeDatabase()` answers the engine's operations with the engine's filters and refusals: `seed(table, rows)` puts rows in, `inserted`, `updated` and `deleted` say what the code wrote, and raw SQL is recorded in `queries`, not run. What it cannot answer as Postgres would — a unique key, a relation, a cursor, search, an `$atomic`'s isolation — it refuses by name. It has no schema (no column's default, type or constraint is applied), it reads text of digits as the number it spells, it gives rows in the order they were written unless `orderBy` says otherwise, and there is no row-level security. What depends on those is tested against the app over HTTP, or against a Postgres of your own (below).

## Over HTTP: `api`, as test users

`api` calls the app under test where the run says it answers (`PALBASE_TEST_BASE_URL`), as the test users the run made for it (`PALBASE_TEST_IDENTITIES`, each with its access token). `testRun.stack` says whether an app answers: an HTTP test skips itself where none does, so `bun test` passes on a computer with no app started.

```ts
// tests/notes.http.test.ts
import { describe, expect, it } from "bun:test";
import { api, TestApiError, testRun } from "palbase/backend/test";

describe.skipIf(!testRun.stack)("notes, over HTTP", () => {
  it("are each user's own", async () => {
    const title = `a test run's note ${crypto.randomUUID()}`;
    await api.signInAs("alice");
    const note = await api.post<{ id: string }>("/notes", { title });
    expect((await api.get<{ title: string }>(`/notes/${note.id}`)).title).toBe(title);

    await api.signInAs("bob");
    const refused = await api.get(`/notes/${note.id}`).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(TestApiError);
    expect((refused as TestApiError).status).toBe(404);
  });

  it("refuses a caller with no token", async () => {
    api.asAnonymous();
    const refused = await api.post("/notes", { title: "x" }).catch((e: unknown) => e);
    expect((refused as TestApiError).status).toBe(401);
  });
});
```

- `api.signInAs(name)` acts as the run's test user of that name; `api.asAnonymous()` as no one. `api.signIn({ email, password })` signs in at the project's auth (it needs a publishable key: `PALBASE_TEST_API_KEY`).
- A refusal throws `TestApiError`: its `status`, its code (`error`), its `data` and the whole `body`, the platform's envelope.
- `testRun.minted("alice")` says whether the run made that user. `createTestApi({ baseUrl, identities, … })` is a client of your own, for a test that calls two apps.

## Running them

| Where | How | What runs |
|---|---|---|
| Your computer | `bun test` | the unit tests; the HTTP tests skip themselves |
| Your computer, against your app | `palbase test --users alice,bob --base-url http://localhost:8080 -- bun test ./tests` | all of them, as test users made for this run in the environment you use, deleted when the command ends — Ctrl-C too |
| As a machine runs them | `palbase test --machine backend --base-url http://localhost:8080` | the machine's own test command, as its test users (it shows the command and asks before running it; `-y` says yes) |
| An agent with an environment's token, against the deployed machine | `PALBASE_TOKEN=pbe_… palbase test --users alice,bob --base-url https://<ref>.app.palbase.studio -- bun test ./tests` | all of them, against the version that serves, as test users made with the token (scope `auth:test-users`) and deleted when the command ends. No key is made: the command gets no `PALBASE_SECRET_KEY`, so it starts no app of its own. In `main`, `-y` confirms the test users made there |
| The platform | `palbase machines:update backend --test-command "bun test ./tests" --test-users alice,bob` | every new build, against the new version itself, before it takes traffic |

On the platform the tests run against the new version **as it will run** — its env, its secrets, its database, after its migration has started: they pass and it takes traffic; one fails and the build fails, naming the test, while the machine keeps serving the version it runs (see [Builds](https://palbase.studio/docs/machines/builds#tests-before-it-takes-traffic)). The tests write where the app writes, so write them as a real user's session: a note of their own, not a table they expect empty. What a test user owns goes with them — the run deletes its users, and a deleted user's rows are erased (`ownedByUser()`, on `user.deleted`).

The image has to carry the tests: `palbase init`'s `Dockerfile` copies `tests/`, and Bun's types are a dev dependency the image does not install.

When a test fails with a `500`, its `TestApiError` names the request's id (`request_id`). What the app printed for it — its error, its stack, on a line with that id — is in the build's log after what the tests printed (`palbase machines:builds:log <build>`), and in the machine's log as `source: "test"`: `palbase machines:logs <name> --search <request_id>` finds it. An environment token with `machines:logs` reads both.

## Without the network

The kit tests the app as it is deployed. The app can also be tested inside the test's own process — its routes, auth, validation and refusals answering a `Request` through `handle()`, no port opened.

### The app in the process: `handle()`

`PalbaseFactory.create` answers a `Request` through the app's `handle()`, the same path a request from the network takes. A test builds the app with its own environment, on a free port, without exiting on a crash:

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Get, Post, User, z, type UserT } from "palbase/backend";

export const CreateNote = z.object({ title: z.string().min(1).max(200) });
export type CreateNote = z.infer<typeof CreateNote>;

@Controller("/notes")
export class NotesController {
  @Post("")
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): { owner: string; title: string } {
    return { owner: user.id, title: body.title };
  }

  @Get("/health", { auth: false })
  health(): { ok: true } {
    return { ok: true };
  }
}
```

```ts
// src/modules/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesController } from "./notes.controller";

@Module({ controllers: [NotesController] })
export class NotesModule {}
```

```ts
// tests/notes.handle.test.ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PalbaseFactory, type PalbaseApplication } from "palbase/backend";
import { NotesModule } from "../src/modules/notes/notes.module";

const env = {
  PALBASE_URL: "https://abcd1234.palbase.studio",
  PALBASE_PROJECT_ID: "11111111-2222-3333-4444-555555555555",
  PALBASE_SECRET_KEY: "pb_abcd1234_s0123456789abcdef0123456789abcdef",
};

let app: PalbaseApplication;
beforeAll(async () => {
  app = await PalbaseFactory.create(NotesModule, { env, port: 0, host: "127.0.0.1", exitOnFatal: false });
});
afterAll(() => app.close());

const call = (path: string, init?: RequestInit) => app.handle(new Request(`http://app.test${path}`, init));

describe("notes over HTTP", () => {
  it("serves a public route", async () => {
    const res = await call("/notes/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("refuses a caller with no token, in the envelope", async () => {
    const res = await call("/notes", { method: "POST", body: JSON.stringify({ title: "x" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized", status: 401 });
  });

  it("lists the routes it serves", () => {
    expect(app.routes).toEqual(["POST /notes", "GET /notes/health"]);
  });
});
```

- `env` stands in for what the platform and the project's Secrets give a machine. Nothing is called with these values until a route needs the project: a route with no token never asks for the project's keys.
- `port: 0` takes a free port, so tests can run side by side. `exitOnFatal: false` leaves a crash to the test runner instead of exiting the process.
- `app.close()` stops it and runs every `onShutdown()`.

### Signed-in requests, without the network

A signed-in route needs a token the app verifies against a key set. In a test the key set is the test's own: `createApp` (the engine `PalbaseFactory` serves) takes a `TokenVerifier` you build, and `createServer` takes a `fetch` that answers the project's module calls however the test says. A helper that makes all three:

```ts
// tests/project.ts
import { createServer } from "palbase/server";
import { TokenVerifier } from "palbase/backend";

export const url = "https://abcd1234.palbase.studio";
export const projectId = "11111111-2222-3333-4444-555555555555";

const b64 = (bytes: Uint8Array | string): string =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes).toString("base64url");

/** A signing key of the test's own, the key set that publishes it, and tokens it signs. */
export async function testProject(answer: (url: URL, init: RequestInit) => Response = () => Response.json({})) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "test", alg: "ES256", use: "sig" };

  const verifier = new TokenVerifier({
    issuer: url,
    projectId,
    fetch: async () => Response.json({ keys: [jwk] }),
    // Every session stands; a test of sign-out answers false for its session.
    standing: async () => true,
  });

  async function token(userId: string, claims: Record<string, unknown> = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const body = {
      iss: url, aud: [url], sub: userId, exp: now + 900, iat: now, auth_time: now,
      email: `${userId}@example.com`, email_verified: true, role: "authenticated",
      session_id: `ses_${userId}`, project_id: projectId, ...claims,
    };
    const head = b64(JSON.stringify({ alg: "ES256", kid: "test", typ: "JWT" }));
    const payload = b64(JSON.stringify(body));
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(`${head}.${payload}`));
    return `${head}.${payload}.${b64(new Uint8Array(signature))}`;
  }

  // `Palbase.*` inside the app: each call answered by `answer`, sent once.
  const server = createServer({
    url,
    secretKey: "pb_abcd1234_s0123456789abcdef0123456789abcdef",
    fetch: async (input, init) => answer(new URL(String(input)), init ?? {}),
    retry: { attempts: 1, maxWaitSeconds: 0 },
  });

  return { verifier, token, server };
}
```

```ts
// tests/notes.signed-in.test.ts
import { describe, expect, it } from "bun:test";
import { createApp } from "palbase/backend";
import { testProject } from "./project";
import { NotesModule } from "../src/modules/notes/notes.module";

describe("notes for a signed-in user", () => {
  it("takes the user from the token", async () => {
    const project = await testProject();
    const app = createApp({ modules: [NotesModule], verifier: project.verifier, server: project.server });
    await app.start();

    const res = await app.handle(
      new Request("http://app.test/notes", {
        method: "POST",
        headers: { authorization: `Bearer ${await project.token("usr_ada")}` },
        body: JSON.stringify({ title: "Ship it" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owner: "usr_ada", title: "Ship it" });

    // A refusal the schema makes, with the field it names.
    const bad = await app.handle(
      new Request("http://app.test/notes", {
        method: "POST",
        headers: { authorization: `Bearer ${await project.token("usr_ada")}` },
        body: JSON.stringify({ title: "" }),
      }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "bad_request", data: { fields: [{ field: "title" }] } });
    await app.stop();
  });
});
```

`createApp` takes the same settings the bootstrap does (`auth`, `rateLimit`, `maxBodyBytes`, `cors`, `webhookSecret`) and builds the container at once, so a wiring mistake throws right there. `start()` runs every `onStart()`, and `stop()` runs every `onShutdown()`. It opens no port. To test an [`@On` handler](https://palbase.studio/docs/backend/hooks), give it a `webhookSecret` and hand it a signed delivery.

> **Note:** Classes are recorded process-wide when their files are imported. Build each test file's app from modules that own every `@Controller`, `@Injectable()` and `@On` class that file's imports bring in, or the build stops with `unowned class`.

### Against a Postgres of your own

`Database` is the request's transaction against a real Postgres, so a test that reaches it needs one: Postgres 18, with the roles the platform's databases have, and the app's schema migrated into it. The roles, made once:

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE app_owner LOGIN CREATEDB;
CREATE ROLE app_login LOGIN NOINHERIT;
GRANT anon, authenticated, service_role TO app_login;
```

Migrate it with the app itself, as a release does: run it once with `PALBASE_DB_MIGRATE=start` and once with `PALBASE_DB_MIGRATE=complete`, each with `PALBASE_DB_OWNER_URL` naming the owner. Then build the app with `db: { schemas }` and `PALBASE_DB_URL` naming `app_login`. A migration run exits the process, so run it before the tests, not inside them. The default database driver is Bun's SQL: tests that run on Node give the app a driver of their own. See [Database](https://palbase.studio/docs/backend/database) and [Schema changes](https://palbase.studio/docs/backend/migrations).

## Related

- [Builds](https://palbase.studio/docs/machines/builds#tests-before-it-takes-traffic): tests before a version takes traffic
- [Modules & Dependency Injection](https://palbase.studio/docs/backend/modules): the constructor seam
- [Event Hooks](https://palbase.studio/docs/backend/hooks): signing a delivery in a test
- [Test Users](https://palbase.studio/docs/backend/test-users): users made for tests
- [Responses & Errors](https://palbase.studio/docs/backend/errors): what a refusal looks like
