> The full documentation index: https://palbase.studio/llms.txt

# Modules & Dependency Injection

One `@Module` declaration says **what exists, who owns it, and what it may reach**. It is the only place ownership is decided. A `@Controller` or `@Injectable()` class that no module lists does not exist, and the app refuses to start rather than serve without it. Being in a particular folder grants nothing.

A dependency is named by its constructor parameter's **type**, and by nothing else. There is no `@Inject`, no `useFactory`, no `forwardRef` and no token registry.

## The four lists

A module is named after its **domain** and lives with it: `src/modules/notes/` holds the module, the controller, the service and the schemas that belong to notes.

```ts
// src/modules/notes/notes.module.ts
import { Module } from "palbase/backend";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService], // the class another module may reach
  imports: [],             // whose exports THIS module may reach
})
export class NotesModule {}
```

```ts
// src/modules/notes/notes.service.ts
import { Injectable, NotFound } from "palbase/backend";

export interface Note {
  id: string;
  title: string;
}

@Injectable()
export class NotesService {
  private readonly notes = new Map<string, Note>();

  get(id: string): Note {
    const note = this.notes.get(id);
    if (!note) throw new NotFound(`no note ${id}`);
    return note;
  }
}
```

```ts
// src/modules/notes/notes.controller.ts
import { Controller, Get, Param } from "palbase/backend";
import { NotesService, type Note } from "./notes.service";

@Controller("/notes")
export class NotesController {
  // The container supplies this. Nothing here constructs or imports an instance.
  constructor(private readonly notes: NotesService) {}

  @Get("/{id}")
  get(@Param("id") id: string): Note {
    return this.notes.get(id);
  }
}
```

Four lists answer four different questions, and nothing else answers them:

