> The full documentation index: https://palbase.studio/llms.txt

# AI

`Palbase.ai` is the project's models and agents, from your backend. It answers one-shot questions (`ask`, `generate`, `stream`, `embed`, `image`), gives an agent tools that run on your machine, defines agents from each turn's context, and runs **chats**: conversations of the project's agents with the members your backend names. Every call is made with the app's secret key and is recorded with its cost. The models are the platform's, and nothing is configured to use them.

A model call is billed to the project, so no app makes one. There is no AI client in `palbase/web` or the mobile SDKs: an app reaches a chat through one of your backend's [gateways](https://palbase.studio/docs/backend/gateways), and asks your routes for anything else.

## Quick example

```ts
// src/modules/reviews/reviews.controller.ts
import { Body, Controller, Palbase, Post, z } from "palbase/backend";

const Review = z.object({ text: z.string().min(1).max(4000) });
const Verdict = z.object({ sentiment: z.enum(["positive", "neutral", "negative"]), summary: z.string() });

@Controller("/reviews")
export class ReviewsController {
  // A document of Verdict's shape, checked against it before it is returned.
  @Post("/verdict")
  verdict(@Body(Review) body: z.infer<typeof Review>): Promise<z.infer<typeof Verdict>> {
    return Palbase.ai.generate({
      schema: Verdict,
      instructions: "Classify the customer review and summarize it in one sentence.",
      prompt: body.text,
      model: "fast",
    });
  }
}
```

## One-shot answers

