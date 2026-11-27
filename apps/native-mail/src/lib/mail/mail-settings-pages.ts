export const NEW_SIGNATURE_PAGE = "signature-new";
export const EDIT_SIGNATURE_PREFIX = "signature-edit:";
export const SIGNATURE_DEFAULTS_PREFIX = "signature-defaults:";
export const NEW_TEMPLATE_PAGE = "template-new";
export const EDIT_TEMPLATE_PREFIX = "template-edit:";

/** True for the in-drawer signature pages, which the account drawer hosts as custom pages. */
export function isMailSignaturePage(page: string): boolean {
  return (
    page === NEW_SIGNATURE_PAGE ||
    page.startsWith(EDIT_SIGNATURE_PREFIX) ||
    page.startsWith(SIGNATURE_DEFAULTS_PREFIX)
  );
}

/** True for the in-drawer template editor pages, which the account drawer hosts as custom pages. */
export function isMailTemplatePage(page: string): boolean {
  return page === NEW_TEMPLATE_PAGE || page.startsWith(EDIT_TEMPLATE_PREFIX);
}
