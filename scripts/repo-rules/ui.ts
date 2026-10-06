import ts from "typescript";

import { type FileContext, type Rule, appSourceUnder, find, hasSpreadAttributes, jsxAttribute, jsxTagName, matchLines, sourceUnder } from "./engine";

const WEB_UI = appSourceUnder(["apps/web/", "packages/ui/src/"], /\.tsx$/);
const NATIVE_UI = appSourceUnder(["apps/native-calendar/", "apps/native-mail/", "packages/native-core/src/"], /\.tsx$/);
const ALL_UI_CODE = appSourceUnder(["apps/web/", "packages/ui/src/", "apps/native-calendar/", "apps/native-mail/", "packages/native-core/src/"]);
const WEB_STYLES = sourceUnder(["apps/web/", "packages/ui/src/", "apps/gatus/"], /\.css$/);

/** Files that define the palette itself: design tokens, theme providers, and the user-pickable event/label colors. */
const COLOR_SOURCES = /^(packages\/design-tokens\/|packages\/ui\/src\/styles\/|apps\/web\/app\/globals\.css$|apps\/gatus\/)|(^|\/)(theme|colors?|palette|tokens?)[^/]*\.(ts|tsx|css)$|(^|\/)app\.config\.ts$/;

/** HTML email templates and their previews must inline literal colors because mail clients ignore CSS variables. */
const EMAIL_TEMPLATES = /^(packages\/ui\/src\/components\/email\/|apps\/web\/app\/debug\/mails\/)/;

const NON_INTERACTIVE = new Set(["div", "span", "li", "ul", "ol", "p", "img", "section", "article", "td", "tr", "label", "header", "footer", "main", "nav"]);

const RAW_PALETTE =
  /\b(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|placeholder|caret|accent)-(?:(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b|white\b|black\b(?!\/\d))/;

const LAYOUT_PROPERTIES = "width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset|margin|padding|flex-basis|grid-template-columns|grid-template-rows|all";

const ICON_TAG = /(Icon|^Feather|^Ionicons|^MaterialIcons|^Lucide\w*)$/;

const textOf = (node: ts.JsxAttribute | undefined) => node?.initializer?.getText() ?? "";

function onlyIconChildren(children: ts.NodeArray<ts.JsxChild>) {
  const meaningful = children.filter((child) => !(ts.isJsxText(child) && child.text.trim() === ""));
  return (
    meaningful.length > 0 &&
    meaningful.every((child) => ts.isJsxSelfClosingElement(child) && ICON_TAG.test(jsxTagName(child)) && !jsxAttribute(child, "aria-label"))
  );
}

function hasAccessibleName(node: ts.JsxOpeningLikeElement, names: string[]) {
  return hasSpreadAttributes(node) || names.some((name) => jsxAttribute(node, name));
}

function classStrings(file: FileContext) {
  const strings: Array<{ text: string; line: number }> = [];
  const sourceFile = file.ast();
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && /^(className|class)$/.test(node.name.getText()) && node.initializer) {
      strings.push({ text: node.initializer.getText(), line: file.lineOf(node.getStart(sourceFile)) });
      return;
    }
    if (ts.isStringLiteralLike(node)) strings.push({ text: node.text, line: file.lineOf(node.getStart(sourceFile)) });
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return strings;
}

function cssBlocks(text: string, selector: RegExp) {
  const blocks: Array<{ index: number; body: string }> = [];
  for (let match = selector.exec(text); match; match = selector.exec(text)) {
    const start = text.indexOf("{", match.index);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}" && --depth === 0) break;
    }
    blocks.push({ index: match.index, body: text.slice(start + 1, end) });
    selector.lastIndex = end;
  }
  return blocks;
}