| Call | What it answers |
|---|---|
| `ask(prompt, options?)` | The answer as text. |
| `generate({ schema, prompt })` | A document of the schema's shape, checked against it. With `background: true`, the response's id at once; its end is the event `ai.response.completed` (or `ai.response.failed`, see [Event Hooks](https://palbase.studio/docs/backend/hooks)), and `result(id, schema)` reads it. |
| `stream({ prompt })` | The answer as the model writes it: `textStream`, then `text` and `response` at the end. With a `schema`, `partialObjectStream` and `object`. |
| `embed(text)`, `embed(texts)` | A vector per text, in order. `dimensions` asks for a shorter one. |
| `image({ prompt })` | Pictures, waited for. `save(bucket, path)` writes one into the project's storage. |

Each takes `instructions`, `model`, `messages` (the conversation so far, in place of `prompt`), `metadata` (labels of your own, returned with the response) and `signal`. A `model` is a role, `"fast"`, `"default"` or `"strong"`, or a catalogue model as `provider:model` (`Palbase.ai.models()`). `images` gives the question up to 4 pictures, each a file of the project's storage (`{ bucket, path }`), an https address (`{ url }`) or its bytes (`{ mediaType, data }`: base64 png, jpeg, webp or gif, up to 5 MiB each and 6 MiB together, kept in the project's storage while the question is answered, then deleted). A tool's pictures reach the model too. Once a response has ended, its `usage` says what it cost: `cost_nano_usd`, `usd`, and `cost_final` once nothing more of it can be settled. The question is asked with the secret key, so the model can be shown any file of the project's: check that a file is the user's own before you name it. `tools` and `maxToolCalls` give a one-shot answer the tools below, except a client tool, which only a chat has an app to answer.

`stream(…).toResponse()` is the stream as a route's answer to a browser, as server-sent events: `data: {"text": "…"}` for each fragment, `event: reset` with `{"offset": n}` when the model went back (keep the first `n` characters), and a last `event: done` with the answer. A failure is `event: error` with its code alone.

```ts
// src/modules/reviews/replies.controller.ts
import { Body, Controller, Palbase, Post, z } from "palbase/backend";

const Draft = z.object({ review: z.string().min(1).max(4000) });

@Controller("/replies")
export class RepliesController {
  // The browser reads the reply as it is written.
  @Post("/draft")
  draft(@Body(Draft) body: z.infer<typeof Draft>): Response {
    return Palbase.ai.stream({ instructions: "Draft a short, polite reply to this review.", prompt: body.review }).toResponse();
  }
}
```

`usage()` lists the project's uses of models and what each cost. Each use carries its labels (`metadata`): the caller's, and for a chat's turn, the chat's labels and the chat. `usage({ metadata: { product: "p1" } })` lists only the uses that carry those labels, such as a product's spend or a task's. This works after the chat is deleted too. `connectProvider(provider, key)` sends the project's calls to a provider with the project's own key from then on.

## Tools

An agent is given tools from five sources:

| Source | Made with | Runs |
|---|---|---|
| Your backend | `Palbase.ai.tool({ name, description, input, run })` | On your machine, when the agent calls it. |
| The app | `Palbase.ai.clientTool({ name, description, input })` | In the app the chat is open in. The turn waits for the answer, which reaches the chat through your gateway. |
| An HTTPS tool | `Palbase.ai.endpoints.put(name, { kind: "https", url, … })`, then `{ source: "https", name }` | At that address: a signed `POST`. |
| An MCP server | `Palbase.ai.endpoints.put(name, { kind: "mcp", url })`, then `{ source: "mcp", name, only? }` | At that address, over streamable HTTP. |
| The platform | `{ source: "platform", name }`: `web.search`, `web.fetch`, `workspace.fetch_archive` | On the platform. `web.search` searches the web, `web.fetch` reads a page of it, `workspace.fetch_archive` downloads an archive from a URL and unpacks it into the chat's workspace (a workspace chat has it already). They belong to the agent; its subagents use the agent's. |

A tool answers within 110 seconds; past that the agent is told it did not answer. A tool whose work takes longer (a review that takes minutes) answers `{ deferred: true, expires_in_seconds? }` at once, and the call waits. Your server gives the answer later with `chats.answer(chatId, callId, output)` (`POST /ai/chats/{id}/tool-outputs/{callId}` with the secret key), within the time the tool named: a minute to a day, an hour by default. A call nobody answers by then is told to the agent as unanswered. No member answers such a call. The tool is told the call's `callId` and the chat in its context.

A chat that works in a workspace gives its agent the workspace's own tools as well:

| Tool | Does |
|---|---|
| `palai.workspace.file`, `str_replace_based_edit_tool` | Read, write and edit a file. |
| `palai.workspace.glob`, `palai.workspace.grep` | Find files by name, and lines by pattern. |
| `palai.workspace.shell`, `palai.workspace.background_status`, `palai.workspace.background_kill` | Run a command (with no network), keep one running in the background, read it and stop it. `xcodebuild`, `xcrun`, `swift` and `simuse` run on the platform's Mac, and what they write under `artifacts/` and `scratch/` comes back into the workspace. |
| `palai.workspace.fetch_archive` | Download an archive from a URL and unpack it into the workspace. |
| `palai.workspace.commit`, `palai.publish.push` | Commit, as the member the turn is for, and push to the chat's branch. |
| `palai.artifact.publish`, `palai.artifact.open`, `palai.artifact.read`, `palai.artifact.list` | Publish a file as the turn's output, and read the ones published. |
| `palai.agent.spawn`, `palai.agent.status`, `palai.agent.send`, `palai.agent.stop` | Hand work to a subagent, follow it, message it and stop it. |

The table a backend tool reads:

```ts
// src/db/public.ts
import { defineSchema, defineTable, ownedByUser, policy, text, uuid } from "palbase/backend";

export const orders = defineTable("orders", {
  columns: {
    id: uuid().primaryKey().defaultRandom(),
    owner: ownedByUser(),
    status: text(),
  },
  // A customer reads their own orders, and no one else's.
  policies: (p) => [policy("orders_own").for("select").to("authenticated").using(p.col("owner").eq(p.auth.uid()))],
});

export default defineSchema("public", { tables: [orders] });
```

```ts
// src/modules/support/support.tools.ts
import { Database, Palbase, z } from "palbase/backend";
import { ToolError } from "palbase/ai";

// Run on this machine when the agent calls it, its input checked against the schema first.
export const lookupOrder = Palbase.ai.tool({
  name: "lookup_order",
  description: "Tells an order's status by its id.",
  input: z.object({ orderId: z.string().uuid() }),
  run: async ({ orderId }) => {
    // As the chat's member: the orders policy decides what is found.
    const order = await Database.public.orders.findUnique({ where: { id: orderId } });
    if (!order) throw new ToolError(`No order ${orderId} of this customer.`);
    return { orderId, status: order.status };
  },
});

// Every call waits for a person's yes before it runs.
export const refundOrder = Palbase.ai.tool({
  name: "refund_order",
  description: "Refunds an order. A person approves each call.",
  input: z.object({ orderId: z.string().uuid() }),
  approval: true,
  run: ({ orderId }) => `Refund started for ${orderId}.`,
});

// The app answers it: the customer picks a city on their screen.
export const pickCity = Palbase.ai.clientTool({
  name: "pick_city",
  description: "Has the customer pick a city in the app, and answers the city's name.",
  input: z.object({ reason: z.string() }),
});
```

A tool is made once, at a module's top level: the framework serves every tool its process declared, and the platform calls the machine for one by its name. Its `run` is given the input and a context: `chatId`, `agent`, `callId` (the same for every attempt at one call), the chat's `metadata`, `signal`, and `user`.

- **Whose rights.** A chat that has only ever had one member is theirs: the tool runs in a transaction as that member, and `ctx.user` is them. In a chat that has had several members, a tool runs for no member and `ctx.user` is `null`, so no member has the agent act with another's rights. Reach past the caller's rights only by saying so (`Database.$asService()`).
- **What it answers.** A string, an object (said to the agent as JSON), pictures (`{ mediaType, bytes }`) or a list of them, 4 MiB at most in all.
- **When it fails.** A `ToolError`'s message is what the agent and the chat's members are told. Anything else thrown is told as "The tool failed", and the error is in the app's log.
- **`approval: true`.** Every call waits for a person's yes: the member whose message began the turn, or the server.

An HTTPS tool is any server's route. The platform calls it with `POST {tool, call_id, input, context}`, signed with the endpoint's secret in `Palbase-Signature`, and it answers `{ output, is_error }`. `endpoints.put` answers that secret once (`signing_secret`), and putting the endpoint again makes a new one. Keep it in the project's [secrets](https://palbase.studio/docs/backend/secrets):

```ts
// src/modules/rates/rates.controller.ts
import { Controller, Post, Req } from "palbase/backend";
import { verifySignature, WebhookSignatureError } from "palbase/server";

// put once: Palbase.ai.endpoints.put("convert", { kind: "https", url: "https://<ref>.app.palbase.studio/tools/convert", description, parameters })
@Controller("/tools", { auth: false })
export class RatesController {
  @Post("/convert")
  async convert(@Req() req: Request): Promise<Response> {
    const secret = process.env.CONVERT_TOOL_SECRET;
    if (!secret) throw new Error("CONVERT_TOOL_SECRET is not set");
    const raw = new Uint8Array(await req.arrayBuffer());
    try {
      await verifySignature({ secret, signature: req.headers.get("palbase-signature"), body: raw });
    } catch (e) {
      if (e instanceof WebhookSignatureError) return Response.json({ error: "invalid_signature" }, { status: 401 });
      throw e;
    }
    const call = JSON.parse(new TextDecoder().decode(raw)) as { input: { usd: number } };
    return Response.json({ output: [{ type: "text", text: `${(call.input.usd * 0.92).toFixed(2)} EUR` }], is_error: false });
  }
}
```

A project holds 32 endpoints. `endpoints.list()` and `endpoints.delete(name)` read and remove them.

## Agents

`Palbase.ai.agent(name, define)` is an agent your backend defines at the start of each turn, from the turn's context: the chat's `chatId`, `metadata` and `user` (the member, in a chat that has only ever had one).

```ts
// src/modules/support/support.agent.ts
import { Palbase } from "palbase/backend";
import { lookupOrder, pickCity, refundOrder } from "./support.tools";

export const support = Palbase.ai.agent("support", (ctx) => ({
  model: "fast",
  instructions: [
    "You are the shop's support assistant. Answer briefly.",
    ctx.user ? `The customer is ${ctx.user.name}.` : "Several people are in this chat: each message says who wrote it.",
  ].join(" "),
  tools: [lookupOrder, refundOrder, pickCity, { source: "mcp", name: "shop-docs" }],
  subagents: [{ name: "researcher", description: "Looks a question up in the shop's documents, step by step.", tools: [{ source: "mcp", name: "shop-docs" }] }],
  maxToolCalls: 12,
}));
```

```ts
// src/modules/support/support.setup.ts
import { Injectable, Palbase } from "palbase/backend";
import { support } from "./support.agent";

@Injectable()
export class SupportSetup {
  // The project's agent "support" is this backend's: each of its turns asks the machine for its definition.
  async onStart(): Promise<void> {
    await Palbase.ai.agents.put(support);
  }
}
```

| Field | What it is |
|---|---|
| `instructions` | What the agent is told before the chat. |
| `model` | A role or a catalogue model. |
| `tools` | 64 at most, an MCP server's tools counted. |
| `subagents` | 16 at most: each a `name`, a `description` the agent reads to hand it work, and its own `instructions`, `model` and `tools`. `required: true` fails the turn when its part fails. |
| `maxToolCalls` | The turn's tool calls, 1 to 10 000. Past it the agent is told it has no tools left, and answers. |
| `thinking` | `visible` shows the model's reasoning in the chat's stream as `thinking` parts. `hidden` does not ask for it. When the model's provider will not give it, the turn says so once: a `thinking` part with `unavailable: true`, the `model` and the provider's `reason`. One cause is an OpenAI organization not verified for reasoning summaries; Anthropic's models (`strong`) show theirs. |

An agent need not be the backend's: `agents.put("helper", { instructions, model, tools })` names a definition the platform keeps, and `chats.create({ definition })` gives one chat a definition of its own.

## Chats

A chat is the project server's. Only your backend starts one (a user's own call is refused `403 server_only`), and it names the chat's members:

