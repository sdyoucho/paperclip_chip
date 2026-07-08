/**
 * discord-adapter/command-router.ts
 * 49개 커맨드 전체를 ADAPTER.md 1절 분류(A/B/C/D)에 따라 라우팅.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { handleInstantCommand } from "./handlers/instant-command";
import { handleGovernanceCommand } from "./handlers/governance-command";
import { handleConfigCommand } from "./handlers/config-command";
import { handleOpsCommand } from "./handlers/ops-command";

type CommandCategory = "instant" | "governance" | "config" | "ops";

interface CommandSpec {
  category: CommandCategory;
  agentSlug?: string; // instant/governance일 때 담당 agent
}

export const COMMAND_TABLE: Record<string, CommandSpec> = {
  // C. 즉시실행
  ask: { category: "instant", agentSlug: "haecho" },
  monitor: { category: "instant", agentSlug: "mochyo" },
  report: { category: "instant", agentSlug: "bunchyo" },
  youtube: { category: "instant", agentSlug: "bunchyo" },
  schedule: { category: "instant", agentSlug: "sochyo" },
  schedule_add: { category: "instant", agentSlug: "sochyo" },
  schedule_edit: { category: "instant", agentSlug: "sochyo" },
  schedule_remove: { category: "instant", agentSlug: "sochyo" },
  money: { category: "instant", agentSlug: "inchyo" },
  settlement: { category: "instant", agentSlug: "inchyo" },
  streamer_add: { category: "instant", agentSlug: "inchyo" },
  streamer_list: { category: "instant", agentSlug: "inchyo" },
  fixedcost_list: { category: "instant", agentSlug: "inchyo" },
  fixedcost_add: { category: "instant", agentSlug: "inchyo" },
  fixedcost_remove: { category: "instant", agentSlug: "inchyo" },
  fixedcost_paid: { category: "instant", agentSlug: "inchyo" },
  fixedcost_sync: { category: "instant", agentSlug: "inchyo" },
  rnd_health: { category: "instant", agentSlug: "gaechyo" },
  rnd_code_review: { category: "instant", agentSlug: "gaechyo" },
  rnd_diagnose: { category: "instant", agentSlug: "gaechyo" },
  rnd_design: { category: "instant", agentSlug: "dichyo" },
  rnd_errors: { category: "instant", agentSlug: "gaechyo" },
  rnd_announce: { category: "instant", agentSlug: "gaechyo" },
  code_sessions: { category: "instant", agentSlug: "gaechyo" },
  code_diagnose: { category: "instant", agentSlug: "gaechyo" },
  gicho_learn_status: { category: "instant", agentSlug: "gihyo" },

  // D. 거버넌스 (executionPolicy 적용)
  code_propose: { category: "governance", agentSlug: "gaechyo" },
  gicho_learn_add: { category: "governance", agentSlug: "gihyo" },
  // ⚠️ gicho_learn_approve는 D'(Discord 버튼)로 대체 권장 — 슬래시 커맨드에서 제거 검토.

  // A. 설정
  config_ai: { category: "config" },
  config_notion: { category: "config" },
  config_discord: { category: "config" },
  config_status: { category: "config" },
  rawdata: { category: "config" },
  rawdata_channel: { category: "config" },
  model_status: { category: "config" },
  model_set: { category: "config" },
  model_agent: { category: "config" },
  model_reset: { category: "config" },
  credit_settings: { category: "config" },
  credit_limit: { category: "config" },
  credit_thresholds: { category: "config" },
  rnd_channel: { category: "config" },
  forum_channel: { category: "config" },
  rnd_forum_channel: { category: "config" },

  // B. 봇 운영
  reboot: { category: "ops" },
  uptime: { category: "ops" },
  restart_schedule: { category: "ops" },
  help: { category: "ops" },
};

export async function routeCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const spec = COMMAND_TABLE[interaction.commandName];
  if (!spec) {
    await interaction.reply({
      content: `알 수 없는 명령어: /${interaction.commandName}`,
      ephemeral: true,
    });
    return;
  }

  switch (spec.category) {
    case "instant":
      return handleInstantCommand(interaction, spec.agentSlug!);
    case "governance":
      return handleGovernanceCommand(interaction, spec.agentSlug!);
    case "config":
      return handleConfigCommand(interaction);
    case "ops":
      return handleOpsCommand(interaction);
  }
}
