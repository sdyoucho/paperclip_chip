# Discord 어댑터 + mngbot-runtime 설계 (Phase 5)

## 0. 두 개의 새 컴포넌트

| 컴포넌트 | 역할 | 배치 |
|---|---|---|
| **discord-mngbot-adapter** | Discord ↔ Paperclip 사이의 유일한 다리. 슬래시 커맨드 수신 → Issue 생성/직접 API 호출, Paperclip 쪽 활동(코멘트/완료)을 persona webhook으로 Discord에 다시 게시 | 별도 Node 프로세스 (discord.js) |
| **mngbot-runtime** | Phase 2에서 정의한 `adapterType: "http"`의 실제 수신 서버. heartbeat wake를 받아 8개 페르소나 로직(포팅된 Python 모듈) 실행 | 상시 구동 Node/Express 서비스 |

```
Discord 슬래시 커맨드
   ↓
discord-mngbot-adapter ──(Issue 생성/직접 API)──▶ Paperclip 코어
                                                      │ heartbeat wake (http adapter)
                                                      ▼
                                              mngbot-runtime (8 페르소나 핸들러)
                                                      │ 코멘트/상태 갱신
                                                      ▼
                                              Paperclip Activity 로그
                                                      │ (activity-listener가 구독)
                                                      ▼
discord-mngbot-adapter ◀────────────────── persona webhook으로 Discord에 결과 게시
```

---

## 1. 49개 명령어 전체 분류

Discord 커맨드를 4종류로 나눴다. **A/B는 Paperclip Issue를 만들지 않는다** —
direct API 호출이거나 어댑터 자체 로직이다.

### A. 회사/에이전트 설정 명령어 (Issue 생성 없음 — Paperclip 설정 API 직접 호출)
`config_ai`, `config_notion`, `config_discord`, `config_status`, `rawdata`,
`rawdata_channel`, `model_status`, `model_set`, `model_agent`, `model_reset`,
`credit_settings`, `credit_limit`, `credit_thresholds`, `rnd_channel`,
`forum_channel`, `rnd_forum_channel`

→ `model_*`는 `agents.adapterConfig`/`budgetMonthlyCents` 직접 PATCH,
나머지는 plugin config(Notion plugin 설정 등) 또는 회사 메타데이터 PATCH.

### B. 봇 프로세스 운영 명령어 (Paperclip과 무관, 어댑터 자체 처리)
`reboot`, `uptime`, `restart_schedule`, `help`

→ Paperclip 개념이 아니라 discord-mngbot-adapter 프로세스 자체의 운영 명령.

### C. 즉시실행(승인 불필요) 명령어 — Issue 생성, executionPolicy 없음
`ask`(haecho), `monitor`(mochyo), `report`(bunchyo), `youtube`(bunchyo),
`schedule`(sochyo, 조회), `schedule_add/edit/remove`(sochyo),
`money`(inchyo), `settlement`(inchyo), `streamer_add/list`(direct CRUD,
agent 불필요 — `mngbot_streamers` API 직접 호출도 가능하나 일관성을 위해
inchyo 또는 무관(논의 필요)에 배정), `fixedcost_*`(inchyo),
`rnd_health/code_review/diagnose/design/errors/announce`(gaechyo/dichyo),
`code_sessions/code_diagnose`(gaechyo, 읽기), `gicho_learn_status`(gihyo, 읽기)

→ Issue 생성(또는 일부는 Issue 없이 direct read API) → 담당 agent heartbeat가
즉시 처리 → 코멘트 게시 → issue `done` → 결과를 persona webhook으로 Discord에.

### D. 거버넌스(승인 게이트) 명령어 — Phase 4 executionPolicy 적용
`code_propose`(gaechyo, 2-stage), `gicho_learn_add`(gihyo, 1-stage)

### D'. 승인 액션 — 슬래시 커맨드가 아니라 **Discord 버튼**으로 재현
원본은 `bot/code_approval_view.py`처럼 Discord UI 버튼으로 승인을 받았다.
이 UX를 그대로 살려서, **`/gicho_learn_approve` 슬래시 커맨드는 폐기**하고
discord-mngbot-adapter가 게시하는 persona webhook 메시지에 **"✅ 승인" /
"🔁 재작업 요청" 버튼**을 붙인다. 버튼 클릭 → Paperclip Issue stage 전이 API
(comment + status=done 또는 revision_requested) 호출. (원본 UX에 더 가깝고,
별도 명령어를 외울 필요가 없어짐 — Cho 확인 후 최종 결정 권장.)

