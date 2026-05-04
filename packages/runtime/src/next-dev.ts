import { networkInterfaces } from "node:os";

function addHost(target: Set<string>, value?: string | null) {
  if (!value) {
    return;
  }

  try {
    const host = new URL(value).hostname;
    if (host) {
      target.add(host);
    }
    return;
  } catch {}

  const trimmed = value.trim();
  if (trimmed) {
    target.add(trimmed);
  }
}

export function getAllowedNextDevOrigins(env: Record<string, string | undefined> = process.env) {
  const origins = new Set(["localhost", "127.0.0.1"]);

  addHost(origins, env.NEXT_PUBLIC_APP_URL);
  addHost(origins, env.NEXT_PUBLIC_API_URL);
  addHost(origins, env.EXPO_PUBLIC_APP_URL);
  addHost(origins, env.EXPO_PUBLIC_API_URL);

  for (const iface of Object.values(networkInterfaces())) {
    for (const entry of iface ?? []) {
      if (entry.family === "IPv4" && !entry.internal && entry.address) {
        origins.add(entry.address);
      }
    }
  }

  return Array.from(origins);
}
