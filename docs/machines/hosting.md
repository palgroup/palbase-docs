> The full documentation index: https://palbase.studio/llms.txt

# Sites, Previews & Domains

A **site** is a static website an environment serves: a folder of files — what Vite, Next.js with `output: "export"`, Astro, SvelteKit's static adapter, Nuxt, Docusaurus or VitePress writes. Sites never sleep and cost nothing to serve: they are answered by the platform's own servers behind a CDN, not by a machine, and what they send is not counted as the environment's outbound traffic.

Every site answers at `<name>-<ref>.palbase.app` — the environment's `web` site at `<ref>.palbase.app` — and, once added, at a domain of your own.

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

## Built from GitHub

A site can be built on every push instead, as a machine is (see [Connecting GitHub](https://palbase.studio/docs/machines/github)):

```sh
palbase hosting:sites:create web --repo acme/shop --branch main --path apps/web
palbase hosting:builds                 # its builds, newest first
palbase hosting:builds <build> --wait  # one build, its log, followed to its end
palbase hosting:build                  # build the branch's head now
```

The platform reads the lockfile next to the site (or at the repository's root, for a workspace) and installs with pnpm, yarn, npm or bun, runs the `build` script of its `package.json`, and serves the folder its framework writes (`dist` for Vite and Astro, `out` for Next.js, `build` for SvelteKit, `.output/public` for Nuxt …). Say otherwise with `--install-command`, `--build-command` and `--output <dir>`. `--build-env KEY=VALUE` (repeatable) sets what the build runs with — what your pages are sent, such as `VITE_PALBASE_URL` — never a secret: whatever a build bakes into a page, every visitor reads.

A build counts against the environment's builds for the day, with its machines'. A failed build changes nothing: the site serves what it served, and `hosting:builds <build>` shows why.

## Releases and rollback

```sh
palbase hosting:releases              # newest first; the one serving is marked
palbase hosting:rollback              # the release before the one serving
palbase hosting:rollback --to '#3'    # or a release by its number or id
```

A rollback, like a deploy, is at once: the next request is answered by the release named. In Studio: **Cloud › Sites › a site › Releases › Serve this release**.

## Caching

A page is kept by the CDN for one minute; a file whose name holds its content's hash (`/assets/index-Bf3k2.js`, `/_next/static/…`, `/_astro/…`) is kept by browsers for a year and by the CDN for an hour. When a site serves another release, is taken down or deleted, what the CDN keeps of it is let go of within seconds. You do not purge anything yourself.

## Pull request previews

A site or a machine built from GitHub can preview its pull requests: each pull request opened against its branch is built at its head, **in the same environment, with that environment's settings and secrets**, and answers at `<name>-pr<number>-<ref>` until the pull request closes. The platform writes the address in a comment on the pull request and keeps it current as the pull request is pushed to.

```sh
palbase hosting:sites:update web --previews
palbase machines:update api --previews
palbase hosting:previews                # each pull request's address, head and state
palbase machines:previews api
```

Turn previews on in an environment kept for them — `staging`, built from the same repository. A project's production environment (its first, `main`) previews nothing: a pull request's code would run with production's settings, secrets and data, so turning previews on there is refused (`previews_in_production`), as Vercel's previews never run in production either.

- A **site's** preview is a release of its own. The site never serves it, and it is none of the releases `hosting:releases` lists or a rollback returns to.
- A **machine's** preview is a machine of its own, `<name>-pr<number>`: one copy, the machine's size, settings and secrets. It counts as one of the environment's machines, and at most three previews of a machine run at once. It is deleted when its pull request closes, and with the machine.
- A machine that runs its database's migrations has each preview given a **database of its own**, `<database>-pr<number>` — empty, migrated by the preview's release to the pull request's schema, so a pull request that adds a table or renames a column is previewed with it, and the environment's database is never touched by it. It is of the `preview` size (0.25 vCPU, 512 MiB, 500 MB, asleep when idle), keeps no backup to bring it back from, counts against none of the environment's databases — the Free plan's one free database included — costs nothing, and goes with its preview. It starts empty: a preview's tests make their own data (`palbase test` makes their users). A machine that another machine migrates the database for has its preview given that database, without migrations, as the machine is.
- A machine's preview whose pull request has had **no push for 3 days** is taken down — its machine and its database — and reads `idle`; the pull request's comment says so. The next push opens it again, with a new database, or:

  ```sh
  palbase machines:previews:open 12 --machine api
  ```

  On a preview that is open, `previews:open` starts its 3 days again. A preview the environment's limits refuse — no room for one more machine, or the storage the previews' databases are made on filling up — reads `refused`, with why, on `machines:previews` and the pull request; the next push or `previews:open` tries again.
- A pull request from a **fork** — another account's copy of the repository, which anyone can open — waits for an admin of the environment (**fork protection**, as Vercel's Git Fork Protection): nothing of it is built until one authorizes its head, and each new push asks again. Its comment says so, with a link to the site's or machine's page in Studio, where **Authorize** builds it; or from the CLI:

  ```sh
  palbase hosting:previews:authorize 12 --site web     # the head its preview shows: look at what it changes first
  palbase machines:previews:authorize 12 --machine api
  ```

  A person authorizes it — signed in to Studio, or to the CLI with `palbase login` — never a key or an environment's token (`person_required`). The head authorized must be the pull request's newest: one pushed to since is refused (`preview_head_moved`). `--preview-forks` turns fork protection off — a fork's pull request is previewed at once, its author's code running with the environment's settings; a person's to do, as authorizing is — and `--no-preview-forks` turns it on again: a fork's preview built while it was off waits for an admin again.

The platform's GitHub App, **Palbase Cloud**, asks for the *Pull requests* permission to hear pull requests and write its comment; GitHub asks each installation's owner to accept it.

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

A domain is one environment's at a time, across the platform: another environment — anyone's — is told it is taken until it is removed here. An environment has 20 domains at most.

## Keeping a machine awake

A machine of a shared size sleeps when it has had no request for a while, and the next request wakes it. In an environment on **Pay as you go**, `palbase machines:update <name> --always-on` keeps it awake: never put to sleep, started again at once if it ever stops, and every hour of it paid. On the Free plan the setting is refused, and the machine sleeps as any. A dedicated size never sleeps.

## Abuse

A site that breaks the [terms of use](/legal/terms) — phishing, malware, content that is not yours to publish — is taken down by the platform: its addresses answer with a page saying so, and the owners and admins of its organization are mailed why. Report one to **abuse@palbase.app**.
