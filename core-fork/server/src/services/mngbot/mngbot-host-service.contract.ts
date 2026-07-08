/**
 * plugin/mngbot-host-service.contract.ts
 *
 * ctx.mngbot이 제공해야 하는 메서드 계약(인터페이스).
 * Plugin은 이 인터페이스에만 의존하고, 실제 구현은 코어 서버
 * (core-hooks/mngbot-host-service.ts 참고)가 capability "mngbot.read" /
 * "mngbot.write_sync_status"로 게이트해서 plugin worker에 주입한다.
 *
 * ⚠️ 이 인터페이스는 설계 초안이다. 실제 Paperclip plugin SDK의 ctx 확장
 *    방식(예: ctx.host.register vs ctx 직접 프로퍼티 등)은
 *    packages/plugins/sdk/ 소스를 보고 맞춰야 한다.
 */

export type MngbotEntityType =
  | "streamer"
  | "broadcast_log"
  | "schedule_item"
  | "fixed_cost"
  | "report"
  | "learning_item";

export interface MngbotPendingSyncRow {
  syncLogId: string;
  companyId: string;
  entityType: MngbotEntityType;
  entityId: string;
  notionDatabaseKey: string;
  notionPageId: string | null;
  retryCount: number;
}

export interface MngbotHostService {
  /** company 스코프 내 status='pending'(+ 백오프 기한 지난 'failed' 재시도분) 조회 */
  listPendingSyncs(
    companyId: string,
    limit: number,
  ): Promise<MngbotPendingSyncRow[]>;

  /**
   * entityType/entityId로 실제 row를 조회하되, Notion 매핑에 필요한
   * 관련 필드(예: broadcast_log의 streamerName)까지 조인해서 반환.
   * 반환 shape은 notion-field-mappers.ts의 각 map* 함수 입력 타입과 일치.
   */
  getEntityForNotion(
    companyId: string,
    entityType: MngbotEntityType,
    entityId: string,
  ): Promise<Record<string, unknown> | null>;

  /** 동기화 성공 처리: sync_log.status='synced' + 원본 엔티티.notion_page_id 갱신 */
  markSynced(
    syncLogId: string,
    notionPageId: string,
  ): Promise<void>;

  /** 동기화 실패 처리: retryCount++, lastError 기록, 백오프 계산은 plugin이 수행 */
  markFailed(
    syncLogId: string,
    error: string,
    opts: { permanent: boolean }, // maxRetries 초과 시 true → status='failed' 고정
  ): Promise<void>;
}
