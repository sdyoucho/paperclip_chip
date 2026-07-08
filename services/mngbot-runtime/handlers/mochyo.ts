/**
 * mngbot-runtime/handlers/mochyo.ts
 * modules/chzzk_monitor.py 전체 포팅.
 *
 * 원본 자체가 "R&D 보류 상태 플레이스홀더"임 — 실시간 모니터링은
 * 개쵸가 WebSocket 기반으로 재설계할 예정이라는 안내 메시지만 반환한다.
 * (즉, 이건 미완성 포팅이 아니라 원본과 100% 동일한 동작이다.)
 */
import { checkoutIssue, postIssueComment, updateIssueStatus, releaseIssue } from "../issue-client";
import type { WakePayload } from "../dispatch";

export async function runMochyo(payload: WakePayload): Promise<void> {
  const { runId, issueId } = payload;
  await checkoutIssue(runId, issueId);

  const message =
    "📡 **모쵸 — 방송 모니터링**\n\n" +
    "⚠️ 모쵸 모듈은 현재 R&D 보류 상태입니다.\n\n" +
    "개쵸(`/code_propose 모쵸 개선 방안`)를 통해 WebSocket 기반 " +
    "실시간 모니터링 시스템 개발이 진행될 예정입니다.\n\n" +
    "현재는 mngbot_broadcast_logs에 저장된 과거 데이터만 조회 가능합니다.\n\n" +
    "_재설계 예정 · 우선순위: 개쵸 작업 완료 후_";

  await postIssueComment(runId, issueId, message);
  await updateIssueStatus(runId, issueId, "done");
  await releaseIssue(runId, issueId);
}
