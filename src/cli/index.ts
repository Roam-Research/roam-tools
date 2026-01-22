#!/usr/bin/env node

import { Command } from "commander";
import { z } from "zod";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CallToolResult } from "../core/types.js";
import { tools, routeToolCall } from "../core/tools.js";

// Get file extension from MIME type
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "application/pdf": "pdf",
  };
  return mimeToExt[mimeType] || "bin";
}

// Write image to temp directory and return metadata
function writeImageToTemp(data: string, mimeType: string): { type: "image"; path: string; mimeType: string; size: number } | { type: "image"; data: string; mimeType: string } {
  try {
    const tempDir = join(tmpdir(), "roam");
    mkdirSync(tempDir, { recursive: true });

    const ext = getExtensionFromMimeType(mimeType);
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(tempDir, filename);

    const buffer = Buffer.from(data, "base64");
    writeFileSync(filePath, buffer);

    return {
      type: "image",
      path: filePath,
      mimeType,
      size: buffer.length,
    };
  } catch {
    // Fall back to base64 output if file write fails
    return {
      type: "image",
      data,
      mimeType,
    };
  }
}

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.1.0");

// Helper to check if a Zod schema field is optional
function isOptional(schema: z.ZodTypeAny): boolean {
  return schema.isOptional() || schema instanceof z.ZodOptional;
}

// Helper to get the base type of a Zod schema (unwrapping optional/nullable)
function getBaseType(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getBaseType(schema._def.innerType);
  }
  return schema;
}

// Helper to check if schema contains a number type
function hasNumberType(schema: z.ZodTypeAny): boolean {
  const base = getBaseType(schema);
  if (base instanceof z.ZodNumber) return true;
  if (base instanceof z.ZodUnion) {
    return base._def.options.some((opt: z.ZodTypeAny) => getBaseType(opt) instanceof z.ZodNumber);
  }
  return false;
}

// Helper to check if schema is a boolean type
function hasBooleanType(schema: z.ZodTypeAny): boolean {
  return getBaseType(schema) instanceof z.ZodBoolean;
}

// Build commands dynamically from shared tool definitions
tools.forEach((tool) => {
  const cmd = program
    .command(tool.name.replace(/_/g, "-"))
    .description(tool.description);

  // Add options from Zod schema shape
  const shape = tool.schema.shape as Record<string, z.ZodTypeAny>;
  for (const [param, fieldSchema] of Object.entries(shape)) {
    const isRequired = !isOptional(fieldSchema);
    const description = fieldSchema.description || "";

    // Build flag string
    const flagName = param.replace(/([A-Z])/g, "-$1").toLowerCase();
    const flag = isRequired ? `--${flagName} <value>` : `--${flagName} [value]`;

    cmd.option(flag, description);
  }

  // Handler
  cmd.action(async (options) => {
    const args: Record<string, unknown> = {};
    const shape = tool.schema.shape as Record<string, z.ZodTypeAny>;

    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const fieldSchema = shape[camelKey];

        if (fieldSchema && hasNumberType(fieldSchema) && !isNaN(Number(value))) {
          args[camelKey] = Number(value);
        } else if (fieldSchema && hasBooleanType(fieldSchema)) {
          args[camelKey] = value === "true" || value === true;
        } else {
          args[camelKey] = value;
        }
      }
    }

    try {
      const result: CallToolResult = await routeToolCall(tool.name, args);

      // Output each content item
      for (const item of result.content) {
        if (item.type === "text") {
          console.log(item.text);
        } else if (item.type === "image") {
          const imageInfo = writeImageToTemp(item.data, item.mimeType);
          console.log(JSON.stringify(imageInfo, null, 2));
        }
      }

      if (result.isError) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }
  });
});

program.parse();
