import { z } from "zod";
import type {
  SearchResponse,
  SearchSuggestionsResponse,
  SearchTemplatesResponse,
  CallToolResult,
  RoamActionClient,
} from "../types.js";
import { textResult, RoamError, ErrorCodes } from "../types.js";

// Shape-only check for semantic_search's edited-date filters. Calendar validity
// (e.g. "2026-02-30") is left to the renderer, which rejects it with an
// "Input error: ..." message.
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

// Schemas
export const SearchSchema = z.object({
  query: z
    .string()
    .describe("Search query — use empty string to get recently edited and viewed content"),
  scope: z
    .enum(["pages", "blocks", "all"])
    .optional()
    .describe(
      "Search scope: 'pages' for page titles only, 'blocks' for block content only, 'all' for both (default: 'all')",
    ),
  offset: z.coerce.number().optional().describe("Skip first N results (default: 0)"),
  limit: z.coerce.number().optional().describe("Max results (default: 20)"),
  includePath: z
    .boolean()
    .optional()
    .describe("Include breadcrumb path to each result (default: true)"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown (default: 0)"),
});

export const SearchTemplatesSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      "Keywords to filter templates by name (case-insensitive). Try relevant keywords first before listing all.",
    ),
});

export const SemanticSearchSchema = z.object({
  query: z
    .string()
    .describe(
      "Natural-language query. Semantic search ranks by meaning via embeddings, so it finds conceptually related content that keyword search misses.",
    ),
  k: z.coerce
    .number()
    .optional()
    .describe("Number of results to return / KNN pool size (default: 25, max: 200)"),
  scope: z
    .enum(["pages", "blocks", "all"])
    .optional()
    .describe(
      "Search scope: 'pages' for page titles only, 'blocks' for block content only, 'all' for both (default: 'all')",
    ),
  includePath: z
    .boolean()
    .optional()
    .describe("Include breadcrumb path to each result (default: true)"),
  maxDepth: z.coerce
    .number()
    .optional()
    .describe("Max depth of children to include in markdown per result (default: 2)"),
  editedAfter: z
    .string()
    .regex(YYYY_MM_DD, "Must be YYYY-MM-DD format (e.g. '2026-03-17')")
    .optional()
    .describe(
      "Only return results last edited on or after this day (inclusive). A date in YYYY-MM-DD format, read as a day in the user's local calendar. Edited means last edited: a daily note written on one day but edited later counts as the later day.",
    ),
  editedBefore: z
    .string()
    .regex(YYYY_MM_DD, "Must be YYYY-MM-DD format (e.g. '2026-03-17')")
    .optional()
    .describe(
      "Only return results last edited on or before this day (inclusive). A date in YYYY-MM-DD format, read as a day in the user's local calendar. Edited means last edited: a daily note written on one day but edited later counts as the later day.",
    ),
  dailyNotes: z
    .enum(["only", "exclude"])
    .optional()
    .describe(
      "Filter by daily notes: 'only' restricts results to daily-note pages and their blocks; 'exclude' leaves them out. Omit to include everything (default).",
    ),
});

// Types derived from schemas
export type SearchParams = z.infer<typeof SearchSchema>;
export type SearchTemplatesParams = z.infer<typeof SearchTemplatesSchema>;
export type SemanticSearchParams = z.infer<typeof SemanticSearchSchema>;

// Response shape from data.ai.semanticSearch (array order is the ranking).
// `filters` names the filters Roam applied, as given; a Roam that predates
// them ignores them and omits it.
interface SemanticSearchResponse {
  results: unknown[];
  queriedAt?: string;
  filters?: Record<string, unknown>;
}

const SEMANTIC_FILTER_KEYS = ["editedAfter", "editedBefore", "dailyNotes"] as const;

export async function search(
  client: RoamActionClient,
  params: SearchParams,
): Promise<CallToolResult> {
  const apiParams: Record<string, unknown> = {
    query: params.query,
    scope: params.scope ?? "all",
    offset: params.offset ?? 0,
    limit: params.limit ?? 20,
    includePath: params.includePath ?? true,
  };
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;

  const response = await client.call<SearchResponse | SearchSuggestionsResponse>("data.ai.search", [
    apiParams,
  ]);
  return textResult(response.result ?? { total: 0, results: [] });
}

export async function searchTemplates(
  client: RoamActionClient,
  params: SearchTemplatesParams,
): Promise<CallToolResult> {
  const response = await client.call<SearchTemplatesResponse>("data.ai.searchTemplates", [
    { query: params.query },
  ]);
  return textResult(response.result ?? { results: [] });
}

export async function semanticSearch(
  client: RoamActionClient,
  params: SemanticSearchParams,
): Promise<CallToolResult> {
  // Single object arg, same call style as data.ai.search. Only forward provided
  // fields; the backend supplies defaults (k=25, scope="all", includePath=true,
  // maxDepth=2). The filters (editedAfter, editedBefore, dailyNotes) have no
  // default: absent means unfiltered.
  const apiParams: Record<string, unknown> = { query: params.query };
  if (params.k !== undefined) apiParams.k = params.k;
  if (params.scope !== undefined) apiParams.scope = params.scope;
  if (params.includePath !== undefined) apiParams.includePath = params.includePath;
  if (params.maxDepth !== undefined) apiParams.maxDepth = params.maxDepth;
  if (params.editedAfter !== undefined) apiParams.editedAfter = params.editedAfter;
  if (params.editedBefore !== undefined) apiParams.editedBefore = params.editedBefore;
  if (params.dailyNotes !== undefined) apiParams.dailyNotes = params.dailyNotes;

  try {
    const response = await client.call<SemanticSearchResponse>("data.ai.semanticSearch", [
      apiParams,
    ]);
    const result = response.result ?? { results: [] };
    // An older Roam drops the filters without a word, and its results would
    // read as filtered. Name the ones it did not report applying, in the
    // result itself: it must stay a JSON object, which the transports parse
    // to add the graph and token fields.
    const ignored = SEMANTIC_FILTER_KEYS.filter(
      (key) => params[key] !== undefined && result.filters?.[key] === undefined,
    );
    if (ignored.length === 0) return textResult(result);
    const warning =
      `This version of Roam ignored ${ignored.join(", ")}, so these results are not ` +
      `filtered by ${ignored.length === 1 ? "it" : "them"}. Updating Roam enables the filters.`;
    // After the spread, so a `warning` from the server can't hide this one.
    return textResult({ ...result, warning });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Only reframe the "semantic search isn't set up for this graph" case — an
    // opt-in feature that needs embeddings enabled + a signed-in user, so the
    // backend rejects with a message mentioning embeddings/semantic search. Let
    // every other failure (version mismatch, auth, connection, unknown action,
    // …) propagate UNCHANGED — reframing those as "not enabled" would mislead.
    if (!/embedding|semantic search/i.test(detail)) throw err;
    throw new RoamError(
      `Semantic search isn't enabled for this graph. It is an opt-in feature — not available on every graph — that requires the user to turn on embeddings in Roam and be signed in. Use the regular "search" tool instead. (Underlying error: ${detail})`,
      err instanceof RoamError ? err.code : ErrorCodes.INTERNAL_ERROR,
      { fallbackTool: "search", ...(err instanceof RoamError ? err.context : {}) },
    );
  }
}
