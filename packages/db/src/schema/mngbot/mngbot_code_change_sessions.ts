/**
 * packages/db/src/schema/mngbot/mngbot_code_change_sessions.ts
 *
 * chip_bot 대체 대상: modules/code_planner.py (_PLAN_SESSIONS, in-memory dict!)
 *                     + modules/code_modifier.py + utils/github_client.py
 *                     /code_propose 2단계 승인 UI (bot/code_planning_view.py, code_approval_view.py)
 *                     담당 에이전트: 개쵸(gaechyo)
 *
 * ⚠️ 중요: chip_bot 원본은 세션을 메모리(dict)에만 저장했다 — 재부팅 시 전부 소실.
 *          Postgres 이전은 단순 마이그레이션이 아니라 실제 영속성 버그 픽스다.
 *
 * status 흐름 (원본 그대로 유지):
 *   plan_pending → plan_approved → generating → code_pending
 *     → code_approved → applying → applied
 *   각 단계에서 "rejected" 또는 "failed"로 이탈 가능.
 *
 * ⚠️ 거버넌스 단계 연결 포인트:
 *   plan_pending→plan_approved, code_pending→code_approved 전환은
 *   Paperclip의 Approval(board approval gate)로 연결 권장.
 *   여기서는 데이터 모델만 정의하고 approvalId는 nullable로 열어둔다.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";
import { agents } from "../agents.js";
import { issues } from "../issues.js"; // ⚠️ 실제 export 경로/컬럼명 확인 필요 (Phase 4 GOVERNANCE.md 참고)

export const MNGBOT_CODE_SESSION_STATUSES = [
  "plan_pending",
  "plan_approved",
  "generating",
  "code_pending",
  "code_approved",
  "applying",
  "applied",
  "rejected",
  "failed",
] as const;
export type MngbotCodeSessionStatus =
  (typeof MNGBOT_CODE_SESSION_STATUSES)[number];

export const mngbotCodeChangeSessions = pgTable(
  "mngbot_code_change_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // Phase 4(거버넌스)에서 확정: Issue.executionPolicy의 2-stage 승인 게이트로
    // 이 세션의 plan_approval / code_approval을 표현한다 (GOVERNANCE.md 참고).
    // approvalId는 별도 Approvals 엔티티를 쓰지 않기로 결정해 제거하지 않고
    // "혹시 board-level Approval로도 동시에 노출하고 싶을 때"를 위해 nullable로 남김.
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    approvalId: uuid("approval_id"),

    userRequest: text("user_request").notNull(),
    enrichedRequest: text("enriched_request"),
    requester: text("requester").notNull().default("Cho"),

    status: text("status").notNull().default("plan_pending"),

    // intent 분석 결과 (intent/scope/risk/target_agent/reasoning 등)
    intent: jsonb("intent").$type<Record<string, unknown>>(),

    // 코드베이스 스캔 요약 (total_files, focused_paths)
    codebaseSummary: jsonb("codebase_summary").$type<{
      totalFiles?: number;
      focusedPaths?: string[];
    }>(),

    // 변경 계획 (plan_summary + files[])
    plan: jsonb("plan").$type<Record<string, unknown>>(),

    // Stage 5 결과 — 파일별 코드 생성 제안 (diff/내용)
    fileProposals: jsonb("file_proposals")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),

    githubRepo: text("github_repo"),
    githubBranch: text("github_branch"),
    githubPrUrl: text("github_pr_url"),

    // 참고용 비정규화 비용 (source of truth: cost_events)
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 5 })
      .notNull()
      .default("0"),

    errorMessage: text("error_message"),

    // 개쵸(gaechyo)
    createdByAgentId: uuid("created_by_agent_id").references(
      () => agents.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_code_change_sessions_company_idx").on(
      table.companyId,
    ),
    companyStatusIdx: index(
      "mngbot_code_change_sessions_company_status_idx",
    ).on(table.companyId, table.status),
  }),
);

export type MngbotCodeChangeSession =
  typeof mngbotCodeChangeSessions.$inferSelect;
export type NewMngbotCodeChangeSession =
  typeof mngbotCodeChangeSessions.$inferInsert;
