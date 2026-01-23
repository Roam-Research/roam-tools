import { z } from "zod";
import type { RoamClient } from "../client.js";
import type { CallToolResult } from "../types.js";
import { imageResult, textResult } from "../types.js";

// Schemas
export const FileGetSchema = z.object({
  url: z.string().describe("Firebase storage URL of the file"),
});

// Types derived from schemas
export type FileGetParams = z.infer<typeof FileGetSchema>;

// Response type from Roam API
interface FileGetResponse {
  base64: string;
  mimetype?: string;
  filename?: string;
}

// Detect MIME type from base64 image data by checking magic bytes
function detectImageMimeType(base64: string): string | null {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("Qk")) return "image/bmp";
  return null;
}

export async function getFile(client: RoamClient, params: FileGetParams): Promise<CallToolResult> {
  const response = await client.call<FileGetResponse>("file.get", [
    { url: params.url, format: "base64" },
  ]);

  if (!response.result) {
    throw new Error("No file data returned");
  }

  const { base64, mimetype } = response.result;
  const mimeType = mimetype || detectImageMimeType(base64);

  if (mimeType?.startsWith("image/")) {
    return imageResult(base64, mimeType);
  }

  // Non-image file - return as text (base64 encoded)
  return textResult(response.result);
}
