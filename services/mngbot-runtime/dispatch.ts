/**
 * mngbot-runtime/dispatch.ts
 */

export interface WakePayload {
  agentSlug: string;
  agentId: string;
  runId: string;
  issueId: string;
}

import { runHaecho } from "./handlers/haecho";
import { runGihyo } from "./handlers/gihyo";
import { runInchyo } from "./handlers/inchyo";
import { runBunchyo } from "./handlers/bunchyo";
import { runSochyo } from "./handlers/sochyo";
import { runMochyo } from "./handlers/mochyo";
import { runGaechyo } from "./handlers/gaechyo";
import { runDichyo } from "./handlers/dichyo";

const HANDLERS: Record<string, (p: WakePayload) => Promise<void>> = {
  haecho: runHaecho,
  gihyo: runGihyo,
  inchyo: runInchyo,
  bunchyo: runBunchyo,
  sochyo: runSochyo,
  mochyo: runMochyo,
  gaechyo: runGaechyo,
  dichyo: runDichyo,
};

export async function dispatchWake(payload: WakePayload): Promise<void> {
  const handler = HANDLERS[payload.agentSlug];
  if (!handler) {
    throw new Error(`알 수 없는 agentSlug: ${payload.agentSlug}`);
  }
  await handler(payload);
}
