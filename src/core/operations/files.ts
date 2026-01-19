import type { RoamClient } from "../client.js";

export interface FileGetParams {
  url: string;
}

export interface FileGetResult {
  base64: string;
}

export class FileOperations {
  constructor(private client: RoamClient) {}

  async get(params: FileGetParams): Promise<FileGetResult> {
    const response = await this.client.call<string>("file.get", [
      { url: params.url, format: "base64" },
    ]);

    if (!response.success || !response.result) {
      throw new Error("Failed to get file");
    }

    return { base64: response.result };
  }
}
