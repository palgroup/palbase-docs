> The full documentation index: https://palbase.studio/llms.txt

# Quickstart

In this guide you create a Palbase project in Studio, sign a user up and in from a web app, write a small backend with `palbase/backend`, put it on a machine by pushing it to GitHub, and call it from the web app as the signed-in user. Nothing here is run from a command line of Palbase's — the project is Studio's, the deploy is `git push`.

## Before you start

| You need | Why |
|---|---|
| **A Studio account** | where the project lives |
| **A GitHub repository** you can push to | a machine is built from a branch of it |
| **Bun 1.4** — [bun.sh](https://bun.sh) | the backend runs on Bun, and `bun install` writes the lockfile its build installs from |
| **Node.js 22** | the web app (Next.js) |

> **Note:** The SDK is one npm package, `palbase` — `palbase/web` for the app, `palbase/backend` for the backend (it brings `palbase/server` and `palgres`), and the CLI (`npx palbase`): `npm install palbase` (or `bun add palbase`).

## 1. Create a project

In Studio, **Projects › Create project**: a **Project name**, its **First environment**, and the **Organization** it belongs to (asked only when you have more than one). The first environment's slug is always `main`.

Open the environment. Everything in this guide is that environment's — it is a project of its own, with its own address, keys, users, machines and databases:

- its **address**, `https://<ref>.palbase.studio` — the ref is on **Settings**;
- its **publishable key**, `pb_<ref>_c…`, on **Settings › API keys** — the key apps ship.

## 2. Sign a user up from a web app

Start a Next.js app and give it the web SDK:

```json
{
  "dependencies": {
    "palbase": "^0.10.0",
    "next": "^16.3.4",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  }
}
```

and three settings, in `.env.local`:

```text
NEXT_PUBLIC_PALBASE_URL=https://<ref>.palbase.studio
NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY=pb_<ref>_c…
NEXT_PUBLIC_BACKEND_URL=https://<ref>.app.palbase.studio
```

**A browser calls the project's address directly.** The address answers a page on any site, so nothing stands between the app and the project ([Web SDK](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser) says what it answers, and why the browser is the one to call it). Next.js needs no setting for the SDK: the package is compiled JavaScript.

The client is made once, in the browser, with the project's address:

```ts
// lib/palbase.ts
import { createClient, type PalbaseClient } from "palbase/web";

let client: PalbaseClient | undefined;

/** The project's client: its publishable key, and the signed-in user's session. */
export function palbase(): PalbaseClient {
  client ??= createClient({
    url: process.env.NEXT_PUBLIC_PALBASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY!,
  });
  return client;
}
```

And a page that signs up, signs in, and — after step 6 — calls the backend:

```tsx
// app/page.tsx
"use client";

import { useState } from "react";
import { PalbaseError } from "palbase/web";
import { palbase } from "../lib/palbase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [said, setSaid] = useState("");

  async function attempt(work: () => Promise<string>) {
    try {
      setSaid(await work());
    } catch (e) {
      setSaid(e instanceof PalbaseError ? `${e.status} ${e.code}: ${e.message}` : String(e));
    }
  }

  const signUp = () =>
    attempt(async () => {
      const { user } = await palbase().auth.signUp({ email, password });
      const session = await palbase().auth.currentSession();
      return session ? `signed up and in as ${user.id}` : `signed up as ${user.id}: verify the address, then sign in`;
    });

  const signIn = () =>
    attempt(async () => {
      const result = await palbase().auth.signIn(email, password);
      return result.user ? `signed in as ${result.user.id}` : "this account asks for a second factor";
    });

  const callBackend = () =>
    attempt(async () => {
      const session = await palbase().auth.currentSession();
      if (!session) return "sign in first";
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/me`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      return `${res.status} ${await res.text()}`;
    });

  return (
    <main>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password (15+ characters)" type="password" />
      <button onClick={() => void signUp()}>Sign up</button>
      <button onClick={() => void signIn()}>Sign in</button>
      <button onClick={() => void callBackend()}>Call the backend</button>
      <p>{said}</p>
    </main>
  );
}
```

Run it (`npm run dev`), sign up, and the user is in **Auth › Users** in Studio. A password of a single factor is 15 characters at least. A project that asks for a verified email answers the sign-up without a session; the verification is [Web Auth](https://palbase.studio/docs/web/auth)'s to explain.

You have used one module — auth — with no backend at all. Storage, realtime, flags, notify and analytics are the same: every project has them, the publishable key reaches what an app may do, and the secret key reaches the rest ([Introduction](https://palbase.studio/docs/getting-started/introduction)).

## 3. Write the backend

A backend is its own directory — its own repository here — that a machine builds:

```text
notes-backend/
├── Dockerfile
├── .env.example
├── package.json
├── bun.lock
├── tsconfig.json
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── me.controller.ts
    └── modules/notes/
        ├── dto.ts
        ├── notes.controller.ts
        ├── notes.module.ts
        └── notes.service.ts
