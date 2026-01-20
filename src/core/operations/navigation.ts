import type { RoamClient } from "../client.js";
import type { FocusedBlock, MainWindowView, SidebarWindowInfo } from "../types.js";

export interface OpenParams {
  uid?: string;
  title?: string;
}

export interface OpenSidebarParams {
  uid: string;
  type?: "block" | "outline" | "mentions";
}

export class NavigationOperations {
  constructor(private client: RoamClient) {}

  async getFocusedBlock(): Promise<FocusedBlock | null> {
    const result = await this.client.call<FocusedBlock>("ui.getFocusedBlock", []);
    if (!result.success) {
      throw new Error(result.error || "Failed to get focused block");
    }
    return result.result || null;
  }

  async getMainWindow(): Promise<MainWindowView | null> {
    const result = await this.client.call<MainWindowView>("ui.mainWindow.getOpenView", []);
    if (!result.success) {
      throw new Error(result.error || "Failed to get main window");
    }
    return result.result || null;
  }

  async getSidebarWindows(): Promise<SidebarWindowInfo[]> {
    const result = await this.client.call<SidebarWindowInfo[]>("ui.rightSidebar.getWindows", []);
    if (!result.success) {
      throw new Error(result.error || "Failed to get sidebar windows");
    }
    return result.result || [];
  }

  async open(params: OpenParams): Promise<void> {
    let response;
    if (params.uid) {
      // Could be a page or block - openBlock handles both
      response = await this.client.call("ui.mainWindow.openBlock", [{ block: { uid: params.uid } }]);
    } else if (params.title) {
      response = await this.client.call("ui.mainWindow.openPage", [{ page: { title: params.title } }]);
    } else {
      return;
    }
    if (!response.success) {
      throw new Error(response.error || "Failed to open window");
    }
  }

  async openSidebar(params: OpenSidebarParams): Promise<void> {
    const response = await this.client.call("ui.rightSidebar.addWindow", [
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
  }
}
