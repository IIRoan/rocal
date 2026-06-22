const ROUTE_HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "head",
  "options",
]);

const ROUTE_SCHEMA_KEYS = new Set(["body", "query", "params"]);

const DEFAULT_INTERNAL_SERVICES = new Set([
  "EventParticipantService",
  "MailCalendarIngestionService",
  "MailRealtimeService",
  "MailSyncService",
]);

/**
 * @param {import('estree').MemberExpression} node
 * @returns {boolean}
 */
function isRouteModelReference(node) {
  let current = node;

  while (current.type === "MemberExpression") {
    current = current.object;
  }

  return current.type === "Identifier" && current.name === "RouteModel";
}

/**
 * @param {import('estree').CallExpression} node
 * @returns {boolean}
 */
function isElysiaHttpRouteCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.property.type === "Identifier" &&
    ROUTE_HTTP_METHODS.has(node.callee.property.name)
  );
}

/**
 * @param {import('estree').CallExpression} node
 * @returns {import('estree').ObjectExpression | null}
 */
function getRouteOptionsObject(node) {
  if (!isElysiaHttpRouteCall(node) || node.arguments.length === 0) {
    return null;
  }

  const lastArgument = node.arguments[node.arguments.length - 1];
  return lastArgument.type === "ObjectExpression" ? lastArgument : null;
}

/**
 * @param {import('estree').Property} property
 * @returns {string | null}
 */
function getObjectPropertyKeyName(property) {
  if (property.type !== "Property" || property.key.type !== "Identifier") {
    return null;
  }

  return property.key.name;
}

/**
 * @param {string} filename
 * @returns {boolean}
 */
function isRouteFile(filename) {
  return /[/\\]routes[/\\]/.test(filename);
}

/**
 * @param {string} filename
 * @returns {boolean}
 */
function isServiceFile(filename) {
  return /[/\\]services[/\\]/.test(filename);
}

/**
 * @param {{
 *   internalServices?: readonly string[];
 * }} [options]
 */
export function createApiContractRules(options = {}) {
  const internalServices = new Set([
    ...DEFAULT_INTERNAL_SERVICES,
    ...(options.internalServices ?? []),
  ]);

  return {
    "use-route-model-schemas": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require Elysia route body/query/params schemas to reference RouteModel from contracts/.",
        },
        schema: [],
        messages: {
          inlineSchema:
            "Route {{key}} must use a RouteModel schema from contracts/ (e.g. body: RouteModel.events.createBody).",
        },
      },
      create(context) {
        if (!isRouteFile(context.filename)) {
          return {};
        }

        return {
          CallExpression(node) {
            const options = getRouteOptionsObject(node);
            if (!options) {
              return;
            }

            for (const property of options.properties) {
              if (property.type !== "Property") {
                continue;
              }

              const keyName = getObjectPropertyKeyName(property);
              if (!keyName || !ROUTE_SCHEMA_KEYS.has(keyName)) {
                continue;
              }

              if (!isRouteModelReference(property.value)) {
                context.report({
                  node: property.value,
                  messageId: "inlineSchema",
                  data: { key: keyName },
                });
              }
            }
          },
        };
      },
    },
    "require-route-models-plugin": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require route modules that validate requests to register routeModels from contracts/.",
        },
        schema: [],
        messages: {
          missingUse:
            "Route files that use RouteModel schemas must call .use(routeModels) on the Elysia app.",
          missingImport:
            "Route files that use RouteModel schemas must import routeModels from ../contracts.",
        },
      },
      create(context) {
        if (!isRouteFile(context.filename)) {
          return {};
        }

        let usesRouteModelSchema = false;
        let importsRouteModels = false;
        let usesRouteModelsPlugin = false;

        return {
          ImportDeclaration(node) {
            if (
              typeof node.source.value === "string" &&
              node.source.value.endsWith("/contracts") &&
              node.specifiers.some(
                (specifier) =>
                  specifier.type === "ImportSpecifier" &&
                  specifier.imported.type === "Identifier" &&
                  specifier.imported.name === "routeModels",
              )
            ) {
              importsRouteModels = true;
            }
          },
          CallExpression(node) {
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.type === "Identifier" &&
              node.callee.property.name === "use" &&
              node.arguments.length === 1 &&
              node.arguments[0].type === "Identifier" &&
              node.arguments[0].name === "routeModels"
            ) {
              usesRouteModelsPlugin = true;
            }

            const options = getRouteOptionsObject(node);
            if (!options) {
              return;
            }

            for (const property of options.properties) {
              const keyName = getObjectPropertyKeyName(property);
              if (
                keyName &&
                ROUTE_SCHEMA_KEYS.has(keyName) &&
                property.type === "Property" &&
                isRouteModelReference(property.value)
              ) {
                usesRouteModelSchema = true;
              }
            }
          },
          "Program:exit"() {
            if (!usesRouteModelSchema) {
              return;
            }

            if (!importsRouteModels) {
              context.report({
                loc: { line: 1, column: 0 },
                messageId: "missingImport",
              });
            }

            if (!usesRouteModelsPlugin) {
              context.report({
                loc: { line: 1, column: 0 },
                messageId: "missingUse",
              });
            }
          },
        };
      },
    },
    "require-service-contract": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require domain services to implement an I*Service interface from contracts/.",
        },
        schema: [
          {
            type: "object",
            properties: {
              internalServices: {
                type: "array",
                items: { type: "string" },
              },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          missingInterface:
            "Service {{name}} must implement an I*Service interface declared in contracts/.",
        },
      },
      create(context) {
        if (!isServiceFile(context.filename)) {
          return {};
        }

        return {
          ExportNamedDeclaration(node) {
            const declaration = node.declaration;
            if (declaration?.type !== "ClassDeclaration" || !declaration.id) {
              return;
            }

            const className = declaration.id.name;
            if (!className.endsWith("Service")) {
              return;
            }

            if (internalServices.has(className)) {
              return;
            }

            const implementsContract = declaration.implements?.some(
              (implemented) =>
                implemented.expression.type === "Identifier" &&
                /^I\w+Service$/.test(implemented.expression.name),
            );

            if (!implementsContract) {
              context.report({
                node: declaration.id,
                messageId: "missingInterface",
                data: { name: className },
              });
            }
          },
        };
      },
    },
  };
}

/** @type {import('eslint').ESLint.Plugin} */
export const apiContractPlugin = {
  meta: {
    name: "@workspace/api-contract",
    version: "0.0.0",
  },
  rules: createApiContractRules(),
};

/**
 * @param {{
 *   internalServices?: readonly string[];
 * }} [options]
 * @returns {import('eslint').ESLint.Plugin}
 */
export function createApiContractPlugin(options) {
  return {
    meta: apiContractPlugin.meta,
    rules: createApiContractRules(options),
  };
}