```

```json
{
  "name": "notes-backend",
  "private": true,
  "type": "module",
  "scripts": { "start": "bun run src/main.ts" },
  "dependencies": {
    "palbase": "^0.10.0"
  }
}
```

The decorators read the types TypeScript emits, so `tsconfig.json` turns both on:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

The schemas of a domain sit in its `dto.ts` — each one a value for `@Body` and a type of the same name:

```ts
// src/modules/notes/dto.ts
import { z } from "palbase/backend";

export const CreateNote = z.object({ title: z.string().min(1).max(200) });
export type CreateNote = z.infer<typeof CreateNote>;

export const Note = z.object({ id: z.string(), owner: z.string(), title: z.string(), created_at: z.string() });
export type Note = z.infer<typeof Note>;
```

The service holds the logic. This one keeps notes in the machine's memory — enough to see the whole path work; [step 8](#8-where-next) gives it a database:

```ts
// src/modules/notes/notes.service.ts
import { Injectable, NotFound } from "palbase/backend";
import type { CreateNote, Note } from "./dto";

// In this process only: a machine that sleeps, or a second copy, does not have them.
@Injectable()
export class NotesService {
  private readonly notes = new Map<string, Note>();

  list(owner: string): Note[] {
    return [...this.notes.values()].filter((n) => n.owner === owner);
  }

  create(owner: string, input: CreateNote): Note {
    const note: Note = { id: crypto.randomUUID(), owner, title: input.title, created_at: new Date().toISOString() };
    this.notes.set(note.id, note);
    return note;
  }

  get(owner: string, id: string): Note {
    const note = this.notes.get(id);
    if (!note || note.owner !== owner) throw new NotFound(`no note ${id}`);
    return note;
  }
}
```

The controller is HTTP only — and every route needs a signed-in user unless it says otherwise:

```ts
// src/modules/notes/notes.controller.ts
import { Body, Controller, Get, Param, Post, User, type UserT } from "palbase/backend";
import { CreateNote, type Note } from "./dto";
import { NotesService } from "./notes.service";

@Controller("/notes")
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get("")
  list(@User() user: UserT): Note[] {
    return this.notes.list(user.id);
  }

  @Post("", { rateLimit: { max: 30, window: 60 } })
  create(@Body(CreateNote) body: CreateNote, @User() user: UserT): Note {
    return this.notes.create(user.id, body);
  }

  @Get("/{id}")
  read(@Param("id") id: string, @User() user: UserT): Note {
    return this.notes.get(user.id, id);
  }
}
```

```ts
// src/modules/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({ controllers: [NotesController], providers: [NotesService] })
export class NotesModule {}
```

`/me` answers who the caller is:

```ts
// src/me.controller.ts
import { Controller, Get, User, type UserT } from "palbase/backend";

@Controller("/me")
export class MeController {
  @Get("")
  me(@User() user: UserT): { id: string; email: string | null; emailVerified: boolean } {
    return { id: user.id, email: user.email, emailVerified: user.emailVerified };
  }
}
```

The root module lists what exists, and `main.ts` serves it. The browser calls the backend from the web app's origin, so the backend names that origin (CORS is the backend's own to answer):

```ts
// src/app.module.ts
import { Module } from "palbase/backend";
import { MeController } from "./me.controller";
import { NotesModule } from "./modules/notes/notes.module";

@Module({ imports: [NotesModule], controllers: [MeController] })
export class AppModule {}
```

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";

// Serves on $PORT. The project's address, id and secret key come from the
// environment: the machine is started with them.
await PalbaseFactory.create(AppModule, {
  cors: { origins: (process.env.WEB_ORIGINS ?? "http://localhost:3000").split(",") },
});
```

How the machine runs it:

```dockerfile
FROM oven/bun:1.4.2-alpine@sha256:d888c0ae6c86d7866ff10c5aafdd9077b36aee6455b33dd270fb93c0dd5cef6f
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY src ./src
USER bun
CMD ["bun", "run", "src/main.ts"]
```

And what it needs before it can start — the build reads this file, and waits rather than roll out an app that would not:

```text
PALBASE_URL=
PALBASE_PROJECT_ID=
PALBASE_SECRET_KEY=
```

