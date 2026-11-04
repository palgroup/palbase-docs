> The full documentation index: https://palbase.studio/llms.txt

# Sites, Previews & Domains

A **site** is a web app an environment serves at its own address. A static one is a folder of files — what Vite, Next.js with `output: "export"`, Astro, SvelteKit's static adapter, Nuxt's `generate`, Docusaurus or VitePress writes — answered by the platform's own servers behind a CDN, never asleep. One that runs on a server — Next.js, Nuxt, SvelteKit, React Router (Remix) or Astro rendering pages and answering API routes, or Express — is a [machine](https://palbase.studio/docs/machines/overview) whose site is its address: its pages come from the machine, its framework's hashed files from the CDN ([A web app that runs on a server](#a-web-app-that-runs-on-a-server)). Static sites never sleep: they are answered by the platform's own servers behind a CDN, not by a machine. What they send is the environment's outbound traffic, with its machines' — on Free 5 GB a month at full speed and then slowed, on Pay as you go $0.126 a GiB past it — and the files they keep are billed past 10 GiB ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits#what-compute-costs-past-its-free-quota)).

Every site answers at `<name>-<ref>.palbase.app` — the environment's `web` site at `<ref>.palbase.app` — and, once added, at a domain of your own. A site moves to another environment of the project with `palbase hosting:sites:move <name> --to <env>`: its files go with it, it answers throughout, and its old address keeps working ([Moving to another environment](https://palbase.studio/docs/machines/overview#moving-to-another-environment)).

## Import from GitHub

In Studio: **Cloud › Sites › Import from GitHub** (the project's Cloud: its sites, whatever environment each is bound to). Choose the environment it is bound to, a repository, its branch and the directory the project is in, and **Read the repository**: Palbase reads it at the branch's head — its `package.json`, its framework's configuration, its lockfiles, its Node.js version file — and says what it is, with its build filled in. Change what you will, then **Import**; every push to the branch builds it from then on. Previews are on from the start, for the project's team alone ([who sees a preview](#who-sees-a-preview)): a static web app's pull requests and its other branches ([branch previews](#branch-previews)), a web app's on a server its pull requests; a backend's are turned on on its page, as a machine's are.

```sh
palbase hosting:import                         # this checkout's repository, branch and directory
palbase hosting:import --repo acme/shop --branch main --path apps/web --name shop
palbase hosting:import --as server             # what it is, if Palbase read it otherwise
```

| What it finds | What it is made |
|---|---|
| Vite, Create React App, Gatsby, Docusaurus, VitePress, Vue CLI, Parcel, Angular; Astro without an adapter; Next.js with `output: "export"`; Nuxt with `nuxt generate`; SvelteKit with `adapter-static`; React Router with `ssr: false`; a folder with `index.html` and no `package.json` | a **static site**: built from the branch, served from the CDN |
| Next.js, Nuxt, SvelteKit with `adapter-node`, React Router (Remix), Astro with `output: "server"` or an adapter | a **web app on a server**: a machine, and a site whose server it is |
| Express, Fastify, Koa, Hono, NestJS, AdonisJS; a `go.mod`, `requirements.txt`, `pyproject.toml`, `Gemfile`, `Cargo.toml` or other language's manifest; a `Dockerfile` | a **backend**: a machine |

SvelteKit's `adapter-auto` knows no adapter for Palbase: the import says so, and its build fails until `@sveltejs/adapter-node` is named in `svelte.config`. The import reads, and makes nothing, until you import (`GET /machines/github/detect`).

## Deploy a folder

```sh
npm run build
palbase hosting:deploy dist            # the site "web": opened on the first deploy
palbase hosting:deploy dist --site docs
```

The CLI lists every file of the folder with its SHA-256 and sends only those the environment does not have yet: a release that changes one file sends one file. Once every file is there the release is finished and the site serves it at once. Hidden files (`.env`, `.git`) and `node_modules` are left out; `/.well-known` is kept.

A folder whose only page is `index.html` is taken for a single-page app: a path no file answers is answered with `/index.html`. Say so yourself with `palbase hosting:sites:create <name> --spa` (or `hosting:sites:update <name> --spa | --no-spa`). Otherwise a path no file answers is `/404.html` when there is one, and a 404.

| Limit | |
|---|---|
| Sites per environment | 10 |
| Files per release | 20,000 |
| One file | 25 MiB |
| One release | 1 GiB |
| Releases kept to return to | the 10 newest |
| Files kept, every site's releases and previews together — the project's, all its environments' | 10 GiB on Free; up to 100 GiB on Pay as you go, $0.0315 a GiB-month past the first 10 |
| Build cache kept between a site's builds | counted with the machines' images: 1 GiB free, then $0.2625 a GiB-month on Pay as you go; on Free, past it, the cache is taken back first |

## Built from GitHub

A site can be built on every push instead, as a machine is (see [Connecting GitHub](https://palbase.studio/docs/machines/github)):

```sh
palbase hosting:sites:create web --repo acme/shop --branch main --path apps/web
palbase hosting:builds                 # its builds, newest first
palbase hosting:builds <build> --wait  # one build, its log, followed to its end
palbase hosting:build                  # build the branch's head now
```

The platform reads the lockfile next to the site (or at the repository's root, for a workspace) and installs with pnpm, yarn, npm or bun, runs the `build` script of its `package.json`, and serves the folder its framework writes (`dist` for Vite and Astro, `out` for Next.js, `build` for SvelteKit, `.output/public` for Nuxt …). Say otherwise with `--install-command`, `--build-command` and `--output <dir>`. `--build-env KEY=VALUE` (repeatable) sets what the build runs with — what your pages are sent, such as `VITE_PALBASE_URL` — never a secret: whatever a build bakes into a page, every visitor reads.

**Node.js.** A build runs the Node.js its `.nvmrc` or `.node-version` names — the site's directory's, else the repository root's — else the newest line its `package.json`'s `engines.node` allows, else Node.js 24. The lines are 20 (past its end of life), 22, 24 and 26; a version no build runs is refused with the ones that do. The build's log starts with `node --version`.

**Install cache.** The files an install reads — `package.json`, the lockfile, `.npmrc`, `.yarnrc.yml`, `.yarn/`, `patches/` — are copied before the rest of the source, so a push that changes no package takes the installed ones from the site's build cache and skips the install. A package with its own `preinstall`, `install`, `postinstall` or `prepare` script, a workspace's root, and a site given its own install command install with the whole source there, as before.

**Which pushes build it.** A site at the repository's root is built by every push. One in a directory is built by a push that changes a file in it — or, when it installs at the repository's root (a workspace's member), in any of the workspace's packages or at the root itself (a lockfile, a workspace's configuration): what its build may read. A push to another app of the repository builds nothing (Vercel's skipping of a monorepo's unaffected projects), and a pull request is previewed the same way: only the sites and machines whose directories its files change get a preview.

**On GitHub.** Each build is a check on its commit — *Palbase Cloud · site &lt;name&gt;-&lt;ref&gt;* — queued, building, then live (with its address) or why not.

```sh
palbase hosting:builds:cancel <build> --site web    # stop a build queued or building: the site serves what it served
palbase hosting:hooks:create "CMS publish" --site web   # a deploy hook: a URL that builds the branch's head when it is POSTed to
palbase hosting:hooks --site web
palbase hosting:hooks:delete <hook> --site web
```

A **deploy hook** (Vercel's, Netlify's) is a URL — `https://deploy-hooks.palbase.studio/pbh_…` — that builds the site's branch's head when anything POSTs to it: a CMS's *publish*, another service's schedule. It takes no key: the URL is the secret, shown once as it is made. Delete it if it leaks; its URL builds nothing from then on. A site or a machine has five at most, each called at most once in five seconds, and the build it asks for counts as a push's. In Studio: **Deploy hooks** on the site's or machine's page.

A build counts against the environment's builds for the day, with its machines'. A failed build changes nothing: the site serves what it served, and `hosting:builds <build>` shows why.

## A web app that runs on a server

A site may have a **server**: a machine of its environment that answers what its files do not.

```sh
palbase hosting:sites:create web --repo acme/shop --server api --server-path /api/   # the files, and /api/… from the machine api
palbase hosting:sites:create shop --server shop                                       # every path from the machine shop
palbase hosting:sites:update web --no-server
```

- With **paths** (prefixes ending in `/`, ten at most), the site's own files answer every other path: a static front end and its API at one address, no CORS.
- With **none**, the machine answers every path: a web app that renders on a server (Next.js, Nuxt, SvelteKit, Remix, Astro), its site its address — `<name>-<ref>.palbase.app` and its domains. This is what the import makes of one.

The machine is reached as at its own address: woken if it sleeps, held to the environment's limits. What its framework builds under a hash of its content — `/_next/static/`, `/_nuxt/`, `/_app/immutable/`, `/_astro/` — the CDN keeps as the machine's `Cache-Control` says, so a page's scripts and styles come from the CDN; everything else is the machine's to answer each time.

A machine of a **free** size sleeps after 15 minutes without a request, as Vercel's Hobby functions scale to zero: the first visitor after that waits for it to start — its program's start included — while the machine's later requests, and the CDN's files, wait for nothing. On Pay as you go `--always-on` keeps it awake ([Keeping a machine awake](#keeping-a-machine-awake)).

A pull request's preview of the site is answered by the machine's own preview of the same pull request, once that is built; until then, and for a branch's preview, by the machine itself.


## Releases and rollback

```sh
palbase hosting:releases              # newest first; the one serving is marked
palbase hosting:rollback              # the release before the one serving
palbase hosting:rollback --to '#3'    # or a release by its number or id
```

A rollback, like a deploy, is at once: the next request is answered by the release named. In Studio: **Cloud › Sites › a site › Releases › Serve this release**.

## Caching

A page is kept by the CDN for one minute; a file whose name holds its content's hash (`/assets/index-Bf3k2.js`, `/_next/static/…`, `/_astro/…`) is kept by browsers for a year and by the CDN for an hour. When a site serves another release, is taken down or deleted, what the CDN keeps of it is let go of within seconds. You do not purge anything yourself.

## Redirects, rewrites and headers

A site says how it answers beyond its files in two plain-text files at the root of what is deployed — the folder `hosting:deploy` sends, or the folder its build writes (put them in `public/` or `static/`, which builders copy there): `_redirects` and `_headers`. They are [Cloudflare Pages's files](https://developers.cloudflare.com/pages/configuration/redirects/), which Netlify's mostly are, so a site moved from either keeps them; what Vercel's `vercel.json` says in `redirects`, `rewrites` and `headers` is written in them. Neither is served: `/_redirects` and `/_headers` are answered as paths no file answers.

### `_redirects`

A rule a line — a source, a destination, and a status, `302` when none is given. `#` starts a comment.

```
/home                /                                  301
/old-blog/*          https://blog.example.com/:splat
/blog/:year/:slug    /posts/:year-:slug                 308
/users/:id           /users/profile.html                200
```

- A **redirect** — `301`, `302`, `303`, `307` or `308` — sends the visitor to a path of the site or to an `https://` address, which may hold a query string and a fragment. The query asked goes along unless the destination has its own: `/home?ref=x` is sent to `/?ref=x`. The CDN keeps a redirect a minute at most, as a page, and lets go of it when the site serves another release.
- A **rewrite** — `200` — keeps the visitor's address and answers with the destination's path instead, as the site answers any path: its file, a page of that name, a directory's index, a single-page app's `index.html`, or the 404. It is followed once: its destination is not looked up in `_redirects` again.
- `*` catches the rest of the path, slashes too, and `:splat` writes it in the destination; `:name` catches one part of the path and is written again as `:name`. A source has one `*` at most, and each `:name` once.

The first rule, in the file's order, whose source is the path asked answers it — whether or not a file is at that path. Rules with neither `*` nor `:name` are counted apart, up to 2,000, while they come before the first that has one: put them first.

### `_headers`

A path a line, and under it, indented, the headers of what the site answers there:

```
/*
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin

/embed/*
  ! X-Frame-Options

/fonts/*
  Access-Control-Allow-Origin: *

https://:site.palbase.app/*
  X-Robots-Tag: noindex
```

Every rule whose path is the one asked adds its headers, in their order, to whatever the site answers: a file, a redirect, a rewrite (by the path asked, not the rewrite's), a single-page app's `index.html`, the 404. A header a rule sets is in place of the platform's — `Cache-Control`, `Content-Type`, `X-Content-Type-Options`; set again by a later rule, it is added to (`X-Robots-Tag: nosnippet, noindex`). `! Name` takes a header off. `*` and `:name` match as in `_redirects`, and are written again in a value. A rule of an `https://` address applies on that host alone — the one above keeps the site's `palbase.app` address out of search engines, and not its own domain.

`Cache-Control` says how long browsers keep an answer. The CDN keeps a page a minute whatever it says, and lets go of everything at the next release; a 404 keeps the platform's `Cache-Control`, so that a missing page is never kept long.

A site sets no header that is the platform's or would reach every visitor alike: `Set-Cookie` (a page the CDN keeps is everyone's: its cookie would be too), `Cache-Tag`, `Cloudflare-CDN-Cache-Control`, `CDN-Cache-Control` and `ETag` (how the CDN and browsers keep a site's answers and let go of them), `Location` (a redirect is a rule of `_redirects`), `Clear-Site-Data` (it would sign every site on the platform's domains out, not this one alone — no site or machine sends it), `Content-Length`, `Content-Encoding`, `Content-Range`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `Upgrade` and `Trailer` (how an answer is sent), and any `X-Palbase-…` or `CF-…` header — nor takes one off.

### What is refused

A release whose `_redirects` or `_headers` has a line that does not hold is refused — `hosting:deploy` says so, and a build fails, changing nothing, with why on `hosting:builds <build>` — naming the file, each line and why. Cloudflare Pages leaves such a line out with a warning in its deploy's log; here you hear of it before the site serves it. Besides the headers above and the limits below, these are refused:

- **A proxy to another address** — `/api/* https://api.example.com/:splat 200`. A rewrite answers with a file of the site; call a machine at its own address or domain.
- **Netlify's other statuses and conditions** — a `404` rewrite (a path no file answers is answered by the site's `/404.html`), `Country=`, `Language=`, `Role=`, `Cookie=`, and query parameters in a source.
- **`!` after a status** — Netlify's forced rule. On Netlify a rule does not apply where a file is at its source unless it is forced; here, as on Cloudflare Pages, every rule applies.
- **A domain as a source** — `https://example.com/* …`: a domain sends its visitors to another with `hosting:domains:redirect`.
- **`/* /index.html 200`** and the like (`/app/* /app/index.html`): it would answer every path below — scripts and images too — with one page. A single-page app's fallback is the site's own: `hosting:sites:update <name> --spa`. Cloudflare Pages refuses it too.
- **A redirect to a path it matches itself** — `/docs/* /docs/start 301` — which a browser would follow for ever.
- **A second rule with the same source**, or a second `_headers` rule with the same path: Cloudflare Pages applies the first of two redirects and the last of two header rules; write one.
- **In `_headers`, an address that is not `https://`, or that names a port.**

| Limit | |
|---|---|
| `_redirects`: rules with neither `*` nor `:name`, before the first that has one | 2,000 |
| `_redirects`: the other rules | 100 |
| `_redirects`: one rule | 1,000 characters |
| `_headers`: rules | 100 |
| `_headers`: one line | 2,000 characters |
| Each file | 256 KiB |

## Pull request previews

A site or a machine built from GitHub can preview its pull requests: each pull request opened against its branch is built at its head, **in the same environment, with that environment's settings and secrets**, and answers at `<name>-pr<number>-<ref>` until the pull request closes. The platform writes the address in a comment on the pull request and keeps it current as the pull request is pushed to.

```sh
palbase hosting:sites:update web --previews
palbase machines:update api --previews
palbase hosting:previews                # each pull request's address, head and state
palbase machines:previews api
```

Any environment previews its pull requests, production's (`main`) too: a pull request against the branch a machine is built from is previewed in that machine's environment. Its code runs there with the environment's settings, secrets and users — its sign-ins, files and notifications are production's when the environment is — while a machine that runs its database's migrations gives it a database of its own, so the pull request's schema never touches the environment's data. Fork protection stays on unless an admin turns it off: a fork's pull request waits for an admin before its code runs with those secrets.

- A **site's** preview is a release of its own. The site never serves it, and it is none of the releases `hosting:releases` lists or a rollback returns to.
- A **machine's** preview is a machine of its own, `<name>-pr<number>`: one copy, the machine's size, settings, secrets and tests — a build whose tests fail does not take the preview's traffic, as a push's does not take the machine's. It counts as one of the environment's machines, and at most three previews of a machine run at once. It is deleted when its pull request closes, and with the machine.
- A machine that runs its database's migrations has each preview given a **database of its own**, `<database>-pr<number>` — empty, migrated by the preview's release to the pull request's schema, so a pull request that adds a table or renames a column is previewed with it, and the environment's database is never touched by it. It is of the `preview` size (0.25 vCPU, 512 MiB, 500 MB, asleep when idle), keeps no backup to bring it back from, counts against none of the environment's databases, and goes with its preview. Its hours are the `free` size's: on Free from the project's 400 free database hours, on Pay as you go billed at that size's price past them. It starts empty: a preview's tests make their own data (`palbase test` makes their users). A machine that another machine migrates the database for has its preview given no database: the environment's — production's too — is never a pull request's to write. A preview runs no crons or tasks of its own and is sent none of the environment's events: they would run again beside its machine's, with the environment's users.
- A machine's preview whose pull request has had **no push for 3 days**, or that was opened **7 days ago** however often it is pushed to, is taken down — its machine and its database — and reads `idle`; the pull request's comment says which. A preview checks a change before it is merged, not an environment that lives on. The next push opens it again, with a new database, or:

  ```sh
  palbase machines:previews:open 12 --machine api
  ```

  On a preview that is open, `previews:open` starts its 3 days again. A preview the environment's limits refuse — no room for one more machine, or the storage the previews' databases are made on filling up — reads `refused`, with why, on `machines:previews` and the pull request; it is tried again every ten minutes, and the next push or `previews:open` tries at once.
- A pull request from a **fork** — another account's copy of the repository, which anyone can open — waits for an admin of the environment (**fork protection**, as Vercel's Git Fork Protection): nothing of it is built until one authorizes its head, and each new push asks again. Its comment says so, with a link to the site's or machine's page in Studio, where **Authorize** builds it; or from the CLI:

  ```sh
  palbase hosting:previews:authorize 12 --site web     # the head its preview shows: look at what it changes first
  palbase machines:previews:authorize 12 --machine api
  ```

  A person authorizes it — signed in to Studio, or to the CLI with `palbase login` — never a key or an environment's token (`person_required`). The head authorized must be the pull request's newest: one pushed to since is refused (`preview_head_moved`). `--preview-forks` turns fork protection off — a fork's pull request is previewed at once, its author's code running with the environment's settings; a person's to do, as authorizing is — and `--no-preview-forks` turns it on again: a fork's preview built while it was off waits for an admin again.

The platform's GitHub App, **Palbase Cloud**, asks for the *Pull requests* permission to hear pull requests and write its comment; GitHub asks each installation's owner to accept it.

### Branch previews

A site that previews previews its branches too, as Vercel previews every push: a push to any branch other than the site's own builds that branch's head into a release of its own at `<name>-git-<branch>-<ref>` — `feature/login` of the site `web` at `web-git-feature-login-<ref>.palbase.app` — never what the site serves. It is built again at each push to the branch, and closes when the branch is deleted or goes a month without a push. A site previews ten branches at once; a push touching nothing its build reads builds none. `hosting:previews` lists them under the pull requests', and the build's check on the commit says the address.

### Who sees a preview

A site's previews — its pull requests' and its branches' — are its team's alone (Vercel's Deployment Protection, the default). A visitor is sent to Palbase Studio: signed in as a member of the project — any role — they are let through for 12 hours; anyone else is asked to sign in. Making a site's previews anyone's (`--no-protect-previews`) is a person's to do, signed in to Studio or the CLI, never a key's. What a protected preview answers is kept by no CDN.

To show a preview to someone outside the team, make a **share link**: it opens every preview of the site for 1 to 30 days, until it is deleted.

```sh
palbase hosting:previews:link --site web --name client --days 14   # its token, shown once: add ?_palbase_pass=<token> to a preview's address
palbase hosting:previews:links --site web
palbase hosting:previews:unlink <link> --site web
palbase hosting:sites:update web --no-protect-previews              # anyone with a preview's address sees it
```

In Studio: **Preview access** on the site's page. The pass rides in the address once; the platform moves it into a cookie of the preview's own host at once, so the address shown, kept and shared carries none, and a site's server is never sent it. A machine's own previews, `<name>-pr<n>-<ref>.app.palbase.studio`, are APIs and stay open — except the previews of a web app's server (a machine that answers every path of a site that protects its previews): those are the site's pages, and the site's protection is theirs too.

## Your own domain

A site or a machine answers at a domain of your own too:

```sh
palbase hosting:domains:add example.com              # the site "web": example.com and www.example.com, example.com redirecting to www
palbase hosting:domains:add example.com --primary apex   # www.example.com redirecting to example.com instead
palbase hosting:domains:add docs.example.com --site docs  # a subdomain: itself alone
palbase hosting:domains:add example.com --only       # the apex alone: no www, no redirect
palbase machines:domains:add api.example.com --machine api
palbase hosting:domains                              # each domain's state, where it redirects, and what its DNS still needs
palbase hosting:domains:remove www.example.com
```

An apex (`example.com`) comes with its www, as Vercel adds it: visitors type both, so both answer and one redirects to the other — to `www.example.com` unless you choose the apex. In Studio, adding an apex asks the same: **Add www.example.com and redirect example.com to it** (recommended), **Add www.example.com and redirect it to example.com**, or **Add example.com only**.

Adding one prints the records to add to the domain's DNS:

| Type | Name | Value |
|---|---|---|
| `A` | `example.com` | the platform's address for apexes, as printed |
| `CNAME` | `www.example.com` | `domains.palbase.app` |
| `TXT` | `_palbase.<domain>` | `palbase-domain=<a token of its own>` |

An apex takes an **A record** at the platform's address for apexes, which any DNS host has — GoDaddy's, Namecheap's, your registrar's. Its certificate is issued for you by Let's Encrypt; remove any other A record and any AAAA record of the apex, or Let's Encrypt may ask an address that is not ours. A subdomain takes a **CNAME**, and is served through the CDN. Where your DNS host has an `ALIAS`, `ANAME` or flattened CNAME (Cloudflare's DNS does), the apex may point at `domains.palbase.app` with one instead, and is served through the CDN too — what matters only when the apex is the address visitors end up at. The TXT record shows the domain is this environment's. A domain answers once its records are there and its certificate is issued, usually within minutes; `hosting:domains` says what is still missing.

### Redirects

A domain may send its visitors to another domain of the same site or machine — the same path and query there — with a status of its own: `308` (permanent, the default), `301`, `307` or `302`.

```sh
palbase hosting:domains:redirect example.com --to www.example.com
palbase hosting:domains:redirect www.example.com --to example.com --status 301
palbase hosting:domains:redirect example.com --none   # it answers itself again
```

A redirect holds at once; the CDN keeps none, a browser keeps a permanent one as it would anywhere. A domain redirects to one that answers itself, and a domain others redirect to is not deleted until their redirect changes. In Studio: **Domains › Redirect**.

A domain is one environment's at a time, across the platform: another environment — anyone's — is told it is taken until it is removed here. A project has 20 domains at most on Free, its environments' together, and 100 on Pay as you go, where each past the first 20 is $0.25 a month (the month's most).

## Keeping a machine awake

A machine of a shared size sleeps when it has had no request for 15 minutes, and the next request wakes it: it waits while the machine's sandbox starts and its program listens — about 3 to 4 seconds, the sandbox's 2 to 3 of them (measured 02.11: a plain Node server 3.2–3.6 s, Next.js 3.6–4.0 s) — and is sent to the machine the moment it does. Its files under `/_next/static/` and the like stay at the CDN all the while. In a project on **Pay as you go**, `palbase machines:update <name> --always-on` keeps it awake: never put to sleep, started again at once if it ever stops, and every hour of it paid. On the Free plan the setting is refused, and the machine sleeps as any. A dedicated size never sleeps.

## Abuse

A site that breaks the [terms of use](/legal/terms) — phishing, malware, content that is not yours to publish — is taken down by the platform: its addresses answer with a page saying so, and the owners and admins of its organization are mailed why. Report one to **abuse@palbase.app**.
