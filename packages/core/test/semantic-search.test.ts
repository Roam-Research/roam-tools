import { describe, expect, it, vi } from "vitest";
import { SemanticSearchSchema, semanticSearch } from "../src/operations/search.js";
import { routeToolCall } from "../src/tools.js";
import { RoamError, ErrorCodes } from "../src/types.js";
import type { RoamActionClient } from "../src/types.js";

function mockClient(): RoamActionClient & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn().mockResolvedValue({ result: { results: [] } }) };
}

describe("SemanticSearchSchema date and daily-note filters", () => {
  it("accepts omitted filters", () => {
    const parsed = SemanticSearchSchema.parse({ query: "q" });
    expect(parsed.editedAfter).toBeUndefined();
    expect(parsed.editedBefore).toBeUndefined();
    expect(parsed.dailyNotes).toBeUndefined();
  });

  it("accepts YYYY-MM-DD dates", () => {
    const parsed = SemanticSearchSchema.parse({
      query: "q",
      editedAfter: "2026-03-01",
      editedBefore: "2026-03-17",
    });
    expect(parsed.editedAfter).toBe("2026-03-01");
    expect(parsed.editedBefore).toBe("2026-03-17");
  });

  it.each(["editedAfter", "editedBefore"])(
    "rejects %s values that are not YYYY-MM-DD (incl. the MM-DD-YYYY daily-note format)",
    (key) => {
      for (const bad of [
        "03-17-2026",
        "2026-3-17",
        "2026/03/17",
        "2026-03-17T00:00",
        "today",
        "",
      ]) {
        expect(() => SemanticSearchSchema.parse({ query: "q", [key]: bad }), bad).toThrow();
      }
    },
  );

  it("accepts dailyNotes 'only' and 'exclude' and rejects anything else", () => {
    expect(SemanticSearchSchema.parse({ query: "q", dailyNotes: "only" }).dailyNotes).toBe("only");
    expect(SemanticSearchSchema.parse({ query: "q", dailyNotes: "exclude" }).dailyNotes).toBe(
      "exclude",
    );
    expect(() => SemanticSearchSchema.parse({ query: "q", dailyNotes: "all" })).toThrow();
    expect(() => SemanticSearchSchema.parse({ query: "q", dailyNotes: "include" })).toThrow();
  });
});

describe("semanticSearch warns when Roam did not apply the filters it was sent", () => {
  const respond = (result: unknown): RoamActionClient => ({
    call: vi.fn().mockResolvedValue({ result }),
  });
  const text = (r: Awaited<ReturnType<typeof semanticSearch>>) =>
    (r.content[0] as { text: string }).text;

  it("names every filter an older Roam dropped (no `filters` in its response)", async () => {
    const r = await semanticSearch(respond({ results: [] }), {
      query: "q",
      editedAfter: "2026-03-01",
      dailyNotes: "only",
    });
    expect(text(r)).toMatch(/^WARNING: This version of Roam ignored editedAfter, dailyNotes,/);
    expect(text(r)).toContain('"results": []');
  });

  it("stays quiet when Roam reports every filter it was sent", async () => {
    const r = await semanticSearch(
      respond({ results: [], filters: { editedAfter: "2026-03-01", dailyNotes: "only" } }),
      { query: "q", editedAfter: "2026-03-01", dailyNotes: "only" },
    );
    expect(text(r)).not.toContain("WARNING");
  });

  it("names only the filters missing from what Roam reports", async () => {
    const r = await semanticSearch(respond({ results: [], filters: { dailyNotes: "only" } }), {
      query: "q",
      editedBefore: "2026-03-17",
      dailyNotes: "only",
    });
    expect(text(r)).toMatch(
      /^WARNING: This version of Roam ignored editedBefore, so these results are not filtered by it\./,
    );
  });

  it("stays quiet when no filter was sent", async () => {
    const r = await semanticSearch(respond({ results: [] }), { query: "q" });
    expect(text(r)).not.toContain("WARNING");
  });
});

describe("semanticSearch operation forwards filters only when provided", () => {
  it("omits the filter keys from the wire call when unset (absent means unfiltered)", async () => {
    const client = mockClient();
    await semanticSearch(client, { query: "q" });
    expect(client.call).toHaveBeenLastCalledWith("data.ai.semanticSearch", [{ query: "q" }]);
  });

  it("forwards each filter under its own name", async () => {
    const client = mockClient();
    await semanticSearch(client, {
      query: "q",
      editedAfter: "2026-03-01",
      editedBefore: "2026-03-17",
      dailyNotes: "exclude",
    });
    expect(client.call).toHaveBeenLastCalledWith("data.ai.semanticSearch", [
      { query: "q", editedAfter: "2026-03-01", editedBefore: "2026-03-17", dailyNotes: "exclude" },
    ]);
    await semanticSearch(client, { query: "q", dailyNotes: "only" });
    expect(client.call).toHaveBeenLastCalledWith("data.ai.semanticSearch", [
      { query: "q", dailyNotes: "only" },
    ]);
  });
});

describe("routeToolCall: semantic_search filters", () => {
  const options = (call: RoamActionClient["call"]) => ({
    resolveGraph: async () => ({ name: "test-graph", type: "offline" as const, nickname: "test" }),
    createClient: () => ({ call }),
    tokenInfoMode: "skip" as const,
  });

  it("passes the filters through the registered tool, with graph stripped", async () => {
    const callSpy = vi.fn().mockResolvedValue({ success: true, result: { results: [] } });
    const result = await routeToolCall(
      "semantic_search",
      { query: "q", editedAfter: "2026-03-01", dailyNotes: "only", graph: "test" },
      options(callSpy),
    );

    expect(result.isError).toBeFalsy();
    expect(callSpy).toHaveBeenCalledWith("data.ai.semanticSearch", [
      { query: "q", editedAfter: "2026-03-01", dailyNotes: "only" },
    ]);
  });

  it("rejects a malformed date before anything reaches the client", async () => {
    const callSpy = vi.fn();
    await expect(
      routeToolCall(
        "semantic_search",
        { query: "q", editedBefore: "03-17-2026" },
        options(callSpy),
      ),
    ).rejects.toThrow(/Invalid arguments/);
    expect(callSpy).not.toHaveBeenCalled();
  });

  // The renderer validates calendar days the regex can't (e.g. 2026-02-31) and
  // rejects with "Input error: ...". That must reach the model as-is, not be
  // reframed as "semantic search isn't enabled", which would send it to `search`.
  it("surfaces a renderer input error unchanged rather than as 'not enabled'", async () => {
    const message = "Server error: Input error: 'editedAfter' must be a date as YYYY-MM-DD";
    const result = await routeToolCall(
      "semantic_search",
      { query: "q", editedAfter: "2026-02-31" },
      options(async () => {
        throw new RoamError(message, ErrorCodes.INTERNAL_ERROR);
      }),
    );

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.error.message).toBe(message);
    expect(parsed.error).not.toHaveProperty("fallbackTool");
  });
});
