/**
 * packages/db/src/schema/mngbot/mngbot_learning_items.ts
 *
 * chip_bot 대체 대상: modules/gicho_learning.py + utils/notion_client.py
 *                     (Notion DB: NOTION_GICHO_LEARNING_DB)
 *                     /gicho_learn_add, /gicho_learn_approve, /gicho_learn_status
 *                     담당 에이전트: 기쵸(gihyo)
 *
 * status 흐름: requested → approved → learning → completed
 *                                  ↘ rejected      ↘ failed
 *
 * ⚠️ 거버넌스 단계 연결 포인트:
 *   "approved" 전환은 원래 Cho(인간)의 수동 승인이었다. Paperclip으로 옮기면
 *   이 전환을 Paperclip의 Approval(board approval) 흐름에 연결해
 *   approval_comments / approvals 테이블과 연동하는 것을 권장한다.
 *   (지금 단계에서는 데이터 모델만 정의하고, 실제 승인 라우팅은 거버넌스 phase에서 처리)
 */

import {
  pgTable,
  uuid,
  text,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";
import { agents } from "../agents.js";
import { issues } from "../issues.js"; // ⚠️ 실제 export 경로 확인 필요 (Phase 4 GOVERNANCE.md 참고)

export const MNGBOT_LEARNING_STATUSES = [
  "requested",
  "approved",
  "learning",
  "completed",
  "rejected",
  "failed",
] as const;
export type MngbotLearningStatus =
  (typeof MNGBOT_LEARNING_STATUSES)[number];

export const mngbotLearningItems = pgTable(
  "mngbot_learning_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // Phase 4(거버넌스)에서 추가: 학습 승인(1-stage)을 Issue.executionPolicy로 표현.
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),

    subject: text("subject").notNull(),
    category: text("category").notNull().default("기타"),

    // text로 두되 애플리케이션 레벨에서 MngbotLearningStatus로 제약
    // (Drizzle pgEnum 대신 text+constants 채택: 상태값 추가/변경 시
    //  마이그레이션 없이 애플리케이션 레이어에서 빠르게 대응 가능)
    status: text("status").notNull().default("requested"),

    sources: jsonb("sources").$type<string[]>().notNull().default([]),

    // 요청자 표시명 (chip_bot 기본값: "Cho"). 추후 board user 테이블과
    // 연결할 수 있으나, 현재는 자유 텍스트로 유지.
    requestedBy: text("requested_by").notNull().default("Cho"),

    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    summary: text("summary"),
    insights: jsonb("insights").$type<string[]>().notNull().default([]),
    applications: jsonb("applications")
      .$type<string[]>()
      .notNull()
      .default([]),

    // 참고용 비정규화 비용 (source of truth: cost_events)
    costUsd: numeric("cost_usd", { precision: 12, scale: 5 })
      .notNull()
      .default("0"),

    errorMessage: text("error_message"),

    // 실행을 담당한 agent (기쵸 = gihyo)
    executedByAgentId: uuid("executed_by_agent_id").references(
      () => agents.id,
    ),

    notionPageId: text("notion_page_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_learning_items_company_idx").on(
      table.companyId,
    ),
    companyStatusIdx: index("mngbot_learning_items_company_status_idx").on(
      table.companyId,
      table.status,
    ),
  }),
);

export type MngbotLearningItem = typeof mngbotLearningItems.$inferSelect;
export type NewMngbotLearningItem = typeof mngbotLearningItems.$inferInsert;
