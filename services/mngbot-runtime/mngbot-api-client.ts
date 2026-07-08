/**
 * mngbot-runtime/mngbot-api-client.ts
 *
 * mngbot_* 테이블(스트리머/스케줄/고정비/리포트/학습/코드세션) CRUD를 위한
 * 클라이언트. mngbot-runtime은 별도 프로세스이므로 Paperclip DB에 직접
 * 붙는 대신, 코어가 추가로 노출하는 `/api/mngbot/*` REST 엔드포인트를 사용한다
 * (Phase 3에서 정의한 capability "mngbot.read"/"mngbot.write_sync_status"와
 *  같은 맥락의 "추가 노출" — 단, 이건 plugin이 아니라 mngbot-runtime이라는
 *  1급 서비스를 위한 것이므로 더 넓은 CRUD 권한을 가진 전용 API 키 사용).
 *
 * ⚠️ 이 엔드포인트들은 아직 Paperclip 코어에 존재하지 않는다 — Phase 1
 *    스키마를 노출하는 얇은 컨트롤러 레이어를 코어 서버 쪽에 추가해야 한다.
 *    (server/src/routes/mngbot.ts 신설 — additive)
 */

const BASE = process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100";
const KEY = process.env.PAPERCLIP_AGENT_API_KEY!;

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/api/mngbot${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`mngbot API ${path} 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── 스케줄 ──────────────────────────────────────────────────────────
export const scheduleApi = {
  listThisWeek: (companyId: string) =>
    call(`/schedule-items?companyId=${companyId}&range=this_week`),
  create: (input: {
    companyId: string;
    title: string;
    startAt: string;
    description?: string;
    createdByAgentId?: string;
  }) => call(`/schedule-items`, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, patch: Record<string, unknown>) =>
    call(`/schedule-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => call(`/schedule-items/${id}`, { method: "DELETE" }),
};

// 다른 엔티티(streamers/fixedCosts/reports/learningItems/codeChangeSessions)도
// 동일 패턴으로 추가 — 분량상 이 zip에서는 schedule만 전체 구현.

export const codeSessionApi = {
  getByIssueId: (issueId: string) =>
    call(`/code-change-sessions?issueId=${issueId}`).then((rows) => rows[0] ?? null),
  updateStatus: (id: string, patch: Record<string, unknown>) =>
    call(`/code-change-sessions/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};

export const learningItemApi = {
  getByIssueId: (issueId: string) =>
    call(`/learning-items?issueId=${issueId}`).then((rows) => rows[0] ?? null),
  updateStatus: (id: string, patch: Record<string, unknown>) =>
    call(`/learning-items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};

// ── 스트리머 ────────────────────────────────────────────────────────
export const streamerApi = {
  list: (companyId: string) => call(`/streamers?companyId=${companyId}`),
  create: (input: { companyId: string; name: string; chzzkUrl?: string; youtubeUrl?: string; soopUrl?: string }) =>
    call(`/streamers`, { method: "POST", body: JSON.stringify(input) }),
};

// ── 방송 로그 (모쵸가 적재, 분쵸/인쵸가 조회) ────────────────────────
export const broadcastLogApi = {
  listRecent: (companyId: string, streamerId: string, days: number) =>
    call(`/broadcast-logs?companyId=${companyId}&streamerId=${streamerId}&days=${days}`),
};

// ── 고정비 (인쵸) ───────────────────────────────────────────────────
// ⚠️ 원본 modules/fixed_costs.py의 remove_cost(name)/mark_paid(name)은
//    둘 다 "서비스 이름"으로 동작했다(id 아님). mark_paid는 amount를 따로
//    받지 않고 그 비용 레코드에 이미 저장된 amount_krw를 그대로 사용한다.
//    여기서도 동일하게 name 기준 + amount 자동 조회로 맞췄다.
export const fixedCostApi = {
  list: (companyId: string) => call(`/fixed-costs?companyId=${companyId}`),
  getTotalMonthlyKrw: (companyId: string) =>
    call(`/fixed-costs/total-monthly-krw?companyId=${companyId}`).then((r) => r.total as number),
  create: (input: { companyId: string; name: string; amountKrw: number; payDay: number }) =>
    call(`/fixed-costs`, { method: "POST", body: JSON.stringify(input) }),
  removeByName: (companyId: string, name: string) =>
    call(`/fixed-costs/by-name/${encodeURIComponent(name)}?companyId=${companyId}`, { method: "DELETE" }),
  markPaidByName: (companyId: string, name: string, recordedByAgentId?: string) =>
    call(`/fixed-costs/by-name/${encodeURIComponent(name)}/payments`, {
      method: "POST",
      body: JSON.stringify({
        companyId,
        paidAt: new Date().toISOString().slice(0, 10),
        recordedByAgentId,
      }),
    }),
  // ⚠️ 원본 fixed_costs.py의 sync_from_notion()(Notion→로컬 동기화)은
  //    Phase 3에서 "Postgres가 source of truth, Notion은 단방향 백업"으로
  //    결정하면서 의도적으로 포팅하지 않음(반대 방향 동기화는 설계 위반).
};

// ── 리포트 (분쵸) ───────────────────────────────────────────────────
export const reportApi = {
  save: (input: { companyId: string; streamerId?: string; period: string; contentMarkdown: string; generatedByAgentId: string; costUsd: number }) =>
    call(`/reports`, { method: "POST", body: JSON.stringify(input) }),
};
