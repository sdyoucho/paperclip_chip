/**
 * discord-adapter/discord-link-store.ts
 * ⚠️ STUB. schema-addendum/mngbot_discord_links.ts에 대한 CRUD 래퍼.
 * discord-adapter가 Paperclip DB에 직접 연결할지, 얇은 API 엔드포인트를
 * 통해 갈지는 배포 형태 결정 필요 (mngbot-runtime의 옵션 B와 동일 고민).
 */

export interface RecordDiscordLinkInput {
  companyId: string;
  issueId: string;
  discordGuildId: string;
  discordChannelId: string;
  requestedByDiscordUserId: string;
}

export async function recordDiscordLink(
  input: RecordDiscordLinkInput,
): Promise<void> {
  // TODO: INSERT INTO mngbot_discord_links (...) 또는 POST /api/mngbot/discord-links
  throw new Error("recordDiscordLink 미구현");
}

export interface PendingDiscordLink {
  issueId: string;
  discordChannelId: string;
  lastSeenCommentCount: string | null;
}

export async function listPendingDiscordLinks(): Promise<PendingDiscordLink[]> {
  // TODO: issue.status != 'done'인 링크만 조회
  return [];
}

export async function bumpSeenCommentCount(
  issueId: string,
  count: number,
): Promise<void> {
  // TODO: UPDATE mngbot_discord_links SET last_seen_comment_count = $count WHERE issue_id = $issueId
}
