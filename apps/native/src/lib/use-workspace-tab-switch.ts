import { useWorkspaceTabHost } from "../providers/WorkspaceTabHostProvider";

/**
 * Switch between calendar and mail — updates the keep-alive host immediately,
 * then syncs the router on the next frame.
 */
export function useWorkspaceTabSwitch() {
  const { switchTab } = useWorkspaceTabHost();
  return switchTab;
}
