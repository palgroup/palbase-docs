> The full documentation index: https://palbase.studio/llms.txt

# Next.js

A Next.js app uses Palbase in two places. In the browser, `palbase/web` signs the user in and calls the project's address directly. On the server (the proxy, server components, server actions, route handlers), the same client reads who is signed in from the request's cookies, and `palbase/server` acts as the project with the secret key. `palbase/web/ssr` joins the two: it keeps the session in a cookie the page and your server both read, as `@supabase/ssr` does for Supabase.

## Quick example

The browser's client keeps its session in the page's cookies:

```ts
// src/lib/palbase.ts
"use client";

import type { PalbaseClient } from "palbase/web";
import { createBrowserClient } from "palbase/web/ssr";

// The environment's address and publishable key, from Studio. Public: they go into the bundle.
export const PROJECT = process.env.NEXT_PUBLIC_PALBASE_URL ?? "https://k3xq81w4m.palbase.studio";
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY ?? "pb_k3xq81w4m_cZ8yX7wV6uT5";

let client: PalbaseClient | undefined;

/** The browser's client, made on first use: from an effect or an event handler, which run in the browser. */
export function palbase(): PalbaseClient {
  client ??= createBrowserClient({ url: PROJECT, publishableKey: PUBLISHABLE_KEY });
  return client;
}
```

```tsx
// src/app/signin/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { palbase } from "../../lib/palbase";

export default function SignInPage() {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(form: FormData) {
    // From the browser: auth's limits count this person's own address.
    const result = await palbase().auth.signIn(String(form.get("email")), String(form.get("password")));
    if (result.mfaRequired) return setProblem("a second factor is needed");
    // The session is in the cookie now: the server's pages see it.
    router.push("/account");
    router.refresh();
  }

  return (
    <form action={(form) => void submit(form).catch(() => setProblem("those details were not accepted"))}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit">Sign in</button>
      {problem && <p role="alert">{problem}</p>}
    </form>
  );
}
```

A server component reads who it is from the request:

```ts
// src/lib/palbase-server.ts
import { cookies } from "next/headers";
import type { PalbaseClient } from "palbase/web";
import { createServerClient } from "palbase/web/ssr";

const PROJECT = process.env.NEXT_PUBLIC_PALBASE_URL ?? "https://k3xq81w4m.palbase.studio";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY ?? "pb_k3xq81w4m_cZ8yX7wV6uT5";

/** A server component's client: it reads the request's cookies and never writes them. */
export async function readingClient(): Promise<PalbaseClient> {
  const jar = await cookies();
  return createServerClient({ url: PROJECT, publishableKey: PUBLISHABLE_KEY, cookies: { getAll: () => jar.getAll() } });
}

/** A server action's or a route handler's client: it may renew the session and write it back. */
export async function writingClient(): Promise<PalbaseClient> {
  const jar = await cookies();
  return createServerClient({
    url: PROJECT,
    publishableKey: PUBLISHABLE_KEY,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value, c.options)),
    },
  });
}
```

```tsx
// src/app/account/page.tsx
import { redirect } from "next/navigation";
import { keepSession } from "palbase/web/ssr";
import { readingClient } from "../../lib/palbase-server";

export default async function AccountPage() {
  // Auth's answer for the token in the cookie: never the cookie's word alone.
  const user = await keepSession(await readingClient());
  if (!user) redirect("/signin");
  return <p>Signed in as {user.email ?? user.id}</p>;
}
```

## The browser calls the project directly

The browser calls `https://<ref>.palbase.studio` itself. The project's address answers a page on any site, preflights included, so the app needs no rewrite of the modules' paths, and should have none. Through a rewrite every user's call reaches the project from your Next.js server's address, and what the project decides from a caller's address is then decided from yours, for all your users at once: auth's limits on sign-in attempts, the proof-of-work it asks of a busy address, the country a flag's condition reads and an analytics event is given. See [Overview](https://palbase.studio/docs/web/overview#calling-the-project-from-a-browser).

For the same reason, sign the user in **in the browser**, as the example does, and not in a server action: a sign-in your server makes for every user comes from one address.

## The session cookie

`createBrowserClient` keeps the session in a cookie named `pb-<ref>-session`, split into `pb-<ref>-session.0`, `.1`, … when it is longer than a cookie holds. It is written for the whole site (`path=/`), `SameSite=Lax` so a link from elsewhere (a sign-in email) opens the page signed in, `Secure` (the browser's client leaves it off on a page served over http, such as `http://localhost:3000`, and the server's needs `cookieOptions: { secure: false }` there), and readable by the page's script, because the browser's client reads it there. The browser keeps it as long as it keeps any cookie (400 days); the session itself ends when its refresh token does. `cookieOptions` changes any of that, for the browser's client and the server's alike: `{ domain: ".example.com" }` shares the session with the site's other subdomains.

The cookie is where the session is kept, not how a call proves it. Every call still carries the access token as `Authorization: Bearer …`, and the project reads no cookie. What a cookie says is what the browser wrote, and a browser can write anything: `keepSession` asks auth whose the token is before your code acts on it.

## On the server

`createServerClient({ url, publishableKey, cookies })` is one request's client: its session is the request's cookies. Give it `getAll`, which reads them, and, where the server can write the response's cookies, `setAll`.

Who renews the session matters. A renewal hands out a new refresh token and the old one stops working, so a renewal whose new token cannot be written back ends the session at the next one. The client follows what you gave it:

