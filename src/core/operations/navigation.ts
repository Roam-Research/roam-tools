import type { RoamClient } from "../client.js";
import type { FocusedBlock, MainWindowView, SidebarWindowInfo } from "../types.js";

export interface OpenMainWindowParams {
  uid?: string;
  title?: string;
}

export interface OpenSidebarParams {
  uid: string;
  type?: "block" | "outline" | "mentions";
}

export async function getFocusedBlock(client: RoamClient): Promise<FocusedBlock | null> {
  const result = await client.call<FocusedBlock>("ui.getFocusedBlock", []);
  if (!result.success) {
    throw new Error(result.error || "Failed to get focused block");
  }
  return result.result || null;
}

export async function getMainWindow(client: RoamClient): Promise<MainWindowView | null> {
  const result = await client.call<MainWindowView>("ui.mainWindow.getOpenView", []);
  if (!result.success) {
    throw new Error(result.error || "Failed to get main window");
  }
  return result.result || null;
}

export async function getSidebarWindows(client: RoamClient): Promise<SidebarWindowInfo[]> {
  const result = await client.call<SidebarWindowInfo[]>("ui.rightSidebar.getWindows", []);
  if (!result.success) {
    throw new Error(result.error || "Failed to get sidebar windows");
  }
  return result.result || [];
}

export async function openMainWindow(client: RoamClient, params: OpenMainWindowParams): Promise<{ success: true }> {
  let response;
  if (params.uid) {
    // Could be a page or block - openBlock handles both
    response = await client.call("ui.mainWindow.openBlock", [{ block: { uid: params.uid } }]);
  } else if (params.title) {
    response = await client.call("ui.mainWindow.openPage", [{ page: { title: params.title } }]);
  } else {
    return { success: true };
  }
  if (!response.success) {
    throw new Error(response.error || "Failed to open window");
  }
  return { success: true };
}

export async function openSidebar(client: RoamClient, params: OpenSidebarParams): Promise<{ success: true }> {
  const response = await client.call("ui.rightSidebar.addWindow", [
    {
      window: {
        type: params.type || "outline",
        "block-uid": params.uid,
      },
    },
  ]);
  if (!response.success) {
    throw new Error(response.error || "Failed to open sidebar");
  }
  return { success: true };
}
