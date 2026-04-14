type LogLevel = "debug" | "info" | "ok" | "warn" | "error" | "skip" | "step";
const COLORS = {
  reset: "\x1b[0m",
  faint: "\x1b[2m",
  debug: "\x1b[35m", // Magenta
  info: "\x1b[36m",  // Cyan
  ok: "\x1b[32m",    // Green
  warn: "\x1b[33m",  // Yellow
  error: "\x1b[31m", // Red
  skip: "\x1b[34m",  // Blue
  step: "\x1b[36m",  // Cyan
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

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} ${time}`;
}

function write(level: LogLevel, scope: string, msg: string) {
    const timeStr = `${COLORS.faint}${timestamp()}${COLORS.reset}`;
    const levelColor = COLORS[level];
    const levelStr = `${levelColor}${LEVEL_LABELS[level]}${COLORS.reset}`;
    const scopeStr = scope ? ` ${COLORS.faint}<${scope}>${COLORS.reset}` : "";
    const line = `${timeStr} ${levelStr}${scopeStr} ${msg}`.trimEnd();
    console.log(line);
}

write("info", "", "Server started on port 3000");
write("debug", "db", "Query executed in 12ms");
write("warn", "auth", "Invalid login attempt");
write("error", "api", "Failed to fetch user");
write("ok", "", "All systems operational");
write("skip", "build", "Skipped caching");
write("step", "deploy", "Uploading assets");