```ts
// src/modules/support/support.controller.ts
import { Body, Controller, Palbase, Post, User, z, type UserT } from "palbase/backend";
import { support } from "./support.agent";

const StartChat = z.object({ title: z.string().max(256).optional() });

@Controller("/support")
export class SupportController {
  // The signed-in user asks for a chat with support, and is its owner.
  @Post("/chats")
  async start(@Body(StartChat) body: z.infer<typeof StartChat>, @User() user: UserT): Promise<{ id: string }> {
    const chat = await Palbase.ai.chats.create({ agent: support, title: body.title, members: [{ userId: user.id, owner: true }] });
    return { id: chat.id };
  }
}
```

| Call | What it does |
|---|---|
| `chats.create({ agent, members, title, metadata, workspace })` | Starts a chat with a named agent (or `definition`). 64 members at most, each `{ userId, name, owner }`: `name` is how the agent and the others are told who wrote. |
| `chats.get(id)`, `chats.list({ member })`, `chats.delete(id)` | Reads a chat, lists them (a member's, or all), deletes one. A turn still running is stopped. |
| `chats.members.put(id, userId, { name, owner })`, `chats.members.delete(id, userId)` | Adds or changes a member, removes one. |
| `chats.send(id, { text, clientId, delivery, as, budget, images, files })` | A message for the agent: a turn of its own when none runs. |
| `chats.messages(id)` | What was written, newest first, a page at a time. |
| `chats.stop(id)` | Stops the turn the agent is on. What it wrote stays. Answers the turn's id, or `null` when none ran. |
| `chats.approve(id, approvalId, { reason, as })`, `chats.deny(…)` | A call that waits for a person's yes, made or not. Denied, the agent is told the reason and goes on. |
| `chats.answer(id, callId, output, { isError, as })` | A client tool's answer: `true` when it is the one taken, `false` when another came first. |
| `chats.sendToSubagent(id, runId, text, { as })` | A message for a subagent at work, at its next step. |
| `chats.turnCost(id, responseId)` | What a turn cost so far, its subagents counted: tokens, `costNanoUsd` (and `usd`), and `final` once nothing more of it is settled. `runs` breaks it down run by run: the turn's own and each subagent's, by name, model and state. A turn still at work is read as it spends. |
| `chats.events(id)` | The chat as a source a gateway pipes into its channel. See [A chat in an app](#a-chat-in-an-app). |

`send` keys a message on its `clientId`: the same id sent again, a retry, is the same message, delivered once. One is made when you give none. `delivery` is for a message that comes while the agent works: `"next"` (the default) gives it the message at its next step, `"now"` cuts the step it is in.

**Writing as a member.** Without `as`, the server writes as itself, and decides any approval or tool call. With `as: userId`, it writes as that member and is held to their rules. The message is theirs and counts toward their messages a minute (`429 too_many_messages`). A turn another member began is theirs alone to decide or answer (`403 not_your_turn`). A user who is not a member is refused (`403 not_a_member`). A gateway does all of a member's work this way, as the member who sent the message.

**Events.** Every turn of a chat is an event of the project's: `ai.response.started` as it begins, whoever opened it (a member's message, the server's, the chat's goal), and `ai.response.completed` or `ai.response.failed` as it ends. A turn's event carries the chat (`chat_id`, its labels as `metadata`), the member it ran for (`user_id`, `null` for the server's), the labels of the message that opened it (`message_metadata`), whether it was the goal's (`goal_turn`, `goal_id`), and how it ended: `completed`, `failed` (its `error`: a `code`, a `message`, and whether asking again may help, `retryable`), `stopped`, or `budget_exceeded`. Take them with `@On("ai.response.completed")` ([Event Hooks](https://palbase.studio/docs/backend/hooks)). The chat's stream says the same on the turn's last part (`end`, `error`).

