# 거버넌스 연결 설계 (Phase 4)

## 0. 발견한 핵심 메커니즘 — Issue `executionPolicy` Stage Gate

공개 소스(이슈 트래커 버그 리포트 #3921, `skills/paperclip/SKILL.md`, DeepWiki
Approvals Workflow 문서)를 종합하면, Paperclip은 정확히 chip_bot의 2단계 승인
UI(`/code_propose`)가 필요로 하는 메커니즘을 **이미 코어 기능으로 갖고 있다**:

- 모든 Issue는 `executionPolicy`를 가질 수 있고, 그 안에 순서가 있는 **stage 배열**이
  들어간다. 각 stage는 `type: "review" | "approval"` 같은 종류와
  `commentRequired: boolean` 같은 옵션을 가진다.
- 승인자가 해당 stage를 "승인"한다는 것은 곧 **그 stage의 status를 `done`으로
  바꾸면서 코멘트를 같이 남기는 것**이다 (`server/src/services/issue-execution-policy.ts`
  의 가드: `"Approving a review or approval stage requires a comment"`).
- Stage가 승인되면 issue는 다음 stage로 진행한다.
- 코멘트가 달리거나 상태가 바뀌면 **그 issue를 담당하는 agent의 heartbeat가
  comment-driven wake로 다시 깨어난다** ("Auto-checkout for scoped wakes").
- agent의 표준 동작 절차(SKILL.md)에 **"Step 2 — Approval follow-up (when triggered)"**
  이 명시되어 있다 — 즉 "내가 만든 approval/review 요청이 승인됐는지 확인하고 다음
  단계로 진행"하는 것이 Paperclip이 agent에게 기대하는 표준 패턴이다.

**결론**: chip_bot의 두 승인 흐름을 **Paperclip 코어를 한 줄도 안 고치고**,
순수하게 Issue + executionPolicy 설정만으로 재현할 수 있다.

| chip_bot 흐름 | Paperclip 매핑 |
|---|---|
| `/code_propose` 2단계 승인(계획→코드) | Issue 1개, `executionPolicy.stages` = [계획 승인 stage, 코드 승인 stage] |
| `/gicho_learn_approve` 단일 승인 | Issue 1개, `executionPolicy.stages` = [학습 승인 stage] |

기존에 메모리(`_PLAN_SESSIONS`)나 우리 자체 `status` enum으로 흐름을 추적하던 걸,
**issue의 stage/status를 source of truth로** 바꾸고, `mngbot_code_change_sessions`/
`mngbot_learning_items`는 "이 issue에 연결된 도메인 데이터(plan, 코드 제안, 학습
요약 등)"만 들고 가는 보조 테이블로 역할을 좁힌다.

---

## 1. ⚠️ 검증 필요 (정확한 필드명 미확인)

`executionPolicy`의 정확한 JSON 스키마(필드명, stage type enum 값, 승인자 지정
방식)는 버그 리포트 코드 인용 한 줄과 SKILL.md 설명에서 **추정**한 것이다.
실제 사용 전에 다음을 리포지토리에서 직접 확인해야 한다:

- `packages/db/src/schema/issues.ts` — `executionPolicy` 컬럼 타입/구조
- `server/src/services/issue-execution-policy.ts` — stage 전이 검증 로직 전체
- `skills/paperclip/references/api-reference.md` — "governance/approvals" 섹션
  (SKILL.md가 명시적으로 이 문서를 가리킴 — 가장 신뢰할 수 있는 1차 자료)
- 승인자를 누구로 지정하는지(board user 고정인지, stage별로 지정 가능한지)

아래 코드의 `executionPolicy` JSON 구조는 **현재 알려진 사실에 기반한 최선의 추정
템플릿**이며, 실제 필드명이 다르면 `execution-policy-templates.ts`만 고치면 된다
(다른 코드는 이 템플릿을 통해서만 접근하도록 캡슐화함).

