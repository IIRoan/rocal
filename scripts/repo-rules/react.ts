import ts from "typescript";

import { type Rule, CLIENT_SOURCE, appSourceUnder, calleeName, find, isComponentName, walk } from "./engine";

const REACT_SOURCE = appSourceUnder(CLIENT_SOURCE);

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);

const PERSISTENT_RESOURCES = /^(addEventListener|addListener|setInterval|subscribe|observe|watch|watchPositionAsync|onAuthStateChange|listen)$/;

const MUTATING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

function effectCallback(node: ts.Node) {
  if (!ts.isCallExpression(node) || !EFFECT_HOOKS.has(calleeName(node) ?? "")) return null;
  const [callback] = node.arguments;
  return callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ? callback : null;
}

function returnsCleanup(callback: ts.ArrowFunction | ts.FunctionExpression) {
  if (!ts.isBlock(callback.body)) return true;
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isReturnStatement(node) && node.expression) found = true;
    if (!ts.isFunctionLike(node)) ts.forEachChild(node, visit);
  };
  ts.forEachChild(callback.body, visit);
  return found;
}

function stateBindings(scope: ts.Node) {
  const values = new Set<string>();
  const setters = new Set<string>();
  walk(scope, (node) => {
    if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isCallExpression(node.initializer)) return;
    const hook = calleeName(node.initializer) ?? "";
    if (ts.isArrayBindingPattern(node.name) && (hook === "useState" || hook === "useReducer")) {
      const [value, setter] = node.name.elements;
      if (value && ts.isBindingElement(value)) values.add(value.name.getText());
      if (setter && ts.isBindingElement(setter) && hook === "useState") setters.add(setter.name.getText());
    } else if (/^use[A-Z]/.test(hook) && ts.isObjectBindingPattern(node.name)) {
      for (const element of node.name.elements) if (element.name.getText() === "data") values.add("data");
    }
  });
  return { values, setters };
}

const rootIdentifier = (node: ts.Expression): string | null => {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return rootIdentifier(node.expression);
  return null;
};

export const reactRules: Rule[] = [
  {
    id: "react-effect-lifecycle",
    summary: "Effects that install listeners, intervals, subscriptions, or observers return a cleanup function.",
    files: REACT_SOURCE,
    check: (file) =>
      find(file, (node) => {
        const callback = effectCallback(node);
        if (!callback || returnsCleanup(callback)) return null;
        let resource: string | null = null;
        walk(callback.body, (child) => {
          if (ts.isCallExpression(child) && PERSISTENT_RESOURCES.test(calleeName(child) ?? "")) resource ??= calleeName(child);
          if (ts.isNewExpression(child) && /(Observer|WebSocket|EventSource|BroadcastChannel)$/.test(child.expression.getText())) resource ??= child.expression.getText();
        });
        return resource ? `effect installs ${resource} without returning a cleanup` : null;
      }),
    examples: {
      path: "apps/web/hooks/use-resize.ts",
      bad: ['useEffect(() => { window.addEventListener("resize", onResize); }, []);', "useEffect(() => { const id = setInterval(tick, 1000); }, []);"],
      good: ['useEffect(() => { window.addEventListener("resize", onResize); return () => window.removeEventListener("resize", onResize); }, []);'],
    },
  },
  {
    id: "react-effect-purpose",
    summary: "Effects synchronize external systems; an effect that only calls state setters is derived state and belongs in render or useMemo.",
    files: REACT_SOURCE,
    check: (file) => {
      const { setters } = stateBindings(file.ast());
      return find(file, (node) => {
        const callback = effectCallback(node);
        if (!callback || !ts.isBlock(callback.body) || callback.body.statements.length === 0) return null;
        const onlySetters = callback.body.statements.every(
          (statement) =>
            ts.isExpressionStatement(statement) &&
            ts.isCallExpression(statement.expression) &&
            ts.isIdentifier(statement.expression.expression) &&
            setters.has(statement.expression.expression.text),
        );
        return onlySetters ? "effect only copies values into state; derive during render (or useMemo) or set state in the event handler" : null;
      });
    },
    examples: {
      path: "apps/web/components/list.tsx",
      bad: ["const [items, setItems] = useState([]);\nuseEffect(() => { setItems(data.filter(isVisible)); }, [data]);"],
      good: [
        "const visible = useMemo(() => data.filter(isVisible), [data]);",
        "const [open, setOpen] = useState(false);\nuseEffect(() => { if (!session) return; setOpen(true); }, [session]);",
      ],
    },
  },
  {
    id: "react-component-boundaries",
    summary: "Components are defined at module scope, never inside another component (their state remounts every render).",
    files: appSourceUnder(CLIENT_SOURCE, /\.tsx$/),
    check: (file) =>
      find(file, (node) => {
        const name =
          ts.isFunctionDeclaration(node) && node.name
            ? node.name.text
            : ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
              ? node.name.getText()
              : null;
        if (!isComponentName(name)) return null;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (!ts.isFunctionLike(parent)) continue;
          const parentName = ts.isFunctionDeclaration(parent) && parent.name ? parent.name.text : ts.isVariableDeclaration(parent.parent) ? parent.parent.name.getText() : null;
          if (!isComponentName(parentName)) return null;
          let rendered = false;
          walk(parent, (child) => {
            if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && child.tagName.getText() === name) rendered = true;
          });
          return rendered ? `component ${name} is defined inside ${parentName}; move it to module scope` : null;
        }
        return null;
      }),
    examples: {
      path: "apps/web/components/list.tsx",
      bad: ["export function List() { const Row = () => <li />; return <ul><Row /></ul>; }"],
      good: ["const Row = () => <li />;\nexport function List() { return <ul><Row /></ul>; }", "export function List() { const renderRow = () => <li />; return <ul>{renderRow()}</ul>; }"],
    },
  },
  {
    id: "react-immutable-state",
    summary: "Never mutate React state or query data in place; build a new array/object.",
    files: REACT_SOURCE,
    check: (file) => {
      const { values } = stateBindings(file.ast());
      if (values.size === 0) return [];
      return find(file, (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && MUTATING_METHODS.has(node.expression.name.text)) {
          const root = rootIdentifier(node.expression.expression);
          if (root && values.has(root) && ts.isIdentifier(node.expression.expression)) {
            return `${root}.${node.expression.name.text}() mutates state/query data in place; copy first (toSorted, [...${root}])`;
          }
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && !ts.isIdentifier(node.left)) {
          const root = rootIdentifier(node.left);
          if (root && values.has(root)) return `assignment into ${root} mutates state/query data in place; produce a new object`;
        }
        return null;
      });
    },
    examples: {
      path: "apps/web/components/list.tsx",
      bad: ["const [items, setItems] = useState([]);\nitems.sort(byDate);", "const { data } = useEvents();\ndata.title = 'x';"],
      good: ["const [items, setItems] = useState([]);\nconst sorted = items.toSorted(byDate);", "const [items, setItems] = useState([]);\nsetItems([...items, next]);"],
    },
  },
];
