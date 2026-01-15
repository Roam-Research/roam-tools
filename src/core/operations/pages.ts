import type { RoamClient } from "../client.js";
import type { Page, Block } from "../types.js";

export interface CreatePageParams {
  title: string;
  markdown?: string;
  uid?: string;
}

export interface GetPageParams {
  title?: string;
  uid?: string;
}

export interface DeletePageParams {
  uid: string;
}

export class PageOperations {
  constructor(private client: RoamClient) {}

  async create(params: CreatePageParams): Promise<string> {
    if (params.markdown) {
      await this.client.call("data.page.fromMarkdown", [
        {
          page: { title: params.title, uid: params.uid },
          "markdown-string": params.markdown,
        },
      ]);
    } else {
      await this.client.call("data.page.create", [
        { page: { title: params.title, uid: params.uid } },
      ]);
    }
    return params.uid || "";
  }

  async get(params: GetPageParams): Promise<Page | null> {
    const eid = params.uid
      ? `[:block/uid "${params.uid}"]`
      : `[:node/title "${params.title}"]`;

    const response = await this.client.call<Record<string, unknown>>("data.pull", [
      "[:node/title :block/uid {:block/children [:block/string :block/uid :block/open :block/heading {:block/children ...}]}]",
      eid,
    ]);

    if (!response.success || !response.result) {
      return null;
    }

    const r = response.result;
    return {
      uid: r[":block/uid"] as string,
      title: r[":node/title"] as string,
      children: this.transformChildren(r[":block/children"] as Record<string, unknown>[] | undefined),
    };
  }

  private transformChildren(children: Record<string, unknown>[] | undefined): Block[] | undefined {
    if (!children) return undefined;
    return children.map((c) => ({
      uid: c[":block/uid"] as string,
      string: c[":block/string"] as string,
      open: c[":block/open"] as boolean | undefined,
      heading: c[":block/heading"] as number | undefined,
      children: this.transformChildren(c[":block/children"] as Record<string, unknown>[] | undefined),
    }));
  }

  async delete(params: DeletePageParams): Promise<void> {
    await this.client.call("data.page.delete", [{ page: { uid: params.uid } }]);
  }
}
