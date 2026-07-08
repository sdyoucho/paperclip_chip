/**
 * discord-adapter/handlers/instant-command.ts
 * C카테고리 공통 처리: Issue 생성(executionPolicy 없음) → mngbot_discord_links
 * 적재 → 즉시 "⏳ 처리 중" ack → 실제 결과는 activity-listener가 나중에 게시.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import { createIssue } from "../paperclip-client";
import { resolveAgentId, getCompanyIdForGuild } from "../company-context"; // ⚠️ 구현 필요 — 길드↔회사 매핑
import { ensureMngbotProject } from "../project-context"; // ⚠️ 패치: 고아 작업 방지
import { recordDiscordLink } from "../discord-link-store"; // ⚠️ 구현 필요 — mngbot_discord_links insert API 래퍼
import { PERSONA_REGISTRY } from "../persona-registry"; // ⚠️ Phase 2 agents.metadata 기반 구성

export async function handleInstantCommand(
  interaction: ChatInputCommandInteraction,
  agentSlug: string,
): Promise<void> {
  await interaction.deferReply(); // 3초 제한 회피, 이후 본문은 persona webhook으로

  const companyId = await getCompanyIdForGuild(interaction.guildId!);
  const [agentId, projectId] = await Promise.all([
    resolveAgentId(companyId, agentSlug),
    ensureMngbotProject(companyId),
  ]);

  // 슬래시 커맨드 옵션 전체를 그대로 issue title/메타데이터에 보존
  // (원본 모듈 함수 인자와 1:1 매핑되도록 — 실제 인자 추출은 명령어별로 다름)
  const optionsSummary = interaction.options.data
    .map((o) => `${o.name}=${o.value}`)
    .join(", ");

  const issue = await createIssue({
    companyId,
    projectId,
    title: `[/${interaction.commandName}] ${optionsSummary || "(인자 없음)"}`,
    assigneeAgentId: agentId,
    metadata: {
      discordCommand: interaction.commandName,
      discordOptions: interaction.options.data,
    },
  });

  await recordDiscordLink({
    companyId,
    issueId: issue.id,
    discordGuildId: interaction.guildId!,
    discordChannelId: interaction.channelId,
    requestedByDiscordUserId: interaction.user.id,
  });

  const persona = PERSONA_REGISTRY[agentSlug];
  await interaction.editReply(
    `${persona?.displayName ?? agentSlug}에게 전달했어요. 곧 이 채널에 결과를 올릴게요. (issue: \`${issue.id.slice(0, 8)}\`)`,
  );

  // 실제 결과 게시는 mngbot-runtime이 issue를 처리한 뒤 activity-listener가 감지해서
  // persona-webhook.ts로 같은 채널에 올린다 (ADAPTER.md 3절).
}
