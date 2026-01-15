#!/usr/bin/env node

import { Command } from "commander";
import { RoamClient } from "../core/client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "../core/operations/index.js";
import { tools, createRouter, type JsonSchemaProperty } from "../core/tools.js";

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.1.0")
  .option("-g, --graph <name>", "Graph name (or set ROAM_GRAPH env var)");

// Build commands dynamically from shared tool definitions
tools.forEach((tool) => {
  const cmd = program
    .command(tool.name.replace(/_/g, "-")) // create_page -> create-page
    .description(tool.description);

  // Add options from inputSchema
  const { properties, required = [] } = tool.inputSchema;
  for (const [param, schema] of Object.entries(properties)) {
    const propSchema = schema as JsonSchemaProperty;
    const isRequired = required.includes(param);

    // Build flag string
    const flagName = param.replace(/([A-Z])/g, "-$1").toLowerCase(); // parentUid -> parent-uid
    const flag = isRequired ? `--${flagName} <value>` : `--${flagName} [value]`;

    cmd.option(flag, propSchema.description);
  }

  // Handler
  cmd.action(async (options) => {
    const graphName = program.opts().graph || process.env.ROAM_GRAPH;
    if (!graphName) {
      console.error("Error: Graph name required. Use -g <name> or set ROAM_GRAPH env var");
      process.exit(1);
    }

    const client = new RoamClient({ graphName });
    const operations = {
      pages: new PageOperations(client),
      blocks: new BlockOperations(client),
      search: new SearchOperations(client),
      navigation: new NavigationOperations(client),
    };

    const router = createRouter(operations);

    // Convert CLI options back to tool args
    // parent-uid -> parentUid
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const propSchema = tool.inputSchema.properties[camelKey];
        // Check for number type (direct or via oneOf)
        const hasNumberType = propSchema?.type === "number" ||
          propSchema?.oneOf?.some((o) => o.type === "number");
        const hasBooleanType = propSchema?.type === "boolean";

        if (hasNumberType && !isNaN(Number(value))) {
          args[camelKey] = Number(value);
        } else if (hasBooleanType) {
          args[camelKey] = value === "true" || value === true;
        } else {
          args[camelKey] = value;
        }
      }
    }

    try {
      const result = await router(tool.name, args);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
});

program.parse();
