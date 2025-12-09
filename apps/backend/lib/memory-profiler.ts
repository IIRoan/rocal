/**
 * Memory profiling utility to identify what's consuming RAM
 */

export function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`, // Resident Set Size - total memory allocated
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`, // Total heap size
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`, // Actual heap used
    external: `${Math.round(usage.external / 1024 / 1024)}MB`, // C++ objects bound to JS
    arrayBuffers: `${Math.round(usage.arrayBuffers / 1024 / 1024)}MB`, // ArrayBuffers and SharedArrayBuffers
  };
}

export function logMemoryUsage(label: string) {
  const usage = getMemoryUsage();
  console.log(`[MEMORY] ${label}:`, usage);
}

export function startMemoryMonitoring(intervalMs: number = 30000) {
  logMemoryUsage("Initial");

  setInterval(() => {
    logMemoryUsage("Periodic check");
  }, intervalMs);
}

export async function profileModuleLoad<T>(
  moduleName: string,
  loadFn: () => T | Promise<T>
): Promise<T> {
  const before = process.memoryUsage();
  const result = await loadFn();
  const after = process.memoryUsage();

  const diff = {
    rss: Math.round((after.rss - before.rss) / 1024 / 1024),
    heapUsed: Math.round((after.heapUsed - before.heapUsed) / 1024 / 1024),
  };

  console.log(`[MEMORY] ${moduleName} loaded: +${diff.heapUsed}MB heap, +${diff.rss}MB RSS`);

  return result;
}
