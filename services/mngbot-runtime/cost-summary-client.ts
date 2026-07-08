/**
 * mngbot-runtime/cost-summary-client.ts
 *
 * 원본 utils/cost_tracker.py(get_monthly_total/get_by_agent/get_by_model/
 * get_daily_series/project_next_month)와 utils/credit_config.py(월 한도/임계치)
 * 를 대체. Paperclip 코어의 cost_events/budget_policies가 이미 이 데이터를
 * 갖고 있으므로 새 테이블 없이 조회 API만 사용한다(Phase 1 원칙).
 *
 * ⚠️ 검증 필요: 아래 엔드포인트 경로/응답 shape은 "이런 집계 기능이 코어에
 *    있어야 한다"는 요구사항 기반 추정이다. 실제 cost_events 조회/집계
 *    API의 정확한 스펙은 server/src/routes/cost-events.ts(또는 동급 파일)
 *    를 확인 후 맞출 것. 코어에 집계 엔드포인트가 없다면, 원시 cost_events를
 *    받아 이 파일 안에서 직접 합산하는 방식으로 바꿔야 한다.
 *
 * ⚠️ 권장: check_thresholds()/_send_threshold_alert()(원본, 50/70/100% DM 알림)는
 *    포팅하지 않았다. Paperclip의 Budget Policy가 "budget hard-stops"를
 *    이미 코어 기능으로 제공하므로(거버넌스 문서), 직접 재구현 대신
 *    Paperclip UI에서 budget policy를 설정하는 것을 권장한다.
 *    월말정산(monthly_settlement)의 자동 발송도 커스텀 스케줄러 대신
 *    Paperclip의 "Routines & Schedules"(cron 트리거 → issue 생성)로 구성.
 */

const BASE = process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100";
const KEY = process.env.PAPERCLIP_AGENT_API_KEY!;

async function call(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`cost API ${path} 실패: ${res.status}`);
  return res.json();
}

export interface MonthlyCostSummary {
  monthTotalUsd: number;
  byAgent: Record<string, number>; // agentSlug → USD
  byModel: Record<string, number>; // model → USD
  dailySeries: { date: string; costUsd: number }[];
  projectedNextMonthUsd: number;
}

export async function getMonthlyCostSummary(
  companyId: string,
): Promise<MonthlyCostSummary> {
  // 추정 엔드포인트 — 실제로는 /api/companies/:id/cost-events에 집계
  // 쿼리 파라미터(groupBy=agent 등)를 붙이는 형태일 수도 있음.
  return call(`/api/companies/${companyId}/cost-summary?period=month`);
}

export interface BudgetPolicySummary {
  monthlyLimitUsd: number;
  thresholds: number[]; // [0.5, 0.7, 1.0] 등
}

export async function getBudgetPolicy(
  companyId: string,
): Promise<BudgetPolicySummary> {
  return call(`/api/companies/${companyId}/budget-policy`);
}

export async function getRemainingOpenRouterCredits() {
  // 원본 get_remaining_credits()는 OpenRouter API를 직접 호출 — 이건
  // openrouter-client.ts의 getRemainingCredits()를 그대로 재사용하면 된다.
  const { getRemainingCredits } = await import("./openrouter-client");
  return getRemainingCredits();
}
