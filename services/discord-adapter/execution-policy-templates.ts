/**
 * services/discord-adapter/execution-policy-templates.ts
 *
 * ⚠️ services/mngbot-runtime/governance/execution-policy-templates.ts와 내용이
 *    동일한 의도적 중복 파일이다. DB I/O가 없는 순수 상수/함수라 두 프로세스에
 *    각각 복제해 두는 게, 서비스 경계를 넘는 깨지기 쉬운 import보다 안전하다고
 *    판단했다 — 수정 시 두 파일을 같이 고쳐야 한다(INTEGRATION.md 참고).
 */


 * Issue.executionPolicy에 들어갈 JSON 템플릿. 실제 필드명/enum 값은
 * GOVERNANCE.md 1절에 적은 대로 "최선의 추정"이며, 이 파일 하나만 고치면
 * 실제 스키마에 맞출 수 있도록 다른 모든 코드는 이 템플릿 함수만 통해서
 * executionPolicy를 만든다(직접 JSON을 흩어 쓰지 않음).
 */

export type StageKind = "review" | "approval";

export interface ExecutionPolicyStage {
  key: string; // 우리 쪽에서 stage를 식별하기 위한 논리 키 (실제 스키마에 있는지 확인 필요)
  label: string;
  type: StageKind;
  commentRequired: boolean;
}

export interface ExecutionPolicy {
  stages: ExecutionPolicyStage[];
}

/**
 * 개쵸 `/code_propose` — 계획 승인 → 코드 승인, 2단계.
 * chip_bot 원본 bot/code_planning_view.py / code_approval_view.py 의
 * 2단계 승인 UI를 그대로 반영.
 */
export const CODE_CHANGE_EXECUTION_POLICY: ExecutionPolicy = {
  stages: [
    {
      key: "plan_approval",
      label: "계획 승인",
      type: "approval",
      commentRequired: true, // Cho가 승인 코멘트 없이 그냥 넘기는 것 방지
    },
    {
      key: "code_approval",
      label: "코드 승인",
      type: "approval",
      commentRequired: true,
    },
  ],
};

/**
 * 기쵸 `/gicho_learn` — 학습 승인, 1단계.
 * chip_bot 원본 modules/gicho_learning.py의 requested→approved 전이를 반영.
 */
export const LEARNING_EXECUTION_POLICY: ExecutionPolicy = {
  stages: [
    {
      key: "learning_approval",
      label: "학습 승인",
      type: "approval",
      commentRequired: false, // 원본은 승인에 코멘트를 요구하지 않았음 — 그대로 유지
    },
  ],
};

/**
 * 현재 issue가 어떤 stage에 멈춰있고, 그 stage가 승인됐는지 판별하는 헬퍼.
 * 실제 issue 객체 shape(특히 현재 stage/그 status를 어디서 읽는지)은
 * `issues` 테이블/API 응답을 직접 보고 맞춰야 함 — 아래는 추정 인터페이스.
 */
export interface IssueStageState {
  currentStageKey: string | null;
  stageStatus: "pending" | "in_review" | "done" | "revision_requested" | null;
}

export function isStageApproved(state: IssueStageState, stageKey: string): boolean {
  return state.currentStageKey === stageKey && state.stageStatus === "done";
}

export function isStageRevisionRequested(
  state: IssueStageState,
  stageKey: string,
): boolean {
  return (
    state.currentStageKey === stageKey &&
    state.stageStatus === "revision_requested"
  );
}
