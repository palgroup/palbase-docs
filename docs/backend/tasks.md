> The full documentation index: https://palbase.studio/llms.txt

# Tasks

A task is work your backend puts on its machine's queue to be done once, now or later: a receipt mailed when an order is paid, a reminder a day after sign-up, a report built in the background. Mark a provider with `@Task({ name })` and give it a `run(payload, meta)` method; put a task with `Tasks.enqueue(TheClass, payload)`. The platform keeps the queue. When a task is due it wakes the machine and calls `run`; an attempt that fails is made again later, and a task with no attempt left is kept, to be tried again from Studio or the CLI.

Nothing polls: a machine with no task due sleeps. A [cron](https://palbase.studio/docs/backend/cron) that wakes every minute to look in a table for work keeps it awake for nothing, and takes up to a minute to notice.

## Quick example

The table the task works on:

```ts
// src/db/public.ts
import { defineSchema, defineTable, text, timestamp, uuid } from "palbase/backend";

// The app's own: no policy lets a user reach it, the service role does.
export const orders = defineTable("orders", {
  columns: { id: uuid().primaryKey().defaultRandom(), email: text(), receipt_sent_at: timestamp().nullable() },
});

export default defineSchema("public", { tables: [orders] });
```

```ts
// src/modules/orders/send-receipt.task.ts
import { Database, Log, Notifications, Task, TaskFailure, z, type TaskMeta } from "palbase/backend";
import { now } from "palgres";

const Receipt = z.object({ orderId: z.string().uuid() });

// Mail an order's receipt. A failed attempt is made again: up to five more, 10 s, 20 s, 40 s… apart.
@Task({ name: "send-receipt", payload: Receipt, retry: 5, concurrency: 10 })
export class SendReceipt {
  async run(payload: z.infer<typeof Receipt>, meta: TaskMeta): Promise<void> {
    const order = await Database.public.orders.findUnique({ where: { id: payload.orderId } });
    // The order is gone: no attempt will ever find it.
    if (!order) throw new TaskFailure(`order ${payload.orderId} is gone`);
    if (order.receipt_sent_at) return; // an attempt made again after one that finished
    await Notifications.email.send({ to: order.email, templateSlug: "receipt", variables: { order: order.id } });
    await Database.public.orders.update({ where: { id: order.id }, set: { receipt_sent_at: now() } });
    Log.info("receipt sent", { order: order.id, task: meta.id, attempt: meta.attempt });
  }
}
```

```ts
// src/modules/orders/orders.controller.ts
import { Controller, Param, Post, Tasks } from "palbase/backend";
import { SendReceipt } from "./send-receipt.task";

@Controller("/orders")
export class OrdersController {
  @Post("/{id}/paid")
  async paid(@Param("id") id: string) {
    // Put once per order: the same key again answers the task already put.
    const task = await Tasks.enqueue(SendReceipt, { orderId: id }, { key: `receipt:${id}` });
    return { receipt: task.id };
  }
}
```

```ts
// src/modules/orders/orders.module.ts
import { Module } from "palbase/backend";
import { OrdersController } from "./orders.controller";
import { SendReceipt } from "./send-receipt.task";

@Module({ controllers: [OrdersController], providers: [SendReceipt] })
export class OrdersModule {}
```

A task type is a provider like any other: its module lists it in `providers`, and it takes its dependencies by constructor. A class is one task type.

## Putting a task

```ts
// src/modules/users/reminders.ts
import { Task, Tasks, type TaskMeta } from "palbase/backend";
import { SendReceipt } from "../orders/send-receipt.task";

@Task({ name: "remind" })
export class Remind {
  async run(payload: { userId: string }, meta: TaskMeta): Promise<void> {
    console.log(`remind ${payload.userId} (task ${meta.id})`);
  }
}

export async function put(orderId: string, userId: string, trialEnds: string): Promise<void> {
  await Tasks.enqueue(SendReceipt, { orderId });                       // due now
  await Tasks.enqueue(Remind, { userId }, { delay: 24 * 3600 });       // in a day
  await Tasks.enqueue(Remind, { userId }, { runAt: new Date(trialEnds) });
  await Tasks.enqueue(SendReceipt, { orderId }, { key: `receipt:${orderId}` });
}
```

What `Tasks.enqueue` takes is checked as it is written: the payload is what the class's `run` takes, and anything else does not compile. It answers the task as it was put — `id`, `state`, `runAt` — and `duplicate: true` when a task of the type was put already under the same key.

| Option | What it is |
|---|---|
| `delay` | Due this many seconds from now: 30 days at most |
| `runAt` | Due at this time: 30 days from now at most; a time past is now |
| `key` | Put once: another task of the type under the same key, until a day after the first is over, is not put — the first is answered |

A task carries 64 KiB of JSON at most, kept and handed to `run` as the bytes it was given: name what it works on — an id — and read it where it runs. A project's queues hold 100,000 tasks not yet done, or 256 MiB of what the tasks kept carry; past that, `Tasks.enqueue` is refused (`429`, `queue_full`) until some are done.

`Tasks.cancel(id)` takes a task that is waiting off the queue; `Tasks.get(id)` reads one as it is now. A task of another of the project's machines is put by its type's name: `Tasks.enqueue("rebuild-index", payload, { machine: "search" })`.

## Options

| Option | What it is | Default |
|---|---|---|
| `name` | The task type: what its tasks are put under, kept under and called by. Letters, digits, `.`, `_` and `-`, at most 64. | required |
| `payload` | A schema (zod, valibot, arktype — any Standard Schema) what a task carries is checked against before `run`; `run` is given what it gives | none |
| `timeout` | Seconds one attempt may take before it is a failed one: 1–900 | 60 |
| `retry` | Attempts after a failed one: 0–20 | 5 |
| `concurrency` | How many of its tasks the machine runs at once, however many copies it has: 1–50 | 5 |

A machine has at most 50 task types; two of one name are refused at boot.

## How a task goes

1. **Due.** When its time comes, the platform calls the machine for it — waking it if it sleeps — once the type has room under its `concurrency` (and the project under 50 at once). Tasks are taken type by type, oldest first: one type's backlog holds no other's back.
2. **Signed.** The call is `POST /_palbase/tasks/<name>`, signed with the machine's `PALBASE_PLATFORM_SECRET`, as the platform's other calls into a machine are. Nothing from the internet reaches it.
3. **Checked, then run in one transaction, as the service role.** What it carries is checked against `payload`, then `run` runs in a database transaction of its own, given its `TaskMeta`, with every row in reach as a [cron](https://palbase.studio/docs/backend/cron)'s is.
4. **Done, failed for good, or made again.**
   - `run` returned: the task succeeded.
   - What it carries is not what `payload` takes, or `run` threw a `TaskFailure`: the task **failed** at once and is not tried again — no attempt would do better.
   - `run` threw anything else, or ran past its `timeout`: the attempt failed and its transaction is rolled back. The next one is made after 10 s, then 20 s, 40 s, … an hour apart at most, until `retry` is spent; then the task **failed**.

A task that succeeded lets go of what it carried; only a task that may be tried again keeps it.

A task is delivered **at least once**: its `id` is the same through every attempt, and an attempt can run and still be counted as failed (the machine finished, its answer was lost). Key the work on the task's `id`, or on what it works on, as the receipt above does with `receipt_sent_at`.

A project whose machine time for the period is used up runs no task: a task due then fails ("its machine time for the period is used up"), and none is put meanwhile (`429`, `quota_exceeded`). Once the time comes back, the failed ones are tried again by hand — not run in a heap the moment it does.

## What a task is given

| Field of `TaskMeta` | What it is |
|---|---|
| `env` | The app's environment variables as it started, the platform's keys left out |
| `environmentId` | The project's id |
| `task` | The task type's name |
| `id` | The task's id: the same for every attempt of it |
| `attempt` | 1 for the first, then one more for each attempt made again |
| `createdAt` | When it was put on the queue |

## Failed tasks

A task that succeeded or was cancelled is kept a day; one that failed, 30 — with why its last attempt failed. On the machine's **Tasks** tab in Studio, or with the CLI:

| | Studio | CLI |
|---|---|---|
| The types, and what each one's queue holds | Task types | `palbase machines:tasks:types` |
| The tasks, of one state or type | Tasks, with Show | `palbase machines:tasks --state failed` |
| A task, with what it carries | | `palbase machines:tasks:get <id>` |
| Try a failed task again: due now, with as many attempts again as its type gives — its attempts counted on, not from zero | Retry | `palbase machines:tasks:retry <id>` |
| Take a waiting task off the queue: it is not run, nor tried again, and what it carried is let go | Cancel | `palbase machines:tasks:cancel <id>` |
| Put a task by hand | | `palbase machines:tasks:enqueue <type> --payload '<json>'` |

Trying again and cancelling are an admin's, as every change is; so is reading what a task carries — a member sees the queue, not what is in it.

## On your computer

Off the platform — the app started on your computer, or in a test — it runs its own tasks, in its own process, as the platform would: each when it is due, its type's `concurrency` kept, a failed attempt made again later, a key held a day. Nothing of that queue outlives the process. `Tasks.enqueue` of another machine's type is refused there.

## Without palbase/backend

Any program a machine runs takes tasks by answering two signed calls, as it takes [crons](https://palbase.studio/docs/machines/overview#crons-and-tasks); anything with the project's secret key puts them: `POST /machines/<machine>/tasks` with `{"task", "payload", "delay" | "run_at", "key"}`.

## Related

- [Cron](https://palbase.studio/docs/backend/cron): work on a schedule
- [Event Hooks](https://palbase.studio/docs/backend/hooks): the platform's events, delivered as they happen
- [Database](https://palbase.studio/docs/backend/database): the transaction a task runs in
