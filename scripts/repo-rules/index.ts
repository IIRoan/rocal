import { backendRules } from "./backend";
import { clientRules } from "./client";
import { commentRules } from "./comments";
import type { Rule } from "./engine";
import { reactRules } from "./react";
import { repositoryRules } from "./repository";
import { typescriptRules } from "./typescript";
import { uiRules } from "./ui";

export const rules: Rule[] = [
  ...repositoryRules,
  ...commentRules,
  ...backendRules,
  ...clientRules,
  ...typescriptRules,
  ...reactRules,
  ...uiRules,
];
