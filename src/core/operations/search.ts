import type { RoamClient } from "../client.js";
import type { SearchResult } from "../types.js";

export interface SearchParams {
  query: string;
  searchBlocks?: boolean;
  searchPages?: boolean;
  limit?: number;
}

export class SearchOperations {
  constructor(private client: RoamClient) {}

  async search(params: SearchParams): Promise<SearchResult[]> {
    const result = await this.client.call<SearchResult[]>("data.search", [
      {
        "search-str": params.query,
        "search-blocks": params.searchBlocks ?? true,
        "search-pages": params.searchPages ?? true,
        limit: params.limit ?? 100,
      },
    ]);

    return result.result || [];
  }
}
