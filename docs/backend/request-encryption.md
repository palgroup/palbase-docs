> The full documentation index: https://palbase.studio/llms.txt

# Encrypted Requests

A field your route marks `encrypted()` is sealed by the app before the request leaves the device, and a field your route answers with `encrypt()` is opened by the app when the answer arrives. Your handler and the app's code see the value; everything between them — the network, the edge, a proxy, the logs, a debugging proxy, the browser's network panel — sees ciphertext. It is on every plan, at no cost.

It protects a field from whatever sits between the app and your code. It does not protect it from the device that typed it, nor from your backend, which opens it. To keep it sealed in the database too, store it in an [encrypted column](https://palbase.studio/docs/backend/encryption).

## Quick example

The backend: `tc` (a national ID) is encrypted in the request and in the answer.

```ts
// server/src/patients/patients.controller.ts
import { Body, Controller, encrypt, encrypted, Get, NotFound, Param, Post, z, type Encrypted } from "palbase/backend";

const CreatePatient = z.object({
  name: z.string().min(1).max(200),
  // Sealed by the app; opened before validation, so the handler and the schema see the value.
  tc: encrypted(z.string().regex(/^\d{11}$/)),
});
type CreatePatient = z.infer<typeof CreatePatient>;

interface Patient {
  id: string;
  name: string;
  tc: string;
}

@Controller("/patients")
export class PatientsController {
  private readonly patients = new Map<string, Patient>();

  @Post("")
  create(@Body(CreatePatient) body: CreatePatient): { id: string; name: string; tc: Encrypted<string> } {
    const patient = { id: crypto.randomUUID(), name: body.name, tc: body.tc };
    this.patients.set(patient.id, patient);
    // Sealed with the request's own key: only the app that asked opens it.
    return { id: patient.id, name: patient.name, tc: encrypt(patient.tc) };
  }

  @Get("/:id")
  get(@Param("id") id: string): { id: string; name: string; tc: Encrypted<string> } {
    const patient = this.patients.get(id);
    if (!patient) throw new NotFound("no such patient");
    return { id: patient.id, name: patient.name, tc: encrypt(patient.tc) };
  }
}
```

Once it is deployed, `palbase apps:sync` writes the app's client with the fields marked, and the app's calls are what they would be without them:

<!-- fragment: the app's module is the one palbase apps:sync writes for your project -->
```ts
// src/patients.ts
import { pb } from "../palbase/clinic-web";

const patient = await pb.backend.patients.create({ name: "Ada", tc: "10000000146" });
console.log(patient.tc); // "10000000146"
```

What went over the wire:

```text
POST /patients
Palbase-Encryption: 1.t1.gZlVWWADouVFMPA7e26mzk8OCPWBYEEnrr9VqRsqSgA.z-X3bStZx8D0K24F90qhbcbUTIIHDxZYWwnMIeFjZWcMqHk5nHmy7ZYKGyb8Idvo
{"name":"Ada","tc":"pbt1.fCnMiPfNbStaAugZD5anhbAszYy170oluQ_30omSb7lSOGzhJACqpVg"}

200
{"id":"a71f381e-b849-4ccd-9e0d-224a1fc80f2c","name":"Ada","tc":"pbt1.yrbQ_0Qhe_p0R7HXOgHgkXJKaeniFL8N9Jd1xNmZ50C_ckFf5tCPF7o"}
```

Each request has a key of its own, sealed to the project's key in use and bound to the project, the method, the route and its path's values; each field is bound to its place. A value moved to another field, a request replayed against another route or another record, does not open, and the backend answers 400.

## Marking a field

**In a request**, `encrypted(schema)` marks a field of the body or of the query, wherever it sits in the body: a nested object's field, every item of an array (`items: z.array(z.object({ tc: encrypted(z.string()) }))`), an optional field. A query's field is one of the query's own names. A path parameter or a header is not marked: it is part of the address the request is routed by.

**In an answer**, the handler returns the value through `encrypt(value)`, typed `Encrypted<T>`. The build reads the route's return type and writes the mark into the contract, as it writes every other answer's type: `{ tc: Encrypted<string> }` is a `string` the app opens. An answer the route declares as a named schema holds no mark — the build refuses it, naming the route — and a streamed answer and an upload carry no encrypted field.

A request that comes without its key to a route that marks its request is refused before the handler runs. A route that marks only its answer runs its handler and is then refused, since the answer cannot be sealed: keep such a route free of side effects, or mark a field of its request too.

## In the apps

The web, iOS and Android clients `palbase apps:sync` writes seal and open the marked fields themselves. The first call that carries one fetches the project's list of keys with the app's publishable key, and checks that the project signed it with the signing key `apps:sync` wrote into the app, and that it answers this call's fresh nonce: a list that does not verify is not sealed to, and the call fails with `encryption_keys_unverified` before anything is sent. A marked field that comes back plain fails with `field_not_encrypted`.

The [iOS](https://palbase.studio/docs/ios/debug-console) and [Android](https://palbase.studio/docs/android/debug-console) debug consoles record a backend call as it went: an encrypted field is shown sealed, and **Reveal** beside it shows its value. Nothing is recorded while the console is off.

## Keys

Each project has its own keys, and apps seal to the newest. An owner or an admin of the organization lists and rotates them:

```bash
palbase transit:list                      # the keys, the one in use, who made and retired each
palbase transit:rotate                    # a new key, in use at once; the older ones still open what is sealed to them
palbase transit:rotate --retire-previous  # a new key, and every older one refused from now on
palbase transit:retire t1                 # refuse one older key
```

A key thought exposed is rotated with `--retire-previous`. A request sealed to a retired key is refused at once, before it reaches your backend (which also refuses it on its own once it next fetches the keys, within a minute), and an app that sealed to it is told so: it fetches the list again and sends the call once more, sealed to the new key — the user sees nothing. An app fetches the list again every hour in any case. The secrets audit trail (`palbase secrets:audit`) has every rotation and retirement.

## Errors

A request the format refuses is answered `400`, with its code in `error`:

| Code | When | `data` |
|---|---|---|
| `encryption_required` | A marked field came plain, or the request has no `Palbase-Encryption` header. | `field`, `current` |
| `encryption_unopenable` | The request's key or a field does not open: changed, moved from another field, sealed for another project, route or record. | `field` |
| `encryption_key_retired` | The request is sealed to a key the project retired. The app's client fetches the list again and sends once more. | `current` |
| `encryption_key_unknown` | The request is sealed to a key the project has not made. The same. | `current` |

## Trying a route

curl and Postman send the field plain, and are refused. `palbase machines:call` calls a route as the app does — its marked fields sealed to the key in use, its answer's opened — and prints the answer:

```bash
palbase machines:call backend POST /patients --data '{"name":"Ada","tc":"10000000146"}'
```

Studio's **Try it** on a machine's endpoint seals and opens them the same way.

## Without palbase/backend

A server built another way — NestJS, Express, Hono, a route handler — opens a request and seals its answer with `palbase/server`'s `transit`, in the same format. Its contract marks the fields `x-palbase-encrypted: true`; served by its app (a machine made with `--openapi-path`), it is what `palbase apps:sync` writes the apps' clients from.

```ts
// src/transit.ts
import { createServer } from "palbase/server";

export const palbase = createServer({ url: process.env.PALBASE_URL!, secretKey: process.env.PALBASE_SECRET_KEY! });

/** Awaited at startup: the project's keys, fetched again every minute and when a request names one not held. */
export const transitLoaded = palbase.transit.load();
```

```ts
// src/patients.ts
import { TransitRefusal } from "palbase/server";
import { palbase } from "./transit";

const patients = new Map<string, { id: string; name: string; tc: string }>();

/** POST /patients and GET /patients/{id}, as a fetch handler (Hono, Bun.serve, a route handler) takes them. */
export async function handle(request: Request): Promise<Response> {
  const key = request.headers.get("palbase-encryption");
  const id = new URL(request.url).pathname.split("/")[2];
  try {
    if (request.method === "POST") {
      // The route as the contract writes it: a key sealed for another route does not open here.
      const req = await palbase.transit.request({ header: key, method: "POST", path: "/patients" });
      const input = (await req.open(await request.json(), "/body", ["/body/tc"])) as { name: string; tc: string };
      const patient = { id: crypto.randomUUID(), name: input.name, tc: input.tc };
      patients.set(patient.id, patient);
      return Response.json(await req.seal(patient, ["/response/tc"]));
    }
    // A path's values are part of what the key is sealed for, in order.
    const req = await palbase.transit.request({ header: key, method: "GET", path: "/patients/{id}", params: [id ?? ""] });
    const patient = patients.get(id ?? "");
    if (!patient) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(await req.seal(patient, ["/response/tc"]));
  } catch (e) {
    // Answered as palbase/backend answers it, so the apps' clients know a retired key when they meet one.
    if (e instanceof TransitRefusal) return Response.json({ error: e.code, error_description: e.message, data: e.data }, { status: e.status });
    throw e;
  }
}
```

In a NestJS controller the same calls go in its methods: the header through `@Headers("palbase-encryption")`, `open()` on the `@Body()`, the answer returned through `seal()`, and an exception filter that answers a `TransitRefusal` as above.
