/**
 * core-fork/server/src/services/mngbot/routes.ts
 *
 * services/discord-adapter, services/mngbot-runtime가 호출하는 모든
 * `/api/mngbot/*`, `/api/companies/:id/cost-summary`, `/api/companies/:id/budget-policy`,
 * `/api/companies/:id/projects` 엔드포인트를 역산해서 정리한 "필요 API 목록"이다.
 *
 * ⚠️ 이 파일은 실제 Express 라우터 구현이 아니라 **요구사항 명세**다.
 *    실제 구현 시 Paperclip의 기존 라우팅 컨벤션(인증 미들웨어, 에러 핸들링
 *    패턴 등)을 그대로 따라야 하므로, server/src/routes/의 기존 파일 하나를
 *    참고해서 동일한 스타일로 작성할 것.
 *
 * 각 엔드포인트 옆에 "어느 클라이언트 파일이 호출하는지"를 적어둬서,
 * 구현 우선순위를 정하거나 빠진 게 없는지 대조할 수 있게 했다.
 */

export const REQUIRED_MNGBOT_ENDPOINTS = [
  // ── 스트리머 ──
  { method: "GET", path: "/api/mngbot/streamers", calledBy: "mngbot-runtime/mngbot-api-client.ts (streamerApi.list)" },
  { method: "POST", path: "/api/mngbot/streamers", calledBy: "mngbot-runtime/mngbot-api-client.ts (streamerApi.create)" },

  // ── 방송 로그 ──
  { method: "GET", path: "/api/mngbot/broadcast-logs", calledBy: "mngbot-runtime/mngbot-api-client.ts (broadcastLogApi.listRecent)" },

  // ── 스케줄 ──
  { method: "GET", path: "/api/mngbot/schedule-items", calledBy: "mngbot-runtime/mngbot-api-client.ts (scheduleApi.listThisWeek)" },
  { method: "POST", path: "/api/mngbot/schedule-items", calledBy: "scheduleApi.create" },
  { method: "PATCH", path: "/api/mngbot/schedule-items/:id", calledBy: "scheduleApi.update" },
  { method: "DELETE", path: "/api/mngbot/schedule-items/:id", calledBy: "scheduleApi.remove" },

  // ── 고정비 ──
  { method: "GET", path: "/api/mngbot/fixed-costs", calledBy: "fixedCostApi.list" },
  { method: "GET", path: "/api/mngbot/fixed-costs/total-monthly-krw", calledBy: "fixedCostApi.getTotalMonthlyKrw" },
  { method: "POST", path: "/api/mngbot/fixed-costs", calledBy: "fixedCostApi.create" },
  { method: "DELETE", path: "/api/mngbot/fixed-costs/by-name/:name", calledBy: "fixedCostApi.removeByName (원본 remove_cost(name)과 동일하게 name 기준)" },
  { method: "POST", path: "/api/mngbot/fixed-costs/by-name/:name/payments", calledBy: "fixedCostApi.markPaidByName (amount는 서버가 기존 레코드에서 조회, 원본 mark_paid(name)과 동일)" },

  // ── 리포트 ──
  { method: "POST", path: "/api/mngbot/reports", calledBy: "reportApi.save" },

  // ── 학습 항목 (거버넌스) ──
  { method: "POST", path: "/api/mngbot/learning-items", calledBy: "discord-adapter/paperclip-client.ts (createLearningItem)" },
  { method: "GET", path: "/api/mngbot/learning-items?issueId=", calledBy: "mngbot-runtime learningItemApi.getByIssueId" },
  { method: "PATCH", path: "/api/mngbot/learning-items/:id", calledBy: "learningItemApi.updateStatus" },

  // ── 코드 변경 세션 (거버넌스) ──
  { method: "POST", path: "/api/mngbot/code-change-sessions", calledBy: "discord-adapter/paperclip-client.ts (createCodeChangeSession)" },
  { method: "GET", path: "/api/mngbot/code-change-sessions?issueId=", calledBy: "mngbot-runtime codeSessionApi.getByIssueId" },
  { method: "PATCH", path: "/api/mngbot/code-change-sessions/:id", calledBy: "codeSessionApi.updateStatus" },

  // ── Discord 링크 매핑 ──
  { method: "POST", path: "/api/mngbot/discord-links", calledBy: "discord-adapter/discord-link-store.ts (recordDiscordLink)" },
  { method: "GET", path: "/api/mngbot/discord-links?status=pending", calledBy: "discord-link-store.ts (listPendingDiscordLinks)" },
  { method: "PATCH", path: "/api/mngbot/discord-links/:issueId", calledBy: "discord-link-store.ts (bumpSeenCommentCount)" },

  // ── 비용/예산 (코어 cost_events/budget_policies 위에 얇은 집계 레이어) ──
  { method: "GET", path: "/api/companies/:companyId/cost-summary?period=month", calledBy: "mngbot-runtime/cost-summary-client.ts (getMonthlyCostSummary)" },
  { method: "GET", path: "/api/companies/:companyId/budget-policy", calledBy: "cost-summary-client.ts (getBudgetPolicy)" },

  // ── Project (고아 작업 방지 패치) ──
  { method: "GET", path: "/api/companies/:companyId/projects?title=", calledBy: "discord-adapter/project-context.ts (ensureMngbotProject)" },
  { method: "POST", path: "/api/companies/:companyId/projects", calledBy: "project-context.ts (ensureMngbotProject)" },
] as const;
