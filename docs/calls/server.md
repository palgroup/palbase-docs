> The full documentation index: https://palbase.studio/llms.txt

# Your Server

With the project's secret key in the `apikey` header ([Server SDK](https://palbase.studio/docs/server/overview#the-secret-key)), your server sets the calls module up, decides who may call whom, reads and ends calls, and lets its agent into one ([Agents](https://palbase.studio/docs/calls/agents)). A publishable key is refused here (`403 secret_key_required`). From TypeScript, `palbase/server`'s `palbase.calls` makes each call below, typed ([Server SDK](https://palbase.studio/docs/server/overview)). Your organization's owners and admins do the same in Studio, under **Calls**, and with the CLI's `calls:*` commands; a member of your team reads the settings and the calls there, and changes nothing.

## Settings

`GET /calls/settings` reads them; `PUT /calls/settings` changes what it names, and answers them all:

| Setting | What it does |
|---|---|
| `max_participants` | How many people a call holds, agents included: 2 to 100 (the default). A call that would hold more is refused (`call_full`) |
| `calls_per_hour` | How many calls one person may start in an hour: 1 to 1,000 (60 by default). 10 a minute, whatever it says |
| `hook` | The endpoint asked who may call whom (below): `{ url, timeout_ms, on_error }`; `null` removes it |

```bash
curl -s -X PUT "https://<ref>.palbase.studio/calls/settings" \
  -H "apikey: $PALBASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"max_participants": 8}'
```

From a terminal, as one of your organization's owners or admins — `palbase config:diff` and `palbase config:copy` compare and copy the settings between environments:

```bash
palbase calls:settings:get
palbase calls:settings:set --max-participants 8 --calls-per-hour 30
```

## Who may call whom

Anyone in the project may call anyone who has not blocked them and whom they have not blocked, and a call from a conversation reaches its members alone ([Calls](https://palbase.studio/docs/calls/overview#who-may-call-whom)). Your hook narrows it further: a follower calls only whom they follow, a booking's customer only its host, a patient only their doctor during the appointment.

Set it with `PUT /calls/settings`:

```json
{ "hook": { "url": "https://api.example.com/palbase/can-call", "timeout_ms": 2000, "on_error": "deny" } }
```

The first time a hook is set, the answer carries its signing secret, `hook_secret` (`whsec_…`): **here once**, never read back. Keep it where your endpoint checks the signature. `POST /calls/settings/hook-secret` makes a new one, given once the same way, and the old one signs nothing more (`409 no_hook` when there is no hook). Changing the hook's address keeps its secret; removing the hook (`"hook": null`) drops it.

The CLI sets it the same way, and keeps the secret in the environment's secrets instead of printing it with `--secret-to` — where a machine of yours reads it:

```bash
palbase calls:hook:set --url https://api.example.com/palbase/can-call --on-error deny --secret-to CALLS_HOOK_SECRET
palbase calls:hook:get
palbase calls:hook:secret:rotate --secret-to CALLS_HOOK_SECRET
palbase calls:hook:remove
```

Before a call rings — and before someone is asked into a call going on — your endpoint is sent a `POST`, after blocks, deleted accounts and a conversation's members are taken out:

```json
{
  "event": "calls.can_call",
  "action": "start",
  "from_user_id": "usr_ada",
  "to_user_ids": ["usr_bob", "usr_cem"],
  "video": true,
  "conversation_id": "5f0e…"
}
```

`action` is `start` (making a call) or `invite` (asking people into one, its `call_id` then given); `conversation_id` is there when the call is made from one. It is signed as the [Standard Webhooks](https://www.standardwebhooks.com) spec signs: `webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`, `v1,<base64 HMAC-SHA256>` of `<webhook-id>.<webhook-timestamp>.<body>` with the secret's bytes (the base64 after `whsec_`). The libraries of Standard Webhooks check it as they are.

It answers `200` with the people the caller may reach:

```json
{ "allowed_user_ids": ["usr_bob"] }
```

Those it leaves out are not rung; when it leaves out everyone, the call is `403 not_allowed`. Anything but a `200` with that body — another status, a body it cannot read, no answer within `timeout_ms` (100 to 5,000; 2,000 by default) — is no answer, and `on_error` says what happens: `deny` (the default) refuses the call, `allow` lets it ring everyone blocks allow. The hook is asked again for each call: what it allowed once is not remembered. Redirects are not followed.

## Reading and ending calls

| Call | What it does |
|---|---|
| `GET /calls/admin/calls` | The project's calls, the newest first: `user_id` a person's (with `missed=true`, the ones they missed or were busy for), `state` those `ringing`, `active` or `ended`, `limit` (1 to 100, 20 by default) and `cursor` to page |
| `GET /calls/admin/calls/{call_id}` | A call as it is now |
| `POST /calls/admin/calls/{call_id}/end` | Ends the call for everyone in it (`ended`): their apps are told, and its room on the media server closes |

Each answers calls as a person's apps read them ([A call](https://palbase.studio/docs/calls/http#a-call)); a call that is not the project's is `404 call_not_found`. Studio's **Calls › Calls** is the same list: a person's calls by their user id, and **End call** on one going on. With the CLI:

```bash
palbase calls:list --user usr_ada --missed
palbase calls:list --state active
palbase calls:get 8a1e2f40-5c7d-4b8e-9a61-3f2d7c0b9e15
palbase calls:end 8a1e2f40-5c7d-4b8e-9a61-3f2d7c0b9e15
```

## Webhooks

Your backend's webhook endpoints hear of the project's calls ([Webhooks](https://palbase.studio/docs/server/webhooks)):

| Event | Sent when |
|---|---|
| `calls.call.started` | A call was made — ringing, or a group going on |
| `calls.call.ended` | A call ended |
| `calls.participant.joined` | A person answered or joined, or an agent came into the call |
| `calls.participant.left` | A person or an agent left the call |

Each one's `data` says of the call: `call_id`, `kind`, `video`, `mode`, `state`, `caller_id`, `conversation_id`, and `room` — its room on the media server, once it is there; a participant's event adds `user_id` and `participant_kind` (`user` or `bot`), and `calls.call.ended` its `end_reason`.

```json
{
  "id": "0b7c…",
  "type": "calls.participant.joined",
  "project_id": "2b7d…",
  "created_at": "2026-10-29T09:41:22Z",
  "data": { "call_id": "8a1e…", "kind": "group", "video": false, "mode": "sfu", "state": "active", "caller_id": "usr_ada", "conversation_id": null, "room": "2b7d…_8a1e…", "user_id": "usr_bob", "participant_kind": "user" }
}
```
