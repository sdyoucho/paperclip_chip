/**
 * gaechyo-stage-runner.ts
 *
 * ⚠️ STUB — 아직 구현 안 됨. 실제 로직은 chip_bot의
 *    modules/code_planner.py (계획 생성), modules/code_modifier.py
 *    (코드 생성), utils/github_client.py (PR 생성)를 TS로 포팅해서 채운다.
 *
 * 이 파일은 "다음 단계(Discord 어댑터 / mngbot-runtime 런타임 이식)"의
 * 작업 대상이며, 거버넌스 단계(Phase 4)에서는 호출 시점/시그니처만 확정한다.
 */

// ⚠️ Phase 7 통합 수정: mngbot-runtime은 별도 프로세스이므로 db 스키마 타입을
// 직접 import할 수 없다. mngbot-api-client.ts(codeSessionApi)가 반환하는 REST
// 응답 객체를 그대로 타입으로 쓴다(느슨한 타입 — 정확한 shape은 API 응답에 의존).
type MngbotCodeChangeSession = Record<string, any>;

export async function runCodePlanningStage(
  session: MngbotCodeChangeSession,
): Promise<void> {
  // TODO: code_planner.py 포팅
  // - 코드베이스 스캔(intent 분석 → 관련 파일 탐색)
  // - 변경 계획(plan) 생성 → session.plan에 저장
  // - 계획을 issue 코멘트로 게시 + Stage "plan_approval"로 issue 전이
  throw new Error("runCodePlanningStage: 미구현 (다음 단계에서 포팅)");
}

export async function runCodeGenerationStage(
  session: MngbotCodeChangeSession,
): Promise<void> {
  // TODO: code_modifier.py 포팅
  // - plan 기반으로 파일별 코드 변경 제안(diff) 생성 → fileProposals에 저장
  // - 제안을 issue 코멘트로 게시 + Stage "code_approval"로 issue 전이
  throw new Error("runCodeGenerationStage: 미구현 (다음 단계에서 포팅)");
}

export async function applyCodeChange(
  session: MngbotCodeChangeSession,
): Promise<{ prUrl: string }> {
  // TODO: utils/github_client.py 포팅
  // - 브랜치 생성 → fileProposals 커밋 → PR 생성 → prUrl 반환
  throw new Error("applyCodeChange: 미구현 (다음 단계에서 포팅)");
}
