/**
 * mngbot-runtime/external-apis/youtube-client.ts
 * modules/youtube_analytics.py 포팅. LLM 호출 없음 — YouTube Data API v3 직접 조회.
 */

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

export function extractChannelId(url: string): string | null {
  if (url.includes("/channel/")) {
    return url.split("/channel/")[1].split("/")[0].split("?")[0];
  }
  // @handle, /c/, /user/ 등은 별도 API 호출 필요 — 원본과 동일하게 생략
  return null;
}

export interface YoutubeChannelStats {
  subs: number;
  views: number;
  videos: number;
}

export async function fetchChannelStats(
  channelId: string,
): Promise<YoutubeChannelStats | null> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${YT_API_BASE}/channels?part=statistics&id=${channelId}&key=${apiKey}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.items ?? [];
    if (!items.length) return null;
    const s = items[0].statistics;
    return {
      subs: Number(s.subscriberCount ?? 0),
      views: Number(s.viewCount ?? 0),
      videos: Number(s.videoCount ?? 0),
    };
  } catch {
    return null;
  }
}
