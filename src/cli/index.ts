#!/usr/bin/env node

import { Command } from "commander";
import { tools, routeToolCall, type JsonSchemaProperty } from "../core/tools.js";

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.1.0");

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
    // Convert CLI options back to tool args
    // parent-uid -> parentUid
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const propSchema = tool.inputSchema.properties[camelKey];
        // Check for number type (direct or via oneOf)
        const hasNumberType =
          propSchema?.type === "number" ||
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
      const result = await routeToolCall(tool.name, args);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
});

program.parse();
