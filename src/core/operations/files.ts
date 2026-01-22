import { z } from "zod";
import type { RoamClient } from "../client.js";

// Schemas
export const FileGetSchema = z.object({
  url: z.string().describe("Firebase storage URL of the file"),
});

// Types derived from schemas
export type FileGetParams = z.infer<typeof FileGetSchema>;

// Response type (not an input schema)
export interface FileGetResult {
  base64: string;
  mimetype?: string;
  filename?: string;
}

export async function getFile(client: RoamClient, params: FileGetParams): Promise<FileGetResult> {
  const response = await client.call<FileGetResult>("file.get", [
    { url: params.url, format: "base64" },
  ]);

  if (!response.success) {
    throw new Error(response.error || "Failed to get file");
  }
  if (!response.result) {
    throw new Error("No file data returned");
  }

  return response.result;
}
