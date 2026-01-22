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

export async function createPage(client: RoamClient, params: CreatePageParams): Promise<string> {
  let response;
  if (params.markdown) {
    response = await client.call("data.page.fromMarkdown", [
      {
        page: { title: params.title, uid: params.uid },
        "markdown-string": params.markdown,
      },
    ]);
  } else {
    response = await client.call("data.page.create", [
      { page: { title: params.title, uid: params.uid } },
    ]);
  }
  if (!response.success) {
    throw new Error(response.error || "Failed to create page");
  }
  return params.uid || "";
}

export async function getPage(client: RoamClient, params: GetPageParams): Promise<string | null> {
  const apiParams: Record<string, unknown> = params.uid ? { uid: params.uid } : { title: params.title };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<string>("data.ai.getPage", [apiParams]);

  if (!response.success) {
    throw new Error(response.error || "Failed to get page");
  }

  return response.result || null;
}

export async function deletePage(client: RoamClient, params: DeletePageParams): Promise<{ success: true }> {
  const response = await client.call("data.page.delete", [{ page: { uid: params.uid } }]);
  if (!response.success) {
    throw new Error(response.error || "Failed to delete page");
  }
  return { success: true };
}

export async function getGuidelines(client: RoamClient): Promise<string | null> {
  const response = await client.call<string>("data.ai.getGraphGuidelines", []);

  if (!response.success) {
    throw new Error(response.error || "Failed to get graph guidelines");
  }

  return response.result || null;
}
