import type { RoamClient } from "../client.js";
import type { Block, BlockLocation } from "../types.js";

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

export class BlockOperations {
  constructor(private client: RoamClient) {}

  async create(params: CreateBlockParams): Promise<string> {
    // Uses fromMarkdown for easier AI-generated content
    const response = await this.client.call("data.block.fromMarkdown", [
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

  async get(params: GetBlockParams): Promise<string | null> {
    const apiParams: Record<string, unknown> = { uid: params.uid };
    if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

    const response = await this.client.call<string>("data.ai.getBlockMd", [apiParams]);

    if (!response.success) {
      throw new Error(response.error || "Failed to get block");
    }

    return response.result || null;
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

  async update(params: UpdateBlockParams): Promise<void> {
    const block: Record<string, unknown> = { uid: params.uid };
    if (params.string !== undefined) block.string = params.string;
    if (params.open !== undefined) block.open = params.open;
    if (params.heading !== undefined) block.heading = params.heading;

    const response = await this.client.call("data.block.update", [{ block }]);
    if (!response.success) {
      throw new Error(response.error || "Failed to update block");
    }
  }

  async delete(params: DeleteBlockParams): Promise<void> {
    const response = await this.client.call("data.block.delete", [{ block: { uid: params.uid } }]);
    if (!response.success) {
      throw new Error(response.error || "Failed to delete block");
    }
  }

  async getBacklinks(params: GetBacklinksParams): Promise<GetBacklinksResponse> {
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

    const response = await this.client.call<GetBacklinksResponse>("data.ai.getBacklinksMd", [apiParams]);

    if (!response.success) {
      throw new Error(response.error || "Failed to get backlinks");
    }

    return response.result || { total: 0, results: [] };
  }
}
