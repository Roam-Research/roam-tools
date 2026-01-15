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
    const response = await this.client.call<Record<string, unknown>>("data.pull", [
      "[:block/string :block/uid :block/open :block/heading {:block/children [:block/string :block/uid :block/open :block/heading {:block/children ...}]}]",
      `[:block/uid "${params.uid}"]`,
    ]);

    if (!response.success || !response.result) {
      return null;
    }

    return this.transformBlock(response.result);
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

    await this.client.call("data.block.update", [{ block }]);
  }

  async delete(params: DeleteBlockParams): Promise<void> {
    await this.client.call("data.block.delete", [{ block: { uid: params.uid } }]);
  }

  async getBacklinks(params: GetBacklinksParams): Promise<Block[]> {
    const response = await this.client.call<Array<[Record<string, unknown>]>>("data.q", [
      `[:find (pull ?b [:block/string :block/uid :block/open :block/heading])
        :where
        [?target :block/uid "${params.uid}"]
        [?b :block/refs ?target]]`,
    ]);

    if (!response.success || !response.result) {
      return [];
    }

    return response.result.map(([block]) => this.transformBlock(block));
  }
}
