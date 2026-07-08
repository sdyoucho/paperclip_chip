/**
 * mngbot-runtime/handlers/gaechyo.ts
 * Phase 4 approval-followup-handler를 그대로 재사용 — 이 파일은
 * "최초 wake(아직 어떤 stage에도 안 들어간 신규 세션)" 케이스만 추가로 처리.
 */

import {
  checkoutIssue,
  getIssue,
  releaseIssue,
  extractStageState,
} from "../issue-client";
import type { WakePayload } from "../dispatch";
import { codeSessionApi } from "../mngbot-api-client";
import { handleCodeChangeFollowUp } from "../governance/approval-followup-handler"; // Phase 4 산출물
import { runCodePlanningStage } from "../governance/gaechyo-stage-runner"; // Phase 4 산출물(스텁)

export async function runGaechyo(payload: WakePayload): Promise<void> {
  const { runId, issueId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);
  const stageState = extractStageState(issue);

  const session = await codeSessionApi.getByIssueId(issueId);

  try {
    if (session && session.status === "plan_pending" && stageState.currentStageKey === null) {
      // 최초 wake — 아직 계획 단계 진입 전. 코드베이스 스캔 + 계획 생성 후
      // issue를 "plan_approval" stage로 전이(runCodePlanningStage 내부 책임).
      await runCodePlanningStage(session);
    } else {
      // 이후 wake(코멘트/승인 트리거) — Phase 4 follow-up 로직에 그대로 위임
      await handleCodeChangeFollowUp(issueId, stageState);
    }
  } finally {
    await releaseIssue(runId, issueId);
  }
}