export const uiRules: Rule[] = [
  {
    id: "wcag-accessible-names",
    summary: "WCAG 1.1.1/4.1.2: images have alt text, and icon-only buttons and links have an accessible name (aria-label or accessibilityLabel).",
    files: (file) => WEB_UI(file) || NATIVE_UI(file),
    check: (file) =>
      find(file, (node) => {
        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
          const tag = jsxTagName(node);
          if ((tag === "img" || tag === "Image") && WEB_UI(file.path) && !hasAccessibleName(node, ["alt"])) return `<${tag}> without alt text (use alt="" for decoration)`;
        }
        if (!ts.isJsxElement(node)) return null;
        const opening = node.openingElement;
        const tag = jsxTagName(opening);
        if (WEB_UI(file.path) && /^(button|Button|a|Link|IconButton)$/.test(tag) && onlyIconChildren(node.children)) {
          return hasAccessibleName(opening, ["aria-label", "aria-labelledby", "title"]) ? null : `icon-only <${tag}> without aria-label`;
        }
        if (NATIVE_UI(file.path) && /^(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)$/.test(tag) && onlyIconChildren(node.children)) {
          return hasAccessibleName(opening, ["accessibilityLabel", "aria-label"]) ? null : `icon-only <${tag}> without accessibilityLabel`;
        }
        return null;
      }),
    examples: {
      path: "apps/web/components/toolbar.tsx",
      bad: ['const a = <img src="/logo.svg" />;', "const b = <Button size=\"icon\"><TrashIcon /></Button>;", "const c = <button onClick={close}><XIcon className=\"size-4\" /></button>;"],
      good: [
        'const a = <img src="/logo.svg" alt="" />;',
        'const b = <Button size="icon" aria-label="Delete"><TrashIcon /></Button>;',
        "const c = <Button><TrashIcon /> Delete</Button>;",
      ],
    },
  },
  {
    id: "wcag-keyboard-access",
    summary: "WCAG 2.1.1/2.4.3: clickable non-interactive elements need a role and a key handler (prefer a real button), and tabIndex is never positive.",
    files: WEB_UI,
    check: (file) =>
      find(file, (node) => {
        if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxOpeningElement(node)) return null;
        const tabIndex = textOf(jsxAttribute(node, "tabIndex"));
        if (/^\{\s*[1-9]/.test(tabIndex)) return "positive tabIndex breaks the natural focus order";
        const tag = jsxTagName(node);
        if (!NON_INTERACTIVE.has(tag) || !jsxAttribute(node, "onClick") || hasSpreadAttributes(node)) return null;
        const keyboard = ["onKeyDown", "onKeyUp", "onKeyPress"].some((name) => jsxAttribute(node, name));
        return jsxAttribute(node, "role") && keyboard ? null : `<${tag} onClick> is not keyboard accessible; use a <button> or add role + onKeyDown`;
      }),
    examples: {
      path: "apps/web/components/row.tsx",
      bad: ["const a = <div onClick={open}>Open</div>;", "const b = <span tabIndex={2} />;"],
      good: ["const a = <button type=\"button\" onClick={open}>Open</button>;", 'const b = <div role="button" tabIndex={0} onClick={open} onKeyDown={onKey}>Open</div>;'],
    },
  },
  {
    id: "wcag-visible-focus",
    summary: "WCAG 2.4.7: removing the outline (`outline-none`) requires a focus-visible style on the same element.",
    files: WEB_UI,
    check: (file) =>
      classStrings(file)
        .filter(({ text }) => /(^|[\s"'`])outline-none\b/.test(text) && !/\b(focus-visible|focus|group-focus-visible|peer-focus-visible|has-focus-visible):/.test(text))
        .map(({ line }) => ({ line, message: "outline-none without a focus-visible: style; keyboard focus becomes invisible" })),
    examples: {
      path: "apps/web/components/row.tsx",
      bad: ['const a = <button className="rounded outline-none" />;'],
      good: ['const a = <button className="rounded outline-none focus-visible:ring-2 focus-visible:ring-ring" />;'],
    },
  },
  {
    id: "wcag-allow-zoom",
    summary: "WCAG 1.4.4: never disable pinch zoom or cap the viewport scale.",
    files: (file) => ALL_UI_CODE(file) || WEB_STYLES(file),
    check: (file) =>
      matchLines(
        file,
        /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b|userScalable\s*:\s*false|maximumScale\s*:\s*1\b/,
        (match) => `"${match[0]}" blocks zoom`,
      ),
    examples: {
      path: "apps/web/app/layout.tsx",
      bad: ["export const viewport = { width: 'device-width', maximumScale: 1 };", "export const viewport = { userScalable: false };"],
      good: ["export const viewport = { width: 'device-width', initialScale: 1 };"],
    },
  },
  {
    id: "theme-tokens-only",
    summary: "UI colors come from theme tokens: no hex/rgb/hsl literals, raw Tailwind palette classes, white/black utilities, or gradients outside palette files.",
    files: (file) => (ALL_UI_CODE(file) || WEB_STYLES(file)) && !COLOR_SOURCES.test(file) && !EMAIL_TEMPLATES.test(file),
    check(file) {
      const findings = matchLines(
        file,
        /["'`(\s:,]#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b(?![-\w])|\b(?:rgba?|hsla?|oklch|oklab)\(\s*\d/,
        (match) => `raw color ${match[0].trim()}; use a theme token (bg-primary, theme.colors.*)`,
      );
      findings.push(
        ...matchLines(file, RAW_PALETTE, (match) => `raw palette class ${match[0]}; use a semantic token (bg-background, text-muted-foreground, ...)`),
        ...matchLines(file, /\bbg-gradient-to-|\bbg-linear-|\b(?:linear|radial|conic)-gradient\(/, () => "gradient; Solace surfaces are flat"),
        ...matchLines(file, /\bbackdrop-blur(?:-\w+)?\b|backdrop-filter\s*:/, () => "backdrop blur (glassmorphism, and slow on moving surfaces in Firefox/Safari)"),
      );
      return findings;
    },
    examples: {
      path: "apps/web/components/badge.tsx",
      bad: [
        'const a = <span className="bg-orange-500 text-white" />;',
        'const b = { color: "#ef5a3c" };',
        'const b = { color: "#fff3" };',
        "const c = { backgroundColor: 'rgba(0, 0, 0, 0.4)' };",
        'const d = <div className="bg-gradient-to-r backdrop-blur-md" />;',
      ],
      good: ['const a = <span className="bg-primary text-primary-foreground" />;', "const b = { color: theme.colors.primaryBase };", 'const c = <a href="#main" />;', "// Upstream issue #9151 forced this fallback."],
    },
  },
  {
    id: "motion-compositor-only",
    summary: "Cross-browser motion animates only transform/opacity: no transition-all or layout-property transitions/keyframes, dvh instead of 100vh/h-screen, no press-scale.",
    files: (file) => ALL_UI_CODE(file) || WEB_STYLES(file),
    check(file) {
      const findings = matchLines(
        file,
        new RegExp(`\\btransition-all\\b|\\btransition-\\[[^\\]]*\\b(?:${LAYOUT_PROPERTIES})\\b`),
        (match) => `${match[0]} animates layout properties; transition only transform/opacity (transition-transform, transition-opacity)`,
      );
      findings.push(
        ...matchLines(file, new RegExp(`\\btransition(?:-property)?\\s*:[^;\n]*\\b(?:${LAYOUT_PROPERTIES})\\b`), () => "CSS transition on a layout property; animate transform/opacity"),
        ...matchLines(file, /\b(?:min-|max-)?h-screen\b|\b100vh\b/, (match) => `${match[0]} breaks under mobile browser toolbars; use dvh (h-dvh)`),
        ...matchLines(file, /\bactive:scale-|\bwhileTap\b/, (match) => `${match[0]} press-scale; give feedback with color/opacity`),
      );
      if (file.path.endsWith(".css")) {
        for (const { index, body } of cssBlocks(file.text, /@keyframes\s+[\w-]+/g)) {
          const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1] ?? "");
          const layout = properties.filter((property) => !/^(transform|opacity|visibility|translate|scale|rotate|offset|animation-timing-function|--[\w-]+)$/.test(property));
          if (layout.length > 0) findings.push({ line: file.lineOf(index), message: `@keyframes animates ${[...new Set(layout)].join(", ")}; keyframes may only animate transform/opacity` });
        }
      }
      return findings;
    },
    examples: {
      path: "apps/web/components/drawer.tsx",
      bad: ['const a = <div className="transition-all" />;', 'const b = <div className="transition-[height] duration-200" />;', 'const c = <main className="h-screen" />;', 'const d = <button className="active:scale-95" />;'],
      good: ['const a = <div className="transition-transform duration-200" />;', 'const c = <main className="h-dvh" />;', 'const a = { color: "[transition-property:color,opacity]",\nlayout: "inset-0" };'],
    },
  },
  {
    id: "motion-shared-helpers",
    summary: "Motion goes through the shared helpers so reduced motion and Firefox/Safari quirks are handled once: WAAPI via @workspace/ui/lib/motion, GSAP via @workspace/ui/lib/gsap, no LayoutAnimation, native driver for core Animated.",
    files: ALL_UI_CODE,
    check: (file) =>
      find(file, (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const source = node.moduleSpecifier.text;
          if (/^(gsap|@gsap\/react)(\/|$)/.test(source) && file.path !== "packages/ui/src/lib/gsap.ts") return `import ${source} through @workspace/ui/lib/gsap`;
          if (/^(framer-motion|motion\/react|motion)$/.test(source)) return `${source} is not a Solace motion library; use @workspace/ui/lib/motion (WAAPI)`;
        }
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
        const method = node.expression.name.text;
        const owner = node.expression.expression.getText();
        const [keyframes] = node.arguments;
        if (method === "animate" && file.path !== "packages/ui/src/lib/motion.ts" && keyframes && (ts.isArrayLiteralExpression(keyframes) || ts.isIdentifier(keyframes)) && /^(element|el|node|content|item|ref\.current|\w+Ref\.current|\w+Element)$/.test(owner)) {
          return "direct Element.animate; use slideFadeIn/slideFadeOut from @workspace/ui/lib/motion";
        }
        if (owner === "LayoutAnimation") return "LayoutAnimation reflows on the JS thread; use Reanimated transform/opacity";
        if (owner === "Animated" && /^(timing|spring|decay)$/.test(method)) {
          const config = node.arguments[1];
          const nativeDriver = config && ts.isObjectLiteralExpression(config) && config.properties.some((p) => p.getText().replace(/\s/g, "") === "useNativeDriver:true");
          return nativeDriver ? null : `Animated.${method} without useNativeDriver: true runs on the JS thread`;
        }
        return null;
      }),
    examples: {
      path: "apps/web/components/drawer.tsx",
      bad: ['import { gsap } from "gsap";', 'import { motion } from "motion/react";', "element.animate([{ opacity: 0 }, { opacity: 1 }], 200);", "LayoutAnimation.easeInEaseOut();", "Animated.timing(value, { toValue: 1 }).start();"],
      good: ['import { gsap } from "@workspace/ui/lib/gsap";', "slideFadeIn(element, { y: 8 }, { duration: 200 });", "Animated.timing(value, { toValue: 1, useNativeDriver: true }).start();"],
    },
  },
  {
    id: "motion-reduced-motion",
    summary: "Stylesheets that declare animations honor prefers-reduced-motion.",
    files: sourceUnder(["apps/", "packages/"], /\.css$/),
    check: (file) =>
      /@keyframes|\banimation\s*:/.test(file.text) && !/prefers-reduced-motion/.test(file.text)
        ? [{ line: 1, message: "animations without a prefers-reduced-motion override" }]
        : [],
    examples: {
      path: "apps/web/app/extra.css",
      bad: ["@keyframes fade { from { opacity: 0 } to { opacity: 1 } }\n.a { animation: fade 1s; }"],
      good: ["@keyframes fade { from { opacity: 0 } to { opacity: 1 } }\n@media (prefers-reduced-motion: reduce) { .a { animation: none; } }"],
    },
  },
];
