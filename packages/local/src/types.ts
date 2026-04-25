import type { GraphType } from "@roam-research/roam-tools-core";

// Constructor config for the local-Desktop-API RoamClient. Lives in this package
// because RoamClient itself is local-only.
export interface RoamClientConfig {
  graphName: string;
  graphType: GraphType;
  token: string;
  port?: number;
}
