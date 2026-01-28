import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { QueryResponse, CallToolResult } from "../types.js";
import { textResult } from "../types.js";

// Schema for executing Roam queries ({{query: }} or {{[[query]]: }} blocks, NOT Datalog)
// Supports two modes: UID mode (execute existing query block) or Query mode (raw query string)
export const QuerySchema = z.object({
  uid: z.string().optional().describe("UID of a block containing {{query: ...}} or {{[[query]]: ...}} - uses the block's saved display settings and filters"),
  query: z.string().optional().describe("Raw Roam query string (e.g., \"{and: [[TODO]] {not: [[DONE]]}}\") - NOT Datalog - results are flat list, no user filters applied"),
  sort: z.enum(["created-date", "edited-date", "daily-note-date"]).optional().describe("Sort order (only for query mode, default: created-date)"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction (only for query mode, default: desc)"),
  includePath: z.boolean().optional().describe("Include breadcrumb path in results (only for query mode, default: true)"),
  offset: z.coerce.number().optional().describe("Skip first N results (default: 0)"),
  limit: z.coerce.number().optional().describe("Max results to return (default: 20)"),
  maxDepth: z.coerce.number().optional().describe("Max depth of children to include in markdown (default: 1)"),
});

export type QueryParams = z.infer<typeof QuerySchema>;

export async function query(client: RoamClient, params: QueryParams): Promise<CallToolResult> {
  // Validate: exactly one of uid or query must be provided
  const hasUid = params.uid !== undefined;
  const hasQuery = params.query !== undefined;
  if (hasUid === hasQuery) {
    throw new Error("Provide exactly one of 'uid' or 'query', not both or neither");
  }
  const apiParams: Record<string, unknown> = {};

  if (params.uid !== undefined) {
    // UID mode - execute existing query block
    apiParams.uid = params.uid;
  } else {
    // Query mode - raw query string
    apiParams.query = params.query;
    if (params.sort !== undefined) apiParams.sort = params.sort;
    if (params.sortOrder !== undefined) apiParams.sortOrder = params.sortOrder;
    if (params.includePath !== undefined) apiParams.includePath = params.includePath;
  }

  // Common parameters for both modes
  if (params.offset !== undefined) apiParams.offset = params.offset;
  if (params.limit !== undefined) apiParams.limit = params.limit;
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<QueryResponse>("data.ai.roamQuery", [apiParams]);
  return textResult(response.result ?? { total: 0, results: [] });
}
