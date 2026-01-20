import type { RoamClient } from "../client.js";

export interface FileGetParams {
  url: string;
}

export interface FileGetResult {
  base64: string;
  mimetype?: string;
  filename?: string;
}

export class FileOperations {
  constructor(private client: RoamClient) {}

  async get(params: FileGetParams): Promise<FileGetResult> {
    const response = await this.client.call<FileGetResult>("file.get", [
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
}
