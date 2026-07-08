/**
 * mngbot-runtime/handlers/bunchyo.ts
 * modules/weekly_report.py + modules/youtube_analytics.py 포팅.
 *
 * ⚠️ modules/competitor_analysis.py(analyzeCompetitor)는 직접 슬래시 커맨드가
 *    없고(원본도 /ask 자연어 라우팅 전용) external-apis/perplexity-client.ts에
 *    함수로 포팅해뒀다 — haecho의 서브 에이전트 호출(아직 TODO)이 준비되면 연결.
 *
 * ⚠️ 원본의 APScheduler 매주 일요일 21시 자동발송(start_scheduler)은
 *    포팅하지 않음 — Paperclip의 "Routines & Schedules"(cron 트리거 → issue
 *    생성)로 대체 권장 (cost-summary-client.ts 주석과 동일한 원칙).
 */

import {
  checkoutIssue,
  getIssue,
  postIssueComment,
  updateIssueStatus,
  releaseIssue,
} from "../issue-client";
import type { WakePayload } from "../dispatch";
import { chat } from "../openrouter-client";
import { streamerApi, broadcastLogApi, reportApi } from "../mngbot-api-client";
import { extractChannelId, fetchChannelStats } from "../external-apis/youtube-client";

async function generateWeeklyReport(
  payload: WakePayload,
  companyId: string,
  streamerName: string,
): Promise<string> {
  const streamers =
    streamerName === "all"
      ? await streamerApi.list(companyId)
      : (await streamerApi.list(companyId)).filter((s: any) => s.name === streamerName);

  if (!streamers.length) return "📊 분쵸 — 주간 리포트\n\n등록된 스트리머 없음";

  const sections: string[] = [];
  for (const s of streamers.slice(0, 5)) {
    const logs = await broadcastLogApi.listRecent(companyId, s.id, 7);
    if (!logs.length) {
      sections.push(`[${s.name}]\n최근 7일 데이터 없음`);
      continue;
    }
    const avgViewers = logs.reduce((sum: number, l: any) => sum + l.viewersAvg, 0) / logs.length;
    const peakViewers = Math.max(...logs.map((l: any) => l.viewersPeak));
    const totalChats = logs.reduce((sum: number, l: any) => sum + l.chatCount, 0);
    const avgSentiment =
      logs.reduce((sum: number, l: any) => sum + (l.sentimentPositivePct ?? 0), 0) / logs.length;

    sections.push(
      `[${s.name}]\n` +
        `- 방송 횟수: ${logs.length}회\n` +
        `- 평균 시청자: ${avgViewers.toFixed(0)}명\n` +
        `- 최고 시청자: ${peakViewers.toLocaleString()}명\n` +
        `- 총 채팅: ${totalChats.toLocaleString()}건\n` +
        `- 긍정 감정: ${avgSentiment.toFixed(1)}%`,
    );
  }

  const dataContext = sections.join("\n\n");
  const today = new Date();
  const start = new Date(today.getTime() - 7 * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const result = await chat(
    [
      {
        role: "system",
        content:
          "당신은 분쵸(분석 전문가)입니다. 주간 방송 데이터를 분석해 " +
          "실행 가능한 인사이트를 제공합니다.\n" +
          "구조: 1) 주간 하이라이트 2) 개선점 3) 다음 주 액션",
      },
      {
        role: "user",
        content: `${fmt(start)} ~ ${fmt(today)} 주간 데이터:\n\n${dataContext}\n\n위 데이터를 토대로 주간 리포트를 작성해주세요.`,
      },
    ],
    { companyId, agentId: payload.agentId, issueId: payload.issueId, agent: "bunchyo", tier: "standard", maxTokens: 1200, temperature: 0.5 },
  );

  await reportApi
    .save({
      companyId,
      period: `${fmt(start)} ~ ${fmt(today)}`,
      contentMarkdown: result.content,
      generatedByAgentId: payload.agentId,
      costUsd: result.cost,
    })
    .catch((err) => console.warn("[bunchyo] 리포트 저장 실패:", err));

  return (
    `📊 **분쵸 — 주간 리포트 (${fmt(start).slice(5)} ~ ${fmt(today).slice(5)})**\n\n` +
    `${result.content.slice(0, 3500)}\n\n` +
    `_${result.model.split("/").pop()} · $${result.cost.toFixed(5)} · 분쵸_`
  );
}

async function generateYoutubeStats(companyId: string, streamerName: string): Promise<string> {
  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return "📺 분쵸 — YouTube 통계\n\n⚠️ `YOUTUBE_API_KEY` 미설정.\n`/config_ai`로 설정해주세요.";
  }

  const all = await streamerApi.list(companyId);
  const streamers = streamerName === "all" ? all : all.filter((s: any) => s.name === streamerName);
  if (!streamers.length) return "📺 분쵸 — YouTube 통계\n\n등록된 스트리머 없음";

  const lines: string[] = ["📺 **분쵸 — YouTube 채널 통계**\n"];
  for (const s of streamers.slice(0, 5)) {
    if (!s.youtubeUrl) {
      lines.push(`❌ ${s.name}: YouTube URL 미등록`);
      continue;
    }
    const channelId = extractChannelId(s.youtubeUrl);
    if (!channelId) {
      lines.push(`⚠️ ${s.name}: URL 파싱 실패 (${s.youtubeUrl})`);
      continue;
    }
    const stats = await fetchChannelStats(channelId);
    lines.push(
      stats
        ? `📺 ${s.name}: 구독자 ${stats.subs.toLocaleString()} · 조회수 ${stats.views.toLocaleString()} · 영상 ${stats.videos.toLocaleString()}개`
        : `❌ ${s.name}: 통계 조회 실패`,
    );
  }
  lines.push("\n_YouTube Data API v3 · 분쵸_");
  return lines.join("\n");
}

export async function runBunchyo(payload: WakePayload): Promise<void> {
  const { runId, issueId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);
  const command = issue.metadata?.discordCommand as string;
  const opts: Record<string, string> = Object.fromEntries(
    ((issue.metadata?.discordOptions as { name: string; value: string }[]) ?? []).map((o) => [
      o.name,
      String(o.value),
    ]),
  );
  const streamerName = opts["streamer"] ?? "all";

  try {
    let body: string;
    if (command === "report") {
      body = await generateWeeklyReport(payload, issue.companyId, streamerName);
    } else if (command === "youtube") {
      body = await generateYoutubeStats(issue.companyId, streamerName);
    } else {
      body = `알 수 없는 분쵸 커맨드: ${command}`;
    }
    await postIssueComment(runId, issueId, body);
    await updateIssueStatus(runId, issueId, "done");
  } catch (err) {
    await postIssueComment(runId, issueId, `❌ 처리 실패: ${String((err as Error)?.message ?? err)}`);
    await updateIssueStatus(runId, issueId, "failed");
  } finally {
    await releaseIssue(runId, issueId);
  }
}
