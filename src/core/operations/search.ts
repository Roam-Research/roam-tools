import type { RoamClient } from "../client.js";
import type { SearchResponse, Template } from "../types.js";

export interface SearchParams {
  query: string;
  offset?: number;
  limit?: number;
  includePath?: boolean;
  maxDepth?: number;
}

export interface SearchTemplatesParams {
  query?: string;
}

export async function search(client: RoamClient, params: SearchParams): Promise<SearchResponse> {
  const apiParams: Record<string, unknown> = {
    query: params.query,
    offset: params.offset ?? 0,
    limit: params.limit ?? 100,
    includePath: params.includePath ?? true,
  };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<SearchResponse>("data.ai.search", [apiParams]);

  if (!response.success) {
    throw new Error(response.error || "Search failed");
  }

  return response.result || { total: 0, results: [] };
}

export async function searchTemplates(
  client: RoamClient,
  params: SearchTemplatesParams
): Promise<Template[]> {
  const response = await client.call<Template[]>("data.ai.searchTemplates", [
    { query: params.query },
  ]);

  if (!response.success) {
    throw new Error(response.error || "Template search failed");
  }

  return response.result || [];
}
