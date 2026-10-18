> The full documentation index: https://palbase.studio/llms.txt

# Translations

Write the sentences your backend says to people in one language, and `t()` answers each request in the language its caller reads: the first of their languages your app has a translation for, and the language you wrote it in otherwise.

```ts
import { Controller, Post, t } from "palbase/backend";

@Controller("/payments")
export class PaymentsController {
  @Post("/charge")
  charge() {
    // …
    return { message: t("Kartınız reddedildi ({{amount}} ₺)", { amount: 50 }) };
  }
}
```

The sentence itself is the key. `{{name}}` takes a value from the second argument; `{{{name}}}` is left as it is.

## How a request's language is chosen

Every request says its user's languages in `Accept-Language`, best first: a browser sends them, and the iOS and Android SDKs send the device's languages in its order. For each sentence, `t()` takes the first of them your app has a translation of, then the language the sentences are written in.

Each language is matched as a table names it, from the most specific down: `pt-BR` reads `pt-BR.json`, then `pt.json`; `zh-TW` reads `zh-TW.json`, then `zh-Hant.json`, then `zh.json`. A device's regional preferences (`fr-FR-u-mu-celsius`) are not part of the language.

The answer says which: `Content-Language: en` (a list when one answer mixes languages; unless your handler set it). An app with `palbase/strings/` answers every request with `Vary: Accept-Language`, so a cache never hands one user's language to another.

`t()` outside a request — a scheduled job, an event hook, a gateway, the app's start — has no caller to ask, and says the sentence as it is written.

## palbase/strings/

The translations live in your repository, next to the code, one file per language:

```text
palbase/strings/
  _meta.json   { "version": 3, "source": "tr" }
  en.json      { "Kartınız reddedildi ({{amount}} ₺)": "Your card was declined ({{amount}} ₺)" }
  de.json      { "Kartınız reddedildi ({{amount}} ₺)": "" }
```

- `_meta.json` names the language the sentences are written in (`source`). It has no file of its own: its text is the key.
- Each other language is `<language>.json`, named as the language is written (`en`, `de`, `pt-BR`): `"sentence": "translation"`.
- An empty translation is not one yet: that sentence is said in the source language.

Correct a translation in the file and deploy, as any change to your app: the machine reads the table when it starts. The build checks it too: a table that breaks a rule — a file named `EN.json`, a translation that is not a string, a file for the source language, a table still in the earlier format below — stops the build before it takes traffic, and the log names the file and the rule.

Dockerfiles made by `palbase init` 0.3.1 or later copy `palbase/` into the image; check yours, or one you wrote, for `COPY palbase ./palbase`. An app that started without a table says so, with where it looked, the first time `t()` is called.

## Keep the files with the code

Run it in your backend's directory (or below it: it works in the nearest directory up with a `package.json`):

```bash
npx palbase strings --source tr --add en   # start the table: the sentences are in Turkish; en.json is made, empty
npx palbase strings --translate            # fill what is empty
npx palbase strings                        # after a change to the code
npx palbase strings --add de               # one more language
```

`palbase strings` reads every `t("…")` your backend calls — `t` imported from `palbase/backend`, or from a module of your app that re-exports it — with the TypeScript compiler. A sentence new in the code is added to every language's file, empty; a translation is kept. A sentence the code no longer calls is kept too, with its translations, and listed: `--prune` takes it out of every file. Run it again and it changes nothing.

What it cannot read is pointed out, with its file and line: a `t()` whose sentence is not written out (`t(message)` — no file can hold its translation: write the sentence itself, its values as `{{name}}`), and a `t` imported from a module it does not follow (a path alias such as `@/lib/i18n`). If it reads no sentence at all while the table has some, it changes nothing.

A table in the format of the earlier Palbase (`"version": 2`, a `{"value", "state"}` object for each sentence) is written in this one the first time you run it, every translation kept; until then the app does not start with it.

## Translate with your AI module

```bash
npx palbase strings --translate
```

Each empty translation of a sentence the code calls is sent to your environment's AI module — the same models, usage and cost as any other call your project makes, under your own key on this computer — and written into the file as it comes back. On the production environment it asks first: its AI budget is the one your app's own calls use. A translation that does not keep every `{{placeholder}}` of its sentence, or comes back empty, is not taken: it is listed, and stays empty. The command ends with what it cost, from your environment's AI usage (or says when not every call is there yet).

A translation is used as it is written: read the files' diff before you commit it, and correct it there.