| Where | `cookies` | What the client does |
|---|---|---|
| The proxy (`src/proxy.ts`) | `getAll` and `setAll` | Renews a session with five minutes or less left on the way in, before any page renders. |
| A server action, a route handler | `getAll` and `setAll` | Renews before a call that finds the token about to lapse, and writes the new session back. |
| A server component | `getAll` only | Never renews: Next.js lets a server component read cookies, not write them. Run the proxy before the pages that read the session, so none renders with a token that has lapsed. |

`keepSession(pb)` is who is signed in, as auth says: it renews first when the client can and the session has little left, then asks auth whose the access token is (`GET /auth/user`). It answers the user, or `null` when no one is signed in, the session is over, or auth does not take the token. When auth cannot be asked, it throws a `PalbaseError`: the network failed, or a server component's token lapsed with no proxy to renew it (`missing_credential`). It writes nothing but a renewal, so it never puts back an older session over one the browser renewed meanwhile.

The proxy keeps the session fresh for every page it runs before:

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, keepSession } from "palbase/web/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pb = createServerClient({
    url: process.env.NEXT_PUBLIC_PALBASE_URL ?? "https://k3xq81w4m.palbase.studio",
    publishableKey: process.env.NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY ?? "pb_k3xq81w4m_cZ8yX7wV6uT5",
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        // The pages rendered after this see the renewed session...
        for (const c of cookies) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        // ...and so does the browser.
        for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
        // An answer that writes one person's session is kept by no cache.
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const user = await keepSession(pb);
  if (!user && request.nextUrl.pathname.startsWith("/account")) {
    return NextResponse.redirect(new URL("/signin", request.url));
  }
  return response;
}

export const config = {
  // Every page, not the build's static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

`setAll` is given the cookies and the headers to send with them: `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0` and `Pragma: no-cache`. An answer that writes a session is one person's, and a cache between your server and the browser that kept it would hand it to the next person. Set them on the response with the cookies.

The redirect is a convenience for the reader, not the check: a page that shows one person's data asks `keepSession` itself, as the account page above does.

## Acting as the project

A route handler that does what only the project may, such as sending an email, checks who is asking with the request's client and then acts with the secret key:

```ts
// src/lib/server.ts
import { createServer } from "palbase/server";

const PROJECT = process.env.NEXT_PUBLIC_PALBASE_URL ?? "https://k3xq81w4m.palbase.studio";

/** The project, with its secret key: server code only. */
export const server = createServer({ url: PROJECT, secretKey: process.env.PALBASE_SECRET_KEY ?? "" });
```

```ts
// src/app/api/invite/route.ts
import { keepSession } from "palbase/web/ssr";
import { writingClient } from "../../../lib/palbase-server";
import { server } from "../../../lib/server";

export async function POST(request: Request): Promise<Response> {
  const user = await keepSession(await writingClient());
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { to } = (await request.json()) as { to: string };
  await server.notify.sendEmail({
    body: { to, subject: "You're invited", text: `${user.email ?? "A friend"} invited you.`, category: "transactional" },
  });
  return new Response(null, { status: 204 });
}
```

```ts
// src/invite.ts
"use client";

export async function invite(to: string): Promise<void> {
  // Same origin: the browser sends the session cookie with it.
  const res = await fetch("/api/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to }),
  });
  if (!res.ok) throw new Error(`the invite was refused: ${res.status}`);
}
```

A message composed whole like this one goes out through the project's own email provider. A template goes through the platform's shared sender too. See [Notifications](https://palbase.studio/docs/backend/notifications).

`createServer` takes the same address as the browser's client. It refuses to run where there is a `document`, and its package resolves to an error in a browser bundle, so the secret key cannot ship to the client by accident.

A larger backend, with its own database and routes, is a machine of its own rather than route handlers, and the browser calls it with the user's token. See [Calling Your Backend](https://palbase.studio/docs/web/backend-calls).

## Without cookies

`createClient` from `palbase/web` keeps the session in the browser's `localStorage` instead. Then the server sees no session of its own, and an app renders what is the user's in client components and keeps server components for what is the same for everyone. A client made with `createClient` belongs in client components (`"use client"`), made on first use as `palbase()` above is: a module that called it at import would run on the server too while Next renders the client component's first HTML, where there is no `localStorage`.

Everything in [Auth](https://palbase.studio/docs/web/auth) and [Realtime](https://palbase.studio/docs/web/realtime) works with either client as written.

## Environment variables

| Variable | Where | What |
|---|---|---|
| `NEXT_PUBLIC_PALBASE_URL` | Build, browser and server | The environment's address, `https://<ref>.palbase.studio`. Read by the browser's client and by the server. |
| `NEXT_PUBLIC_PALBASE_PUBLISHABLE_KEY` | Build, browser and server | The publishable key, `pb_<ref>_c…`. Public by design. |
| `PALBASE_SECRET_KEY` | Server only | A secret key, `pb_<ref>_s…`, from Studio's Settings › API keys. Never `NEXT_PUBLIC_`. |

A `NEXT_PUBLIC_` value is built into the bundle, so the address and the key are fixed at build time: build once per environment.

## Related

- [Overview](https://palbase.studio/docs/web/overview) — the client, and what the project's address answers a browser
- [Auth](https://palbase.studio/docs/web/auth) — the flows, and the pages auth's emails link to
- [Realtime](https://palbase.studio/docs/web/realtime) — channels over the project's socket
- [Uploads](https://palbase.studio/docs/web/uploads) — sending a file to a signed URL
- [Server SDK](https://palbase.studio/docs/server/overview) — `createServer` and the secret key
