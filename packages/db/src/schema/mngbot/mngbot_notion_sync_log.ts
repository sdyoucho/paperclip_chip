/**
 * packages/db/src/schema/mngbot/mngbot_notion_sync_log.ts
 *
 * 신규 테이블 (chip_bot에는 없던 개념).
 *
 * 목적: Postgres가 source of truth가 된 이후, "백업 수단으로 Notion에
 *       자동 업데이트"하기 위한 outbox(발행 큐) 테이블.
 *
 *       각 mngbot_* 테이블에 INSERT/UPDATE가 일어날 때마다 애플리케이션
 *       서비스 레이어(또는 추후 DB 트리거)가 이 테이블에 status='pending'
 *       행을 적재한다. 별도 프로세스로 동작하는 Notion 동기화 plugin
 *       (3단계에서 설계)이 이 테이블을 주기적으로 polling하거나
 *       Paperclip의 plugin event(ctx.events)로 받아 Notion에 반영한다.
 *
 * 이렇게 분리하는 이유:
 *   - Notion API rate limit/장애가 Paperclip 코어 트랜잭션에 영향 주지 않음
 *   - 동기화 실패 시 재시도 가능 (lastError/retryCount로 추적)
 *   - "Postgres 우선, Notion은 읽기용 백업"이라는 요구사항을 구조적으로 강제
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies.js";

export const MNGBOT_NOTION_ENTITY_TYPES = [
  "streamer",
  "broadcast_log",
  "schedule_item",
  "fixed_cost",
  "report",
  "learning_item",
] as const;
export type MngbotNotionEntityType =
  (typeof MNGBOT_NOTION_ENTITY_TYPES)[number];

export const MNGBOT_NOTION_SYNC_STATUSES = [
  "pending",
  "retry_pending",
  "synced",
  "failed",
] as const;
export type MngbotNotionSyncStatus =
  (typeof MNGBOT_NOTION_SYNC_STATUSES)[number];

export const mngbotNotionSyncLog = pgTable(
  "mngbot_notion_sync_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    // streamer | broadcast_log | schedule_item | fixed_cost | report | learning_item
    entityType: text("entity_type").notNull(),
    // 해당 mngbot_* 테이블의 PK (다형 참조이므로 FK 제약은 걸지 않음)
    entityId: uuid("entity_id").notNull(),

    // chip_bot 시절 .env 키 (NOTION_STREAMERS_DB 등)에 대응하는 논리 키.
    // 실제 Notion DB ID는 회사별/인스턴스별로 다르므로 plugin 설정에서 resolve.
    notionDatabaseKey: text("notion_database_key").notNull(),
    notionPageId: text("notion_page_id"),

    status: text("status").notNull().default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),

    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_notion_sync_log_company_idx").on(
      table.companyId,
    ),
    // plugin worker가 "이 회사의 미처리 동기화 항목"을 빠르게 polling하기 위한 인덱스
    statusPollIdx: index("mngbot_notion_sync_log_status_poll_idx").on(
      table.companyId,
      table.status,
    ),
    // 동일 엔티티에 대한 동기화 행 중복 적재 방지용 조회 인덱스
    entityIdx: index("mngbot_notion_sync_log_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  }),
);

export type MngbotNotionSyncLog = typeof mngbotNotionSyncLog.$inferSelect;
export type NewMngbotNotionSyncLog =
  typeof mngbotNotionSyncLog.$inferInsert;
