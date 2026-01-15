import type { RoamClient } from "../client.js";
import type { Block, BlockLocation } from "../types.js";

export interface CreateBlockParams {
  parentUid: string;
  order?: number | "first" | "last";
  markdown: string;
}

export interface GetBlockParams {
  uid: string;
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
  uid: string;
}

export class BlockOperations {
  constructor(private client: RoamClient) {}

  async create(params: CreateBlockParams): Promise<string> {
    // Uses fromMarkdown for easier AI-generated content
    await this.client.call("data.block.fromMarkdown", [
      {
        location: {
          "parent-uid": params.parentUid,
          order: params.order ?? "last",
        },
        "markdown-string": params.markdown,
      },
    ]);
    // TODO: return created block uid
    return "";
  }

  async get(params: GetBlockParams): Promise<Block | null> {
    // TODO: implement with pull
    throw new Error("Not implemented");
  }

  async update(params: UpdateBlockParams): Promise<void> {
    const block: Record<string, unknown> = { uid: params.uid };
    if (params.string !== undefined) block.string = params.string;
    if (params.open !== undefined) block.open = params.open;
    if (params.heading !== undefined) block.heading = params.heading;

    await this.client.call("data.block.update", [{ block }]);
  }

  async delete(params: DeleteBlockParams): Promise<void> {
    await this.client.call("data.block.delete", [{ block: { uid: params.uid } }]);
  }

  async getBacklinks(params: GetBacklinksParams): Promise<Block[]> {
    // TODO: implement with query for blocks referencing this uid
    throw new Error("Not implemented");
  }
}
