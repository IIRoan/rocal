export type LogLevel = "debug" | "info" | "ok" | "warn" | "error" | "skip" | "step";

type ConsoleMethod = "debug" | "info" | "log" | "warn" | "error";

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  ok: "OK",
  warn: "WARN",
  error: "ERR",
  skip: "SKIP",
  step: "STEP",
};

const LEVEL_METHODS: Record<LogLevel, ConsoleMethod> = {
  debug: "debug",
  info: "info",
  ok: "log",
  warn: "warn",
  error: "error",
  skip: "log",
  step: "log",
};

const LOGGER_PATCHED = Symbol.for("workspace.logger.patched");
const LOGGER_INSTANCE = Symbol.for("workspace.logger.instance");
const LOGGER_ORIGINALS = Symbol.for("workspace.logger.originals");

function timestamp(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function normalizeArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") {
        return arg;
      }

      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }

      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

export class WorkspaceLogger {
  constructor(private readonly scope?: string) {}

  private write(level: LogLevel, args: unknown[]): void {
    const prefix = `${timestamp()} ${LEVEL_LABELS[level].padEnd(4, " ")}`;
    const scope = this.scope ? ` [${this.scope}]` : "";
    const message = normalizeArgs(args);
    const line = `${prefix}${scope} ${message}`.trimEnd();
    const globalRef = globalThis as typeof globalThis & {
      [LOGGER_ORIGINALS]?: Partial<Record<ConsoleMethod, Console[ConsoleMethod]>>;
    };
    const originals = globalRef[LOGGER_ORIGINALS];
    const method = LEVEL_METHODS[level];
    const writer = originals?.[method] ?? console[method];
    writer(line);
  }

  debug(...args: unknown[]): void {
    this.write("debug", args);
  }

  info(...args: unknown[]): void {
    this.write("info", args);
  }

  ok(...args: unknown[]): void {
    this.write("ok", args);
  }

  warn(...args: unknown[]): void {
    this.write("warn", args);
  }

  error(...args: unknown[]): void {
    this.write("error", args);
  }

  skip(...args: unknown[]): void {
    this.write("skip", args);
  }

  step(...args: unknown[]): void {
    this.write("step", args);
  }

  child(scope: string): WorkspaceLogger {
    return new WorkspaceLogger(this.scope ? `${this.scope}:${scope}` : scope);
  }
}

export function createLogger(scope?: string): WorkspaceLogger {
  return new WorkspaceLogger(scope);
}

export function installGlobalConsoleLogger(scope?: string): WorkspaceLogger {
  const globalRef = globalThis as typeof globalThis & {
    [LOGGER_PATCHED]?: boolean;
    [LOGGER_INSTANCE]?: WorkspaceLogger;
    [LOGGER_ORIGINALS]?: Partial<Record<ConsoleMethod, Console[ConsoleMethod]>>;
  };

  if (globalRef[LOGGER_PATCHED]) {
    return globalRef[LOGGER_INSTANCE] ?? createLogger(scope);
  }

  const baseLogger = createLogger(scope);
  const originalConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  globalRef[LOGGER_ORIGINALS] = originalConsole;

  const patch = (method: ConsoleMethod, level: LogLevel) => {
    console[method] = (...args: unknown[]) => {
      const prefix = `${timestamp()} ${LEVEL_LABELS[level].padEnd(4, " ")}`;
      const scoped = scope ? ` [${scope}]` : "";
      const line = `${prefix}${scoped} ${normalizeArgs(args)}`.trimEnd();
      originalConsole[method](line);
    };
  };

  patch("debug", "debug");
  patch("info", "info");
  patch("log", "info");
  patch("warn", "warn");
  patch("error", "error");

  globalRef[LOGGER_PATCHED] = true;
  globalRef[LOGGER_INSTANCE] = baseLogger;
  return baseLogger;
}
