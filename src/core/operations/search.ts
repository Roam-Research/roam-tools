import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { SearchResponse, Template, CallToolResult } from "../types.js";
import { textResult } from "../types.js";

// Schemas
export const SearchSchema = z.object({
  query: z.string().describe("Search query"),
  scope: z.enum(["pages", "blocks", "all"]).optional().describe("Search scope: 'pages' for page titles only, 'blocks' for block content only, 'all' for both (default: 'all')"),
  offset: z.coerce.number().optional().describe("Skip first N results (default: 0)"),
  limit: z.coerce.number().optional().describe("Max results (default: 100)"),
  includePath: z.boolean().optional().describe("Include breadcrumb path to each result (default: true)"),
  maxDepth: z.coerce.number().optional().describe("Max depth of children to include in markdown (default: 0)"),
});

export const SearchTemplatesSchema = z.object({
  query: z.string().optional().describe("Keywords to filter templates by name (case-insensitive). Try relevant keywords first before listing all."),
});

// Types derived from schemas
export type SearchParams = z.infer<typeof SearchSchema>;
export type SearchTemplatesParams = z.infer<typeof SearchTemplatesSchema>;

export async function search(client: RoamClient, params: SearchParams): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = {
    query: params.query,
    scope: params.scope ?? "all",
    offset: params.offset ?? 0,
    limit: params.limit ?? 100,
    includePath: params.includePath ?? true,
  };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<SearchResponse>("data.ai.search", [apiParams]);
  return textResult(response.result ?? { total: 0, results: [] });
}

export async function searchTemplates(
  client: RoamClient,
  params: SearchTemplatesParams
): Promise<CallToolResult> {
  const response = await client.call<Template[]>("data.ai.searchTemplates", [
    { query: params.query },
  ]);
  return textResult(response.result ?? []);
}
