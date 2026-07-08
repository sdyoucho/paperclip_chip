/**
 * packages/db/src/schema/mngbot/mngbot_broadcast_logs.ts
 *
 * chip_bot 대체 대상: utils/notion_client.py → save_broadcast_log / get_broadcast_logs
 *                     (Notion DB: NOTION_BROADCAST_LOG_DB)
 *                     모쵸(mochyo)의 chzzk_monitor.py 결과가 누적되는 곳.
 *
 * 방송 1회(또는 일자별 스냅샷)당 1행. 분쵸(weekly_report)가 이 테이블을 읽어
 * 주간 리포트를 생성한다.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  jsonb,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";
import { agents } from "../agents.js";
import { mngbotStreamers } from "./mngbot_streamers.js";

export const mngbotBroadcastLogs = pgTable(
  "mngbot_broadcast_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    streamerId: uuid("streamer_id")
      .notNull()
      .references(() => mngbotStreamers.id, { onDelete: "cascade" }),

    // chzzk | youtube | soop | twitch
    platform: text("platform").notNull(),

    logDate: date("log_date").notNull(),

    viewersPeak: integer("viewers_peak").notNull().default(0),
    viewersAvg: integer("viewers_avg").notNull().default(0),
    chatCount: integer("chat_count").notNull().default(0),

    // 0.00 ~ 100.00 (%)
    sentimentPositivePct: numeric("sentiment_positive_pct", {
      precision: 5,
      scale: 2,
    }),

    // chip_bot: keywords: list[str] (최대 5개) → multi_select
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),

    summary: text("summary"),

    // 이 로그를 생성한 agent (모쵸 = mochyo)
    generatedByAgentId: uuid("generated_by_agent_id").references(
      () => agents.id,
    ),

    notionPageId: text("notion_page_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_broadcast_logs_company_idx").on(
      table.companyId,
    ),
    streamerDateIdx: index("mngbot_broadcast_logs_streamer_date_idx").on(
      table.streamerId,
      table.logDate,
    ),
  }),
);

export type MngbotBroadcastLog = typeof mngbotBroadcastLogs.$inferSelect;
export type NewMngbotBroadcastLog = typeof mngbotBroadcastLogs.$inferInsert;