---

## 2. 흐름 다이어그램

### 2-1. 개쵸 `/code_propose` (2-stage)

```
Discord "/code_propose <요청>"
  → Issue 생성 (assignee=gaechyo, executionPolicy=CODE_CHANGE_POLICY)
  → mngbot_code_change_sessions row 생성 (issueId=위 issue.id, status='plan_pending')
  → gaechyo heartbeat wake (신규 할당)
      Step 1~4 (코드베이스 스캔 + 계획 생성, 포팅된 code_planner.py 로직)
      → 계획을 issue 코멘트로 게시
      → issue를 Stage 1("계획 승인")으로 전이, mngbot 쪽 status='plan_pending'(대기)
      → release, 대기

Cho가 Paperclip UI에서 코멘트 + Stage 1 승인(status=done)
  → comment-driven wake → gaechyo 재기동
      Step 2 "Approval follow-up": Stage 1이 승인됐는지 확인
      → 승인 확인되면 status='generating'으로 전환, 코드 생성(code_modifier.py 포팅)
      → 파일 제안을 issue 코멘트로 게시, Stage 2("코드 승인")로 전이
      → status='code_pending', release, 대기

Cho가 Stage 2 승인
  → comment-driven wake → gaechyo 재기동
      Step 2 follow-up: Stage 2 승인 확인
      → status='applying' → GitHub PR 생성 → status='applied'
      → issue 전체를 done으로 전이
```

### 2-2. 기쵸 `/gicho_learn` (1-stage)

```
Discord "/gicho_learn_add" → Issue 생성(assignee=gihyo, executionPolicy=LEARNING_POLICY)
  → mngbot_learning_items row 생성(issueId=issue.id, status='requested')
  → Stage 1("학습 승인") 대기 상태로 issue 생성 즉시 진입(계획 단계 없음 — 원본과 동일)

Cho가 Stage 1 승인
  → comment-driven wake → gihyo 재기동
      Step 2 follow-up: 승인 확인 → status='learning' → 학습 실행(gicho_learning.py 포팅)
      → 완료 시 status='completed'(or 'failed') → issue done으로 전이
```

---

## 3. Phase 1 스키마에 대한 후속 패치

`mngbot_code_change_sessions.issueId` / `mngbot_learning_items`에는 Phase 1에서
`issueId` 컬럼이 없었다(learning_items는 아예 없었고, code_change_sessions는
`issueId: uuid("issue_id")`를 FK 제약 없이 nullable로만 뒀음). 이제 진짜 FK로
연결한다 — 패치 내용은 `schema-patch/` 폴더에 diff 형태로 포함.

---

## 5. ⚠️ 패치 — "고아 작업 금지" 대응 (후속 검토에서 발견)

Paperclip 공식 문서: "Goal-traced work: Initiative → Project → Milestone →
Issue → Sub-issue. **No orphan work.**" — Issue는 Project 없이 만들 수 없을
가능성이 높다. `createCodeChangeRequest`/`createLearningRequest` 모두
`projectId`를 필수 인자로 받도록 수정했고, 호출 측(discord-adapter)은
`ensureMngbotProject()`로 회사별 기본 Project("매니봇 운영")를 find-or-create
해서 전달한다 (어댑터 zip의 `project-context.ts` 참고).

## 4. 코드 산출물

```
execution-policy-templates.ts   ← 2개 executionPolicy JSON 템플릿 (캡슐화)
governance-issue-service.ts     ← Issue 생성 + mngbot 도메인 row 동시 생성 헬퍼
approval-followup-handler.ts    ← "Step 2 Approval follow-up" 공통 로직
  (gaechyo/gihyo 양쪽이 heartbeat wake 시 호출)
schema-patch/
  mngbot_code_change_sessions.patch.ts  ← issueId FK 추가
  mngbot_learning_items.patch.ts        ← issueId 컬럼 신규 추가
```
