import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import open from "open";
import type { RoamResponse, RoamClientConfig, RoamApiError } from "./types.js";
import { EXPECTED_API_VERSION, getErrorMessage } from "./types.js";

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
    await open(deepLink);
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

  private isVersionMismatch(response: RoamResponse<unknown>): boolean {
    if (response.success) return false;
    const error = response.error;
    if (typeof error === "object" && error !== null) {
      return (error as RoamApiError).code === "VERSION_MISMATCH";
    }
    return false;
  }

  private handleVersionMismatch(response: RoamResponse<unknown>): never {
    const serverVersion = response.apiVersion ?? "unknown";
    let advice = "Please update Roam or the MCP server so versions match.";

    if (serverVersion !== "unknown") {
      const [serverMajor, serverMinor] = serverVersion.split(".").map(Number);
      const [expectedMajor, expectedMinor] = EXPECTED_API_VERSION.split(".").map(Number);

      if (serverMajor > expectedMajor || (serverMajor === expectedMajor && serverMinor > expectedMinor)) {
        advice = "Please update the MCP server.";
      } else {
        advice = "Please update Roam.";
      }
    }

    console.error(
      `\n[FATAL] Roam API version mismatch!\n` +
      `  Roam API version: ${serverVersion}\n` +
      `  MCP expected version: ${EXPECTED_API_VERSION}\n` +
      `  ${advice}\n`
    );
    process.exit(1);
  }

  private checkResponse<T>(response: RoamResponse<T>): void {
    if (this.isVersionMismatch(response)) {
      this.handleVersionMismatch(response);
    }
    if (!response.success) {
      throw new Error(getErrorMessage(response.error));
    }
  }

  async call<T = unknown>(action: string, args: unknown[] = []): Promise<RoamResponse<T>> {
    const doRequest = async (): Promise<RoamResponse<T>> => {
      const port = await this.getPort();
      const url = `http://127.0.0.1:${port}/api/${this.graphName}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, args, expectedApiVersion: EXPECTED_API_VERSION }),
      });
      return response.json() as Promise<RoamResponse<T>>;
    };

    try {
      const response = await doRequest();
      this.checkResponse(response);
      return response;
    } catch (error) {
      // If connection failed, try opening Roam and retry once
      if (this.isConnectionError(error)) {
        // Reset cached port so we re-read from config after Roam starts
        this.port = null;
        await this.openRoamDeepLink();

        let delay = 500;
        const maxDelay = 15000;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await this.sleep(delay);
          try {
            const response = await doRequest();
            this.checkResponse(response);
            return response;
          } catch (retryError) {
            if (!this.isConnectionError(retryError)) {
              throw retryError;
            }
          }
          delay = Math.min(delay * 2, maxDelay);
        }
      }
      throw error;
    }
  }
}
