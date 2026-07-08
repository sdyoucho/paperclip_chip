# 매니봇 8개 페르소나 → Paperclip Org Chart 설계 (Phase 2)

## 0. 핵심 결정사항 + 열린 질문

### 결정: reportsTo 구조
- **해쵸(haecho)는 `reportsTo: null`** — 이 회사(컴퍼니)의 최상위 매니저.
  Paperclip의 "V1은 엄격한 단일 트리, 한 명의 매니저만 가질 수 있음" 제약과
  맞춰, 해쵸 아래 7명이 보고하는 구조로 chip_bot의 오케스트레이션 패턴
  (`modules/haecho.py`의 `orchestrate()`)을 그대로 반영합니다.
- 나머지 7개(기쵸/인쵸/분쵸/스쵸/모쵸/개쵸/디쵸) → `reportsTo: haecho.id`

### 결정: adapterType = `http` (process가 아님)
원본 chip_bot은 8개 페르소나가 **하나의 Python 프로세스 안에서 함수로
호출**됩니다(별도 프로세스 기동 없음, OpenRouter 캐시/cost_tracker 등 공유 상태도
프로세스 전역). 이 구조를 가장 가깝게 재현하려면:

- ❌ `adapterType: "process"` (heartbeat마다 새 프로세스 spawn) — 원본보다 느리고,
  in-memory 캐시/세션 공유가 끊김
- ✅ `adapterType: "http"` — 매니봇 로직을 포팅한 **단일 상시 Node.js 서비스**
  (`mngbot-runtime`)를 띄워두고, 각 agent의 heartbeat/wake를 이 서비스의
  엔드포인트로 webhook 전달. 서비스 내부에서 agent slug별로 분기.

  ```json
  {
    "url": "http://mngbot-runtime:4100/wake",
    "method": "POST",
    "headers": { "Authorization": "Bearer {{secrets.mngbot_internal_token}}" },
    "payloadTemplate": {
      "agentSlug": "haecho",
      "agentId": "{{agent.id}}",
      "runId": "{{run.id}}",
      "issueId": "{{issue.id}}"
    },
    "timeoutMs": 90000
  }
  ```

  이 `mngbot-runtime` 서비스가 바로 1단계에서 설계한 `mngbot_*` 테이블에
  직접 읽고 쓰며, OpenRouter 호출 후 Paperclip 코어의 `cost_events`에
  비용을 기록합니다 (3단계 이전 "어댑터/런타임 이식" 작업에서 구현).

### ⚠️ 열린 질문 — Cho 확인 필요
1. **Discord ↔ Issue 트리거 방향**: 지금 설계는 "Discord 슬래시 커맨드 →
   Paperclip Issue 생성 → 담당 agent heartbeat 깨어남 → 결과를 Discord에
   다시 게시" 흐름을 가정합니다. 이 Discord↔Paperclip 연동 자체는 **별도
   adapter/integration**(Discord bot 프로세스가 Paperclip API를 호출하는 구조)
   이 필요하며, 이건 다음 단계(Adapter/Webhook 이식)에서 다룰 예정입니다.
   지금 단계 스키마/Org Chart는 이 가정에 의존하지 않도록 독립적으로 설계했습니다.
2. **budgetMonthlyCents 초안값**: README의 "₩26,230/월(STT 제외)" 표는 1명
   스트리머 기준이고 haecho의 premium(Opus 4.7) 종합 브리핑 비용이 빠져있어
   과소추정으로 보입니다. 아래 표는 **시작 템플릿**이며, 실사용량 보고 Paperclip
   Budget Policy UI에서 조정하는 것을 전제로 합니다.

---

## 1. Agent 정의표

