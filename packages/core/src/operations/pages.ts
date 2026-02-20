import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { CallToolResult } from "../types.js";
import { textResult } from "../types.js";

// Schemas
export const CreatePageSchema = z.object({
  title: z.string().describe("Page title"),
  markdown: z.string().optional().describe("Markdown content for the page"),
  uid: z.string().optional(),
});

export const GetPageSchema = z.object({
  title: z.string().optional().describe("Page title (alternative to uid)"),
  uid: z.string().optional().describe("Page UID"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown (omit for full tree)"),
});

export const DeletePageSchema = z.object({
  uid: z.string().describe("Page UID to delete"),
});

export const UpdatePageSchema = z.object({
  uid: z.string().describe("Page UID"),
  title: z.string().optional().describe("New page title"),
  childrenViewType: z
    .enum(["document", "bullet", "numbered"])
    .optional()
    .describe("How children are displayed (document, bullet, or numbered)"),
  mergePages: z
    .boolean()
    .optional()
    .describe(
      "If true, merge with existing page when renaming to a title that already exists (default: false)",
    ),
});

export const GetGuidelinesSchema = z.object({});

// Types derived from schemas
export type CreatePageParams = z.infer<typeof CreatePageSchema>;
export type GetPageParams = z.infer<typeof GetPageSchema>;
export type DeletePageParams = z.infer<typeof DeletePageSchema>;
export type UpdatePageParams = z.infer<typeof UpdatePageSchema>;

export async function createPage(
  client: RoamClient,
  params: CreatePageParams,
): Promise<CallToolResult> {
  const response = await client.call<{ uid: string }>("data.page.fromMarkdown", [
    {
      page: { title: params.title, uid: params.uid },
      "markdown-string": params.markdown,
    },
  ]);
  return textResult(response.result ?? { uid: "" });
}

export async function getPage(client: RoamClient, params: GetPageParams): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = params.uid
    ? { uid: params.uid }
    : { title: params.title };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<string>("data.ai.getPage", [apiParams]);
  return textResult(response.result ?? null);
}

export async function deletePage(
  client: RoamClient,
  params: DeletePageParams,
): Promise<CallToolResult> {
  await client.call("data.page.delete", [{ page: { uid: params.uid } }]);
  return textResult({ success: true });
}

export async function updatePage(
  client: RoamClient,
  params: UpdatePageParams,
): Promise<CallToolResult> {
  const page: Record<string, unknown> = { uid: params.uid };
  if (params.title !== undefined) page.title = params.title;
  if (params.childrenViewType !== undefined) page["children-view-type"] = params.childrenViewType;

  const apiParams: Record<string, unknown> = { page };
  if (params.mergePages !== undefined) apiParams["merge-pages"] = params.mergePages;

  await client.call("data.page.update", [apiParams]);
  return textResult({ success: true });
}

export async function getGuidelines(client: RoamClient): Promise<CallToolResult> {
  const response = await client.call<{ guidelines: string | null; starredPages: string[] }>(
    "data.ai.getGraphGuidelines",
    [],
  );
  return textResult(response.result ?? { guidelines: null, starredPages: [] });
}
