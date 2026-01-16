import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { RoamResponse, RoamClientConfig } from "./types.js";

export class RoamClient {
  private graphName: string;
  private port: number | null = null;

  constructor(config: RoamClientConfig) {
    if (!config.graphName) {
      throw new Error("graphName is required");
    }
    this.graphName = config.graphName;
    if (config.port) {
      this.port = config.port;
    }
  }

  private async getPort(): Promise<number> {
    if (this.port) return this.port;

    try {
      const portFile = join(homedir(), ".roam-api-port");
      const content = await readFile(portFile, "utf-8");
      this.port = parseInt(content.trim(), 10);
      return this.port;
    } catch {
      // Default port if file doesn't exist
      return 3333;
    }
  }

  async call<T = unknown>(action: string, args: unknown[] = []): Promise<RoamResponse<T>> {
    const port = await this.getPort();
    const url = `http://localhost:${port}/api/${this.graphName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args }),
    });

    return response.json() as Promise<RoamResponse<T>>;
  }
}
