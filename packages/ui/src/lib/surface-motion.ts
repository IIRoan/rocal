const LAYOUT_TRANSFORM_CLASS_PATTERN = /(?:^|\s)-?translate-(?:x|y)-/;

export function getClassNames(node: HTMLElement) {
  return node.getAttribute("class") ?? "";
}

/** Dialogs and translate-positioned surfaces keep their placement transform, so their motion is opacity only. */
export function shouldPreserveTransformAnimation(
  node: HTMLElement,
  classNames = getClassNames(node),
) {
  if (node.getAttribute("data-slot") === "dialog-content") {
    return true;
  }

  return LAYOUT_TRANSFORM_CLASS_PATTERN.test(classNames);
}
