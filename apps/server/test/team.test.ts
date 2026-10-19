import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../src/store.ts";
import { Team } from "../src/team.ts";
import { MemberAI } from "../src/remote-ai.ts";
import { Codex } from "../src/codex.ts";
import { Manuscript, Engine, TARGET } from "../src/manuscript.ts";
import { createApp } from "../src/app.ts";
import { issueTransfer } from "../src/transfers.ts";
const project = resolve("..");
const fixture = JSON.parse(
  readFileSync(
    join(
      project,
      "work/manuscript-automation/trial-before/document-result.json",
    ),
    "utf8",
  ),
).structuredContent;
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "solair-team-")),
    store = new Store(dir),
    team = new Team(store, { enabled: true, workers: {} }),
    local = new Codex(process.cwd()),
    ai = new MemberAI(team, local);
  const calls: { actor: string; provider?: string; prompt: string }[] = [];
  ai.forActor = (a) => ({
    status: async () => ({
      codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
      google: { status: "unavailable" },
    }),
    propose: async (provider, prompt, _delta, onProvider) => {
      calls.push({ actor: a.id, provider, prompt });
      onProvider("private-provider-" + a.id);
      if (prompt.includes("SOLAIR_SCOPE_ROUTING")) {
        const catalog = JSON.parse(
          prompt.split("CATALOG:\n")[1].split("\nCURRENT REQUEST:")[0],
        );
        return JSON.stringify({
          sectionIds: [catalog.find((s: any) => s.title === "Introduction").id],
          answer: "Located Introduction.",
        });
      }
      return JSON.stringify({
        answer: "Reviewed supplied context.",
        operations: [],
      });
    },
  });
  const doc = structuredClone(fixture);
  const google = {
    tool: async (name: string, args: any) => {
      if (name === "get_document") return structuredClone(doc);
      if (name === "copy_file") return { id: "native-test-backup" };
      if (name === "batch_update_document") {
        const tab = doc.tabs.find((t: any) => t.tabId === TARGET.tab_id);
        for (const r of args.requests) {
          if (r.updateParagraphStyle) {
            const p = Engine.paragraphs(tab).find(
              (p: any) => p.start === r.updateParagraphStyle.range.startIndex,
            );
            Object.assign(
              p.paragraph.paragraphStyle,
              r.updateParagraphStyle.paragraphStyle,
            );
          }
          if (r.createNamedRange) {
            tab.namedRanges ||= {};
            tab.namedRanges[r.createNamedRange.name] = {
              name: r.createNamedRange.name,
            };
          }
        }
        doc.revisionId += "updated";
        return {};
      }
      throw new Error("Unexpected tool " + name);
    },
  };
  const m = new Manuscript(store, google, project),
    server = createApp(store, local, m, project, team, ai).listen(
      0,
      "127.0.0.1",
    );
  await new Promise<void>((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  async function request(
    path: string,
    body?: any,
    cookie = "",
    method = body === undefined ? "GET" : "POST",
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-SOLAIR-Client": "web",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return {
      status: response.status,
      data: data.data,
      error: data.error,
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  const owner = () =>
    request("/auth/setup", {
      key: readFileSync(join(dir, "team-bootstrap.txt"), "utf8"),
      name: "Ralph",
      username: "ralph",
      password: "separate-password-123",
    });
  return {
    base,
    store,
    team,
    ai,
    local,
    calls,
    request,
    owner,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("The hosted image capability serves exact private bytes without a session; other routes stay private and revoked tokens fail", async () => {
  const s = await setup();
  try {
    s.team.config.publicOrigin = "https://manuscript.example";
    const bytes = readFileSync(
      resolve("../work/manuscript-automation/trial-image.png"),
    );
    const source: any = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      image: { mime: "image/png" },
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    mkdirSync(join(s.store.dir, "sources"), { recursive: true });
    writeFileSync(join(s.store.dir, "sources", source.id + ".png"), bytes);
    const job: any = {
      id: "private-test-job",
      status: "applying",
      backup: { id: "native-backup" },
      review: { status: "approved", hash: "preview-hash" },
      baseRevision: "r1",
    };
    s.store.put("source", source);
    s.store.put("job", job);
    const grant = issueTransfer(
        s.store,
        job,
        source,
        s.team.config.publicOrigin,
      ),
      path = new URL(grant.url).pathname.replace("/api/v1", "");
    assert.equal(
      (await fetch(s.base + "/sources/" + source.id + "/image")).status,
      401,
    );
    assert.equal(
      (await fetch(s.base + "/private-transfer/" + "0".repeat(64))).status,
      404,
    );
    const result = await fetch(s.base + path);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-type") || "", /image\/png/);
    assert(Buffer.from(await result.arrayBuffer()).equals(bytes));
    grant.revoke();
    assert.equal((await fetch(s.base + path)).status, 404);
    assert.equal((await fetch(s.base + "/jobs")).status, 401);
  } finally {
    await s.close();
  }
});
test("Team access requires a session; four memberships, one-use invitations and owner-only invitation management", async () => {
  const s = await setup();
  try {
    assert.equal((await s.request("/jobs")).status, 401);
    assert.equal((await s.request("/auth/status")).data.actor, null);
    const owner = await s.owner();
    assert.equal(owner.status, 201);
    assert(owner.cookie);
    assert.equal((await s.owner()).status, 409);
    assert.equal(
      (await s.request("/auth/login", { username: "ralph", password: "wrong" }))
        .status,
      401,
    );
    const invite = (await s.request("/team/invitations", {}, owner.cookie)).data
      .code;
    const editor = await s.request("/auth/join", {
      code: invite,
      name: "Member 2",
      username: "member2",
      password: "individual-password-234",
    });
    assert.equal(editor.status, 201);
    assert.equal(
      (await s.request("/team/invitations", {}, editor.cookie)).status,
      403,
    );
    assert.equal(
      (
        await s.request("/auth/join", {
          code: invite,
          name: "Reused",
          username: "reused",
          password: "individual-password-345",
        })
      ).status,
      401,
    );
    for (const slot of [3, 4]) {
      const code = (await s.request("/team/invitations", {}, owner.cookie)).data
        .code;
      assert.equal(
        (
          await s.request("/auth/join", {
            code,
            name: "Member " + slot,
            username: "member" + slot,
            password: "individual-password-456",
          })
        ).status,
        201,
      );
    }
    assert.equal(
      (await s.request("/team/invitations", {}, owner.cookie)).status,
      409,
    );
    const members = (await s.request("/team/members", undefined, editor.cookie))
      .data;
    assert.equal(members.length, 4);
    assert.equal(new Set(members.map((m: any) => m.slot)).size, 4);
    assert(!JSON.stringify(members).includes("passwordHash"));
    assert.equal(
      (await s.request("/auth/logout", {}, editor.cookie)).status,
      200,
    );
    assert.equal(
      (await s.request("/jobs", undefined, editor.cookie)).status,
      401,
    );
  } finally {
    await s.close();
  }
});
test("Any member can apply; author and applying member come from sessions, not request fields", async () => {
  const s = await setup();
  try {
    const owner = await s.owner(),
      code = (await s.request("/team/invitations", {}, owner.cookie)).data.code;
    const editor = await s.request("/auth/join", {
      code,
      name: "Reviewer",
      username: "reviewer",
      password: "individual-password-234",
    });
    const body = {
      request: "Keep introduction together",
      operations: [
        {
          type: "format_paragraph",
          expected_text: "Introduction",
          paragraph_style: { keepWithNext: true },
          evidence: "Authorized formatting request",
        },
      ],
    };
    assert.equal(
      (
        await s.request(
          "/jobs",
          { ...body, createdBy: owner.data },
          editor.cookie,
        )
      ).status,
      400,
    );
    const created = await s.request("/jobs", body, owner.cookie);
    assert.equal(created.data.createdBy.id, owner.data.id);
    const preview = await s.request(
      `/jobs/${created.data.id}/dry-run`,
      {},
      editor.cookie,
    );
    assert.equal(preview.status, 200);
    const unreviewed = await s.request(
      `/jobs/${created.data.id}/apply`,
      { baseRevision: preview.data.baseRevision },
      editor.cookie,
      "POST",
      { "Idempotency-Key": created.data.id },
    );
    assert.equal(unreviewed.error.code, "REVIEW_REQUIRED");
    const reviewed = await s.request(
      `/jobs/${created.data.id}/review`,
      {
        previewHash: preview.data.review.hash,
        acknowledgedChangeIds: preview.data.review.changes.map(
          (c: any) => c.id,
        ),
        notes: "",
      },
      editor.cookie,
    );
    assert.equal(reviewed.status, 200);
    const applied = await s.request(
      `/jobs/${created.data.id}/apply`,
      { baseRevision: preview.data.baseRevision },
      editor.cookie,
      "POST",
      { "Idempotency-Key": created.data.id },
    );
    assert.equal(applied.status, 200);
    assert.equal(applied.data.verification.native, true);
    assert.equal(applied.data.appliedBy.id, editor.data.id);
    assert.equal(applied.data.createdBy.id, owner.data.id);
    assert(
      s.store
        .list("activity")
        .some(
          (a) => a.kind === "preview_ready" && a.actor.id === editor.data.id,
        ),
    );
    assert.equal(
      (await s.request("/jobs", body, editor.cookie)).data.createdBy.id,
      editor.data.id,
    );
  } finally {
    await s.close();
  }
});
test("Shared chat uses separate provider bindings for each member and never exposes private provider IDs", async () => {
  const s = await setup();
  try {
    const owner = await s.owner(),
      code = (await s.request("/team/invitations", {}, owner.cookie)).data.code;
    const editor = await s.request("/auth/join", {
      code,
      name: "Member 2",
      username: "member2",
      password: "individual-password-234",
    });
    const t = (
      await s.request(
        "/chat/threads",
        { title: "Shared discussion" },
        owner.cookie,
      )
    ).data;
    for (const [cookie, text] of [
      [owner.cookie, "First member request"],
      [editor.cookie, "Second member request"],
      [owner.cookie, "First member followup"],
    ]) {
      assert.equal(
        (await s.request(`/chat/threads/${t.id}/messages`, { text }, cookie))
          .status,
        202,
      );
      for (
        let n = 0;
        n < 50 &&
        s.store
          .get("thread", t.id)
          .messages.some((m: any) => m.status === "running");
        n++
      )
        await new Promise((r) => setTimeout(r, 10));
    }
    assert.deepEqual(
      s.calls.map((c) => c.actor),
      [
        owner.data.id,
        owner.data.id,
        editor.data.id,
        editor.data.id,
        owner.data.id,
        owner.data.id,
      ],
    );
    assert.equal(s.calls[0].provider, undefined);
    assert.equal(s.calls[2].provider, undefined);
    assert.equal(s.calls[4].provider, undefined);
    assert.equal(s.calls[5].provider, "private-provider-" + owner.data.id);
    assert(s.calls[3].prompt.includes("First member request"));
    const shared = (
      await s.request(`/chat/threads/${t.id}`, undefined, editor.cookie)
    ).data;
    assert.equal(shared.messages[2].actor.id, editor.data.id);
    assert(!JSON.stringify(shared).includes("private-provider-"));
  } finally {
    await s.close();
  }
});
test("A member without a configured worker cannot use the local owner AI as fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), "solair-isolation-")),
    store = new Store(dir);
  try {
    const team = new Team(store, { enabled: true, workers: {} }),
      local = new Codex(process.cwd());
    let used = false;
    local.propose = async () => {
      used = true;
      return "forbidden";
    };
    const ai = new MemberAI(team, local);
    assert.throws(
      () =>
        ai.forActor({
          id: "member2",
          slot: 2,
          role: "editor",
          username: "member2",
          name: "Member 2",
        }),
      /No other member/,
    );
    assert.equal(used, false);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Team configuration rejects accidentally shared personal workers or private keys", () => {
  const dir = mkdtempSync(join(tmpdir(), "solair-worker-config-")),
    store = new Store(dir);
  try {
    assert.throws(
      () =>
        new Team(store, {
          enabled: true,
          workers: {
            "1": { url: "http://ai-1:4790", key: "first-private-key" },
            "2": { url: "http://ai-1:4790/", key: "second-private-key" },
          },
        }),
      /distinct AI worker/,
    );
    assert.throws(
      () =>
        new Team(store, {
          enabled: true,
          workers: {
            "1": { url: "http://ai-1:4790", key: "shared-private-key" },
            "2": { url: "http://ai-2:4790", key: "shared-private-key" },
          },
        }),
      /distinct AI worker/,
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("Prototype spaces fail closed on proposed edits and branches do not inherit private provider identity", async () => {
  const s = await setup();
  try {
    const owner = await s.owner(),
      cookie = owner.cookie;
    s.ai.forActor = () => ({
      status: async () => ({
        codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
        google: { status: "unavailable" },
      }),
      propose: async (_pid, _prompt, _delta, onProvider) => {
        onProvider("private-parent-provider");
        return JSON.stringify({
          answer: "A design proposal.",
          operations: [
            { type: "replace_text", before: "x", after: "y", evidence: "test" },
          ],
        });
      },
    });
    const t = await s.request(
        "/chat/threads",
        { title: "Prototype decisions", purpose: "prototype" },
        cookie,
      ),
      sections = await s.request("/manuscript/sections", undefined, cookie);
    const section = sections.data.sections.find(
      (v: any) => !v.readOnly && v.title === "Introduction",
    );
    await s.request(
      "/chat/threads/" + t.data.id + "/messages",
      {
        text: "Discuss our proposed wiring.",
        scope: "sections",
        sectionIds: [section.id],
        helperRole: "prototype",
      },
      cookie,
    );
    let saved: any;
    for (let i = 0; i < 80; i++) {
      saved = (await s.request("/chat/threads/" + t.data.id, undefined, cookie))
        .data;
      if (saved.messages.at(-1).status !== "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(saved.messages.at(-1).status, "failed");
    assert.match(saved.messages.at(-1).text, /discussion-only/);
    assert.equal(s.store.list("job").length, 0);
    s.store.put("thread", { ...saved, providerId: "do-not-copy" });
    const fork = await s.request(
      "/chat/threads/" + saved.id + "/fork",
      { title: "Alternate prototype plan" },
      cookie,
    );
    assert.equal(fork.status, 201);
    assert.equal(fork.data.purpose, "prototype");
    assert.equal(fork.data.branchedFrom, saved.id);
    assert.equal(fork.data.providerId, undefined);
    assert.equal(fork.data.messages.length, 1);
    assert.notEqual(fork.data.messages[0].id, saved.messages[0].id);
  } finally {
    await s.close();
  }
});

test("Prototype discussion continues without a manuscript match and receives confirmed phase", async () => {
  const s = await setup();
  try {
    const owner = await s.owner(),
      cookie = owner.cookie;
    const prompts: string[] = [];
    s.ai.forActor = () => ({
      status: async () => ({
        codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
        google: { status: "unavailable" },
      }),
      propose: async (_pid, prompt, _delta, onProvider) => {
        prompts.push(prompt);
        onProvider("own-discussion-provider");
        return JSON.stringify(
          prompt.includes("SOLAIR_SCOPE_ROUTING")
            ? {
                sectionIds: [],
                answer: "No manuscript section matches this design question.",
              }
            : {
                answer:
                  "Supply the proposed component ratings before deciding the wiring.",
                operations: [],
              },
        );
      },
    });
    const created = await s.request(
      "/chat/threads",
      { title: "DP1 decisions", purpose: "prototype" },
      cookie,
    );
    await s.request(
      "/chat/threads/" + created.data.id + "/messages",
      {
        text: "Help us decide our DP1 demonstration.",
        helperRole: "prototype",
      },
      cookie,
    );
    let saved: any;
    for (let i = 0; i < 100; i++) {
      saved = (
        await s.request("/chat/threads/" + created.data.id, undefined, cookie)
      ).data;
      if (saved.messages.at(-1).status !== "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(saved.messages.at(-1).status, "complete");
    assert.match(saved.messages.at(-1).text, /component ratings/);
    assert.equal(s.store.list("job").length, 0);
    assert.match(
      prompts.at(-1)!,
      /CURRENT CONFIRMED PROJECT PHASE: SOLAIR is in prototype development/,
    );
    assert.match(prompts.at(-1)!, /DISCUSSION ONLY/);
    const fork = await s.request(
      "/chat/threads/" + saved.id + "/fork",
      { title: "Alternative demonstration" },
      cookie,
    );
    assert.equal(fork.data.messages.length, 2);
    assert.equal(fork.data.messages[1].text, saved.messages[1].text);
    assert.equal(fork.data.providerId, undefined);
  } finally {
    await s.close();
  }
});
test("Model discovery is authenticated and resolves only the requesting member's personal worker", async () => {
  const s = await setup();
  try {
    assert.equal((await s.request("/ai/models")).status, 401);
    const owner = await s.owner();
    const requested: string[] = [];
    s.ai.forActor = (a) => ({
      status: async () => ({
        codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
        google: { status: "unavailable" },
      }),
      models: async () => {
        requested.push(a.id);
        return [{ model: "own-model", label: "Own model", efforts: ["high"] }];
      },
      propose: async () => {
        throw new Error("Discovery must not run inference");
      },
    });
    const result = await s.request("/ai/models", undefined, owner.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.data[0].model, "own-model");
    const status = await s.request("/auth/status", undefined, owner.cookie);
    assert.deepEqual(requested, [status.data.actor.id]);
  } finally {
    await s.close();
  }
});

test("One member's in-flight chat blocks their second conversation while another member can continue independently", async () => {
  const s = await setup();
  let release: (() => void) | undefined;
  try {
    const owner = await s.owner(),
      code = (await s.request("/team/invitations", {}, owner.cookie)).data.code;
    const editor = await s.request("/auth/join", {
      code,
      name: "Member 2",
      username: "parallel2",
      password: "individual-password-234",
    });
    const original = s.ai.forActor.bind(s.ai),
      gate = new Promise<void>((r) => (release = r));
    s.ai.forActor = (a) => {
      const client = original(a);
      return {
        ...client,
        propose: async (...args) => {
          if (a.id === owner.data.id) await gate;
          return client.propose(...args);
        },
      };
    };
    const make = async (cookie: string) =>
      (
        await s.request(
          "/chat/threads",
          { title: "Concurrent discussion", purpose: "questions" },
          cookie,
        )
      ).data;
    const first = await make(owner.cookie),
      second = await make(owner.cookie),
      other = await make(editor.cookie);
    assert.equal(
      (
        await s.request(
          `/chat/threads/${first.id}/messages`,
          { text: "Discuss current plans" },
          owner.cookie,
        )
      ).status,
      202,
    );
    const blocked = await s.request(
      `/chat/threads/${second.id}/messages`,
      { text: "Another request" },
      owner.cookie,
    );
    assert.equal(blocked.status, 409);
    assert.equal(blocked.error.code, "PERSONAL_AI_BUSY");
    assert.equal(s.store.get("thread", second.id).messages.length, 0);
    assert.equal(
      (
        await s.request(
          `/chat/threads/${other.id}/messages`,
          { text: "Independent teammate question" },
          editor.cookie,
        )
      ).status,
      202,
    );
    release!();
    for (
      let n = 0;
      n < 100 &&
      [first, other].some(
        (t) =>
          s.store.get("thread", t.id).messages.at(-1)?.status === "running",
      );
      n++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      s.store.get("thread", first.id).messages.at(-1).status,
      "complete",
    );
    assert.equal(
      s.store.get("thread", other.id).messages.at(-1).status,
      "complete",
    );
  } finally {
    release?.();
    await s.close();
  }
});

test("Allowance endpoint stays private and reads/caches only the requesting member worker", async () => {
  const s = await setup();
  try {
    assert.equal((await s.request("/ai/usage")).status, 401);
    const owner = await s.owner();
    const invited = await s.request("/team/invitations", {}, owner.cookie);
    const joined = await s.request("/auth/join", {
      code: invited.data.code,
      name: "Diane",
      username: "diane",
      password: "separate-password-456",
    });
    const calls: string[] = [];
    s.ai.forActor = (actor) => ({
      status: async () => ({
        codex: { status: "connected", model: "x", effort: "high" },
        google: { status: "unavailable" },
      }),
      propose: async () => {
        throw Error("No inference allowed");
      },
      usage: async () => {
        calls.push(actor.id);
        return {
          status: "available",
          checkedAt: new Date().toISOString(),
          limits: [
            {
              id: "codex",
              reached: false,
              primary: { usedPercent: actor.slot === 1 ? 35 : 85 },
            },
          ],
        };
      },
    });
    assert.equal(
      (await s.request("/ai/usage", undefined, owner.cookie)).data.limits[0]
        .primary.usedPercent,
      35,
    );
    assert.equal(
      (await s.request("/ai/usage", undefined, joined.cookie)).data.limits[0]
        .primary.usedPercent,
      85,
    );
    await s.request("/ai/usage", undefined, owner.cookie);
    assert.deepEqual(calls, [owner.data.id, joined.data.id]);
  } finally {
    await s.close();
  }
});

test("High is the default and real public research activity is readable while the request is still running", async () => {
  const s = await setup();
  let release: () => void = () => {};
  try {
    const owner = await s.owner(),
      gate = new Promise<void>((r) => (release = r));
    let choice: any;
    s.ai.forActor = () => ({
      models: async () => [
        { model: "gpt-6.1-sol", label: "Sol", efforts: ["high", "max"] },
      ],
      status: async () => ({
        codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
        google: { status: "unavailable" },
      }),
      propose: async (
        _pid,
        _prompt,
        _delta,
        _provider,
        selected,
        _research,
        onResearch,
        onProgress,
      ) => {
        choice = selected;
        if (_prompt.startsWith("SOLAIR_SCOPE_ROUTING\n"))
          return JSON.stringify({
            sectionIds: [],
            answer: "General research question.",
          });
        onProgress?.("thinking");
        onResearch?.({
          id: "web1",
          type: "search",
          query: "official wind power",
          status: "started",
        });
        onResearch?.({
          id: "web1",
          type: "search",
          query: "official wind power",
          status: "completed",
        });
        onResearch?.({
          id: "web2",
          type: "openPage",
          url: "https://www.energy.gov/example",
          status: "completed",
        });
        await gate;
        onProgress?.("answering");
        return JSON.stringify({ answer: "Research answer", operations: [] });
      },
    });
    const t = await s.request(
        "/chat/threads",
        { title: "Research live", purpose: "questions" },
        owner.cookie,
      ),
      tid = t.data.id;
    assert.equal(
      (
        await s.request(
          "/chat/threads/" + tid + "/messages",
          {
            text: "Research public wind power",
            helperRole: "questions",
            research: true,
          },
          owner.cookie,
        )
      ).status,
      202,
    );
    let saved: any;
    for (let i = 0; i < 50; i++) {
      saved = (
        await s.request("/chat/threads/" + tid, undefined, owner.cookie)
      ).data.messages.at(-1);
      if (saved.progress?.actions.length === 2) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(saved.status, "running");
    assert.equal(choice.effort, "high");
    assert.equal(saved.research.searches, 1);
    assert.equal(saved.progress.actions[0].label, "official wind power");
    assert.equal(saved.progress.actions[0].status, "completed");
    assert.equal(
      saved.progress.actions[1].url,
      "https://www.energy.gov/example",
    );
    release();
    for (let i = 0; i < 50; i++) {
      saved = (
        await s.request("/chat/threads/" + tid, undefined, owner.cookie)
      ).data.messages.at(-1);
      if (saved.status !== "running") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(saved.status, "complete", saved.text);
    assert.equal(saved.progress.actions.length, 2);
  } finally {
    release();
    await s.close();
  }
});

test("Offline routing never resumes or binds the web-enabled answer thread, including later turns", async () => {
  const s = await setup();
  try {
    const owner = await s.owner();
    const calls: {
      routing: boolean;
      pid?: string;
      research?: boolean;
      effort?: string;
    }[] = [];
    s.ai.forActor = () => ({
      models: async () => [
        { model: "gpt-6.1-sol", label: "Sol", efforts: ["low", "high", "max"] },
      ],
      status: async () => ({
        codex: { status: "connected", model: "gpt-6.1-sol", effort: "high" },
        google: { status: "unavailable" },
      }),
      propose: async (pid, prompt, _delta, onProvider, choice, research) => {
        const routing = prompt.startsWith("SOLAIR_SCOPE_ROUTING\n");
        calls.push({ routing, pid, research, effort: choice?.effort });
        onProvider(routing ? "offline-router" : "live-research-thread");
        return JSON.stringify(
          routing
            ? { sectionIds: [], answer: "General research question." }
            : { answer: "Public research discussion.", operations: [] },
        );
      },
    });
    const created = await s.request(
        "/chat/threads",
        { title: "Routing isolation", purpose: "questions" },
        owner.cookie,
      ),
      tid = created.data.id;
    for (const text of [
      "Research rated wind power",
      "Find another official source",
    ]) {
      assert.equal(
        (
          await s.request(
            "/chat/threads/" + tid + "/messages",
            { text, helperRole: "questions", research: true },
            owner.cookie,
          )
        ).status,
        202,
      );
      let saved: any;
      for (let i = 0; i < 80; i++) {
        saved = (
          await s.request("/chat/threads/" + tid, undefined, owner.cookie)
        ).data.messages.at(-1);
        if (saved.status !== "running") break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(saved.status, "complete", saved.text);
    }
    assert.deepEqual(calls, [
      { routing: true, pid: undefined, research: false, effort: "low" },
      { routing: false, pid: undefined, research: true, effort: "high" },
      { routing: true, pid: undefined, research: false, effort: "low" },
      {
        routing: false,
        pid: "live-research-thread",
        research: true,
        effort: "high",
      },
    ]);
    assert(
      s.store
        .list("provider_binding")
        .every((b) => b.providerId !== "offline-router"),
    );
  } finally {
    await s.close();
  }
});
