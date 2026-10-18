> The full documentation index: https://palbase.studio/llms.txt

# Organizations

Studio has three levels. An **organization** is a team: its people and their roles, its access tokens and its audit log. A **project** is an app, in one organization. An **environment** is what runs: each one a Palbase project of its own, with its own address, keys, users, files, machines and databases, and nothing shared with another.

```text
Organization      its members and their roles, access tokens, the audit log
└── Project       an app
    └── Environment   main, staging, a developer's own: address, keys,
                      users, files, flags, machines, databases
```

Everyone in an organization reaches every project and environment of it, at their role in the organization. There is no role per project or per environment.

## Organizations

Before your first project, Studio asks you to create your organization, and you are its **owner**. Any account makes more:

```sh
palbase orgs:create "Acme"
palbase orgs:list                 # your organizations and your role in each
```

An organization's **Projects** page lists its projects, and an admin renames it under **General**.

## Projects and environments

An admin creates a project, in Studio (**New project**) or from the CLI; it opens with its first environment:

```sh
palbase projects:create shop --org acme            # its first environment, main, and its keys
palbase envs:create staging -P shop                # a second environment
palbase envs:create staging -P shop --from main    # opened with main's module settings
```

- **The first environment's slug is `main`**, whatever it is called on screen: it is the project's production one, and a CLI change to it asks for confirmation.
- **Another environment's slug** starts with a letter and continues with up to 38 letters, digits or hyphens; `local` is not one. An environment's name on screen can change; its slug never does.
- **`--from`** opens the new environment with another's module settings: secrets by name, not by value. With `--with-cloud` its machines and databases are declared alike too, built from the same branches, with no data.

Each environment has its own address and keys ([Introduction](https://palbase.studio/docs/getting-started/introduction#the-keys)), and its own usage ([Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits)).

An admin deletes an environment under its **Settings › Danger zone**, or with `palbase envs:delete <slug>`; deleting a project (`palbase projects:delete <project>`) deletes every environment of it. An environment's users, files, flags, keys and secrets go with it, and its machines and databases are deleted too.

## Members and invitations

An organization's **Members** page lists its people, each with their role and when they joined; its admins also see the invitations still open.

An admin invites someone by email, as an **admin** or a **member** (member unless said), with **Add member** or from the CLI:

```sh
palbase orgs:members:invite ada@example.com --role admin --org acme
palbase orgs:members:list --org acme
palbase orgs:members:remove ada@example.com --org acme   # a member, or an invitation still open
```

- **Accepting.** The invited person signs in to Studio with the email the invitation names, and accepts it there. The email must be verified: an account whose address is not is refused (`403 email_not_verified`). An invitation does not expire; it waits until it is taken or withdrawn.
- **Inviting again** keeps the invitation, with the new role and the new inviter.
- **The mail.** An invitation is mailed from Palbase when the inviter's own email is verified. An address gets one invitation mail a day from an organization and five a day from all of them together; past that the invitation still waits for it in Studio, unmailed.
- **How many.** An inviter makes 20 invitations an hour and 100 a day, and an organization 20 an hour, however many admins it has (`429` with `Retry-After`).

A member leaves an organization with `palbase orgs:members:remove` and their own email. An admin takes away a member or an admin; only an owner takes away an owner. The organization's last owner stays: make another owner first (`409 last_owner`).

A person who leaves, or is taken away, takes with them what they held at the organization's environments: the CLI's keys they were given, and the access tokens they made.

## Roles

| | Member | Admin | Owner |
|---|:---:|:---:|:---:|
| Open every project and environment, and read its screens: users, files, flags, logs, usage, machines and their builds | ✓ | ✓ | ✓ |
| See which secrets there are and their versions, and the API keys by their last characters | ✓ | ✓ | ✓ |
| Read with a module's questions that change nothing: a funnel, a retention table, the database's read-only SQL console, a machine's `GET` from **Try it** | ✓ | ✓ | ✓ |
| Change anything in an environment: settings, users, flags, files, templates, machines, databases, secrets | | ✓ | ✓ |
| Read a secret's value, a task's payload, a coupon's one-time codes | | ✓ | ✓ |
| Make and revoke API keys; take a CLI key (`palbase env:pull`, `palbase run`); mint environment tokens | | ✓ | ✓ |
| Create, rename and delete projects and environments | | ✓ | ✓ |
| Invite and take away members and admins; withdraw invitations; rename the organization | | ✓ | ✓ |
| Manage access tokens; read the audit log | | ✓ | ✓ |
| Make or unmake an owner; take away an owner | | | ✓ |

A member's change to an environment is refused with `403 console_role_required`, and the refusal is kept in the audit log. In Studio, an owner changes a member's role from the **Members** list.

A role is read on every request: a member made less than an admin keeps none of the CLI keys they had at the organization's environments, and the admin tokens they made stop working at once. An access token acts at its role, member or admin and never owner, and no more than its maker's role now ([Access Tokens](https://palbase.studio/docs/getting-started/access-tokens)).

## Your Studio account

**Account security**, in the account menu at the top right, is your own account's:

- **Two-factor authentication**: a second step when you sign in, with an authenticator app or by SMS, and **recovery codes** for when you have neither. They are shown once: keep them where you keep passwords.
- **Passkeys**: sign in with this device's fingerprint, face or screen lock, or a security key, instead of a password. Add one, rename it, or remove it.
- **Connected accounts**: sign in with Google or GitHub, when Studio offers them. The last way you sign in cannot be removed: add a password or a passkey first.

A change to how you sign in needs a sign-in from the last five minutes; an older one is asked to sign in again first. Turning off a second factor asks for your current password.

The CLI signs in as you, and holds a session of yours ([CLI](https://palbase.studio/docs/cli/overview#signing-in)).

## The audit log

An organization's **Audit log** says who changed what at its environments, newest first: the change, the environment, who made it — a member by their email, an access token or an environment token by its name — the method and path, and the status it was answered. It holds every change made through Studio, the CLI and tokens; a change refused for its role; and every read of a secret's value. The path is kept without its query and the body not at all, since what was sent can hold a secret. Plain reads are not kept.

Its admins read it in Studio, or from the CLI:

```sh
palbase orgs:audit --org acme --limit 100
```

A module keeps a change made through Studio as Studio's: the audit log is where whose it was is kept. See [`palbase orgs:audit`](https://palbase.studio/docs/cli/reference#palbase-orgsaudit).

## Related

- [Access Tokens](https://palbase.studio/docs/getting-started/access-tokens) — for CI and agents, at a role of the organization
- [Usage & Limits](https://palbase.studio/docs/getting-started/usage-and-limits) — what each environment uses
- [CLI](https://palbase.studio/docs/cli/overview) — signing in, and choosing an environment
- [CLI reference](https://palbase.studio/docs/cli/reference#orgs) — `orgs`, `projects` and `envs`
