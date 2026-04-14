const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'packages', 'logger', 'src', 'index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Insert IS_BROWSER and CSS_COLORS
const insertPoint = content.indexOf('const COLORS = {');
const additions = `const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";

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

`;
content = content.slice(0, insertPoint) + additions + content.slice(insertPoint);

// Replace write method
const writeRegex = /private write\(level: LogLevel, args: unknown\[\]\): void \{[\s\S]*?writer\(line\);\n  \}/;
const writeReplacement = `private write(level: LogLevel, args: unknown[]): void {
    const globalRef = globalThis as typeof globalThis & {
      [LOGGER_ORIGINALS]?: Partial<Record<ConsoleMethod, Console[ConsoleMethod]>>;
    };
    const originals = globalRef[LOGGER_ORIGINALS];
    const method = LEVEL_METHODS[level];
    const writer = originals?.[method] ?? console[method];

    if (IS_BROWSER) {
      const scopeStr = this.scope ? \` <\${this.scope}>\` : "";
      writer(
        \`%c\${timestamp()} %c\${LEVEL_LABELS[level]}%c\${scopeStr}\`,
        CSS_COLORS.faint,
        CSS_COLORS[level as keyof typeof CSS_COLORS],
        CSS_COLORS.faint,
        ...args
      );
      return;
    }

    const timeStr = \`\${COLORS.faint}\${timestamp()}\${COLORS.reset}\`;
    const levelColor = COLORS[level];
    const levelStr = \`\${levelColor}\${LEVEL_LABELS[level]}\${COLORS.reset}\`;
    const scopeStr = this.scope ? \` \${COLORS.faint}<\${this.scope}>\${COLORS.reset}\` : "";
    const message = normalizeArgs(args);
    const line = \`\${timeStr} \${levelStr}\${scopeStr} \${message}\`.trimEnd();
    
    writer(line);
  }`;
content = content.replace(writeRegex, writeReplacement);

// Replace patch method
const patchRegex = /const patch = \(method: ConsoleMethod, level: LogLevel\) => \{[\s\S]*?originalConsole\[method\]\(line\);\n    \};\n  \};/;
const patchReplacement = `const patch = (method: ConsoleMethod, level: LogLevel) => {
    console[method] = (...args: unknown[]) => {
      if (IS_BROWSER) {
        const scopeStr = scope ? \` <\${scope}>\` : "";
        originalConsole[method]!(
          \`%c\${timestamp()} %c\${LEVEL_LABELS[level]}%c\${scopeStr}\`,
          CSS_COLORS.faint,
          CSS_COLORS[level as keyof typeof CSS_COLORS],
          CSS_COLORS.faint,
          ...args
        );
        return;
      }

      const timeStr = \`\${COLORS.faint}\${timestamp()}\${COLORS.reset}\`;
      const levelColor = COLORS[level];
      const levelStr = \`\${levelColor}\${LEVEL_LABELS[level]}\${COLORS.reset}\`;
      const scopeStr = scope ? \` \${COLORS.faint}<\${scope}>\${COLORS.reset}\` : "";
      const line = \`\${timeStr} \${levelStr}\${scopeStr} \${normalizeArgs(args)}\`.trimEnd();
      originalConsole[method]!(line);
    };
  };`;
content = content.replace(patchRegex, patchReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Logger updated successfully');
