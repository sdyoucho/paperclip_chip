/**
 * discord-adapter/activity-listener.ts
 *
 * ⚠️ ADAPTER.md 3절의 미확정 항목: Paperclip 활동을 구독하는 공식 방법이
 *    무엇인지 확인 안 됨. 여기서는 가장 보수적인 "polling" 구현을 둔다 —
 *    실제로 webhook 구독 API가 있다면 이 polling 루프를 그 콜백으로 교체.
 *
 * 동작: mngbot_discord_links에 있는 issue들을 주기적으로 조회해서,
 *       코멘트 수가 늘었거나 status가 바뀌었으면 새 코멘트를 persona
 *       webhook으로 게시. issue가 stage 대기 상태(승인 필요)이면 버튼도 첨부.
 */

import { getIssue } from "./paperclip-client";
import { listPendingDiscordLinks, bumpSeenCommentCount } from "./discord-link-store";
import { speak } from "./persona-webhook";
import { PERSONA_REGISTRY } from "./persona-registry";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { Client, TextChannel } from "discord.js";

const POLL_INTERVAL_MS = 5_000;

function buildApprovalButtons(issueId: string, stageKey: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mngbot:approve:${issueId}:${stageKey}`)
      .setLabel("✅ 승인")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mngbot:revise:${issueId}:${stageKey}`)
      .setLabel("🔁 재작업 요청")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function startActivityListener(discordClient: Client): void {
  setInterval(async () => {
    try {
      const links = await listPendingDiscordLinks(); // status != done인 것들만
      for (const link of links) {
        const issue = await getIssue(link.issueId);
        const newComments = issue.comments.slice(
          Number(link.lastSeenCommentCount ?? 0),
        );
        if (newComments.length === 0 && issue.status !== "done") continue;

        const channel = (await discordClient.channels.fetch(
          link.discordChannelId,
        )) as TextChannel | null;
        if (!channel) continue;

        const agentSlug = issue.assigneeAgentSlug as string; // ⚠️ API 응답 shape 확인 필요
        const persona = PERSONA_REGISTRY[agentSlug];

        for (const comment of newComments) {
          const embed = new EmbedBuilder().setDescription(comment.body);
          const pendingStageKey = issue.currentStageKey; // ⚠️ 확인 필요 (Phase 4와 동일 가정)
          const components =
            issue.stageStatus === "pending" && pendingStageKey
              ? [buildApprovalButtons(issue.id, pendingStageKey)]
              : [];

          await speak(channel, persona, { embed, components });
        }

        await bumpSeenCommentCount(link.issueId, issue.comments.length);
      }
    } catch (err) {
      console.error("[activity-listener] polling 실패:", err);
    }
  }, POLL_INTERVAL_MS);
}
