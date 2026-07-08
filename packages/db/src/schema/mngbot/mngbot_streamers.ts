/**
 * packages/db/src/schema/mngbot/mngbot_streamers.ts
 *
 * chip_bot 대체 대상: utils/notion_client.py → register_streamer / list_streamers / get_streamer
 *                     (Notion DB: NOTION_STREAMERS_DB)
 *
 * 매니지먼트 대상 스트리머의 마스터 레코드.
 * Paperclip 컨벤션: 모든 도메인 테이블은 company_id로 스코프되고,
 * 인덱스는 company_id를 선두로 둔다 (AGENTS.md / doc/SPEC-implementation.md 컨벤션).
 */

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";

export const mngbotStreamers = pgTable(
  "mngbot_streamers",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    // 플랫폼별 채널 URL (chip_bot: 치지직 URL / 유튜브 URL / SOOP URL)
    chzzkUrl: text("chzzk_url"),
    youtubeUrl: text("youtube_url"),
    soopUrl: text("soop_url"),

    active: boolean("active").notNull().default(true),

    // ── Notion 백업 미러 링크 (Postgres가 source of truth, Notion은 읽기용 백업) ──
    notionPageId: text("notion_page_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_streamers_company_idx").on(table.companyId),
    // 같은 회사 내 동일 이름 스트리머 중복 등록 방지
    // (chip_bot 원본엔 없었지만 /streamer_add 중복 방지를 위해 추가)
    companyNameUnique: uniqueIndex("mngbot_streamers_company_name_unique").on(
      table.companyId,
      table.name,
    ),
  }),
);

export type MngbotStreamer = typeof mngbotStreamers.$inferSelect;
export type NewMngbotStreamer = typeof mngbotStreamers.$inferInsert;
