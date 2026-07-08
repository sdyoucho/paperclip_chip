/**
 * gihyo-stage-runner.ts
 *
 * ⚠️ STUB — 실제 로직은 chip_bot의 modules/gicho_learning.py
 *    (학습 실행: 소스 수집 → LLM 요약 → insights/applications 추출)를 포팅.
 */

// ⚠️ Phase 7 통합 수정: 위와 동일한 이유로 REST 응답 객체 타입을 느슨하게 사용
type MngbotLearningItem = Record<string, any>;

export async function runLearningExecution(
  item: MngbotLearningItem,
): Promise<void> {
  // TODO: gicho_learning.py 포팅
  // - item.sources 수집/요약 (OpenRouter 호출, Phase 2 adapterConfig 통해)
  // - 성공 시: status='completed', summary/insights/applications/completedAt 채움
  // - 실패 시: status='failed', errorMessage 채움
  // - 양쪽 다 issue를 done으로 전이 + 결과 코멘트 게시
  throw new Error("runLearningExecution: 미구현 (다음 단계에서 포팅)");
}
