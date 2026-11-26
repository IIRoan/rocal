const OPENPGP_DEBUG_PREFIX = "[OpenPGP.js debug]";

type ConsoleLevels = Pick<Console, "log" | "error">;

/** Development builds turn on OpenPGP.js debug output, which reports every anonymous-recipient packet this key cannot open and can echo message armor; drop only those lines. */
export function silenceOpenPgpDebugLogs(target: ConsoleLevels = console): void {
  for (const level of ["log", "error"] as const) {
    const forward = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      if (args[0] !== OPENPGP_DEBUG_PREFIX) forward(...args);
    };
  }
}
