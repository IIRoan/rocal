const LOGGER_METHODS = new Set(["error", "warn", "info", "debug"]);
const SANITIZE_CONTEXT_CALLEES = new Set(["sanitizeLogContext", "errorLogDetails"]);

/**
 * @param {import('estree').Node} node
 * @returns {boolean}
 */
function isLoggerCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "logger" &&
    node.callee.property.type === "Identifier" &&
    LOGGER_METHODS.has(node.callee.property.name)
  );
}

/**
 * @param {import('estree').Node | null | undefined} node
 * @returns {boolean}
 */
function isLoggerMemberReference(node) {
  return (
    node?.type === "MemberExpression" &&
    node.object.type === "Identifier" &&
    node.object.name === "logger" &&
    node.property.type === "Identifier" &&
    LOGGER_METHODS.has(node.property.name)
  );
}

/**
 * @param {import('estree').CallExpression | import('estree').OptionalCallExpression} node
 * @returns {string | null}
 */
function getCalleeName(node) {
  if (node.callee.type === "Identifier") {
    return node.callee.name;
  }

  return null;
}

/**
 * @param {import('estree').Node} node
 * @param {ReadonlySet<string>} allowedCallees
 * @returns {boolean}
 */
function isSafeValueExpression(node, allowedCallees) {
  if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
    const calleeName = getCalleeName(node);
    return calleeName !== null && allowedCallees.has(calleeName);
  }

  return false;
}

/**
 * @param {import('estree').Property | import('estree').ObjectPattern} property
 * @returns {string | null}
 */
function getPropertyKeyName(property) {
  if (property.type !== "Property" || property.key.type !== "Identifier") {
    return null;
  }

  return property.key.name;
}

/**
 * @param {import('estree').Node} node
 * @returns {import('estree').CallExpression | null}
 */
function getSanitizeContextCall(node) {
  let current = node.parent;

  while (current) {
    if (
      current.type === "CallExpression" &&
      current.callee.type === "Identifier" &&
      SANITIZE_CONTEXT_CALLEES.has(current.callee.name)
    ) {
      return current;
    }

    if (current.type === "CallExpression" && isLoggerCall(current)) {
      return null;
    }

    current = current.parent;
  }

  return null;
}

/**
 * @param {import('estree').Node} node
 * @returns {import('estree').CallExpression | null}
 */
function getEnclosingLoggerCall(node) {
  let current = node.parent;

  while (current) {
    if (current.type === "CallExpression" && isLoggerCall(current)) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

/**
 * @param {{
 *   omitKeys?: readonly string[];
 *   hashKeys?: readonly string[];
 *   urlKeys?: readonly string[];
 *   safeValueCallees?: readonly string[];
 * }} options
 */
function createSafeLoggingRules(options = {}) {
  const omitKeys = new Set(options.omitKeys ?? []);
  const hashKeys = new Set(options.hashKeys ?? []);
  const urlKeys = new Set(options.urlKeys ?? []);
  const sensitiveKeys = new Set([...omitKeys, ...hashKeys]);
  const safeValueCallees = new Set([
    ...(options.safeValueCallees ?? []),
    "sanitizeRequestUrl",
  ]);

  return {
    "no-raw-error-logging": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow passing raw Error values to logger calls or .catch(logger.error).",
        },
        schema: [],
        messages: {
          rawErrorArgument:
            "Do not pass a raw error to logger. Use errorLogDetails(error) or spread it into log context.",
          catchLoggerError:
            "Do not pass logger.error directly to .catch(). Wrap with errorLogDetails instead.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (!isLoggerCall(node)) {
              return;
            }

            for (const argument of node.arguments) {
              if (
                argument.type === "Identifier" &&
                argument.name === "error"
              ) {
                context.report({
                  node: argument,
                  messageId: "rawErrorArgument",
                });
              }

              if (
                argument.type === "NewExpression" &&
                argument.callee.type === "Identifier" &&
                argument.callee.name === "Error"
              ) {
                context.report({
                  node: argument,
                  messageId: "rawErrorArgument",
                });
              }
            }
          },
          "CallExpression[callee.property.name='catch']"(node) {
            const [handler] = node.arguments;
            if (handler && isLoggerMemberReference(handler)) {
              context.report({
                node: handler,
                messageId: "catchLoggerError",
              });
            }
          },
        };
      },
    },
    "no-sensitive-log-keys": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow sensitive structured keys in logger context without sanitization helpers.",
        },
        schema: [],
        messages: {
          sensitiveKey:
            "Log field '{{key}}' may contain PII or secrets. Wrap the object in sanitizeLogContext(), hash with logRef(), or use an approved helper from logging.policy.mjs.",
          urlKey:
            "Log field '{{key}}' may contain query tokens. Pass sanitizeRequestUrl(value) instead of the raw URL.",
          errorKey:
            "Do not log an `error` property. Spread errorLogDetails(error) into the log context instead.",
        },
      },
      create(context) {
        return {
          Property(node) {
            const keyName = getPropertyKeyName(node);
            if (!keyName || !getEnclosingLoggerCall(node)) {
              return;
            }

            if (getSanitizeContextCall(node)) {
              return;
            }

            if (keyName === "error") {
              context.report({
                node: node.key,
                messageId: "errorKey",
              });
              return;
            }

            if (urlKeys.has(keyName) && !isSafeValueExpression(node.value, safeValueCallees)) {
              context.report({
                node: node.key,
                messageId: "urlKey",
                data: { key: keyName },
              });
              return;
            }

            if (
              sensitiveKeys.has(keyName) &&
              !isSafeValueExpression(node.value, safeValueCallees)
            ) {
              context.report({
                node: node.key,
                messageId: "sensitiveKey",
                data: { key: keyName },
              });
            }
          },
        };
      },
    },
    "no-error-string-in-logs": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow errorString() in logger context; use errorLogDetails() instead.",
        },
        schema: [],
        messages: {
          errorString:
            "Do not use errorString() in logger context. Use errorLogDetails() so messages are redacted consistently.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type !== "Identifier" ||
              node.callee.name !== "errorString" ||
              !getEnclosingLoggerCall(node)
            ) {
              return;
            }

            if (getSanitizeContextCall(node)) {
              return;
            }

            context.report({
              node: node.callee,
              messageId: "errorString",
            });
          },
        };
      },
    },
  };
}

/** @type {import('eslint').ESLint.Plugin} */
export const safeLoggingPlugin = {
  meta: {
    name: "@workspace/safe-logging",
    version: "0.0.0",
  },
  rules: createSafeLoggingRules(),
};

/**
 * @param {{
 *   omitKeys: readonly string[];
 *   hashKeys: readonly string[];
 *   urlKeys?: readonly string[];
 *   safeValueCallees?: readonly string[];
 * }} policy
 * @returns {import('eslint').ESLint.Plugin}
 */
export function createSafeLoggingPlugin(policy) {
  return {
    meta: safeLoggingPlugin.meta,
    rules: createSafeLoggingRules(policy),
  };
}
