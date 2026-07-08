/**
 * discord-adapter/project-context.ts
 *
 * ⚠️ 패치 배경: Paperclip 공식 문서 — "Goal-traced work: Initiative → Project
 *    → Milestone → Issue → Sub-issue. No orphan work." 즉 Issue는 Project(또는
 *    그 상위 Goal 체계)에 연결되어야 한다. 이전 버전의 governance-issue-service.ts/
 *    instant-command.ts는 projectId 없이 Issue를 생성했는데, 실제 스키마가
 *    이를 강제한다면 insert 자체가 거부될 수 있다.
 *
 * 해결: 회사별로 "매니봇 운영"이라는 기본 Project를 find-or-create 해서
 *    그 projectId를 모든 mngbot 관련 Issue 생성에 사용한다.
 */

const BASE = process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100";
const KEY = process.env.PAPERCLIP_DISCORD_ADAPTER_API_KEY!;

const DEFAULT_PROJECT_TITLE = "매니봇 운영";
const projectIdCache = new Map<string, string>(); // companyId → projectId

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Paperclip API ${path} 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * 회사의 "매니봇 운영" project를 찾거나 없으면 생성해서 그 id를 반환.
 * 멱등(idempotent) — 여러 Discord 인스턴스가 동시에 호출해도 안전하도록,
 * 실제 구현에서는 코어 쪽에 "findOrCreate" 전용 엔드포인트를 두는 것을
 * 권장한다(여기서는 list→없으면 create의 2단계로 단순화, 레이스 컨디션 가능성 있음).
 */
export async function ensureMngbotProject(companyId: string): Promise<string> {
  const cached = projectIdCache.get(companyId);
  if (cached) return cached;

  // ⚠️ /api/companies/:id/projects의 정확한 응답 shape/쿼리 파라미터는
  //    실제 issues/projects 스키마 확인 후 맞출 것 (issues.ts와 함께 검증 필요 항목).
  const existing = await call(`/api/companies/${companyId}/projects?title=${encodeURIComponent(DEFAULT_PROJECT_TITLE)}`);
  if (existing?.length) {
    projectIdCache.set(companyId, existing[0].id);
    return existing[0].id;
  }

  const created = await call(`/api/companies/${companyId}/projects`, {
    method: "POST",
    body: JSON.stringify({
      title: DEFAULT_PROJECT_TITLE,
      description: "Discord 슬래시 커맨드로 생성되는 모든 매니봇 작업의 기본 Project (고아 Issue 방지용).",
    }),
  });
  projectIdCache.set(companyId, created.id);
  return created.id;
}
