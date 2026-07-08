/**
 * services/discord-adapter/handlers/governance-command.ts
 * /code_propose, /gicho_learn_add 처리.
 *
 * ⚠️ Phase 7 통합 수정: 원래는 core 쪽 governance-issue-service.ts(drizzle
 *    트랜잭션)를 직접 import했는데, discord-adapter는 별도 프로세스라 DB에
 *    붙을 수 없다. createIssue + createCodeChangeSession/createLearningItem
 *    (둘 다 REST) 두 번 호출로 대체했다 — paperclip-client.ts 주석 참고.
 */

import type { ChatInputCommandInteraction } from "discord.js";
import {
  createIssue,
  createCodeChangeSession,
  createLearningItem,
} from "../paperclip-client";
import { resolveAgentId, getCompanyIdForGuild } from "../company-context";
import { ensureMngbotProject } from "../project-context";
import { recordDiscordLink } from "../discord-link-store";
import { PERSONA_REGISTRY } from "../persona-registry";
import {
  CODE_CHANGE_EXECUTION_POLICY,
  LEARNING_EXECUTION_POLICY,
} from "../execution-policy-templates";

export async function handleGovernanceCommand(
  interaction: ChatInputCommandInteraction,
  agentSlug: "gaechyo" | "gihyo",
): Promise<void> {
  await interaction.deferReply();

  const companyId = await getCompanyIdForGuild(interaction.guildId!);
  const [agentId, projectId] = await Promise.all([
    resolveAgentId(companyId, agentSlug),
    ensureMngbotProject(companyId),
  ]);
  const requester = interaction.user.username;

  let issueId: string;

  if (agentSlug === "gaechyo") {
    const userRequest = interaction.options.getString("request", true);

    const issue = await createIssue({
      companyId,
      projectId,
      title: `[코드변경] ${userRequest.slice(0, 80)}`,
      assigneeAgentId: agentId,
      executionPolicy: CODE_CHANGE_EXECUTION_POLICY,
    });
    await createCodeChangeSession({
      companyId,
      issueId: issue.id,
      userRequest,
      requester,
      createdByAgentId: agentId,
    });
    issueId = issue.id;
  } else {
    const subject = interaction.options.getString("subject", true);
    const category = interaction.options.getString("category") ?? "기타";
    const sourcesRaw = interaction.options.getString("sources") ?? "";

    const issue = await createIssue({
      companyId,
      projectId,
      title: `[학습요청] ${subject}`,
      assigneeAgentId: agentId,
      executionPolicy: LEARNING_EXECUTION_POLICY,
    });
    await createLearningItem({
      companyId,
      issueId: issue.id,
      subject,
      category,
      sources: sourcesRaw.split(",").map((s) => s.trim()).filter(Boolean),
      requestedBy: requester,
      executedByAgentId: agentId,
    });
    issueId = issue.id;
  }

  await recordDiscordLink({
    companyId,
    issueId,
    discordGuildId: interaction.guildId!,
    discordChannelId: interaction.channelId,
    requestedByDiscordUserId: interaction.user.id,
  });

  const persona = PERSONA_REGISTRY[agentSlug];
  await interaction.editReply(
    `${persona?.displayName ?? agentSlug}가 검토를 시작했어요. 계획/결과가 나오면 ` +
      `이 채널에 승인 버튼과 함께 올릴게요. (issue: \`${issueId.slice(0, 8)}\`)`,
  );
}