**Pictures and files.** A message carries files of the project's storage. `images: [{ bucket, path }]` are pictures the model is shown with it: up to 4 (as many as the model is shown at once), up to 5 MiB each, png, jpeg, webp or gif. A picture's type is read from its bytes, not its label, and anything else is `415 unsupported_image`. `files: [{ bucket, path, filename, contentType }]` are put in the chat's workspace before the agent reads the message, at `.palbase/attachments/<message id>/<filename>`: up to 8, up to 15 MiB each. The agent is told what each one is and where. `filename` defaults to the path's last segment, and `contentType` to what storage says. A chat that works in no workspace takes images alone (`409 no_workspace`). Each one is copied for the chat as the message is written, so the agent reads what was sent whatever later happens to the file, and the copy is deleted with the chat. The same bytes are kept once, and an object named twice (a picture that is also a file) is read once. Your server attaches any file of the project's storage, writing `as` a member or not: the decision is yours. A client, a member with their own session, attaches only a public bucket's files; a private bucket's file, even their own (`owner_id`), is attached by your server. Any other is `404 attachment_not_found`, the same answer as for a file that is not there. A message shows what it carries as `attachments` (images first): `kind` (`image` or `file`), `bucket`, `path`, `name`, `contentType`, `size`, `sha256`, and a file's `workspacePath`. The chat's members, and your server, read each one back at `GET /ai/chats/{id}/messages/{messageId}/attachments/{position}`. A fork begins with copies of what its history's messages carried, and its first turn shows the model the history's 4 newest pictures again.

