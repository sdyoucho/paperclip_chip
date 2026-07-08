/**
 * core-fork/server/src/services/mngbot/enqueue-notion-sync.ts
 * (구 core-hooks/enqueue-notion-sync.ts — 통합 디렉토리 구조로 이동, import 경로 수정됨)
 *
 * mngbot_* 엔티티를 생성/수정하는 모든 core 서비스 함수가 트랜잭션 마지막에
 * 이 헬퍼를 호출해서 mngbot_notion_sync_log에 pending 행을 적재한다.
 *
 * 사용 예 (스트리머 생성 서비스 내부):
 *
 *   const [streamer] = await db.insert(mngbotStreamers).values({...}).returning();
 *   await enqueueNotionSync(db, {
 *     companyId: streamer.companyId,
 *     entityType: "streamer",
 *     entityId: streamer.id,
 *     notionDatabaseKey: "STREAMERS",
 *   });
 *
 * ⚠️ 같은 트랜잭션 안에서 호출해야 한다(엔티티 insert/update와 outbox 적재가
 *    원자적으로 묶이도록). drizzle transaction 콜백 내부에서 db 인자로
 *    트랜잭션 핸들을 그대로 전달.
 */

// ⚠️ INTEGRATION.md 참고: "@paperclipai/db"는 실제 워크스페이스 패키지명으로
//    교체 필요 — server/ 안의 다른 파일이 packages/db를 어떻게 import하는지
//    확인 후 맞출 것 (예: import { x } from "../../db" 형태일 수도 있음).
import { mngbotNotionSyncLog } from "@paperclipai/db/schema/mngbot/mngbot_notion_sync_log";
import type { MngbotEntityType } from "./mngbot-host-service.contract";

export interface EnqueueNotionSyncInput {
  companyId: string;
  entityType: MngbotEntityType;
  entityId: string;
  notionDatabaseKey: string; // 예: "STREAMERS", "BROADCAST_LOG" ...
}

// db는 drizzle의 NodePgDatabase 또는 트랜잭션 핸들 — 정확한 타입은
// packages/db/src/client.ts의 export 타입에 맞춰 교체.
export async function enqueueNotionSync(
  db: { insert: Function },
  input: EnqueueNotionSyncInput,
): Promise<void> {
  await (db.insert(mngbotNotionSyncLog) as any).values({
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    notionDatabaseKey: input.notionDatabaseKey,
    status: "pending",
  });
}

/**
 * 동일 엔티티에 대해 이미 pending 행이 있으면 새로 만들지 않고
 * updatedAt만 갱신하는 변형(중복 적재 방지). Notion 쪽에 같은 변경이
 * 여러 번 큐잉되는 것을 막기 위해, 빈번하게 갱신되는 엔티티
 * (예: 고정비 납부 기록)에는 이 버전을 권장.
 *
 * 실제 upsert 구현은 (company_id, entity_type, entity_id, status='pending')
 * 조건의 unique index를 추가로 걸고 ON CONFLICT DO UPDATE로 처리하는 것이
 * 가장 안전함 — Phase 1 스키마에 이 unique index를 추가하는 것을 후속 작업으로 권장.
 */
export async function enqueueNotionSyncDeduped(
  db: { insert: Function },
  input: EnqueueNotionSyncInput,
): Promise<void> {
  // TODO: ON CONFLICT (company_id, entity_type, entity_id) WHERE status='pending'
  //       DO UPDATE SET updated_at = now()
  // 부분 unique index 추가 후 구현. 지금은 단순 적재로 동작(중복 가능, 멱등).
  await enqueueNotionSync(db, input);
}
