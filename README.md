# Palbase documentation

The documentation of [Palbase](https://palbase.studio), as Markdown: the same pages as [palbase.studio/docs](https://palbase.studio/docs), copied from the site once a day.

Palbase is a backend for web, iOS and Android apps. Every project has auth, storage, realtime, feature flags, notifications, secrets, analytics, AI and in-app purchases. Your own TypeScript backend (`palbase/backend`) runs on a machine built from a GitHub branch on every push, beside a Postgres database of its own.

- [`docs/`](docs) — every page, by section: getting started, the CLI, the backend, web, server, iOS and Android SDKs, auth, purchases, analytics, client apps, app distribution, machines and databases
- [`llms.txt`](llms.txt) — the index of every page, for AI assistants; [`llms-full.txt`](llms-full.txt) — every page in one file
- The JavaScript SDK and CLI: [`palbase` on npm](https://www.npmjs.com/package/palbase) (`npm install palbase`)
- iOS: [palbase-swift](https://github.com/palgroup/palbase-swift) · Android: [palbase-android](https://github.com/palgroup/palbase-android)

The pages are written for the site, and the site is where they change: this repository follows it (`.github/workflows/sync.yml`), so a pull request here would be overwritten.
