import type { RoamClient } from "../client.js";
import type { SearchResult, Template } from "../types.js";

export interface SearchParams {
  query: string;
  searchBlocks?: boolean;
  searchPages?: boolean;
  limit?: number;
}

interface RoamSearchResult {
  ":block/uid": string;
  ":block/string"?: string;
  ":node/title"?: string;
}

export class SearchOperations {
  constructor(private client: RoamClient) {}

  async search(params: SearchParams): Promise<SearchResult[]> {
    const response = await this.client.call<RoamSearchResult[]>("data.search", [
      {
        "search-str": params.query,
        "search-blocks": params.searchBlocks ?? true,
        "search-pages": params.searchPages ?? true,
        limit: params.limit ?? 100,
      },
    ]);

    if (!response.success) {
      throw new Error(response.error || "Search failed");
    }

    return (response.result || []).map((r) => ({
      uid: r[":block/uid"],
      string: r[":block/string"],
      title: r[":node/title"],
    }));
  }

  async searchTemplates(params: { query?: string }): Promise<Template[]> {
    const response = await this.client.call<Template[]>("data.ai.searchTemplates", [
      { query: params.query },
    ]);

    if (!response.success) {
      throw new Error(response.error || "Template search failed");
    }

    return response.result || [];
  }
}
