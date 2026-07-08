/**
 * discord-adapter/paperclip-client.ts
 * (mngbot-runtime/issue-client.ts와 거의 동일한 책임 — 코드 중복을 줄이려면
 *  추후 packages/shared 같은 공용 패키지로 합치는 것을 권장. 지금은
 *  두 프로세스(discord-adapter / mngbot-runtime)가 독립 배포되므로 분리.)
 *
 * skills/paperclip/SKILL.md가 명시한 규칙: 이슈를 변경하는 모든 요청에는
 * X-Paperclip-Run-Id 헤더 첨부 — discord-adapter는 heartbeat run 컨텍스트가
 * 없으므로 대신 "discord:<interactionId>"를 추적용 의사-run-id로 사용한다.
 */

const PAPERCLIP_API_BASE = process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100";
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_DISCORD_ADAPTER_API_KEY!;

async function paperclipFetch(
  path: string,
  init: RequestInit & { pseudoRunId?: string } = {},
) {
  const res = await fetch(`${PAPERCLIP_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
      "X-Paperclip-Run-Id": init.pseudoRunId ?? `discord:${crypto.randomUUID()}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Paperclip API ${path} 실패: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface CreateIssueInput {
  companyId: string;
  projectId: string; // ⚠️ 패치: "No orphan work" 원칙 — 모든 Issue는 Project에 연결돼야 함
  title: string;
  assigneeAgentId: string;
  executionPolicy?: unknown; // Phase 4 execution-policy-templates.ts 참고
  metadata?: Record<string, unknown>;
}

export async function createIssue(input: CreateIssueInput) {
  return paperclipFetch(`/api/issues`, {
    method: "POST",
    body: JSON.stringify({
      companyId: input.companyId,
      projectId: input.projectId,
      title: input.title,
      assigneeAgentId: input.assigneeAgentId,
      executionPolicy: input.executionPolicy,
      metadata: input.metadata,
      status: "todo",
    }),
  });
}

export async function postComment(issueId: string, body: string) {
  return paperclipFetch(`/api/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/**
 * Discord "✅ 승인" / "🔁 재작업 요청" 버튼 클릭 시 호출.
 * Phase 4에서 확인한 가드: 승인(status=done) 전이는 commentRequired 정책에 따라
 * comment 동반 필요. 거부/재작업도 status로 표현(revision_requested 추정).
 */
export async function transitionStage(
  issueId: string,
  status: "done" | "revision_requested",
  comment: string,
) {
  return paperclipFetch(`/api/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, comment }),
  });
}

export async function getIssue(issueId: string) {
  return paperclipFetch(`/api/issues/${issueId}`, { method: "GET" });
}

export async function listAgents(companyId: string) {
  return paperclipFetch(`/api/companies/${companyId}/agents`, { method: "GET" });
}

// ── mngbot 도메인 row 생성 (Phase 7 통합: 구 governance-issue-service.ts의 책임 흡수) ──
// ⚠️ discord-adapter는 DB에 직접 붙지 않으므로(별도 프로세스), Issue 생성과
//    mngbot_code_change_sessions/mngbot_learning_items row 생성을 각각
//    REST 호출 2번으로 나눠서 처리한다. 원래(Phase 4) 설계는 이 둘을 하나의
//    drizzle 트랜잭션으로 묶었는데, 그건 discord-adapter가 DB 커넥션을
//    가지고 있다는(잘못된) 가정 위에 있었다 — INTEGRATION.md "수정 사항" 참고.
//    원자성이 필요하면 코어 쪽에 "Issue+세션 동시 생성" 전용 엔드포인트를
//    추가하는 것을 권장(지금은 2단계로 단순화, 두 번째 호출 실패 시 Issue만
//    덜렁 남는 정합성 문제가 있을 수 있음 — TODO).
export async function createCodeChangeSession(input: {
  companyId: string;
  issueId: string;
  userRequest: string;
  requester: string;
  createdByAgentId: string;
}) {
  return paperclipFetch(`/api/mngbot/code-change-sessions`, {
    method: "POST",
    body: JSON.stringify({ ...input, status: "plan_pending" }),
  });
}

export async function createLearningItem(input: {
  companyId: string;
  issueId: string;
  subject: string;
  category: string;
  sources: string[];
  requestedBy: string;
  executedByAgentId: string;
}) {
  return paperclipFetch(`/api/mngbot/learning-items`, {
    method: "POST",
    body: JSON.stringify({ ...input, status: "requested" }),
  });
}
