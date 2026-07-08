# 매니봇(chip_bot) → Paperclip Postgres 스키마 설계

> 1단계: 데이터 모델만 정의. Org Chart/Agent 연결과 Notion 동기화 plugin 구현은
> 2/3단계에서 별도 진행.

## 0. 설계 원칙

1. **company_id 스코핑** — Paperclip 컨벤션(`doc/SPEC-implementation.md`, `AGENTS.md`)을
   따라 모든 신규 테이블에 `company_id`를 두고, 인덱스 선두에 둔다.
2. **포크하지 않고 추가(additive)** — 기존 `packages/db/src/schema/*.ts`를 수정하지 않고
   `packages/db/src/schema/mngbot/` 하위에 신규 파일만 추가한다. 기존 `index.ts`에서
   `export * from "./mngbot"`만 추가하면 됨.
3. **비용/예산은 중복 저장하지 않는다** — chip_bot의 `utils/cost_tracker.py`(SQLite
   `usage_log`)는 Paperclip 코어의 `cost_events` / `budget_policies` /
   `budget_incidents` 테이블로 완전히 대체한다. 신규 테이블에는 `costUsd` 같은
   **참고용 비정규화 필드만** 남기고, 정산의 source of truth는 항상 `cost_events`.
4. **Postgres가 1차, Notion은 백업** — 모든 신규 테이블에 `notionPageId` 컬럼을 두고,
   별도의 `mngbot_notion_sync_log` outbox 테이블로 동기화 상태를 추적한다
   (실제 동기화 워커는 3단계 plugin에서 구현).
5. **agentId는 어디든 nullable** — Cho(인간, board user)가 직접 실행한 액션과
   에이전트가 자동 실행한 액션을 구분할 수 있게 해두되, 강제하지 않는다.

---

## 1. 테이블 목록 및 chip_bot 매핑

| 신규 테이블 | chip_bot 원본 | 비고 |
|---|---|---|
| `mngbot_streamers` | Notion `STREAMERS` DB | `/streamer_add`, `/streamer_list` |
| `mngbot_broadcast_logs` | Notion `BROADCAST_LOG` DB | 모쵸(`chzzk_monitor.py`) 결과 누적 |
| `mngbot_schedule_items` | Notion `SCHEDULE` DB | 스쵸(`schedule.py`) CRUD |
| `mngbot_fixed_costs` + `mngbot_fixed_cost_payments` | Notion `FIXED_COSTS` DB + 로컬 JSON 폴백 | 원본은 "마지막 납부일" 단일 필드 → 이력 테이블로 분리(감사 추적) |
| `mngbot_reports` | Notion `REPORT` DB | 분쵸(`weekly_report.py`) |
| `mngbot_learning_items` | Notion `GICHO_LEARNING` DB | 기쵸 자율학습, 승인 워크플로우 포함 |
| `mngbot_code_change_sessions` | **메모리만**(`_PLAN_SESSIONS` dict, 영속화 없음!) | 개쵸 `/code_propose` — Postgres 이전이 곧 영속성 버그 픽스 |
| `mngbot_notion_sync_log` | (신규 개념) | Notion 백업 동기화용 outbox |

### 신규 테이블을 만들지 않고 코어로 흡수하는 항목

| chip_bot 원본 | Paperclip 코어 매핑 | 이유 |
|---|---|---|
| `utils/cost_tracker.py` (SQLite `usage_log`) | `cost_events`, `budget_policies`, `budget_incidents` | 코어가 agent/model/provider/issue 단위로 이미 추적, 중복 방지 |
| `utils/credit_config.py` (월 한도/임계치) | `agents.budgetMonthlyCents` + Budget Policy | 코어 budget policy로 표현 가능 |
| `utils/model_config.py` (티어 오버라이드) | `agents.adapterConfig` (jsonb) | 모델/티어는 adapter 설정의 일부로 표현 |
| `utils/self_monitor.py` (에러 카운터) | `heartbeat_runs` / `activity_log` | 코어 활동 로그가 이미 에러/실행 기록을 축적 |
| 8개 페르소나(`utils/persona.py`) | `agents` 테이블 row 8개 | 2단계(Org Chart) 작업 — 이번 단계에서는 FK만 참조 |

---

## 2. 핵심 테이블 핵심 컬럼 요약

