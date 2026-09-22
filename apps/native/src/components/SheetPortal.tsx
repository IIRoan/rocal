import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View, StyleSheet } from "react-native";

interface SheetPortalHostApi {
  mount: (key: string, children: ReactNode) => void;
  unmount: (key: string) => void;
}

const SheetPortalHostContext = createContext<SheetPortalHostApi | null>(null);

/** Renders children through the nearest host above any BottomSheet, so nested sheets overlay the drawer instead of being clipped by it. */
export function SheetPortal({ children }: { children: ReactNode }) {
  const host = useContext(SheetPortalHostContext);
  const key = useId();

  useEffect(() => {
    if (!host) return;
    host.mount(key, children);
    return () => host.unmount(key);
  });

  if (!host) return <>{children}</>;
  return null;
}

export function SheetPortalHostProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [portals, setPortals] = useState<Map<string, ReactNode>>(new Map());

  const api = useMemo<SheetPortalHostApi>(
    () => ({
      mount: (key, node) =>
        setPortals((current) => new Map(current).set(key, node)),
      unmount: (key) =>
        setPortals((current) => {
          if (!current.has(key)) return current;
          const next = new Map(current);
          next.delete(key);
          return next;
        }),
    }),
    [],
  );

  return (
    <SheetPortalHostContext.Provider value={api}>
      {children}
      {portals.size > 0 ? (
        <View
          style={[StyleSheet.absoluteFill, hostStyles.aboveSheets]}
          pointerEvents="box-none"
        >
          {Array.from(portals.entries()).map(([key, node]) => (
            <React.Fragment key={key}>{node}</React.Fragment>
          ))}
        </View>
      ) : null}
    </SheetPortalHostContext.Provider>
  );
}

const hostStyles = StyleSheet.create({
  /** BottomSheet wrappers sit at zIndex 1000; hosted pickers must overlay them. */
  aboveSheets: { zIndex: 1001 },
});
