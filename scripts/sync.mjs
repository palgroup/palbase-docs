// node scripts/sync.mjs — copies Palbase's documentation from https://palbase.studio
// into docs/ as Markdown, the same pages as the site, so that tools that read
// GitHub repositories (Context7, DeepWiki, code search) find them.
//
// The site is the source: /llms.txt names every page, /docs-md/<page> serves its
// Markdown. A page the site no longer has is deleted here. Links to the site's
// own pages (/docs/…) are made absolute, because on GitHub a path from the root
// of the site leads nowhere.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

const SITE = process.env.PALBASE_DOCS_SITE ?? "https://palbase.studio";
const OUT = "docs";

async function get(path, type = "text/plain") {
  const res = await fetch(SITE + path, { redirect: "follow", headers: { "user-agent": "palbase-docs-sync" } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  // A page the site does not have answers its HTML 404 page, or a sign-in page: never copy one.
  const got = res.headers.get("content-type") ?? "";
  if (!got.startsWith(type)) throw new Error(`${path}: ${got}, not ${type}`);
  return res.text();
}

async function filesUnder(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else out.push(p);
  }
  return out;
}

const index = await get("/llms.txt");
const pages = [...new Set([...index.matchAll(/\]\(https?:\/\/[^)\s]+?\/docs\/([a-z0-9-]+\/[a-z0-9-]+)\)/g)].map((m) => m[1]))];
if (pages.length < 20) throw new Error(`llms.txt named ${pages.length} pages — refusing to sync from what looks like a broken index`);

const written = new Set();
for (const page of pages) {
  const md = (await get(`/docs-md/${page}`, "text/markdown")).replace(/\]\(\/docs\//g, `](${SITE}/docs/`);
  const file = join(OUT, `${page}.md`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, md.endsWith("\n") ? md : `${md}\n`);
  written.add(file);
}
for (const file of await filesUnder(OUT)) if (!written.has(file)) await rm(file);
await writeFile("llms.txt", index);
await writeFile("llms-full.txt", await get("/llms-full.txt"));
console.log(`synced ${written.size} pages from ${SITE}`);