**Budgets.** `send(id, { text, budget: { maxCostUsd: 0.5 } })` bounds what the turn that message starts may cost, its subagents' calls counted. Past it the turn stops and ends `budget_exceeded`. A message into a turn already running takes that turn's budget.

**Settings.** `Palbase.ai.settings.put({ … })` sets what the project allows its chats: `userMessagesPerMinute` (1 to 600, 20 unless set), and `historyLimitBytes`, the chat history the project keeps: a free project at most 500 MiB, less if it says so; a project with paid rights keeps all of it (`historyLimitBytes` is `null`) unless it says a limit of its own, up to 1 TiB. Past it, a message is refused (`409 history_full`) until chats are deleted. `settings.get()` also says how much is kept now. `clients`, off unless set, lets a user's own session read and write the chats they are in at the project's address. The app SDKs read through it what a gateway does not carry — a chat's older history (`loadOlder`), a tool call's whole answer (`chatToolCall`), a workspace file or an attachment — and a chat's live messages still come through its gateway.

## Voice

A chat can be talked to out loud. The app opens a WebRTC peer connection, sends its offer to `POST /ai/chats/{id}/voice`, and sets the answer it gets back; the audio then goes between the app and the platform's voice provider, whose key never leaves the platform. The voice speaks as the chat's agent, with its instructions.

A voice is its member's: the user who starts it, or the member your server starts it for (`as`). They and your server read it (`GET …/voice/{voiceId}`: live or closed, how many seconds, why it ended), tell it (`…/commands`: `speak`, `tell`, `know`, `instruct`, your server's alone) and close it (`DELETE`); no other member does (`403 not_your_voice`). A member starts at most 5 voices an hour, the ones your server starts for them counted with their own (`429 too_many_voices`). One voice talks in a chat at a time: a member's new voice ends the one they left open, and another member's live voice is refused (`409 voice_active`). A voice closes when its member is taken out of the chat (`member_removed`) or the chat is deleted (`chat_deleted`).

`speak` says its `text` exactly and nothing else, with no words of the voice's own before or after it. It waits until the voice finishes what it is saying, so a speak never cuts into the voice's answer, and speaks are said one at a time in the order they came. With `interrupt: true` it cuts what the voice is saying and is said at once. `tell` gives the voice something to say in its own words, `know` gives it something to keep in mind, and `instruct` changes how it behaves. Up to 16 speaks can wait at a time. Past that, a speak is refused with `429 voice_busy`.

What the person asks for out loud is handed over, as the voice's `delegation` says:

| `delegation` | What happens |
|---|---|
| `"chat"` (the default) | The request is a message of the voice's member to the chat's agent — a turn of its own, or into the one at work — with what was said before it given to the agent as context. When that turn ends, the voice says its answer back. No code of yours is needed. |
| `"events"` | Your backend is told: `ai.voice.delegated` carries the request's `delegation_id`, its `text` and what was said before it (`earlier`). Have it done, and answer with a `speak` command naming the `delegation_id`. |

