/**
 * core-hooks/mngbot-host-service.ts
 *
 * MngbotHostService 계약(plugin/mngbot-host-service.contract.ts)의 코어 구현.
 * Paperclip 서버가 plugin worker에 capability "mngbot.read" /
 * "mngbot.write_sync_status"가 선언된 plugin에게만 이 객체를 ctx.mngbot로 주입.
 *
 * ⚠️ 실제 capability-gating 메커니즘(어디서 ctx에 주입하는지,
 *    plugin manifest의 capabilities 배열을 어떻게 검증하는지)은
 *    server/src/services/plugin-*.ts 소스를 직접 보고 맞춰야 한다.
 *    여기서는 "이 함수들이 존재해야 한다"는 구현 목표만 정의.
 */

import { eq, and, or, sql } from "drizzle-orm";
// ⚠️ INTEGRATION.md 참고: "@paperclipai/db"는 실제 워크스페이스 패키지명으로 교체 필요
import { db } from "@paperclipai/db/client";
import {
  mngbotNotionSyncLog,
  mngbotStreamers,
  mngbotBroadcastLogs,
  mngbotScheduleItems,
  mngbotFixedCosts,
  mngbotFixedCostPayments,
  mngbotReports,
  mngbotLearningItems,
} from "@paperclipai/db/schema/mngbot";
import type {
  MngbotHostService,
  MngbotEntityType,
  MngbotPendingSyncRow,
} from "./mngbot-host-service.contract";

const ENTITY_TABLE: Record<MngbotEntityType, any> = {
  streamer: mngbotStreamers,
  broadcast_log: mngbotBroadcastLogs,
  schedule_item: mngbotScheduleItems,
  fixed_cost: mngbotFixedCosts,
  report: mngbotReports,
  learning_item: mngbotLearningItems,
};

export const mngbotHostService: MngbotHostService = {
  async listPendingSyncs(companyId, limit) {
    const rows = await db
      .select()
      .from(mngbotNotionSyncLog)
      .where(
        and(
          eq(mngbotNotionSyncLog.companyId, companyId),
          or(
            eq(mngbotNotionSyncLog.status, "pending"),
            // 실패했지만 maxRetries 미만이라 재시도 대상인 행도 포함
            // (영구 실패는 core 쪽에서 status='failed'로 고정해 더 안 보임)
            eq(mngbotNotionSyncLog.status, "retry_pending"),
          ),
        ),
      )
      .limit(limit);

    return rows.map(
      (r): MngbotPendingSyncRow => ({
        syncLogId: r.id,
        companyId: r.companyId,
        entityType: r.entityType as MngbotEntityType,
        entityId: r.entityId,
        notionDatabaseKey: r.notionDatabaseKey,
        notionPageId: r.notionPageId,
        retryCount: r.retryCount,
      }),
    );
  },

  async getEntityForNotion(companyId, entityType, entityId) {
    const table = ENTITY_TABLE[entityType];
    const [row] = await db
      .select()
      .from(table)
      .where(and(eq(table.companyId, companyId), eq(table.id, entityId)))
      .limit(1);
    if (!row) return null;

    // 매퍼가 요구하는 조인 필드 채우기 (streamerName 등)
    if (entityType === "broadcast_log" || entityType === "report") {
      const [streamer] = row.streamerId
        ? await db
            .select({ name: mngbotStreamers.name })
            .from(mngbotStreamers)
            .where(eq(mngbotStreamers.id, row.streamerId))
            .limit(1)
        : [];
      return { ...row, streamerName: streamer?.name ?? "(미지정)" };
    }

    if (entityType === "fixed_cost") {
      const [lastPayment] = await db
        .select({ paidAt: mngbotFixedCostPayments.paidAt })
        .from(mngbotFixedCostPayments)
        .where(eq(mngbotFixedCostPayments.fixedCostId, row.id))
        .orderBy(mngbotFixedCostPayments.paidAt)
        .limit(1);
      return { ...row, lastPaidAt: lastPayment?.paidAt ?? null };
    }

    return row;
  },

  async markSynced(syncLogId, notionPageId) {
    await db.transaction(async (tx) => {
      const [logRow] = await tx
        .select()
        .from(mngbotNotionSyncLog)
        .where(eq(mngbotNotionSyncLog.id, syncLogId))
        .limit(1);
      if (!logRow) return;

      await tx
        .update(mngbotNotionSyncLog)
        .set({
          status: "synced",
          notionPageId,
          lastSyncedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(mngbotNotionSyncLog.id, syncLogId));

      const table = ENTITY_TABLE[logRow.entityType as MngbotEntityType];
      await tx
        .update(table)
        .set({ notionPageId })
        .where(eq(table.id, logRow.entityId));
    });
  },

  async markFailed(syncLogId, error, opts) {
    await db
      .update(mngbotNotionSyncLog)
      .set({
        status: opts.permanent ? "failed" : "retry_pending",
        lastError: error.slice(0, 2000),
        retryCount: sql`${mngbotNotionSyncLog.retryCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(mngbotNotionSyncLog.id, syncLogId));
  },
};
