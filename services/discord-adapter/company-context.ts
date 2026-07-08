/**
 * discord-adapter/company-context.ts
 * ⚠️ STUB. 1 Discord guild = 1 Paperclip company를 가정(원본 chip_bot도
 * 길드 1개 운영 가정). 멀티 길드/멀티 회사 지원이 필요하면 guild_id →
 * company_id 매핑 테이블을 추가해야 한다.
 */

const GUILD_COMPANY_CACHE = new Map<string, string>();

export async function getCompanyIdForGuild(guildId: string): Promise<string> {
  const cached = GUILD_COMPANY_CACHE.get(guildId);
  if (cached) return cached;
  // TODO: 매핑 테이블 또는 환경변수(PAPERCLIP_COMPANY_ID)에서 조회
  const companyId = process.env.PAPERCLIP_COMPANY_ID!;
  GUILD_COMPANY_CACHE.set(guildId, companyId);
  return companyId;
}

const AGENT_ID_CACHE = new Map<string, string>(); // key: `${companyId}:${slug}`

export async function resolveAgentId(
  companyId: string,
  agentSlug: string,
): Promise<string> {
  const key = `${companyId}:${agentSlug}`;
  const cached = AGENT_ID_CACHE.get(key);
  if (cached) return cached;
  // TODO: listAgents(companyId) 호출 후 metadata.legacySlug === agentSlug로 탐색,
  //       결과를 캐싱. (Phase 2 agents.metadata.legacySlug 활용)
  throw new Error(`resolveAgentId 미구현: ${key}`);
}
