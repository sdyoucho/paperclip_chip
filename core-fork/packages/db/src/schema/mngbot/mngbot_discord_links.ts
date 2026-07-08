/**
 * schema-addendum/mngbot_discord_links.ts
 *
 * Discord 슬래시 커맨드로 생성된 Issue가 "어느 채널/누가 요청했는지"를
 * 기억해서, activity-listener가 결과를 올바른 채널에 persona webhook으로
 * 게시할 수 있게 한다. (Discord interaction token은 15분 만료 → 이 매핑을
 * 통한 webhook 게시 방식이 기본.)
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "../companies";
import { issues } from "../issues"; // ⚠️ 경로 확인 필요

export const mngbotDiscordLinks = pgTable(
  "mngbot_discord_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),

    discordGuildId: text("discord_guild_id").notNull(),
    discordChannelId: text("discord_channel_id").notNull(),
    requestedByDiscordUserId: text("requested_by_discord_user_id").notNull(),

    // activity-listener가 마지막으로 본 코멘트 수 (중복 게시 방지용 커서)
    lastSeenCommentCount: text("last_seen_comment_count").default("0"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    issueUnique: uniqueIndex("mngbot_discord_links_issue_unique").on(
      table.issueId,
    ),
  }),
);

export type MngbotDiscordLink = typeof mngbotDiscordLinks.$inferSelect;
export type NewMngbotDiscordLink = typeof mngbotDiscordLinks.$inferInsert;
