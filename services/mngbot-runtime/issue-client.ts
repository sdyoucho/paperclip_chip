/**
 * mngbot-runtime/issue-client.ts
 * SKILL.md 표준 heartbeat 절차(checkout → 작업 → comment/status 갱신 → release)를
 * 위한 공용 헬퍼. 모든 변경 요청에 X-Paperclip-Run-Id 헤더 첨부(감사 추적, 필수).
 */

const PAPERCLIP_API_BASE = process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100";

async function call(
  runId: string,
  path: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${PAPERCLIP_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PAPERCLIP_AGENT_API_KEY}`,
      "X-Paperclip-Run-Id": runId,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Paperclip API ${path} 실패: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function checkoutIssue(runId: string, issueId: string) {
  return call(runId, `/api/issues/${issueId}/checkout`, { method: "POST" });
}

export async function getIssue(runId: string, issueId: string) {
  return call(runId, `/api/issues/${issueId}`, { method: "GET" });
}

export async function postIssueComment(
  runId: string,
  issueId: string,
  body: string,
) {
  return call(runId, `/api/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function updateIssueStatus(
  runId: string,
  issueId: string,
  status: string,
  comment?: string,
) {
  return call(runId, `/api/issues/${issueId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, comment }),
  });
}

export async function releaseIssue(runId: string, issueId: string) {
  return call(runId, `/api/issues/${issueId}/release`, { method: "POST" });
}

/**
 * issue API 응답에서 현재 stage 상태를 추출.
 * ⚠️ 실제 응답 필드명(currentStageKey/stageStatus)은 Phase 4 GOVERNANCE.md
 *    1절과 동일하게 "추정"이다 — issues 테이블/API 스펙 확인 후 맞출 것.
 */
export function extractStageState(issue: any): {
  currentStageKey: string | null;
  stageStatus: "pending" | "in_review" | "done" | "revision_requested" | null;
} {
  return {
    currentStageKey: issue.currentStageKey ?? null,
    stageStatus: issue.stageStatus ?? null,
  };
}
