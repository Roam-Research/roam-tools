import type { RoamClient } from "../client.js";
import type { Page } from "../types.js";

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
    // TODO: implement with pull
    throw new Error("Not implemented");
  }

  async delete(params: DeletePageParams): Promise<void> {
    await this.client.call("data.page.delete", [{ page: { uid: params.uid } }]);
  }
}