| slug | name | role | title | icon | reportsTo | 모델 티어(adapterConfig 메타) | budgetMonthlyCents (초안) |
|---|---|---|---|---|---|---|---|
| haecho | 해쵸 | manager | 총괄 매니저 | 🎯 | (없음, 최상위) | premium = Claude Opus 4.7 | 4000 (~$40) |
| gihyo | 기쵸 | planner | 기획·학습 담당 | 📋 | haecho | standard = Claude Opus 4.7 | 2000 (~$20) |
| inchyo | 인쵸 | finance | 자금 담당 | 💰 | haecho | light = Gemini 3.1 Flash Lite | 300 (~$3) |
| bunchyo | 분쵸 | analyst | 분석·리서치 담당 | 🔍 | haecho | research = Perplexity Sonar Pro | 1500 (~$15) |
| sochyo | 스쵸 | coordinator | 스케줄 코디네이터 | 📅 | haecho | light | 300 (~$3) |
| mochyo | 모쵸 | monitor | 방송 모니터 | 📡 | haecho | light | 500 (~$5) |
| gaechyo | 개쵸 | engineer | R&D 엔지니어 | 🔧 | haecho | standard = Claude Opus 4.7 | 2500 (~$25) |
| dichyo | 디쵸 | designer | 디자이너 | 🎨 | haecho | vision = gpt-4o | 1000 (~$10) |

총합 12,100 cents(~$121/월) — Cho의 실사용 패턴 확인 후 조정 권장.

## 2. capabilities (자유 텍스트, persona.py description 확장)

| slug | capabilities |
|---|---|
| haecho | 라우팅된 다수 에이전트 결과를 종합해 우선순위별 브리핑 생성. light 모델로 사전요약 → premium으로 최종 종합. |
| gihyo | 콘텐츠/썸네일 개선 제안, 기획서·협업 제안서 작성, 트렌드/기획 기법 자율 학습(승인 필요). |
| inchyo | 자금 현황·API 비용 모니터링, 크레딧 임계치 알림, 고정비 납부 일정 관리, 월말정산. |
| bunchyo | 유튜브 통계, 주간/월간 리포트 생성, 경쟁 채널(SOOP/Twitch/치지직) 분석. |
| sochyo | 일정 조회/등록/수정/삭제. |
| mochyo | 치지직 실시간 방송 현황·채팅·시청자 모니터링. |
| gaechyo | 코드 리뷰, 코드베이스 점검, 이슈 진단, 신규 설계서 작성, 자동 코드 변경(계획→승인→PR). |
| dichyo | Figma 포스터/PPT 디자인 레퍼런스 제안. |

## 3. permissions (jsonb) — 자율 실행 가능 범위

원본 chip_bot은 권한 구분이 없었습니다(전부 Cho 단독 사용 가정). Paperclip으로
옮기며 아래와 같이 **거버넌스 단계(3단계)에서 적용할 권한 초안**을 함께 정의합니다.
지금 단계에서는 데이터로만 저장하고 강제 로직은 다음 단계에서 구현합니다.

```jsonc
// haecho, sochyo, mochyo, inchyo (조회/요약 성격) — 자율 실행
{ "autonomous": ["read", "summarize", "notify"] }

// bunchyo — 외부 API(Perplexity) 호출은 자율, 발송은 자동 스케줄러 허용
{ "autonomous": ["read", "research", "publish_report"] }

// gihyo — 학습 "요청"은 자율이지만 "승인"은 board approval 필요 (원본 그대로)
{ "autonomous": ["read", "suggest", "request_learning"],
  "requiresApproval": ["approve_learning"] }

// gaechyo — 코드 "계획/생성"은 자율, "GitHub 적용(PR)"은 board approval 필요
// (원본 /code_propose 2단계 승인 UI 그대로 반영)
{ "autonomous": ["read", "plan_change", "generate_code"],
  "requiresApproval": ["apply_to_github"] }

// dichyo — 제안만, 별도 승인 불필요 (원본에 승인 흐름 없음)
{ "autonomous": ["read", "suggest_design"] }
```

## 4. metadata (jsonb) — 레거시 호환 메타

Discord Webhook 표시명/색상(`utils/persona.py`)을 그대로 보존해 다른 단계에서
재사용할 수 있게 합니다.

```jsonc
{
  "legacySlug": "haecho",
  "legacyDisplayName": "🎯 해쵸",
  "legacyColorHex": "#1E293B",
  "modelTierKey": "premium"
}
```
