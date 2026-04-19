export type LogLevel = "debug" | "info" | "ok" | "warn" | "error" | "skip" | "step";

type ConsoleMethod = "debug" | "info" | "log" | "warn" | "error";

const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

let IS_PROD = false;
try {
  IS_PROD = process.env.NODE_ENV === "production";
} catch (e) {
  // Ignore
}

const CSS_COLORS = {
  faint: "color: #888;",
  debug: "color: #d946ef;",
  info: "color: #06b6d4;",
  ok: "color: #22c55e;",
  warn: "color: #eab308;",
  error: "color: #ef4444;",
  skip: "color: #3b82f6;",
  step: "color: #06b6d4;",
};

const COLORS = {
  reset: "\x1b[0m",
  faint: "\x1b[2m",
  debug: "\x1b[35m",
  info: "\x1b[36m",
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  skip: "\x1b[34m",
  step: "\x1b[36m",
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info:  "INFO ",
  ok:    "OK   ",
  warn:  "WARN ",
  error: "ERROR",
  skip:  "SKIP ",
  step:  "STEP ",
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
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} ${time}`;
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

export interface LoggerOptions {
  timestamp?: boolean;
}

export class WorkspaceLogger {
  private readonly options: LoggerOptions;

  constructor(private readonly scope?: string, options?: LoggerOptions) {
    this.options = { timestamp: true, ...options };
  }

  private write(level: LogLevel, args: unknown[]): void {
    if (IS_BROWSER && IS_PROD) return;

    const globalRef = globalThis as typeof globalThis & {
      [LOGGER_ORIGINALS]?: Partial<Record<ConsoleMethod, Console[ConsoleMethod]>>;
    };
    const originals = globalRef[LOGGER_ORIGINALS];
    const method = LEVEL_METHODS[level];
    const writer = originals?.[method] ?? console[method];

    if (IS_BROWSER) {
      const scopeStr = this.scope ? ` <${this.scope}>` : "";
      writer(
        `%c${timestamp()} %c${LEVEL_LABELS[level]}%c${scopeStr}`,
        CSS_COLORS.faint,
        CSS_COLORS[level as keyof typeof CSS_COLORS],
        CSS_COLORS.faint,
        ...args
      );
      return;
    }

    const timeStr = this.options.timestamp ? `${COLORS.faint}${timestamp()}${COLORS.reset} ` : "";
    const levelColor = COLORS[level];
    const levelStr = `${levelColor}${LEVEL_LABELS[level]}${COLORS.reset}`;
    const scopeStr = this.scope ? ` ${COLORS.faint}<${this.scope}>${COLORS.reset}` : "";
    const message = normalizeArgs(args);
    const line = `${timeStr}${levelStr}${scopeStr} ${message}`.trimEnd();

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
    return new WorkspaceLogger(this.scope ? `${this.scope}:${scope}` : scope, this.options);
  }
}

export function createLogger(scope?: string, options?: LoggerOptions): WorkspaceLogger {
  return new WorkspaceLogger(scope, options);
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
      if (IS_BROWSER && IS_PROD) return;

      if (IS_BROWSER) {
        const scopeStr = scope ? ` <${scope}>` : "";
        originalConsole[method]!(
          `%c${timestamp()} %c${LEVEL_LABELS[level]}%c${scopeStr}`,
          CSS_COLORS.faint,
          CSS_COLORS[level as keyof typeof CSS_COLORS],
          CSS_COLORS.faint,
          ...args
        );
        return;
      }

      const timeStr = `${COLORS.faint}${timestamp()}${COLORS.reset}`;
      const levelColor = COLORS[level];
      const levelStr = `${levelColor}${LEVEL_LABELS[level]}${COLORS.reset}`;
      const scopeStr = scope ? ` ${COLORS.faint}<${scope}>${COLORS.reset}` : "";
      const line = `${timeStr} ${levelStr}${scopeStr} ${normalizeArgs(args)}`.trimEnd();
      originalConsole[method]!(line);
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
