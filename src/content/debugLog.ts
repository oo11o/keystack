import type { Stack } from "../core/schema";

export function logDebug(chord: string, stack: Stack, debug: boolean): void {
  if (debug) console.log(`[Keystack] ${chord} → "${stack.name}" (${stack.id})`);
}
