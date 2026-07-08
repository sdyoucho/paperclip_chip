/**
 * mngbot-runtime/handlers/gihyo.ts
 * /gicho_learn_add는 생성 시점에 이미 1-stage executionPolicy를 달고 시작하므로
 * (governance-issue-service.ts), gihyo는 별도 "킥오프" 없이 승인 후
 * follow-up만 처리하면 된다. 그 외 instant 커맨드(gicho_learn_status)도 같은
 * wake 엔드포인트로 들어오므로 분기.
 */

import {
  checkoutIssue,
  getIssue,
  postIssueComment,
  updateIssueStatus,
  releaseIssue,
  extractStageState,
} from "../issue-client";
import type { WakePayload } from "../dispatch";
import { learningItemApi } from "../mngbot-api-client";
import { handleLearningFollowUp } from "../governance/approval-followup-handler"; // Phase 4

export async function runGihyo(payload: WakePayload): Promise<void> {
  const { runId, issueId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);

  try {
    if (issue.metadata?.discordCommand === "gicho_learn_status") {
      const item = await learningItemApi.getByIssueId(issueId).catch(() => null);
      // gicho_learn_status는 보통 issueId 없이 "최근 학습 목록 조회"이므로
      // 실제로는 companyId 기준 목록 API가 필요 — 여기선 자리만 표시.
      await postIssueComment(
        runId,
        issueId,
        item ? `상태: ${item.status}` : "학습 항목 목록 조회 (구현 필요: learningItemApi.list)",
      );
      await updateIssueStatus(runId, issueId, "done");
      return;
    }

    // governance follow-up (학습 승인 이후)
    const stageState = extractStageState(issue);
    await handleLearningFollowUp(issueId, stageState);
  } finally {
    await releaseIssue(runId, issueId);
  }
}
