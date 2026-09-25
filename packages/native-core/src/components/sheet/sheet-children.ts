import {
  Children,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";

export const SHEET_CHROME_DISPLAY_NAMES = [
  "BottomSheetHeader",
  "BottomSheetFooter",
] as const;

function getSheetChildName(child: ReactNode): string | undefined {
  if (!isValidElement(child)) {
    return undefined;
  }
  return (child.type as { displayName?: string }).displayName;
}

function flattenSheetChildren(children: ReactNode): ReactNode[] {
  const flattened: ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === "boolean") {
      return;
    }

    if (isValidElement(child) && child.type === Fragment) {
      flattened.push(
        ...flattenSheetChildren(
          (child.props as { children?: ReactNode }).children,
        ),
      );
      return;
    }

    flattened.push(child);
  });

  return flattened;
}

export function isSheetContentPanTarget(child: ReactNode): boolean {
  const name = getSheetChildName(child);
  return (
    name !== "BottomSheetHeader" && name !== "BottomSheetFooter"
  );
}

export function splitSheetChildren(children: ReactNode) {
  const body: ReactNode[] = [];
  let footer: ReactNode = null;
  let header: ReactNode = null;

  for (const child of flattenSheetChildren(children)) {
    const name = getSheetChildName(child);
    if (name === "BottomSheetFooter") {
      footer = child;
      continue;
    }
    if (name === "BottomSheetHeader") {
      header = child;
      continue;
    }
    body.push(child);
  }

  return { body, footer, header };
}
