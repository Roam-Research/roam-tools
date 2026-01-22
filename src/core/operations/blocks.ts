import type { RoamClient } from "../client.js";

export interface CreateBlockParams {
  parentUid: string;
  order?: number | "first" | "last";
  markdown: string;
}

export interface GetBlockParams {
  uid: string;
  maxDepth?: number;
}

export interface UpdateBlockParams {
  uid: string;
  string?: string;
  open?: boolean;
  heading?: number;
}

export interface DeleteBlockParams {
  uid: string;
}

export interface GetBacklinksParams {
  uid?: string;
  title?: string;
  offset?: number;
  limit?: number;
  sort?: "created-date" | "edited-date" | "daily-note-date";
  sortOrder?: "asc" | "desc";
  search?: string;
  includePath?: boolean;
  maxDepth?: number;
}

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

export async function createBlock(client: RoamClient, params: CreateBlockParams): Promise<string> {
  // Uses fromMarkdown for easier AI-generated content
  const response = await client.call("data.block.fromMarkdown", [
    {
      location: {
        "parent-uid": params.parentUid,
        order: params.order ?? "last",
      },
      "markdown-string": params.markdown,
    },
  ]);
  if (!response.success) {
    throw new Error(response.error || "Failed to create block");
  }
  // TODO: return created block uid
  return "";
}

export async function getBlock(client: RoamClient, params: GetBlockParams): Promise<string | null> {
  const apiParams: Record<string, unknown> = { uid: params.uid };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<string>("data.ai.getBlock", [apiParams]);

  if (!response.success) {
    throw new Error(response.error || "Failed to get block");
  }

  return response.result || null;
}

export async function updateBlock(client: RoamClient, params: UpdateBlockParams): Promise<{ success: true }> {
  const block: Record<string, unknown> = { uid: params.uid };
  if (params.string !== undefined) block.string = params.string;
  if (params.open !== undefined) block.open = params.open;
  if (params.heading !== undefined) block.heading = params.heading;

  const response = await client.call("data.block.update", [{ block }]);
  if (!response.success) {
    throw new Error(response.error || "Failed to update block");
  }
  return { success: true };
}

export async function deleteBlock(client: RoamClient, params: DeleteBlockParams): Promise<{ success: true }> {
  const response = await client.call("data.block.delete", [{ block: { uid: params.uid } }]);
  if (!response.success) {
    throw new Error(response.error || "Failed to delete block");
  }
  return { success: true };
}

export async function getBacklinks(
  client: RoamClient,
  params: GetBacklinksParams
): Promise<GetBacklinksResponse> {
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

  if (!response.success) {
    throw new Error(response.error || "Failed to get backlinks");
  }

  return response.result || { total: 0, results: [] };
}
