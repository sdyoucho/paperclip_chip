# 매니봇 Notion 백업 Plugin 설계 (Phase 3)

## 0. 설계 원칙 (재확인)

- **단방향**: Postgres(`mngbot_*` 테이블) → Notion. **Notion → Postgres 역방향 동기화는
  하지 않는다.** Notion 쪽에서 사람이 직접 수정해도 다음 동기화 때 Postgres 값으로
  덮어써진다(Postgres가 유일한 source of truth, Notion은 "읽기용 백업 뷰").
- **장애 격리**: Notion API rate limit/타임아웃이 Paperclip 코어 트랜잭션이나
  매니봇 에이전트 실행에 영향을 주면 안 된다 → **out-of-process plugin worker**로 분리.
- **outbox 패턴**: Phase 1에서 만든 `mngbot_notion_sync_log`가 발행 큐 역할.
  core 서비스가 엔티티를 쓸 때 이 큐에 `pending` 행을 적재하고, plugin이 polling으로
  소비한다. (이벤트 기반 즉시 트리거는 "확장 옵션"으로 4절에 남겨둠 — 기본은 polling.)
- **레거시 Notion DB 재사용**: Cho가 이미 갖고 있는 6개 Notion DB(STREAMERS,
  BROADCAST_LOG, SCHEDULE, FIXED_COSTS, REPORT, GICHO_LEARNING)의 **속성명을 그대로
  유지**해서, 뷰/필터/관계가 깨지지 않게 한다.

---

## 1. ⚠️ 검증 필요 — Plugin Capability 모델

Paperclip 공개 문서에서 확인한 사실:
- Plugin은 `definePlugin({ async setup(ctx) {...} })` 형태로 작성되고,
  `ctx.data`, `ctx.actions`, `ctx.tools`, `ctx.events`, `ctx.jobs` 같은 서비스를 통해
  **host UI에 무언가를 노출**한다.
- "Every API on ctx requires a declared capability in the plugin manifest:
  `companies.read`, `issues.read`, ..." — 즉 ctx가 **코어 엔티티(companies/issues/agents
  등)를 읽기 위한 capability-gated 접근자**도 제공하는 것으로 보인다.

`mngbot_*` 테이블은 코어 엔티티가 아니라 **우리가 Phase 1에서 추가한 신규 테이블**이므로,
plugin이 표준 capability만으로는 이 테이블을 읽을 수 없다. 두 가지 옵션이 있고,
**옵션 B를 권장**한다:

| 옵션 | 방식 | 평가 |
|---|---|---|
| A | plugin worker에 `DATABASE_URL` 직접 연결 | 가장 빠르게 구현 가능하지만, Paperclip의 "Least Privilege / capability-gated" 원칙에 위배. 코어가 plugin에 의도적으로 노출하지 않은 전체 DB 접근권을 주는 것은 차후 보안 감사에서 문제될 수 있음. |
| **B (권장)** | 코어 서버에 신규 capability `mngbot.read` / `mngbot.write_sync_status`를 **추가(additive)** 하고, ctx에 `ctx.mngbot.listPendingSyncs()`, `ctx.mngbot.getEntity()`, `ctx.mngbot.markSynced()` 같은 thin wrapper 메서드를 노출 | 기존 capability 시스템 패턴을 그대로 따르는 확장이라 일관성 있음. 코어 쪽 구현이 약간 더 필요(아래 `core-hooks/` 참고). |

**이 설계 문서는 옵션 B를 기준으로 작성**합니다. 실제 capability 등록 API의 정확한
시그니처는 리포지토리의 `packages/plugins/sdk/`를 직접 보고 맞춰야 합니다
(현재는 공개 문서 스니펫 기준 추정).

---

## 2. Plugin 매니페스트 / 설정

```ts
// plugin/index.ts (요지)
definePlugin({
  id: "mngbot-notion-backup",
  name: "매니봇 Notion 백업",
  description: "Postgres(mngbot_*) → Notion 단방향 미러링 (읽기 전용 백업)",
  capabilities: [
    "mngbot.read",            // 신규 capability (옵션 B)
    "mngbot.write_sync_status",
    "secrets.resolve",        // NOTION_TOKEN 등 company secret 해석
  ],
  configSchema: mngbotNotionConfigSchema, // 아래 3절
  async setup(ctx) { /* ... */ },
  onConfigChanged(newConfig) { /* 동기화 간격/DB ID 변경 반영 */ },
  onShutdown() { /* 진행 중 작업 정리 */ },
  onValidateConfig(config) { /* notion DB ID 형식 검증 */ },
  onHealth() {
    // 대시보드에 노출될 헬스 정보
    return {
      lastSyncedAt, pendingCount, failedCount, lastError,
    };
  },
});
```

