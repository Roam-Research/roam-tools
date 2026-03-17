import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { CallToolResult } from "../types.js";
import { textResult, RoamError, ErrorCodes } from "../types.js";

// Schemas
export const CreateBlockSchema = z.object({
  parentUid: z.string().optional().describe(
    "UID of parent block or page. Exactly one of parentUid, pageTitle, or dailyNotePage is required."
  ),
  pageTitle: z.string().optional().describe(
    "Page title to create block under (creates the page if it doesn't exist). Exactly one of parentUid, pageTitle, or dailyNotePage is required."
  ),
  dailyNotePage: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, "Must be MM-DD-YYYY format (e.g. '03-17-2026')").optional().describe(
    "Daily note date in MM-DD-YYYY format (e.g. '03-17-2026'). Targets that day's daily note page, creating it if needed. Exactly one of parentUid, pageTitle, or dailyNotePage is required."
  ),
  nestUnder: z.string().optional().describe(
    "Insert under a direct child block matching this string (matches on the block's string field, including markup like **bold** or [[links]]). If no match exists, creates a new child block with this text first, then inserts under it. Works with parentUid, pageTitle, or dailyNotePage."
  ),
  markdown: z.string().describe("Markdown content for the block"),
  order: z.union([z.coerce.number(), z.enum(["first", "last"])]).optional().describe(
    "Position (number, 'first', or 'last'). Defaults to 'last'"
  ),
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
  // Validate: exactly one of parentUid, pageTitle, or dailyNotePage
  const targets = [params.parentUid, params.pageTitle, params.dailyNotePage].filter(v => v !== undefined);
  if (targets.length === 0) {
    throw new RoamError(
      "Either 'parentUid', 'pageTitle', or 'dailyNotePage' is required to specify where to create the block",
      ErrorCodes.VALIDATION_ERROR
    );
  }
  if (targets.length > 1) {
    throw new RoamError(
      "Provide only one of 'parentUid', 'pageTitle', or 'dailyNotePage'",
      ErrorCodes.VALIDATION_ERROR
    );
  }

  const location: Record<string, unknown> = {
    order: params.order ?? "last",
  };
  if (params.parentUid !== undefined) {
    location["parent-uid"] = params.parentUid;
  } else if (params.dailyNotePage !== undefined) {
    location["page-title"] = { "daily-note-page": params.dailyNotePage };
  } else {
    location["page-title"] = params.pageTitle;
  }
  if (params.nestUnder !== undefined) {
    location["nest-under-str"] = params.nestUnder;
  }

  const response = await client.call<{ uids: string[] }>("data.block.fromMarkdown", [
    { location, "markdown-string": params.markdown },
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

// --- Comments ---

export const AddCommentSchema = z.object({
  blockUid: z.string().describe("UID of the block to comment on"),
  comment: z.string().optional().describe("Plain text comment (single block, editable later via update_block). Required if commentMarkdown not provided. Preferred for simple comments."),
  commentMarkdown: z.string().optional().describe("Markdown comment parsed into multiple blocks. Required if comment not provided. Use only when you need structure (lists, headings). Harder to edit later."),
});

export const GetCommentsSchema = z.object({
  blockUid: z.string().describe("UID of the block to get comments for"),
  maxDepth: z.coerce.number().optional().describe("Max depth of children to include in each comment's markdown (omit for full tree)"),
});

export type AddCommentParams = z.infer<typeof AddCommentSchema>;
export type GetCommentsParams = z.infer<typeof GetCommentsSchema>;

export interface CommentResult {
  parentUid: string;
  author: string;
  createdTime: number;
  editedTime: number;
  markdown: string;
  singleEditableUid: string | null;
}

export interface GetCommentsResponse {
  total: number;
  comments: CommentResult[];
}

export async function addComment(client: RoamClient, params: AddCommentParams): Promise<CallToolResult> {
  // Validate: exactly one of comment or commentMarkdown must be provided
  const hasComment = params.comment !== undefined;
  const hasCommentMarkdown = params.commentMarkdown !== undefined;
  if (!hasComment && !hasCommentMarkdown) {
    throw new RoamError("Provide one of 'comment' or 'commentMarkdown'", ErrorCodes.VALIDATION_ERROR);
  }
  if (hasComment && hasCommentMarkdown) {
    throw new RoamError("Provide 'comment' or 'commentMarkdown', not both", ErrorCodes.VALIDATION_ERROR);
  }

  const apiParams: Record<string, unknown> = { "block-uid": params.blockUid };
  if (hasComment) apiParams["reply-string"] = params.comment;
  if (hasCommentMarkdown) apiParams["reply-markdown"] = params.commentMarkdown;

  const response = await client.call<{ uids: string[]; parentUid?: string }>("data.block.addComment", [apiParams]);
  return textResult(response.result ?? { uids: [] });
}

export async function getComments(client: RoamClient, params: GetCommentsParams): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = { uid: params.blockUid };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<GetCommentsResponse>("data.ai.getComments", [apiParams]);
  return textResult(response.result ?? { total: 0, comments: [] });
}
