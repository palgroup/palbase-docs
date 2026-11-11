> The full documentation index: https://palbase.studio/llms.txt

# Testing a Schema

An access schema is a rule about who sees what. A change that narrows it by mistake is found at once — somebody cannot do their work. A change that **widens** it is found by somebody who should not have seen something. `palbase access:test` is for the second kind: it holds a schema to answers you wrote down, and names each one a change broke.

It needs no database. The questions are answered by a second implementation of the schema's meaning, kept equal to the database's by Palbase's own tests, so it runs in a second, anywhere your tests run.

## A validation file

```json
{
  "schema": "access.schema",
  "tables": {
    "company": { "columns": { "id": "int" }, "rows": [{ "id": 1 }, { "id": 2 }] },
    "product": {
      "columns": { "id": "int", "company_id": "int" },
      "rows": [{ "id": 10, "company_id": 1 }, { "id": 11, "company_id": 1 }, { "id": 20, "company_id": 2 }]
    }
  },
  "relationships": [
    "company:1#owner@user:olga",
    "product:10#designer@user:una",
    "product:11#developer@user:una",
    "product:10#tester@user:tess"
  ],
  "expect": [
    { "subject": "una", "can": ["code.write", "view"], "on": "product:11" },
    { "subject": "una", "can": "design.write", "cannot": "code.write", "on": "product:10" },
    { "subject": "olga", "cannot": "view", "on": "product:20" },
    { "subject": "tess", "holds": "view", "of": "product", "exactly": ["10"] },
    { "who": "code.write", "on": "product:11", "exactly": ["olga", "una"] }
  ]
}
```

| Key | |
|---|---|
| `schema` | the schema file, beside this one |
| `tables` | for each type with a table: the columns the schema reads (the key, and every column a relation is `from` or a `where` compares), each `text`, `uuid`, `int`, `bool` or `numeric` — and the rows of the example |
| `relationships` | the kept relationships of the example, each `type:id#relation@user:id` — or `@type:id` for a relation that takes objects |
| `expect` | what must be true |

Three kinds of expectation:

| Written | Holds when |
|---|---|
| `{ "subject", "can", "cannot", "on" }` | the subject holds every name under `can`, and none under `cannot`, on the object. Either may be one name or a list |
| `{ "subject", "holds", "of", "exactly" }` | the objects of type `of` the subject holds the name on are exactly these ids |
| `{ "who", "on", "exactly" }` | the subjects who hold the name on the object are exactly these |

`exactly` is the one that catches a widening: it fails for an answer that has grown.

## Running it

```sh
palbase access:test access.test.json
```

```text
7 expectations hold
```

It ends with `0`. Now widen a rule — an edit that lets designers write code, `permission code.write = developer + designer + company->owner`:

```text
✗ una cannot code.write on product:10 — the schema says they can
1 of 7 expectations do not hold
```

and it ends with `1`, naming the expectation: `una` designs product 10, and the file says she does not write its code.

A file that is itself wrong — a type the schema does not have, a row without its key — is said as that, not as a failed expectation.

## What to write down

A validation file is worth the most where a mistake would cost the most:

- **For each role, one thing it must not reach.** *A tester cannot write code. A member of the company cannot manage it.* `cannot` lines are short and they are the ones that fail when a `+` goes where a `&` belonged.
- **Across the boundary you sell.** One company's owner, another company's product: `cannot`, for every permission.
- **`exactly`, for the lists that matter.** Who may read the payroll, who may delete a workspace.
- **The cases with a condition.** A private session and an open one; an archived product and a live one — both rows in `tables`, an expectation for each.

Run it in the same place as your tests, before a deploy and in review. In a `palbase/backend` app the schema file it reads is the one the app starts with, so what it passes is what ships.

## What it does not test

Whether your code *asks*. A route that forgets to call `can`, or a table without its policy, is not something a schema can know. For tables, a row policy that names the permission ([in a backend](https://palbase.studio/docs/access/backend#a-policy-names-a-permission), or [`rows`](https://palbase.studio/docs/access/schema#rows)) closes that gap for every query at once; test the route itself against a real database.