### 회사별 설정값 (`configSchema`)

```ts
{
  notionDatabaseIds: {
    streamers: "노션 DB ID",
    broadcastLog: "노션 DB ID",
    scheduleItems: "노션 DB ID",
    fixedCosts: "노션 DB ID",
    reports: "노션 DB ID",
    learningItems: "노션 DB ID",
  },
  notionTokenSecretRef: "company-secret-uuid", // ctx.secrets.resolve로 해석
  syncIntervalSec: 120,        // 기본 2분 간격 polling
  maxRetries: 5,
  backoffBaseSec: 30,          // 지수 백오프 시작값
}
```

---

## 3. 동기화 흐름

```
[core 서비스: 예) mngbot 스트리머 생성 API]
   1. mngbot_streamers INSERT
   2. mngbot_notion_sync_log INSERT (status=pending, entity_type=streamer)
        └─ core-hooks/enqueue-notion-sync.ts 의 enqueueNotionSync() 호출 한 줄로 처리
            (서비스 코드가 직접 SQL을 안 쓰고 헬퍼만 호출하도록 강제 → 누락 방지)

[plugin worker: ctx.jobs.register("mngbot.notion.sync", ...)]
   매 syncIntervalSec마다:
   3. ctx.mngbot.listPendingSyncs(companyId, limit=50) 호출
   4. 각 행에 대해:
      a. ctx.mngbot.getEntity(entityType, entityId) 로 실제 row 조회
      b. notion-field-mappers.ts 로 엔티티 → Notion properties 변환
      c. notionPageId 있으면 pages.update, 없으면 pages.create
      d. 성공 시: ctx.mngbot.markSynced(syncLogId, notionPageId)
                  → mngbot_notion_sync_log.status='synced' + 원본 엔티티의
                    notion_page_id 컬럼도 함께 갱신
      e. 실패 시: retryCount++, 지수 백오프로 nextAttempt 계산,
                  maxRetries 초과 시 status='failed' + onHealth에 노출
```

---

## 4. 확장 옵션 — 이벤트 기반 즉시 트리거 (기본 비활성)

지연 없는 동기화가 필요해지면, core 서비스가 엔티티 변경 시
`ctx.events.emit("mngbot.entity_changed", {...})`를 추가로 호출하고
plugin이 `ctx.events.on("mngbot.entity_changed", handler)`로 구독하는 방식을
**polling과 병행**할 수 있다. 이 경우도 polling 기반 outbox는 "누락분을 따라잡는
안전망"으로 유지하는 것을 권장(이벤트 유실에 대비).
지금 단계에서는 구현 범위를 줄이기 위해 **polling만 우선 구현**한다.

---

## 5. 오류 처리 / 안전장치

- **재시도**: `retryCount` 기준 지수 백오프(`backoffBaseSec * 2^retryCount`),
  `maxRetries` 초과 시 `status='failed'`로 고정하고 더 이상 자동 재시도하지 않음
  (무한 루프로 Notion API를 두들기는 것 방지).
- **Notion API rate limit(429)**: 응답의 `Retry-After` 헤더를 그대로 backoff에 반영.
- **부분 실패 격리**: 한 행의 동기화 실패가 다른 행 처리를 막지 않도록 `Promise.allSettled`
  류로 배치 처리(개별 try/catch).
- **시크릿 노출 금지**: `NOTION_TOKEN`은 `ctx.secrets.resolve(notionTokenSecretRef)`로만
  접근하고 로그/에러 메시지에 절대 출력하지 않음.
- **회사 경계**: 모든 쿼리/쓰기는 `companyId`로 스코프 — plugin이 다른 회사의
  sync_log/엔티티를 절대 건드릴 수 없게 ctx wrapper가 강제(코어 구현 책임).

---

## 6. 코드 산출물 (이 zip에 포함)

```
plugin/
  index.ts                  ← definePlugin 엔트리, 매니페스트, setup()
  notion-field-mappers.ts   ← mngbot_* row → 레거시 Notion 속성명 매핑 (6개 엔티티)
  sync-worker.ts            ← 동기화 job 본체 (polling, 재시도, 백오프)
  config-schema.ts          ← zod 기반 설정 스키마

core-hooks/
  enqueue-notion-sync.ts    ← core 서비스가 쓰기 후 호출하는 헬퍼 (outbox 적재)
```
