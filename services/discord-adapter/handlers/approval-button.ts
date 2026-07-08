/**
 * discord-adapter/handlers/approval-button.ts
 *
 * activity-listener가 게시하는 "계획 승인 대기" / "코드 승인 대기" /
 * "학습 승인 대기" persona webhook 메시지에 붙는 버튼의 클릭 핸들러.
 * customId 형식: "mngbot:approve:<issueId>:<stageKey>" / "mngbot:revise:<issueId>:<stageKey>"
 *
 * 원본 bot/code_approval_view.py의 Discord UI 버튼 승인 UX를 그대로 재현 —
 * Cho가 슬래시 커맨드를 칠 필요 없이 버튼 클릭만으로 승인.
 */

import type { ButtonInteraction } from "discord.js";
import { transitionStage } from "../paperclip-client";

export async function handleApprovalButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const [, action, issueId, stageKey] = interaction.customId.split(":");
  // action: "approve" | "revise"

  if (action === "approve") {
    // Phase 4 가드: 일부 stage는 commentRequired=true → 버튼 클릭만으로는
    // 코멘트가 없으므로, 모달(discord.js ModalBuilder)을 띄워 코멘트를 받는
    // 추가 스텝이 필요할 수 있다. 여기서는 버튼에 기본 코멘트를 동반하는
    // 단순 버전으로 시작하고, commentRequired=true인 stage는 모달로 확장 권장.
    await transitionStage(
      issueId,
      "done",
      `Discord 버튼 승인 (by ${interaction.user.username})`,
    );
    await interaction.update({
      content: `✅ ${interaction.user.username}님이 승인했습니다 (${stageKey}).`,
      components: [],
    });
    return;
  }

  if (action === "revise") {
    await transitionStage(
      issueId,
      "revision_requested",
      `Discord 버튼 재작업 요청 (by ${interaction.user.username})`,
    );
    await interaction.update({
      content: `🔁 ${interaction.user.username}님이 재작업을 요청했습니다 (${stageKey}).`,
      components: [],
    });
    return;
  }
}
