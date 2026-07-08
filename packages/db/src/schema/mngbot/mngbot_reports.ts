/**
 * packages/db/src/schema/mngbot/mngbot_reports.ts
 *
 * chip_bot 대체 대상: modules/weekly_report.py + utils/notion_client.py → save_report
 *                     (Notion DB: NOTION_REPORT_DB)
 *                     /report 커맨드, 매주 자동 발송 스케줄러
 *                     담당 에이전트: 분쵸(bunchyo)
 *
 * 비용(costUsd)은 참고용 비정규화 필드. 정확한 트랜잭션 단위 비용은
 * Paperclip 코어의 cost_events 테이블이 source of truth이며,
 * issueId로 cost_events ↔ mngbot_reports를 연결한다 (governance 단계에서 연결).
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
import { mngbotStreamers } from "./mngbot_streamers.js";

export const mngbotReports = pgTable(
  "mngbot_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    streamerId: uuid("streamer_id").references(() => mngbotStreamers.id, {
      onDelete: "set null",
    }),

    // 예: "2026-W25", "2026-06"
    period: text("period").notNull(),

    // weekly | monthly | competitor_analysis
    reportType: text("report_type").notNull().default("weekly"),

    contentMarkdown: text("content_markdown").notNull(),

    // 분쵸(bunchyo)
    generatedByAgentId: uuid("generated_by_agent_id").references(
      () => agents.id,
    ),

    // 참고용 비정규화 비용 — 정합성의 source of truth는 cost_events
    costUsd: numeric("cost_usd", { precision: 12, scale: 5 })
      .notNull()
      .default("0"),

    // 리포트 생성에 사용된 부가 메타 (예: 참고 URL, 키워드 등)
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    notionPageId: text("notion_page_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_reports_company_idx").on(table.companyId),
    streamerPeriodIdx: index("mngbot_reports_streamer_period_idx").on(
      table.streamerId,
      table.period,
    ),
  }),
);

export type MngbotReport = typeof mngbotReports.$inferSelect;
export type NewMngbotReport = typeof mngbotReports.$inferInsert;
