import { z } from "zod";
import type { RoamClient } from "../client.js";
import type {
  FocusedBlock,
  SelectedBlock,
  MainWindowView,
  SidebarWindowInfo,
  CallToolResult,
} from "../types.js";
import { textResult } from "../types.js";

// Schemas
export const GetOpenWindowsSchema = z.object({});

export const GetSelectionSchema = z.object({});

export const OpenMainWindowSchema = z.object({
  uid: z.string().optional().describe("UID of page or block"),
  title: z.string().optional().describe("Page title (alternative to uid)"),
});

export const OpenSidebarSchema = z.object({
  uid: z.string().describe("UID of page or block"),
  type: z
    .enum(["block", "outline", "mentions"])
    .optional()
    .describe("View type (default: outline)"),
});

// Types derived from schemas
export type OpenMainWindowParams = z.infer<typeof OpenMainWindowSchema>;
export type OpenSidebarParams = z.infer<typeof OpenSidebarSchema>;

export async function getOpenWindows(client: RoamClient): Promise<CallToolResult> {
  const [mainResponse, sidebarResponse] = await Promise.all([
    client.call<MainWindowView>("ui.mainWindow.getOpenView", []),
    client.call<SidebarWindowInfo[]>("ui.rightSidebar.getWindows", []),
  ]);
  return textResult({
    main: mainResponse.result ?? null,
    sidebar: sidebarResponse.result ?? [],
  });
}

export async function getSelection(client: RoamClient): Promise<CallToolResult> {
  const [focusedResponse, multiSelectedResponse] = await Promise.all([
    client.call<FocusedBlock>("ui.getFocusedBlock", []),
    client.call<SelectedBlock[]>("ui.multiselect.getSelected", []),
  ]);
  return textResult({
    focused: focusedResponse.result ?? null,
    multiSelected: multiSelectedResponse.result ?? [],
  });
}

export async function openMainWindow(
  client: RoamClient,
  params: OpenMainWindowParams,
): Promise<CallToolResult> {
  if (params.uid) {
    // Could be a page or block - openBlock handles both
    await client.call("ui.mainWindow.openBlock", [{ block: { uid: params.uid } }]);
  } else if (params.title) {
    await client.call("ui.mainWindow.openPage", [{ page: { title: params.title } }]);
  }
  return textResult({ success: true });
}

export async function openSidebar(
  client: RoamClient,
  params: OpenSidebarParams,
): Promise<CallToolResult> {
  await client.call("ui.rightSidebar.addWindow", [
    {
      window: {
        type: params.type || "outline",
        "block-uid": params.uid,
      },
    },
  ]);
  return textResult({ success: true });
}