What was said either way is the chat's: a `transcript` part of its stream for each line, and the same line in its history (`messages`, of `kind: "voice"`, with `voice: { id, role }`). The stream's `voice` part says when it began and when it ended. The end is told once, with its `close_reason` and `seconds`, whatever ended the voice: the person's connection was lost, the voice was closed, or the platform lost it (`lost`). A chat whose voice is live has its pipe written whether or not a turn is at work. A voice's start and end are the events `ai.voice.started` and `ai.voice.closed` (its `seconds` and `close_reason`).

## Workspaces

A chat can work in GitHub repositories: its turns run with them checked out, and what its agent commits is pushed to the branch. The tokens are your backend's to give, at each clone and each push.

```ts
// src/modules/builds/app.repo.ts
import { Palbase } from "palbase/backend";

// A token for one clone or one push, asked of this machine each time and kept nowhere: here a
// fine-grained token for this repository's contents, from the machine's secrets.
export const shopApp = Palbase.ai.repo({
  name: "shop-app",
  repository: "acme/shop-app",
  defaultBranch: "main",
  token: () => {
    const token = process.env.SHOP_APP_GITHUB_TOKEN;
    if (!token) throw new Error("SHOP_APP_GITHUB_TOKEN is not set");
    return token;
  },
});
```

```ts
// src/modules/builds/builds.service.ts
import { Injectable, Palbase } from "palbase/backend";
import { shopApp } from "./app.repo";

@Injectable()
export class BuildChats {
  async onStart(): Promise<void> {
    await Palbase.ai.repos.put(shopApp);
  }

  /** A chat that works on a branch of the app; each push waits for its owner's yes. */
  async start(userId: string, branch: string): Promise<string> {
    const chat = await Palbase.ai.chats.create({
      definition: { instructions: "You work on the shop's app. Make small commits.", model: "strong" },
      members: [{ userId, owner: true }],
      workspace: { repos: [{ repo: shopApp, branch }], autoPush: false },
    });
    return chat.id;
  }

  /** What a turn published: a build's product, a screenshot, a report. */
  async firstArtifact(chatId: string, responseId: string): Promise<Response | null> {
    const [first] = await Palbase.ai.chats.artifacts(chatId, responseId);
    return first ? Palbase.ai.chats.artifact(chatId, responseId, first.id) : null;
  }
}
```

With `autoPush: false` a push waits for a member's approval, as an `approval: true` tool does. With `autoPush: true` the agent pushes without one, and what the chat's members write then reaches the repository. A project puts 10,000 repositories, and a chat works in 8 of them at most. `repos.list()` and `repos.delete(name)` read and remove them.

**A repository for a chat at work.** `chats.workspace.addRepo(chatId, { repo, branch? })` (`POST /ai/chats/{id}/workspace/repos`) puts one more of the project's repositories in an open chat's workspace, beside its others. A repository born while the work goes on is put first with `repos.put`. The engine clones it into the workspace before the chat's next turn, and every chat working in the workspace (a fork, too) has it. Your server alone does this.

