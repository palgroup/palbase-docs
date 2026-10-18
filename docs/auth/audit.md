> The full documentation index: https://palbase.studio/llms.txt

# Audit Trail

Auth records what happens in it as events: sign-ins that worked and ones that did not, sign-ups, password and email changes, second factors, sessions and tokens, and every change made with the secret key, to a user or to the settings. Each event names who acted, from which address, what it was done to, and whether it worked. Events are chained: each carries a hash of itself and of the one before it, so an event changed, removed or put out of order breaks the chain where it happened, and verifying the trail finds it.

## Reading it

Studio's **Auth › Audit** shows the latest 100 events with a chart of failed sign-ins per day (the last 7, 30 or 90 days), filtered by result and searched by event, actor, target or metadata. An event's details hold its code, actor, target and metadata. A change made with a secret key is shown as **Admin (secret key)**.

```sh
palbase auth:audit
palbase auth:audit --event auth.login.failure --limit 200
```

`auth:audit` prints the events newest first: when, the event, the result, who, from where, and on what. From a server, `GET /admin/audit` pages through them (`limit` up to 100, `cursor`, `event_type`).

| Field | What it is |
|---|---|
| `event_type` | What happened, as a dotted name (below). |
| `result` | `success` or `failure`. |
| `actor` | `{ user_id, email?, ip? }`: the user who acted, or `service_role` for a call made with a secret key. |
| `target_type`, `target_id` | What it was done to: a user, a session, a setting. |
| `auth_method` | How the user signed in, for a sign-in. |
| `risk_score` | The score the [risk engine](https://palbase.studio/docs/auth/overview#risk) gave, when it scored. |
| `metadata` | What else the event says: a failure's reason, the setting that changed. |
| `event_hash`, `prev_hash` | Its place in the chain. |

The actor and the metadata are kept encrypted. When a user is deleted, their part of the record stays in the chain, and its actor and metadata can no longer be read.

### Event types

| Kind | Types |
|---|---|
| Signing up and in | `auth.signup`, `auth.login.success`, `auth.login.failure`, `auth.social.login`, `auth.magic_link.request`, `auth.magic_link.verify`, `auth.phone.signup`, `auth.phone.login`, `sms.otp.send`, `webauthn.login`, `auth.step_up.success`, `auth.step_up.failure` |
| Passwords and addresses | `auth.password.change`, `auth.password.reset.request`, `auth.password.reset.complete`, `auth.email.verify` |
| Second factors and passkeys | `mfa.enroll`, `mfa.remove`, `mfa.verify.success`, `mfa.verify.failure`, `mfa.recovery.used`, `webauthn.register`, `webauthn.remove`, `webauthn.clone_detected` |
| Linked providers | `social.link`, `social.unlink` |
| Sessions and tokens | `session.create`, `session.revoke`, `session.device_change`, `token.issue`, `token.refresh`, `token.revoke`, `trusted_device.register`, `trusted_device.used`, `trusted_device.revoke` |
| With the secret key | `admin.user.create`, `admin.user.update`, `admin.user.delete`, `admin.user.import`, `admin.user.deactivate_inactive`, `admin.mfa.reset`, `admin.config.change`, `admin.key.rotate`, `admin.audit.export` |
| Abuse and breaches | `bot.pow.challenge`, `bot.stuffing.detected`, `bot.ip.blocked`, `breach.detected`, `breach.forced_reset` |
| Personal data | `gdpr.export`, `gdpr.erasure`, `gdpr.consent.revoke` |
| Service accounts | `serviceaccount.create`, `serviceaccount.rotate`, `serviceaccount.revoke` |

`--event` and `event_type` take one type exactly.

## Exporting it

```sh
palbase auth:audit:export --out audit.ndjson
palbase auth:audit:export --format csv --from 2026-10-01T00:00:00Z --to 2026-11-01T00:00:00Z --out october.csv
palbase auth:audit:export --event admin.config.change --out config-changes.ndjson
```

The export is the whole trail, or the span `--from` (inclusive) to `--to` (exclusive), oldest first: JSON lines, an event a line in the shape above, or CSV. Its size is not limited. The file `--out` writes is readable by you alone. An export that fails halfway breaks off rather than ending as if it were whole, and the export is itself recorded (`admin.audit.export`). The admin call is `GET /admin/audit/export`, with `format`, `from`, `to` and `event_type`.

## Verifying it

```sh
palbase auth:audit:verify
```

```text
The audit trail is whole: 18342 events, each chained to the one before.
```

`auth:audit:verify` (`GET /admin/audit/verify`) computes every event's hash again and checks each link to the event before it, oldest first. A trail that is not whole is an error naming the first event where the chain breaks, and the command exits with `audit_trail_broken`: there, an event was changed or taken out. The answer of the admin call is `{ valid, total, broken_at? }`.

## Related

- [Users & Roles](https://palbase.studio/docs/auth/users): the changes a user's record shows
- [Overview](https://palbase.studio/docs/auth/overview): the settings `admin.config.change` records
- [Logs](https://palbase.studio/docs/getting-started/logs): every request to the environment, and auth's events among them
- [CLI reference](https://palbase.studio/docs/cli/reference#palbase-authaudit): `auth:audit`, `auth:audit:export`, `auth:audit:verify`