Run `bun install` once to write `bun.lock`, and commit everything.

## 4. Give it the secret key

The machine is started with `PALBASE_URL` and `PALBASE_PROJECT_ID` by the platform. `PALBASE_SECRET_KEY` is yours to give — the backend uses it to reach the project's modules and to check its callers' sessions.

1. **Settings › API keys › Secret keys**: a **Key name** (`notes backend`), **Create secret key**. It is shown **once** — copy it now.
2. **Environment › Variables**, **Add secret**: the name `PALBASE_SECRET_KEY`, the key as its value.

The secret is in the environment's **production** set. A machine starts with the set it names, which you choose in the next step.

## 5. Connect GitHub and open the machine

**Backend › Machines › New machine**:

1. **Connect GitHub** — GitHub asks where to install **Palbase Cloud**; choose the repository, and connect it to this project by writing its ref when Palbase asks. Back in Studio, **Refresh** ([Connecting GitHub](https://palbase.studio/docs/machines/github)).
2. **Repository**: `you/notes-backend`; **Branch**: `main`; **Directory**: empty (the repository's root).
3. **Name**: `backend` — the machine of that name answers at `https://<ref>.app.palbase.studio`. **Size**: `shared-256`. **Port**: `8080`.
4. **Create machine**.

The branch's head is built at once. Its build stops at **Waiting for variables**, `PALBASE_SECRET_KEY` missing: the machine starts with no secrets yet. Open it, **Edit settings**, **Secrets: Production secrets**, **Save settings** — and the waiting build rolls out by itself. `.env.example` is what caught it ([Builds](https://palbase.studio/docs/machines/builds#envexample-what-the-program-must-be-given)).

## 6. Push

From now on, a push is the deploy:

```bash
git commit -am "Notes: read one by id"
git push origin main
```

The commit gets a **Palbase Cloud** check on GitHub — *Building*, then *Rolled out* — and the machine page lists the build with its log. The new version starts beside the old one and takes traffic once it answers its health check; a version that does not come up never takes a request.

## 7. Call it

Without a token, the backend refuses — in the envelope every refusal comes in:

```bash
curl -i https://<ref>.app.palbase.studio/me
# HTTP/2 401
# {"error":"unauthorized","error_description":"This route needs a signed-in user","status":401,"request_id":"req_…"}
```

From the web app, signed in, **Call the backend** answers `200` with the user's id and email: the browser sent the session's access token, and the backend checked it against the project. Notes work the same way — `POST /notes` with `{"title": "…"}` and the same header.

What the backend writes is on its machine page under **Logs**, and `Log` from `palbase/backend` puts the request's id on every line ([Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds#logs)). Every request to the environment's address, whichever module answers it, is on Studio's **Logs** page ([Logs](https://palbase.studio/docs/getting-started/logs)).

## 8. Where next

- **A database.** **Database › Databases › New database**, then give it to the machine with **Run migrations** on. Declare the table in `src/db/public.ts`, pass it to `PalbaseFactory.create(AppModule, { db: { schemas: [schema] } })`, and the next push migrates it before the new version serves: [Databases](https://palbase.studio/docs/machines/databases), [Database](https://palbase.studio/docs/backend/database), [Schema](https://palbase.studio/docs/backend/schema).
- **Who sees what.** Row-level security in the schema keeps each user's rows theirs, whatever a route forgets: [Row-Level Security](https://palbase.studio/docs/backend/row-level-security).
- **The other modules** from the backend — files, email, flags, realtime — are `Palbase.storage`, `Palbase.notify`, `Palbase.flags`, `Palbase.realtime`: [Storage](https://palbase.studio/docs/backend/storage), [Notifications](https://palbase.studio/docs/backend/notifications).
- **More environments.** A staging environment is another environment of the project, with machines built from another branch.

## Related

- [Introduction](https://palbase.studio/docs/getting-started/introduction) — the modules, the keys, and environments
- [Architecture](https://palbase.studio/docs/getting-started/architecture) — how a backend's code is shaped
- [Project Structure](https://palbase.studio/docs/getting-started/project-structure) — every file of the backend above
- [Machines](https://palbase.studio/docs/machines/overview) · [Connecting GitHub](https://palbase.studio/docs/machines/github) · [Builds, Logs & Rollback](https://palbase.studio/docs/machines/builds)
- [Web SDK](https://palbase.studio/docs/web/overview) · [Web Auth](https://palbase.studio/docs/web/auth) — the client in full
- [Calling Your Backend](https://palbase.studio/docs/web/backend-calls) — the browser side of step 7
