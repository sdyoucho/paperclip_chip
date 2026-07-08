/**
 * services/mngbot-runtime/governance/approval-followup-handler.ts
 *
 * mngbot-runtime 서비스가 heartbeat wake(http adapter 호출, Phase 2 설계)를
 * 받았을 때 가장 먼저 실행하는 로직. Paperclip SKILL.md의
 * "Step 2 — Approval follow-up (when triggered)" 패턴을 그대로 구현한다.
 *
 * ⚠️ 통합(Phase 7) 단계에서 수정한 부분: 원래 이 파일은 drizzle `db`를 직접
 *    import해서 mngbot_code_change_sessions/mngbot_learning_items를 직접
 *    읽고 썼다. 하지만 mngbot-runtime은 Paperclip 코어와 **별도 프로세스**로
 *    배포되는 서비스라 DB 커넥션을 직접 가질 수 없다(discord-adapter도 동일).
 *    → mngbot-api-client.ts(REST)를 통하도록 전부 교체했다.
 *    "core-fork 안의 코드만 drizzle db를 직접 만질 수 있다"는 규칙을 여기서부터
 *    지킨다 — INTEGRATION.md 참고.
 *
 * 흐름: 이 issue에 내가 만든 pending stage가 있었는가?
 *       → 승인됐으면 다음 단계로 진행
 *       → 수정요청(revision_requested)이면 이전 단계로 되돌아가 재작업
 *       → 아직 pending이면 할 일 없음 (release하고 대기)
 */

import { codeSessionApi, learningItemApi } from "../mngbot-api-client";
import {
  isStageApproved,
  isStageRevisionRequested,
  type IssueStageState,
} from "./execution-policy-templates";
import { runCodePlanningStage, runCodeGenerationStage, applyCodeChange } from "./gaechyo-stage-runner";
import { runLearningExecution } from "./gihyo-stage-runner";

// ─────────────────────────────────────────────────────────────────
// 개쵸: 코드 변경 세션 follow-up
// ─────────────────────────────────────────────────────────────────
export async function handleCodeChangeFollowUp(
  issueId: string,
  stageState: IssueStageState,
) {
  const session = await codeSessionApi.getByIssueId(issueId);
  if (!session) return; // 이 issue는 우리 도메인 세션이 아님

  const status = session.status as string;

  if (status === "plan_pending" && isStageApproved(stageState, "plan_approval")) {
    await codeSessionApi.updateStatus(session.id, { status: "generating" });
    await runCodeGenerationStage(session); // 코드 생성 + Stage 2로 issue 전이 + 코멘트 게시는 이 함수 내부에서
    await codeSessionApi.updateStatus(session.id, { status: "code_pending" });
    return;
  }

  if (status === "plan_pending" && isStageRevisionRequested(stageState, "plan_approval")) {
    // Cho가 "다시 계획해줘" — 같은 stage에서 재작업
    await runCodePlanningStage(session);
    return;
  }

  if (status === "code_pending" && isStageApproved(stageState, "code_approval")) {
    await codeSessionApi.updateStatus(session.id, { status: "applying" });
    try {
      const { prUrl } = await applyCodeChange(session);
      await codeSessionApi.updateStatus(session.id, { status: "applied", githubPrUrl: prUrl });
    } catch (err) {
      await codeSessionApi.updateStatus(session.id, {
        status: "failed",
        errorMessage: String((err as Error)?.message ?? err),
      });
    }
    return;
  }

  if (status === "code_pending" && isStageRevisionRequested(stageState, "code_approval")) {
    await codeSessionApi.updateStatus(session.id, { status: "generating" });
    await runCodeGenerationStage(session);
    await codeSessionApi.updateStatus(session.id, { status: "code_pending" });
    return;
  }

  // 그 외(아직 미승인 등) — 할 일 없음, 그대로 release
}

// ─────────────────────────────────────────────────────────────────
// 기쵸: 학습 요청 follow-up
// ─────────────────────────────────────────────────────────────────
export async function handleLearningFollowUp(
  issueId: string,
  stageState: IssueStageState,
) {
  const item = await learningItemApi.getByIssueId(issueId);
  if (!item) return;

  const status = item.status as string;

  if (status === "requested" && isStageApproved(stageState, "learning_approval")) {
    await learningItemApi.updateStatus(item.id, {
      status: "learning",
      approvedAt: new Date().toISOString(),
    });

    // 원본 gicho_learning.py의 학습 실행 로직 포팅분 호출
    // (성공 시 status='completed' + summary/insights/applications 채움,
    //  실패 시 status='failed' + errorMessage — 함수 내부에서 처리)
    await runLearningExecution(item);
    return;
  }

  // requested 상태에서 stage가 rejected로 끝난 경우 (Approval 자체를 거부)
  // ⚠️ "거부"가 revision_requested와 다른 별도 상태인지, 아니면 stage가 그냥
  //    영원히 pending으로 남는지는 실제 Approvals/Issue 거부 흐름을 확인해야 함.
  if (status === "requested" && stageState.stageStatus === "revision_requested") {
    await learningItemApi.updateStatus(item.id, { status: "rejected" });
  }
}