**Whose commits, and what they carry.** Each commit the agent makes is written as the member its turn is for: their name in the chat and their address, as an author and as a committer. This holds for the platform's commit tool and for a plain `git commit` the agent runs in the shell. Each turn writes its member into the repositories' own git config and installs a `commit-msg` hook that adds the chat's trailers. A hook, or a hooks path, the repository already has is left alone. Give the address with the member (`members: [{ userId, name, email }]`, or `PUT /ai/chats/{id}/members/{userId} { email }`). A member's own session gives it again, verified, whenever they write. It is never served to the chat's other members. A member with no address commits under one of the platform's that names them and reaches no one. A turn that is no member's (your server's own) commits as the platform. `workspace: { trailers: [{ key, value }] }` are git trailers every commit of the chat carries at the end of its message: a task (`PalCore-Task: #12`), a link back to the conversation, a co-author (`Co-authored-by: …`). Up to 16, each one line. The agent's work is pushed only to the chat's branch. On a protected or default branch (`main`, `master`, the repository's default) it goes to a branch of its own, `agent/<workspace>/<run>`.

**What the workspace did, as events.** The workspace's machine publishes its tree whenever the files are quiet for a moment, so mid-turn, as a build writes its product. It publishes once more as it lets the workspace go. Each tree is `ai.workspace.published`, with the files it changed against the tree it replaced (`changed: [{ path, change: added|modified|removed, size_bytes }]`, 1000 at most). Read one of its files, as that tree left it, at `GET /ai/chats/{id}/workspace/files?path=<path>&manifest=<manifest_id>` (without `manifest`, from the tree the workspace is at now). Files are served up to 64 MiB (`413 file_too_large` past it), with their digest in `Content-Digest`; publish a larger one as the turn's artifact. A project reads 4 files at once (`429 too_many_reads`, with `Retry-After`), and a file is written for no longer than its bytes take at 256 KiB/s plus a minute. A tree's changes are named 1000 at a time in the event (`changed_truncated` past that). A push is `ai.workspace.pushed`, with the commits it brought (`commits: [{ sha, subject, author_name, author_email }]`, 100 at most), the repository by your name for it, the branch and the member. The chat's members see the push in the stream with each commit's author by name, never by address. Each event is told once, from the turn's start until 20 minutes after its end, whoever is watching the chat.

## A chat in an app

A chat reaches its members through a gateway declared with `chat: true`. When its first member joins, the gateway pipes the chat into its channel. From then on the **platform** writes the chat there itself: the members' messages, each answer as it is written, the tool calls, the approvals and the subagents' work. The backend is not in the stream. The channel keeps the chat a day (or what `durable` says), so a member who joins later, or was away, has all of it. What a member does in the chat (a message, a yes or a no, a client tool's answer, stop) comes to the gateway as one of its messages, and the backend does it **as them**.

The channel keeps a day of the chat. A chat opened later is read back at `GET /ai/chats/{id}/parts?limit=&cursor=`, a page at a time from its newest end back: the same parts the stream told, in their order, each under the id the channel told it (`part_id`). A client that holds the channel's parts and pages of these keeps each one once. An answer's text is placed by its offset, as in the stream. The last page reaches the chat's start and begins where a fork began. A client that already holds the channel's day passes the `id` of the oldest part it holds as `before=<id>`, and the first page starts just before that part, so the day is not read twice. Each page after it is read by its `next_cursor`. A call with both `cursor` and `before` is refused (`400`). A voice's end is in the pages under the id the channel told it (`vclosed:<voice>`). For a voice the engine lost, whose end its journal never says, it comes right after the voice's last part. Reading a page changes nothing. A client's `loadOlder()` reads the page before the oldest it holds.

A tool call's answer is in the stream by its end: its last 16 KiB, with `omitted_bytes` saying what was left out. A build's log ends with what failed. A member who opens the call reads it whole at `GET /ai/chats/{id}/tool-calls/{callId}`, with secrets masked as the stream masks them. Your server reads a turn's tool calls as the engine committed them, arguments and results as they were, a page at a time, at `GET /ai/chats/{id}/tool-calls?turn=<responseId>&limit=&cursor=`. That is what a diff of the files the turn wrote is made of. A subagent's calls are read by its response (an agent part's `response_id`). A project reads two of these, or of a chat's past pages, at once (`429 too_many_reads`).

```ts
// src/modules/support/support.gateway.ts
import { Authorize, Gateway, GatewayRefusal, OnFirst, Palbase, PalbaseError, Subscribe, z } from "palbase/backend";
import type { GatewayAuthorizeContext, GatewayContext, GatewayGrant, GatewayMessageContext } from "palbase/backend";

export const Say = z.object({ text: z.string().min(1).max(8000), clientId: z.string().max(64).optional(), delivery: z.enum(["next", "now"]).optional() });
export const Said = z.object({ clientId: z.string() });
export const Decide = z.object({ approvalId: z.string(), approve: z.boolean(), reason: z.string().max(1024).optional() });
export const Answer = z.object({ callId: z.string(), output: z.string().max(16_000) });
export const Stopped = z.object({ stopped: z.string().nullable() });

// The ai module's refusals that are the member's own to act on, said to them by their code.
async function asMember<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof PalbaseError && [403, 404, 409, 429].includes(e.status)) throw new GatewayRefusal(e.code);
    throw e;
  }
}

@Gateway("support:{chatId}", { chat: true })
export class SupportGateway {
  // The chat's members, and no one else. A chat that is not there lets no one in.
  @Authorize()
  async enter(ctx: GatewayAuthorizeContext): Promise<GatewayGrant> {
    const chat = await Palbase.ai.chats.get(ctx.params.chatId).catch((e: unknown) => {
      if (e instanceof PalbaseError && e.status === 404) return null;
      throw e;
    });
    return chat?.members.some((m) => m.user_id === ctx.user.id) === true;
  }

  // The chat into the channel, from its start.
  @OnFirst()
  async open(ctx: GatewayContext): Promise<void> {
    await ctx.pipe(Palbase.ai.chats.events(ctx.params.chatId));
  }

  @Subscribe("say", Say, { reply: Said })
  async say(ctx: GatewayMessageContext<z.infer<typeof Say>>): Promise<z.infer<typeof Said>> {
    const { text, clientId, delivery } = ctx.payload;
    const m = await asMember(() => Palbase.ai.chats.send(ctx.params.chatId, { text, clientId, delivery, as: ctx.user.id }));
    return { clientId: m.client_id };
  }

  // A call that waits for a person's yes: the member whose message began the turn says it.
  @Subscribe("decide", Decide)
  async decide(ctx: GatewayMessageContext<z.infer<typeof Decide>>): Promise<void> {
    const { approvalId, approve, reason } = ctx.payload;
    const as = ctx.user.id;
    await asMember(() => (approve ? Palbase.ai.chats.approve(ctx.params.chatId, approvalId, { reason, as }) : Palbase.ai.chats.deny(ctx.params.chatId, approvalId, { reason, as })));
  }

  // A client tool's answer, from the app of the member whose turn it is.
  @Subscribe("answer", Answer)
  async answer(ctx: GatewayMessageContext<z.infer<typeof Answer>>): Promise<void> {
    await asMember(() => Palbase.ai.chats.answer(ctx.params.chatId, ctx.payload.callId, ctx.payload.output, { as: ctx.user.id }));
  }

  // Any member stops the agent. What it wrote stays.
  @Subscribe("stop", z.object({}), { reply: Stopped })
  async stop(ctx: GatewayMessageContext<Record<string, never>>): Promise<z.infer<typeof Stopped>> {
    return { stopped: await asMember(() => Palbase.ai.chats.stop(ctx.params.chatId)) };
  }
}
```

```ts
// src/modules/support/support.module.ts
import { Module } from "palbase/backend";
import { SupportController } from "./support.controller";
import { SupportGateway } from "./support.gateway";
import { SupportSetup } from "./support.setup";

// The agent and its tools are values, declared as their files load: the controller's import brings them.
@Module({ controllers: [SupportController], providers: [SupportGateway, SupportSetup] })
export class SupportModule {}
```

In the app, the member joins `SupportGateway` with the chat's id, and the handle holds the chat's state (`handle.chat`), which the generated client folds from what the platform writes: the messages and answers in order, the last turn, and what waits for this user. The member sends `say`, `decide`, `answer` and `stop` through the gateway, and a refusal arrives as its reason: `not_your_turn`, `too_many_messages`, `history_full`. See [Web Gateways](https://palbase.studio/docs/web/gateways#chat-gateways).

## Refusals

| Status | `error` | When |
|---|---|---|
| 403 | `server_only` | A user started a chat, or asked for what only the server reads (a turn's cost, a chat's pipe). |
| 403 | `not_a_member` | `as` names a user who is not a member of the chat. |
| 403 | `not_your_turn` | `as` decides or answers a turn another member began. |
| 404 | `attachment_not_found` | A message attaches a file that is not there, or one its writer may not attach. |
| 409 | `history_full` | The project keeps as much chat history as it may. Delete chats to write again. |
| 409 | `no_workspace` | A message carries `files` into a chat that works in no workspace. |
| 409 | `attachment_changed` | A file changed while it was attached. Send the message again. |
| 409 | `too_many_members` | A chat holds 64 members. |
| 409 | `too_many_endpoints`, `too_many_repos` | A project holds 32 of each. |
| 413 | `attachment_too_large` | A message's picture is over 5 MiB, or its file over 15 MiB. |
| 415 | `unsupported_image` | A message's picture is not a png, jpeg, webp or gif by its bytes. |
| 429 | `too_many_messages` | The member sent as many messages this minute as the project allows. `Retry-After` says when to write again. |

Each arrives as a `PalbaseError` with its `status` and `code`, its message said in words the caller can act on. A gateway turns the ones a member can act on into a `GatewayRefusal` with the same code, as `asMember` does above.

## Related

- [Gateways](https://palbase.studio/docs/backend/gateways): the channel a chat reaches its members on
- [Web Gateways](https://palbase.studio/docs/web/gateways): a chat's state in the browser
- [Event Hooks](https://palbase.studio/docs/backend/hooks): `ai.response.started`, `ai.response.completed` and `ai.response.failed` (a background response's end, and every chat turn's start and end), `ai.goal.updated`, `ai.voice.started`, `ai.voice.closed`, `ai.voice.delegated`
- [Secrets](https://palbase.studio/docs/backend/secrets): an HTTPS tool's signing secret, a repository's token
- [Row-Level Security](https://palbase.studio/docs/backend/row-level-security): what a tool finds as the chat's member
