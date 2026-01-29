import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { CallToolResult } from "../types.js";
import { textResult } from "../types.js";

// Schemas
export const CreateBlockSchema = z.object({
  parentUid: z.string().describe("UID of parent block or page"),
  markdown: z.string().describe("Markdown content for the block"),
  order: z.union([z.coerce.number(), z.enum(["first", "last"])]).optional().describe("Position (number, 'first', or 'last'). Defaults to 'last'"),
});

export const GetBlockSchema = z.object({
  uid: z.string().describe("Block UID"),
  maxDepth: z.coerce.number().optional().describe("Max depth of children to include in markdown (omit for full tree)"),
});

export const UpdateBlockSchema = z.object({
  uid: z.string().describe("Block UID"),
  string: z.string().optional().describe("New text content"),
  open: z.boolean().optional().describe("Collapse state"),
  heading: z.coerce.number().optional().describe("Heading level (0-3)"),
});

export const DeleteBlockSchema = z.object({
  uid: z.string().describe("Block UID to delete"),
});

export const MoveBlockSchema = z.object({
  uid: z.string().describe("Block UID to move"),
  parentUid: z.string().describe("UID of the new parent block or page"),
  order: z.union([z.coerce.number(), z.enum(["first", "last"])]).describe("Position in the new parent (number, 'first', or 'last')"),
});

export const GetBacklinksSchema = z.object({
  uid: z.string().optional().describe("UID of page or block (required if no title)"),
  title: z.string().optional().describe("Page title (required if no uid)"),
  offset: z.coerce.number().optional().describe("Skip first N results (default: 0)"),
  limit: z.coerce.number().optional().describe("Max results to return (default: 20)"),
  sort: z.enum(["created-date", "edited-date", "daily-note-date"]).optional().describe("Sort order (default: created-date)"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
  search: z.string().optional().describe("Filter results by text match (searches block, parents, children, page title)"),
  includePath: z.boolean().optional().describe("Include breadcrumb path to each result (default: true)"),
  maxDepth: z.coerce.number().optional().describe("Max depth of children to include in markdown (default: 2)"),
});

// Types derived from schemas
export type CreateBlockParams = z.infer<typeof CreateBlockSchema>;
export type GetBlockParams = z.infer<typeof GetBlockSchema>;
export type UpdateBlockParams = z.infer<typeof UpdateBlockSchema>;
export type DeleteBlockParams = z.infer<typeof DeleteBlockSchema>;
export type MoveBlockParams = z.infer<typeof MoveBlockSchema>;
export type GetBacklinksParams = z.infer<typeof GetBacklinksSchema>;

// Keep response types as interfaces (not input schemas)
export interface BacklinkResult {
  uid: string;
  type?: "page";
  markdown: string;
  path?: Array<{ uid: string; title?: string; string?: string }>;
}

export interface GetBacklinksResponse {
  total: number;
  results: BacklinkResult[];
}

export async function createBlock(client: RoamClient, params: CreateBlockParams): Promise<CallToolResult> {
  const response = await client.call<{ uids: string[] }>("data.block.fromMarkdown", [
    {
      location: {
        "parent-uid": params.parentUid,
        order: params.order ?? "last",
      },
      "markdown-string": params.markdown,
    },
  ]);
  return textResult(response.result ?? { uids: [] });
}

export async function getBlock(client: RoamClient, params: GetBlockParams): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = { uid: params.uid };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<string>("data.ai.getBlock", [apiParams]);
  return textResult(response.result ?? null);
}

export async function updateBlock(client: RoamClient, params: UpdateBlockParams): Promise<CallToolResult> {
  const block: Record<string, unknown> = { uid: params.uid };
  if (params.string !== undefined) block.string = params.string;
  if (params.open !== undefined) block.open = params.open;
  if (params.heading !== undefined) block.heading = params.heading;

  await client.call("data.block.update", [{ block }]);
  return textResult({ success: true });
}

export async function deleteBlock(client: RoamClient, params: DeleteBlockParams): Promise<CallToolResult> {
  await client.call("data.block.delete", [{ block: { uid: params.uid } }]);
  return textResult({ success: true });
}

export async function moveBlock(client: RoamClient, params: MoveBlockParams): Promise<CallToolResult> {
  await client.call("data.block.move", [
    {
      location: {
        "parent-uid": params.parentUid,
        order: params.order,
      },
      block: {
        uid: params.uid,
      },
    },
  ]);
  return textResult({ success: true });
}

export async function getBacklinks(
  client: RoamClient,
  params: GetBacklinksParams
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = {};

  if (params.uid !== undefined) apiParams.uid = params.uid;
  if (params.title !== undefined) apiParams.title = params.title;
  if (params.offset !== undefined) apiParams.offset = params.offset;
  if (params.limit !== undefined) apiParams.limit = params.limit;
  if (params.sort !== undefined) apiParams.sort = params.sort;
  if (params.sortOrder !== undefined) apiParams.sortOrder = params.sortOrder;
  if (params.search !== undefined) apiParams.search = params.search;
  if (params.includePath !== undefined) apiParams.includePath = params.includePath;
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetBacklinksResponse>("data.ai.getBacklinks", [apiParams]);
  return textResult(response.result ?? { total: 0, results: [] });
}
