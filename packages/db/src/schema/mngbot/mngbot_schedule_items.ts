/**
 * packages/db/src/schema/mngbot/mngbot_schedule_items.ts
 *
 * chip_bot 대체 대상: modules/schedule.py (Notion DB: NOTION_SCHEDULE_DB)
 *                     /schedule, /schedule_add, /schedule_edit, /schedule_remove
 *                     담당 에이전트: 스쵸(sochyo)
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";
import { agents } from "../agents.js";
import { mngbotStreamers } from "./mngbot_streamers.js";

export const mngbotScheduleItems = pgTable(
  "mngbot_schedule_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // 특정 스트리머 전용 일정이 아닐 수도 있으므로 nullable
    streamerId: uuid("streamer_id").references(() => mngbotStreamers.id, {
      onDelete: "set null",
    }),

    title: text("title").notNull(),
    description: text("description"),

    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),

    // 방송/회의/마감/기타 등 자유 분류 (chip_bot 원본은 단순 문자열)
    category: text("category"),

    // /schedule_add 등을 통해 등록한 주체. 스쵸가 자동 생성했는지,
    // Cho(board user)가 직접 등록했는지 구분하기 위해 agentId는 nullable.
    createdByAgentId: uuid("created_by_agent_id").references(
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
    companyIdx: index("mngbot_schedule_items_company_idx").on(
      table.companyId,
    ),
    companyStartIdx: index("mngbot_schedule_items_company_start_idx").on(
      table.companyId,
      table.startAt,
    ),
  }),
);

export type MngbotScheduleItem = typeof mngbotScheduleItems.$inferSelect;
export type NewMngbotScheduleItem = typeof mngbotScheduleItems.$inferInsert;
