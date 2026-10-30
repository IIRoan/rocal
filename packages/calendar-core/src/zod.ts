import { z } from "zod";

// The web CSP has no 'unsafe-eval', so Zod must not probe `new Function` for its JIT; the interpreter is as correct.
z.config({ jitless: true });

export { z };
