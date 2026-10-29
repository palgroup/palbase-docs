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

Turn previews on in an environment kept for them — `staging`, built from the same repository — never in production: a pull request's code runs with the environment's settings. Studio offers the switch only outside the production environment.

- A **site's** preview is a release of its own. The site never serves it, and it is none of the releases `hosting:releases` lists or a rollback returns to.
- A **machine's** preview is a machine of its own, `<name>-pr<number>`: one copy, the machine's size, settings, secrets and database — without its migrations, which only the machine runs. It counts as one of the environment's machines, and at most three previews of a machine run at once. It is deleted when its pull request closes, and with the machine.
- A pull request from a **fork** — another account's copy of the repository, which anyone can open — is previewed only with `--preview-forks`: its author's code would run with the environment's settings.

The platform's GitHub App, **Palbase Cloud**, asks for the *Pull requests* permission to hear pull requests and write its comment; GitHub asks each installation's owner to accept it.

## Your own domain

A site or a machine answers at a domain of your own too:

```sh
palbase hosting:domains:add www.example.com            # the site "web"
palbase hosting:domains:add example.com --site web
palbase machines:domains:add api.example.com --machine api
palbase hosting:domains                                # each domain's state, and what its DNS still needs
palbase hosting:domains:remove www.example.com
```

Adding one prints the two records to add to the domain's DNS:

| Type | Name | Value |
|---|---|---|
| `CNAME` | `www.example.com` | `domains.palbase.app` |
| `TXT` | `_palbase.www.example.com` | `palbase-domain=<a token of its own>` |

The CNAME points the domain at the platform; the TXT record says it is this environment's. At the apex (`example.com`) most DNS hosts take no CNAME: add an `ALIAS` or `ANAME` record — or, on Cloudflare's DNS, a CNAME, which it flattens — with the same value. The certificate is issued for you once the CNAME is in place. A domain answers once both records are there, usually within minutes; `hosting:domains` says what is still missing.

A domain is one environment's at a time, across the platform: another environment — anyone's — is told it is taken until it is removed here. An environment has 20 domains at most.

## Keeping a machine awake

A machine of a shared size sleeps when it has had no request for a while, and the next request wakes it. In an environment on **Pay as you go**, `palbase machines:update <name> --always-on` keeps it awake: never put to sleep, started again at once if it ever stops, and every hour of it paid. On the Free plan the setting is refused, and the machine sleeps as any. A dedicated size never sleeps.

## Abuse

A site that breaks the [terms of use](/legal/terms) — phishing, malware, content that is not yours to publish — is taken down by the platform: its addresses answer with a page saying so, and the owners and admins of its organization are mailed why. Report one to **abuse@palbase.app**.
