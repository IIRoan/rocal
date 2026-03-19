import * as z from 'zod';

type ZodSchemaWithMeta = {
  meta?: (metadata?: unknown) => unknown;
};

function patchPrototype(target: unknown) {
  const prototype = target as ZodSchemaWithMeta | null | undefined;

  if (!prototype || typeof prototype.meta === 'function') {
    return;
  }

  prototype.meta = function meta() {
    return this;
  };
}

const stringSchemaPrototype = Object.getPrototypeOf(z.string());
patchPrototype(stringSchemaPrototype);
patchPrototype(Object.getPrototypeOf(stringSchemaPrototype));