| List | The question it answers |
|---|---|
| `providers` | which classes does this module **own** (`@Injectable()` services, classes with [`@On`](https://palbase.studio/docs/backend/hooks) handlers, and [`@Webhook`](https://palbase.studio/docs/backend/webhooks) classes) |
| `controllers` | which `@Controller` classes it owns |
| `exports` | which of its own providers **another** module may reach |
| `imports` | whose exports **this** module may reach |

Every list is optional and empty by default. A module with nothing but `imports` is how the root module gathers the domains:

```ts
// src/app.module.ts
import { Module } from "palbase/backend";
import { NotesModule } from "./modules/notes/notes.module";

@Module({ imports: [NotesModule] })
export class AppModule {}
```

```ts
// src/main.ts
import { PalbaseFactory } from "palbase/backend";
import { AppModule } from "./app.module";

await PalbaseFactory.create(AppModule);
```

`PalbaseFactory.create` takes the root module, or an array of them. Every module the app has is reached from there through `imports`. A module nothing imports is not part of the app.

## A class no module lists does not exist

`@Controller`, `@Injectable()` and `@On` record the class they decorate when its file is imported. When the app is built, every recorded class must be owned by exactly one module the root reaches. Otherwise the app stops before it serves anything, and the error names the class:

```text
DiError:
Kind:  unowned class
Path:  PricingService
At:    PricingService
PricingService is declared but no module lists it: it would never be built

Potential solutions:
  - list it in a module's controllers or providers
  - or delete it
```

Every container error is a `DiError` with a `kind`, the path that led to it, and what to do. They are all raised at boot, before the first request, and none is retried: waiting does not fix a wiring mistake.

| `kind` | What it means |
|---|---|
| `unowned class` | A declared class no module lists, or a dependency nobody owns |
| `duplicate ownership` | Two modules list the same class, or an abstract dependency has more than one owned subclass |
| `undeclared provider` | A class in `providers` that is not `@Injectable()` (nor has an `@On` method), or a class in `controllers` that is not a `@Controller` |
| `unknown export` | A module exports a class it does not own |
| `unknown import` | Something in `imports` is not a `@Module`, or a module imports itself |
| `missing import` | A class needs another module's class, and its module does not import that module |
| `private dependency` | The other module owns the class but does not export it |
| `unresolvable dependency` | A constructor parameter typed as an interface, a union or a primitive |
| `metadata missing` | A class takes constructor parameters but no types were emitted |
| `dependency cycle` | `A → B → A` |
| `nest lifecycle name` | A class has `onModuleInit` or another NestJS hook, which would never be called |

## `exports` and `imports`: the boundary

A module reaches another module's class when **both** sides say so: the owner exports it, and the module that needs it imports the owner directly.

```ts
// src/modules/billing/billing.service.ts
import { Injectable } from "palbase/backend";

@Injectable()
export class BillingService {
  planOf(userId: string): "free" | "pro" {
    return userId.startsWith("usr_") ? "free" : "pro";
  }
}
```

```ts
// src/modules/billing/billing.module.ts
import { Module } from "palbase/backend";
import { BillingService } from "./billing.service";

@Module({ providers: [BillingService], exports: [BillingService] })
export class BillingModule {}
```

```ts
// src/modules/reports/reports.controller.ts
import { Controller, Get, User, type UserT } from "palbase/backend";
import { BillingService } from "../billing/billing.service";

@Controller("/reports")
export class ReportsController {
  constructor(private readonly billing: BillingService) {}

  @Get("/plan")
  plan(@User() user: UserT): { plan: "free" | "pro" } {
    return { plan: this.billing.planOf(user.id) };
  }
}
```

```ts
// src/modules/reports/reports.module.ts
import { Module } from "palbase/backend";
import { BillingModule } from "../billing/billing.module";
import { ReportsController } from "./reports.controller";

@Module({ imports: [BillingModule], controllers: [ReportsController] })
export class ReportsModule {}
```

Leave `BillingModule` out of `imports` and the boot stops with `missing import`, naming both modules. Leave `BillingService` out of `exports` and it stops with `private dependency`. **Imports are not transitive.** If `ReportsModule` imports `BillingModule` and `BillingModule` imports `AccountsModule`, `ReportsModule` still cannot reach `AccountsModule`'s classes without importing it itself.

## Dependency injection: the constructor is the seam

Every owned class is built **once**, dependencies first, and every class that names it gets the same instance. A class names what it needs as constructor parameters; the container reads their types from the metadata TypeScript emits (`design:paramtypes`) and passes the instances in. Controllers take services this way, and services take other services.

```ts
// src/modules/notes/clock.ts
import { Injectable } from "palbase/backend";

@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
```

```ts
// src/modules/notes/reminders.service.ts
import { Injectable } from "palbase/backend";
import { Clock } from "./clock";

@Injectable()
export class RemindersService {
  constructor(private readonly clock: Clock) {}

  isDue(at: Date): boolean {
    return at.getTime() <= this.clock.now().getTime();
  }
}
```

### What the container cannot inject

A parameter's type must be a **class**: something that exists at run time. An `interface`, a type alias, a union, `string` or `number` erases to `Object` (or nothing) in the emitted metadata, and the boot stops with `unresolvable dependency`, naming the class and the parameter. Configuration that is a value (a URL, a limit) is read where it is used, from `process.env`. It is not injected.

## The abstraction is the type, the implementation is the provider

To depend on an abstraction, make it an `abstract class` and list a subclass in `providers`. A parameter typed as the abstract class gets the **one** owned subclass:

```ts
// src/modules/mail/mailer.ts
import { Injectable, Log } from "palbase/backend";

export abstract class Mailer {
  abstract send(to: string, subject: string): Promise<void>;
}

@Injectable()
export class LogMailer extends Mailer {
  async send(to: string, subject: string): Promise<void> {
    Log.info("mail", { to, subject });
  }
}
```

```ts
// src/modules/mail/welcome.service.ts
import { Injectable } from "palbase/backend";
import { Mailer } from "./mailer";

@Injectable()
export class WelcomeService {
  constructor(private readonly mailer: Mailer) {}

  welcome(email: string): Promise<void> {
    return this.mailer.send(email, "Welcome");
  }
}
```

```ts
// src/modules/mail/mail.module.ts
import { Module } from "palbase/backend";
import { LogMailer } from "./mailer";
import { WelcomeService } from "./welcome.service";

@Module({ providers: [LogMailer, WelcomeService] })
export class MailModule {}
```

Two owned subclasses of `Mailer` make the choice ambiguous, and the boot stops with `duplicate ownership`. Ask for the subclass itself where you mean one. In a test, the same seam lets you pass any `Mailer` to `new WelcomeService(...)` directly. See [Testing](https://palbase.studio/docs/backend/testing).

## Why there is no `@Inject`, `useFactory` or `forwardRef`

Each of them answers a question the constructor already answers. `@Inject(TOKEN)` names a dependency by a token instead of a type, so the type and the token can disagree. `useFactory` builds an instance outside the container, where its dependencies are not checked. `forwardRef` exists to make a cycle work, and a cycle is a design problem: the boot names it (`A -> B -> A`) and the fix is a third class both depend on.

## `onStart()` and `onShutdown()`

A constructor is pure wiring: synchronous, no I/O, because the container runs it at boot. Startup work is a method on the class:

```ts
// src/modules/catalog/catalog.service.ts
import { Injectable, Log, Palbase } from "palbase/backend";

@Injectable()
export class CatalogService {
  private bucketReady = false;

  // Awaited before the first request, in construction order.
  async onStart(): Promise<void> {
    await Palbase.storage.putBucket({ path: { bucket: "catalog" }, body: { public: true } });
    this.bucketReady = true;
  }

  // Run on SIGTERM, after the requests in flight have finished, in reverse order.
  async onShutdown(): Promise<void> {
    Log.info("catalog stopping", { bucketReady: this.bucketReady });
  }

  ready(): boolean {
    return this.bucketReady;
  }
}
```

- `onStart()` runs once per class, in construction order: a class's dependencies have started before it does. `Palbase` is bound by then. `Database` is not, because it is a request's.
- When one throws, the classes already started are shut down and the whole boot is tried again from scratch, waiting 1, 2, 4 and 8 seconds (`boot: { attempts, backoffMs }` in `PalbaseFactory.create`). Every attempt builds new instances. After the last attempt the error is logged and the process exits, and the machine starts it again.
- `onShutdown()` runs in reverse construction order, and every one is tried even when one throws.

NestJS's names (`onModuleInit`, `onApplicationBootstrap`, `onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown`) are refused at boot with `nest lifecycle name`. They would never be called here, so a class that relied on them would fail silently.

## `emitDecoratorMetadata` is what makes injection work

The container reads constructor types from the metadata TypeScript emits with `"experimentalDecorators": true` and `"emitDecoratorMetadata": true`. Bun, tsc and SWC emit it. esbuild does not. Without it, a class with constructor parameters stops the boot with `metadata missing`:

```text
DiError:
Kind:  metadata missing
Path:  ReportsController
At:    ReportsController
ReportsController takes 1 constructor parameter(s) but no types were emitted
```

Every class with a constructor parameter must carry a decorator (`@Injectable()`, `@Controller`), because TypeScript emits the parameter types only for a decorated class.

> **Note:** A class is recorded once its file is imported, process-wide. Two copies of `palbase/backend` in one app share the record, so a class declared through either is seen. A test that builds only part of the app must pass modules that own every declared class its imports bring in.

## A domain is a folder

`src/modules/<domain>/` is a convention, not a rule the framework reads: nothing scans a directory. A domain's module, controllers, services and schemas sit together because they change together, and the module is what makes them exist. The one other place the layout matters is the schema: the database's tables are declared in `src/db/` and given to `PalbaseFactory.create(…, { db: { schemas } })`. See [Project Structure](https://palbase.studio/docs/getting-started/project-structure) and [Schema](https://palbase.studio/docs/backend/schema).

## Related

- [Overview](https://palbase.studio/docs/backend/overview): the authoring model in one page
- [Controllers & Routing](https://palbase.studio/docs/backend/controllers): what a controller declares
- [Testing](https://palbase.studio/docs/backend/testing): constructing a class with your own dependencies
- [Architecture](https://palbase.studio/docs/getting-started/architecture): how modules, controllers and services fit
