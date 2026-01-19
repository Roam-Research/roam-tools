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
    return result.result || null;
  }

  async getMainWindow(): Promise<MainWindowView | null> {
    const result = await this.client.call<MainWindowView>("ui.mainWindow.getOpenView", []);
    return result.result || null;
  }

  async getSidebarWindows(): Promise<SidebarWindowInfo[]> {
    const result = await this.client.call<SidebarWindowInfo[]>("ui.rightSidebar.getWindows", []);
    return result.result || [];
  }

  async open(params: OpenParams): Promise<void> {
    if (params.uid) {
      // Could be a page or block - openBlock handles both
      await this.client.call("ui.mainWindow.openBlock", [{ block: { uid: params.uid } }]);
    } else if (params.title) {
      await this.client.call("ui.mainWindow.openPage", [{ page: { title: params.title } }]);
    }
  }

  async openSidebar(params: OpenSidebarParams): Promise<void> {
    await this.client.call("ui.rightSidebar.addWindow", [
      {
        window: {
          type: params.type || "outline",
          "block-uid": params.uid,
        },
      },
    ]);
  }
}
