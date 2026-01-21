import type { RoamClient } from "../client.js";

export interface CreatePageParams {
  title: string;
  markdown?: string;
  uid?: string;
}

export interface GetPageParams {
  title?: string;
  uid?: string;
  maxDepth?: number;
}

export interface DeletePageParams {
  uid: string;
}

export class PageOperations {
  constructor(private client: RoamClient) {}

  async create(params: CreatePageParams): Promise<string> {
    let response;
    if (params.markdown) {
      response = await this.client.call("data.page.fromMarkdown", [
        {
          page: { title: params.title, uid: params.uid },
          "markdown-string": params.markdown,
        },
      ]);
    } else {
      response = await this.client.call("data.page.create", [
        { page: { title: params.title, uid: params.uid } },
      ]);
    }
    if (!response.success) {
      throw new Error(response.error || "Failed to create page");
    }
    return params.uid || "";
  }

  async get(params: GetPageParams): Promise<string | null> {
    const apiParams: Record<string, unknown> = params.uid ? { uid: params.uid } : { title: params.title };
    if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

    const response = await this.client.call<string>("data.ai.getPageMd", [apiParams]);

    if (!response.success) {
      throw new Error(response.error || "Failed to get page");
    }

    return response.result || null;
  }

  async delete(params: DeletePageParams): Promise<void> {
    const response = await this.client.call("data.page.delete", [{ page: { uid: params.uid } }]);
    if (!response.success) {
      throw new Error(response.error || "Failed to delete page");
    }
  }

  async getGuidelines(): Promise<string | null> {
    const response = await this.client.call<string>("data.ai.getGraphGuidelines", []);

    if (!response.success) {
      throw new Error(response.error || "Failed to get graph guidelines");
    }

    return response.result || null;
  }
}
