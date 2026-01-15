#!/usr/bin/env node

// CLI entry point - will expose same operations as MCP
// for use with Claude skills and other CLI contexts

import { RoamClient } from "../core/client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "../core/operations/index.js";

const graphName = process.env.ROAM_GRAPH || process.argv[2];
if (!graphName) {
  console.error("Usage: roam-cli <graph-name> <command> [args...]");
  console.error("       or set ROAM_GRAPH env var");
  process.exit(1);
}

const client = new RoamClient({ graphName });
const pages = new PageOperations(client);
const blocks = new BlockOperations(client);
const search = new SearchOperations(client);
const navigation = new NavigationOperations(client);

// TODO: Implement CLI command parsing
// Commands will mirror MCP tools:
// - create-page <title> [--markdown <content>]
// - create-block <parent-uid> <markdown>
// - update-block <uid> [--string <content>] [--open] [--heading <n>]
// - delete-block <uid>
// - delete-page <uid>
// - search <query>
// - get-page <uid|--title <title>>
// - get-block <uid>
// - get-backlinks <uid>
// - get-focused-block
// - get-current-page
// - open <uid|--title <title>>
// - open-sidebar <uid> [--type <type>]

console.log("Roam CLI - not yet implemented");
console.log(`Graph: ${graphName}`);
console.log("Available operations:", {
  pages: Object.getOwnPropertyNames(PageOperations.prototype).filter(n => n !== "constructor"),
  blocks: Object.getOwnPropertyNames(BlockOperations.prototype).filter(n => n !== "constructor"),
  search: Object.getOwnPropertyNames(SearchOperations.prototype).filter(n => n !== "constructor"),
  navigation: Object.getOwnPropertyNames(NavigationOperations.prototype).filter(n => n !== "constructor"),
});
