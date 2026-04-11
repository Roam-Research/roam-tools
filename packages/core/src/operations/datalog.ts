import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { CallToolResult } from "../types.js";
import { textResult } from "../types.js";

export const DatalogQuerySchema = z.object({
  query: z
    .string()
    .describe("Datalog query string (e.g., '[:find ?title :where [?e :node/title ?title]]')"),
  inputs: z
    .array(z.unknown())
    .optional()
    .describe("Input parameters for the query, corresponding to :in clause bindings after $"),
});

export type DatalogQueryParams = z.infer<typeof DatalogQuerySchema>;

export async function datalogQuery(
  client: RoamClient,
  params: DatalogQueryParams,
): Promise<CallToolResult> {
  const args = params.inputs ? [params.query, ...params.inputs] : [params.query];
  const response = await client.call<unknown>("q", args);
  return textResult(response.result ?? []);
}