---

## 2. Wake 계약 (mngbot-runtime이 받는 입력)

Phase 2 `adapterConfig.payloadTemplate`과 동일:

```ts
interface WakePayload {
  agentSlug: string;   // "haecho" | "gihyo" | ... (legacyMetadata.legacySlug)
  agentId: string;     // Paperclip agents.id
  runId: string;       // heartbeat run id (감사 추적용, 모든 API 호출에 X-Paperclip-Run-Id로 첨부)
  issueId: string;     // 이번에 배정/갱신된 issue
}
```

mngbot-runtime은 이 payload를 받으면:
1. `issueId`로 issue checkout (Paperclip API, run-id 헤더 첨부)
2. `mngbot_code_change_sessions`/`mngbot_learning_items`에 연결된 row가 있으면
   → Phase 4 `approval-followup-handler`로 분기 (governance 흐름)
3. 없으면 → "즉시실행" 핸들러(C 카테고리, agentSlug별 디스패치)로 분기
4. 작업 완료 후 issue에 결과 코멘트 게시 + 상태를 `done`으로 전이 + release

---

## 3. Discord ↔ Issue 결과 연결 (신규 테이블)

Discord 인터랙션 토큰은 15분 후 만료되므로, **interaction follow-up이 아니라
persona webhook으로 결과를 게시**하는 방식을 기본으로 한다(원본 `speak()`와
동일 패턴, 만료 걱정 없음). 어느 채널에 게시할지 추적하기 위해 작은 매핑
테이블을 하나 추가한다.

```ts
// schema-addendum/mngbot_discord_links.ts
mngbot_discord_links
  id, company_id, issue_id (unique, → issues.id),
  discord_guild_id, discord_channel_id, requested_by_discord_user_id,
  created_at
```

`activity-listener.ts`가 Paperclip 활동(코멘트 생성, status 변경)을 구독하다가
이 매핑이 있는 issue에 변화가 생기면 → `persona-webhook.ts`로 해당 채널에
agentSlug 페르소나 이름/아바타로 결과를 게시한다.

⚠️ **검증 필요**: Paperclip이 활동(activity)을 외부에서 구독할 수 있는 공식
메커니즘(webhook 등록 API? SSE? polling?)이 무엇인지 정확히 확인 안 됨.
이 설계는 "주기적 polling(`GET /api/issues/:id` 또는 활동 로그 API)"을
기본으로 깔고, 실제로 webhook 구독이 가능하면 그쪽으로 교체하는 것을
권장한다(레이턴시 개선).

---

## 4. 코드 산출물

```
discord-adapter/
  bot.ts                    ← discord.js 클라이언트, 커맨드 등록
  command-router.ts         ← 커맨드명 → 핸들러 디스패치 테이블(전체 49개 분류 반영)
  persona-webhook.ts        ← utils/persona.py speak() TS 포팅 (정확히 동일 동작)
  paperclip-client.ts       ← Issue 생성/코멘트/stage 전이 REST 래퍼
  activity-listener.ts      ← polling 기반 활동 감시 → Discord 게시
  handlers/
    instant-command.ts      ← C카테고리 공통 처리(Issue 생성, executionPolicy 없음)
    governance-command.ts   ← D카테고리 (Phase 4 governance-issue-service 호출)
    approval-button.ts      ← D' 버튼 인터랙션 → stage 전이 API 호출

mngbot-runtime/
  server.ts                 ← Express, POST /wake 엔드포인트
  dispatch.ts                ← agentSlug → 핸들러
  issue-client.ts            ← checkout/comment/transition 공용 클라이언트
  handlers/
    haecho.ts                ← 오케스트레이션 (modules/haecho.py 포팅, 라우팅은 router.py 포팅 필요 — TODO)
    sochyo.ts                ← 즉시실행 예시 전체 구현 (LLM 호출 없음, 원본과 동일)
    gaechyo.ts                ← Phase 4 approval-followup-handler 위임 + 최초 계획 킥오프

schema-addendum/
  mngbot_discord_links.ts    ← 신규 매핑 테이블
```
