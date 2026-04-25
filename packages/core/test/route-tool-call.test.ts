import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted lets the spies be shared between the vi.mock factories (which are
// hoisted to the top of the file) and the test bodies below.
const { mockCallSpy, mockGetTokenInfoSpy, mockRoamClientCtor } = vi.hoisted(() => {
  const callSpy = vi.fn();
  const getTokenInfoSpy = vi.fn();
  return {
    mockCallSpy: callSpy,
    mockGetTokenInfoSpy: getTokenInfoSpy,
    mockRoamClientCtor: vi.fn().mockImplementation(() => ({
      call: callSpy,
      getTokenInfo: getTokenInfoSpy,
    })),
  };
});

vi.mock("../src/client.js", () => ({
  RoamClient: mockRoamClientCtor,
}));

vi.mock("../src/graph-resolver.js", () => ({
  resolveGraph: vi.fn(),
  getPort: vi.fn(),
  updateGraphTokenStatus: vi.fn(),
}));

// Imports must come AFTER vi.mock so the mocks apply to tools.ts's transitive deps.
import { routeToolCall } from "../src/tools.js";
import { resolveGraph, getPort, updateGraphTokenStatus } from "../src/graph-resolver.js";

afterEach(() => {
  vi.mocked(resolveGraph).mockReset();
  vi.mocked(getPort).mockReset();
  vi.mocked(updateGraphTokenStatus).mockReset();
  mockCallSpy.mockReset();
  mockGetTokenInfoSpy.mockReset();
  mockRoamClientCtor.mockClear();
});

// ---------------------------------------------------------------------------
// Test A — injection contract (the load-bearing test for hosted MCP)
// ---------------------------------------------------------------------------
// Hosted MCP relies on this exact shape: pass resolveGraph, createClient, and
// tokenInfoMode: "skip", and routeToolCall MUST run without touching local
// config or constructing a local RoamClient.
describe("routeToolCall — injection contract", () => {
  it("uses injected resolveGraph + createClient and skips token-info sync", async () => {
    let createClientCalled = false;
    let observedAction: string | undefined;

    const result = await routeToolCall(
      "get_page",
      { uid: "abc", graph: "test" },
      {
        resolveGraph: async () => ({
          name: "test-graph",
          type: "hosted",
          nickname: "test",
        }),
        createClient: () => {
          createClientCalled = true;
          return {
            call: async (action: string) => {
              observedAction = action;
              return {
                success: true,
                result: {
                  uid: "abc",
                  markdown: "fake markdown content",
                  queriedAt: "2026-01-01T00:00:00Z",
                },
              };
            },
          };
        },
        tokenInfoMode: "skip",
      },
    );

    expect(createClientCalled).toBe(true);
    expect(observedAction).toBe("data.ai.getPage");
    expect(result.isError).toBeFalsy();

    const first = result.content[0];
    expect(first.type).toBe("text");
    const text = (first as { text: string }).text;
    expect(text.startsWith("Roam graph: test")).toBe(true);
    expect(text).toContain("fake markdown content");

    // Local defaults must NOT have been touched by the hosted path.
    expect(resolveGraph).not.toHaveBeenCalled();
    expect(getPort).not.toHaveBeenCalled();
    expect(mockRoamClientCtor).not.toHaveBeenCalled();
    expect(updateGraphTokenStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test B — backwards-compat (no third arg uses local defaults)
// ---------------------------------------------------------------------------
// Guards the local path against future drift. The MCP and CLI packages call
// routeToolCall(name, args) positionally; that MUST keep using local config,
// getPort, and a constructed RoamClient.
describe("routeToolCall — backwards-compat", () => {
  it("falls back to local resolveGraph + RoamClient when no options given", async () => {
    vi.mocked(resolveGraph).mockResolvedValue({
      name: "default-graph",
      type: "hosted",
      token: "roam-graph-local-token-fake",
      nickname: "default",
    });
    vi.mocked(getPort).mockResolvedValue(3333);
    mockCallSpy.mockResolvedValue({
      success: true,
      result: { uid: "abc", markdown: "fallback markdown", queriedAt: "2026-01-01" },
    });
    mockGetTokenInfoSpy.mockResolvedValue({ status: "unknown" });

    const result = await routeToolCall("get_page", { uid: "abc", graph: "x" });

    expect(resolveGraph).toHaveBeenCalledWith("x");
    expect(getPort).toHaveBeenCalled();
    expect(mockRoamClientCtor).toHaveBeenCalledWith({
      graphName: "default-graph",
      graphType: "hosted",
      token: "roam-graph-local-token-fake",
      port: 3333,
    });
    expect(mockCallSpy).toHaveBeenCalledWith("data.ai.getPage", expect.any(Array));
    expect(result.isError).toBeFalsy();

    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("Roam graph: default");
    expect(text).toContain("fallback markdown");
  });
});

// ---------------------------------------------------------------------------
// Test C — tokenInfoMode: "skip" really skips the get_graph_guidelines side flow
// ---------------------------------------------------------------------------
// The hosted MCP relies on this gate to avoid latency from a local-only token
// info call. Crucially, the injected client *does* implement getTokenInfo —
// this proves the gating fires on the mode, not on method absence.
describe("routeToolCall — get_graph_guidelines with tokenInfoMode: 'skip'", () => {
  it("skips getTokenInfo and config writes even when the client implements them", async () => {
    const getTokenInfoSpy = vi.fn().mockResolvedValue({
      status: "active",
      info: { success: true, grantedAccessLevel: "full" },
    });
    const callSpy = vi.fn().mockResolvedValue({
      success: true,
      result: {
        guidelines: "do nice things",
        starredPages: [],
        todaysDailyNotePage: null,
      },
    });

    const result = await routeToolCall(
      "get_graph_guidelines",
      { graph: "test" },
      {
        resolveGraph: async () => ({ name: "test-graph", type: "hosted", nickname: "test" }),
        createClient: () => ({ call: callSpy, getTokenInfo: getTokenInfoSpy }),
        tokenInfoMode: "skip",
      },
    );

    // Action ran
    expect(callSpy).toHaveBeenCalledWith("data.ai.getGraphGuidelines", []);
    // Side flow was skipped
    expect(getTokenInfoSpy).not.toHaveBeenCalled();
    expect(updateGraphTokenStatus).not.toHaveBeenCalled();
    // Graph-name prefix still applies (documented behavior)
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text.startsWith("Roam graph: test")).toBe(true);
    expect(text).toContain("do nice things");
  });
});
