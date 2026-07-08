/**
 * packages/db/src/schema/mngbot/mngbot_fixed_costs.ts
 *
 * chip_bot 대체 대상: modules/fixed_costs.py + utils/notion_client.py
 *                     (로컬 JSON 폴백 + Notion DB 단방향 동기화 → 이제 Postgres가 단일 진실)
 *                     /fixedcost_list, /fixedcost_add, /fixedcost_remove, /fixedcost_paid
 *                     담당 에이전트: 인쵸(inchyo)
 *
 * 원본은 "마지막 납부일" 1개 필드만 가졌으나, 감사 추적을 위해
 * mngbot_fixed_cost_payments 테이블로 납부 이력을 별도 분리했다 (append-only).
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "../companies";
import { agents } from "../agents";

export const mngbotFixedCosts = pgTable(
  "mngbot_fixed_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    // KRW는 소수 단위가 없으므로 정수로 저장 (원 단위)
    amountKrw: integer("amount_krw").notNull(),

    // 매월 납부일 (1~31)
    payDay: integer("pay_day").notNull(),

    active: boolean("active").notNull().default(true),

    notionPageId: text("notion_page_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_fixed_costs_company_idx").on(table.companyId),
  }),
);

export type MngbotFixedCost = typeof mngbotFixedCosts.$inferSelect;
export type NewMngbotFixedCost = typeof mngbotFixedCosts.$inferInsert;

// ───────────────────────────────────────────────────────────────────
// 납부 이력 (append-only) — chip_bot의 "마지막 납부일" 단일 필드를
// 감사 가능한 이력으로 확장
// ───────────────────────────────────────────────────────────────────
export const mngbotFixedCostPayments = pgTable(
  "mngbot_fixed_cost_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),

    fixedCostId: uuid("fixed_cost_id")
      .notNull()
      .references(() => mngbotFixedCosts.id, { onDelete: "cascade" }),

    paidAt: date("paid_at").notNull(),
    amountKrw: integer("amount_krw").notNull(),

    // /fixedcost_paid 를 호출/승인한 agent (보통 인쵸, 또는 board user 직접 처리 시 null)
    recordedByAgentId: uuid("recorded_by_agent_id").references(
      () => agents.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("mngbot_fixed_cost_payments_company_idx").on(
      table.companyId,
    ),
    fixedCostIdx: index("mngbot_fixed_cost_payments_fixed_cost_idx").on(
      table.fixedCostId,
    ),
  }),
);

export type MngbotFixedCostPayment =
  typeof mngbotFixedCostPayments.$inferSelect;
export type NewMngbotFixedCostPayment =
  typeof mngbotFixedCostPayments.$inferInsert;
