import { readFile } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";
import type { RoamResponse, RoamClientConfig } from "./types.js";

const execAsync = promisify(exec);

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
      const configFile = join(homedir(), ".roam-local-api.json");
      const content = await readFile(configFile, "utf-8");
      const config = JSON.parse(content) as { port: number };
      this.port = config.port;
      return this.port;
    } catch {
      // Default port if file doesn't exist
      return 3333;
    }
  }

  private async openRoamDeepLink(): Promise<void> {
    const deepLink = `roam://#/app/${this.graphName}`;
    await execAsync(`open "${deepLink}"`);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
      // Node fetch connection errors
      return (
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed") ||
        error.message.includes("network") ||
        error.cause !== undefined
      );
    }
    return false;
  }

  async call<T = unknown>(action: string, args: unknown[] = []): Promise<RoamResponse<T>> {
    const doRequest = async (): Promise<RoamResponse<T>> => {
      const port = await this.getPort();
      const url = `http://localhost:${port}/api/${this.graphName}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, args }),
      });
      return response.json() as Promise<RoamResponse<T>>;
    };

    try {
      return await doRequest();
    } catch (error) {
      // If connection failed, try opening Roam and retry once
      if (this.isConnectionError(error)) {
        // Reset cached port so we re-read from config after Roam starts
        this.port = null;
        await this.openRoamDeepLink();
        await this.sleep(3000); // Wait 3 seconds for Roam to start
        return await doRequest();
      }
      throw error;
    }
  }
}
