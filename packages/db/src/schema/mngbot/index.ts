/**
 * packages/db/src/schema/mngbot/index.ts
 * 매니봇(Cho's 매니지먼트 봇) 도메인 스키마 barrel export.
 *
 * 기존 packages/db/src/schema/index.ts에서 이 파일을 re-export하면
 * drizzle-kit이 마이그레이션 생성 시 자동으로 인식한다.
 */

export * from "./mngbot_streamers.js";
export * from "./mngbot_broadcast_logs.js";
export * from "./mngbot_schedule_items.js";
export * from "./mngbot_fixed_costs.js";
export * from "./mngbot_reports.js";
export * from "./mngbot_learning_items.js";
export * from "./mngbot_code_change_sessions.js";
export * from "./mngbot_notion_sync_log.js";
export * from "./mngbot_discord_links.js";
