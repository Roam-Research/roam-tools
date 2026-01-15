# Implement Read Operations Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the stubbed read operations (get_page, get_block, get_backlinks) and fix API call formats.

**Architecture:** Use Roam's `data.pull` for fetching page/block content with children, and `data.q` datalog queries for backlinks. Fix existing write operations to use correct API argument format.

**Tech Stack:** TypeScript, Roam Alpha API (local HTTP)

---

## Task 1: Fix API Call Format for Write Operations

**Files:**
- Modify: `src/core/operations/pages.ts:22-35`
- Modify: `src/core/operations/blocks.ts:32-44`

**Context:** The Roam local API expects a single object with all params, not separate positional args for some operations.

**Step 1: Fix pages.ts create method**

```typescript
async create(params: CreatePageParams): Promise<string> {
  if (params.markdown) {
    const response = await this.client.call("data.page.fromMarkdown", [
      {
        page: { title: params.title, uid: params.uid },
        "markdown-string": params.markdown,
      },
    ]);
  } else {
    await this.client.call("data.page.create", [
      { page: { title: params.title, uid: params.uid } },
    ]);
  }
  // Return provided uid or empty (Roam generates one if not provided)
  return params.uid || "";
}
```

**Step 2: Fix blocks.ts create method**

```typescript
async create(params: CreateBlockParams): Promise<string> {
  await this.client.call("data.block.fromMarkdown", [
    {
      location: {
        "parent-uid": params.parentUid,
        order: params.order ?? "last",
      },
      "markdown-string": params.markdown,
    },
  ]);
  return "";
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/core/operations/pages.ts src/core/operations/blocks.ts
git commit -m "fix: correct API argument format for fromMarkdown operations"
```

---

## Task 2: Implement get_page

**Files:**
- Modify: `src/core/operations/pages.ts:38-41`

**Step 1: Implement get method**

```typescript
async get(params: GetPageParams): Promise<Page | null> {
  const eid = params.uid
    ? `[:block/uid "${params.uid}"]`
    : `[:node/title "${params.title}"]`;

  const response = await this.client.call<Record<string, unknown>>("data.pull", [
    "[:node/title :block/uid {:block/children [:block/string :block/uid :block/open :block/heading {:block/children ...}]}]",
    eid,
  ]);

  if (!response.success || !response.result) {
    return null;
  }

  const r = response.result;
  return {
    uid: r[":block/uid"] as string,
    title: r[":node/title"] as string,
    children: this.transformChildren(r[":block/children"] as Record<string, unknown>[] | undefined),
  };
}

private transformChildren(children: Record<string, unknown>[] | undefined): Block[] | undefined {
  if (!children) return undefined;
  return children.map((c) => ({
    uid: c[":block/uid"] as string,
    string: c[":block/string"] as string,
    open: c[":block/open"] as boolean | undefined,
    heading: c[":block/heading"] as number | undefined,
    children: this.transformChildren(c[":block/children"] as Record<string, unknown>[] | undefined),
  }));
}
```

**Step 2: Add Block import to pages.ts**

Add to imports at top:
```typescript
import type { Page, Block } from "../types.js";
```

**Step 3: Test manually**

Run: `curl -s -X POST http://localhost:3333/api/test103 -H "Content-Type: application/json" -d '{"action": "data.pull", "args": ["[:node/title :block/uid {:block/children [:block/string :block/uid {:block/children ...}]}]", "[:node/title \"test this page\"]"]}'`

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/core/operations/pages.ts
git commit -m "feat: implement get_page with pull"
```

---

## Task 3: Implement get_block

**Files:**
- Modify: `src/core/operations/blocks.ts:47-50`

**Step 1: Implement get method**

```typescript
async get(params: GetBlockParams): Promise<Block | null> {
  const response = await this.client.call<Record<string, unknown>>("data.pull", [
    "[:block/string :block/uid :block/open :block/heading {:block/children [:block/string :block/uid :block/open :block/heading {:block/children ...}]}]",
    `[:block/uid "${params.uid}"]`,
  ]);

  if (!response.success || !response.result) {
    return null;
  }

  return this.transformBlock(response.result);
}

private transformBlock(r: Record<string, unknown>): Block {
  return {
    uid: r[":block/uid"] as string,
    string: r[":block/string"] as string,
    open: r[":block/open"] as boolean | undefined,
    heading: r[":block/heading"] as number | undefined,
    children: this.transformChildren(r[":block/children"] as Record<string, unknown>[] | undefined),
  };
}

private transformChildren(children: Record<string, unknown>[] | undefined): Block[] | undefined {
  if (!children) return undefined;
  return children.map((c) => this.transformBlock(c));
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/operations/blocks.ts
git commit -m "feat: implement get_block with pull"
```

---

## Task 4: Implement get_backlinks

**Files:**
- Modify: `src/core/operations/blocks.ts:65-68`

**Step 1: Implement getBacklinks method**

```typescript
async getBacklinks(params: GetBacklinksParams): Promise<Block[]> {
  // Query for blocks that reference this uid (either as page ref or block ref)
  const response = await this.client.call<Array<[Record<string, unknown>]>>("data.q", [
    `[:find (pull ?b [:block/string :block/uid :block/open :block/heading])
      :where
      [?target :block/uid "${params.uid}"]
      [?b :block/refs ?target]]`,
  ]);

  if (!response.success || !response.result) {
    return [];
  }

  return response.result.map(([block]) => this.transformBlock(block));
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Test manually**

Run: `npm run mcp test103` and test via MCP inspector or curl

**Step 4: Commit**

```bash
git add src/core/operations/blocks.ts
git commit -m "feat: implement get_backlinks with datalog query"
```

---

## Task 5: Final Integration Test

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 2: Test MCP server starts**

Run: `timeout 3 npm run mcp test103 2>&1 || true`
Expected: Server starts without errors

**Step 3: Final commit with all changes**

```bash
git add -A
git status
# If any uncommitted changes remain:
git commit -m "chore: finalize read operation implementations"
git push
```