```
mngbot_streamers
  id, company_id, name, chzzk_url, youtube_url, soop_url,
  active, notion_page_id, created_at, updated_at

mngbot_broadcast_logs
  id, company_id, streamer_id → mngbot_streamers,
  platform, log_date, viewers_peak, viewers_avg, chat_count,
  sentiment_positive_pct, keywords(jsonb), summary,
  generated_by_agent_id → agents, notion_page_id, created_at

mngbot_schedule_items
  id, company_id, streamer_id?, title, description,
  start_at, end_at, all_day, category,
  created_by_agent_id → agents, notion_page_id, created_at, updated_at

mngbot_fixed_costs
  id, company_id, name, amount_krw, pay_day, active,
  notion_page_id, created_at, updated_at

mngbot_fixed_cost_payments      ← append-only 이력
  id, company_id, fixed_cost_id → mngbot_fixed_costs,
  paid_at, amount_krw, recorded_by_agent_id → agents, created_at

mngbot_reports
  id, company_id, streamer_id?, period, report_type,
  content_markdown, generated_by_agent_id → agents,
  cost_usd(참고용), metadata(jsonb), notion_page_id, created_at

mngbot_learning_items
  id, company_id, subject, category, status,
  sources(jsonb), requested_by, requested_at, approved_at, completed_at,
  summary, insights(jsonb), applications(jsonb),
  cost_usd(참고용), error_message,
  executed_by_agent_id → agents, notion_page_id, created_at, updated_at

mngbot_code_change_sessions
  id, company_id, issue_id?, approval_id?,
  user_request, enriched_request, requester, status,
  intent(jsonb), codebase_summary(jsonb), plan(jsonb),
  file_proposals(jsonb[]), github_repo, github_branch, github_pr_url,
  total_cost_usd(참고용), error_message,
  created_by_agent_id → agents, created_at, updated_at

mngbot_notion_sync_log          ← outbox (3단계에서 소비)
  id, company_id, entity_type, entity_id,
  notion_database_key, notion_page_id,
  status(pending/synced/failed), retry_count, last_error,
  last_synced_at, created_at, updated_at
```

---

## 3. ERD (개념도)

```
companies (코어)
  └─< agents (코어, 8개 페르소나가 2단계에서 row로 들어감)
        │
        ├─< mngbot_streamers
        │      └─< mngbot_broadcast_logs
        │      └─< mngbot_schedule_items (streamer_id nullable)
        │      └─< mngbot_reports        (streamer_id nullable)
        │
        ├─< mngbot_fixed_costs
        │      └─< mngbot_fixed_cost_payments
        │
        ├─< mngbot_learning_items
        │
        ├─< mngbot_code_change_sessions  (issue_id/approval_id는 2단계 거버넌스에서 연결)
        │
        └─< mngbot_notion_sync_log  (entity_type+entity_id로 위 테이블들을 다형 참조)

cost_events / budget_policies / budget_incidents (코어, 변경 없음)
  └─ agentId, issueId로 위 모든 mngbot_* 작업의 비용을 추적 (중복 테이블 없음)
```

---

## 4. ⚠️ 검증이 필요한 가정 (코드를 직접 못 본 부분)

이번 설계는 공개 문서/위키 스니펫에서 확인한 `companies`, `agents` 테이블 스키마를
기준으로 작성했습니다. 실제 적용 전에 아래를 리포지토리에서 직접 대조해주세요:

- `packages/db/src/schema/companies.ts` — `companies.id` 타입/제약 확인
- `packages/db/src/schema/agents.ts` — `agents.id`, `reportsTo` 등 확인 (문서상 필드는
  위 매핑에 반영했지만 버전 차이 가능)
- `packages/db/src/schema/issues.ts`, `approvals*.ts` — 2단계에서
  `mngbot_code_change_sessions.issueId` / `approvalId`를 실제 FK로 바꿀 때 필요
- `cost_events` 테이블의 정확한 컬럼명(`costCents` vs `cost_usd` 등) — 문서에는
  `costCents`(정수, cents 단위)로 표기되어 있어, mngbot 쪽 `cost_usd`(소수)와
  단위가 다름. 3단계 전 cost 기록 연동 시 단위 변환 로직 필요.

---

## 5. 다음 단계

1. **Org Chart/Agent 정의** — 8개 페르소나를 `agents` row로 생성(role/title/icon/
   adapterType/adapterConfig/budgetMonthlyCents), `reportsTo`로 해쵸 산하 위임 구조 구성.
2. **Notion 백업 plugin** — `mngbot_notion_sync_log`를 polling/event 기반으로 소비하는
   out-of-process worker plugin 구현, `utils/notion_client.py`의 5개 DB 쓰기 로직을
   읽기 전용 미러로 재작성.
3. **거버넌스 연결** — `/code_propose`, `/gicho_learn_approve`의 승인 단계를
   Paperclip Approval Gate로 연결.
