/**
 * mngbot-runtime/handlers/inchyo.ts
 * modules/money.py + modules/fixed_costs.py 포팅.
 *
 * ⚠️ 의도적으로 포팅하지 않은 것 (cost-summary-client.ts 주석과 동일 원칙):
 *    - check_thresholds()/_send_threshold_alert() (50/70/100% DM 알림)
 *      → Paperclip Budget Policy의 hard-stop/알림 기능으로 대체 권장.
 *    - 매월 말일 23시 자동 정산 발송 스케줄러
 *      → Paperclip Routines(cron)로 대체 권장.
 *    - fixed_costs.py의 sync_from_notion() (Notion→로컬, 역방향)
 *      → Phase 3 설계(Postgres가 단일 진실)와 충돌해 의도적으로 제외.
 *    - streamer_add/streamer_list (별도 streamerApi 책임으로 분리 — 이 파일은
 *      money/settlement/fixedcost_* 만 처리)
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
import { fixedCostApi, streamerApi } from "../mngbot-api-client";
import { getMonthlyCostSummary, getBudgetPolicy, getRemainingOpenRouterCredits } from "../cost-summary-client";

const USD_KRW = 1380; // ⚠️ 원본 하드코딩 그대로 유지 — 실거래 환율 연동은 별도 개선 과제

function progressBar(ratio: number, length = 20): string {
  const filled = Math.round(ratio * length);
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, length - filled));
}

function sparkline(values: number[]): string {
  if (!values.length) return "";
  const blocks = "▁▂▃▄▅▆▇█";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  return values.map((v) => blocks[Math.floor(((v - lo) / span) * 7)]).join("");
}

// ── /money: 자금 현황 ────────────────────────────────────────────────
async function getFinancialSummary(companyId: string): Promise<string> {
  const [credits, summary, policy, fixedTotal] = await Promise.all([
    getRemainingOpenRouterCredits(),
    getMonthlyCostSummary(companyId),
    getBudgetPolicy(companyId),
    fixedCostApi.getTotalMonthlyKrw(companyId),
  ]);

  const monthlyLimit = policy.monthlyLimitUsd;
  const ratio = monthlyLimit ? summary.monthTotalUsd / monthlyLimit : 0;
  const bar = progressBar(ratio);

  const topAgents = Object.entries(summary.byAgent).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topModels = Object.entries(summary.byModel).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const lines = [
    "💰 **인쵸 — 자금 현황**\n",
    `**이번 달 크레딧 한도**`,
    `${bar} \`${(ratio * 100).toFixed(1)}%\``,
    `사용: \`$${summary.monthTotalUsd.toFixed(3)}\` / 한도 \`$${monthlyLimit.toFixed(2)}\``,
    `잔여: **\`$${(monthlyLimit - summary.monthTotalUsd).toFixed(3)}\`**\n`,
    `**🌐 OpenRouter 계정 잔여**`,
    `사용: \`$${credits.usage.toFixed(3)}\` / 총 \`$${credits.total.toFixed(3)}\` (\`${(credits.usage_ratio * 100).toFixed(1)}%\`)`,
    `잔여: \`$${credits.remaining.toFixed(3)}\`\n`,
  ];

  if (topAgents.length) {
    lines.push("**🤖 에이전트별 (Top 5)**");
    lines.push(...topAgents.map(([a, c]) => `• ${a}: \`$${c.toFixed(4)}\``));
    lines.push("");
  }
  if (topModels.length) {
    lines.push("**🧠 모델별 (Top 5)**");
    lines.push(...topModels.map(([m, c]) => `• \`${m.split("/").pop()?.slice(0, 25)}\`: $${c.toFixed(4)}`));
    lines.push("");
  }

  lines.push(`**🏢 고정비 (월)**: ₩${fixedTotal.toLocaleString()}\n`);
  lines.push(
    `_임계치 ${policy.thresholds.map((t) => `${Math.round(t * 100)}%`).join("/")} (Paperclip Budget Policy) | /settlement 로 월말정산_`,
  );
  return lines.join("\n");
}

// ── /settlement: 월말정산 ────────────────────────────────────────────
async function getMonthlySettlement(companyId: string): Promise<string> {
  const summary = await getMonthlyCostSummary(companyId);
  const fixedTotal = await fixedCostApi.getTotalMonthlyKrw(companyId);

  const krw = Math.round(summary.monthTotalUsd * USD_KRW);
  const now = new Date();

  const lines = [
    `📊 **인쵸 — ${now.getFullYear()}년 ${now.getMonth() + 1}월 월말정산**\n`,
    `**💸 이번 달 AI 토큰 총 지출**: **$${summary.monthTotalUsd.toFixed(4)}** (≈ ₩${krw.toLocaleString()})\n`,
  ];

  const byAgent = Object.entries(summary.byAgent).sort((a, b) => b[1] - a[1]);
  if (byAgent.length) {
    lines.push("**🤖 에이전트별 분해**");
    lines.push(
      ...byAgent.map(
        ([a, c]) => `• **${a}**: $${c.toFixed(4)} (${((c / summary.monthTotalUsd) * 100).toFixed(1)}%)`,
      ),
    );
    lines.push("");
  }

  if (summary.dailySeries.length) {
    const spark = sparkline(summary.dailySeries.map((d) => d.costUsd));
    const maxDay = Math.max(...summary.dailySeries.map((d) => d.costUsd));
    lines.push(`**📈 일별 추이 (${summary.dailySeries.length}일)**`);
    lines.push(`\`${spark}\`\n최대: $${maxDay.toFixed(4)}/일\n`);
  }

  const totalNext = Math.round(summary.projectedNextMonthUsd * USD_KRW) + fixedTotal;
  lines.push(
    "**🔮 다음 달 예상 유지비**",
    `AI 토큰 예상: $${summary.projectedNextMonthUsd.toFixed(4)} (≈ ₩${Math.round(summary.projectedNextMonthUsd * USD_KRW).toLocaleString()})`,
    `고정비: ₩${fixedTotal.toLocaleString()}`,
    `**합계: ₩${totalNext.toLocaleString()}**`,
  );
  return lines.join("\n");
}

// ── 자연어 자금 질의 (haecho 위임 또는 직접 호출) ───────────────────
// ⚠️ 현재 직접 호출하는 곳 없음 — /money는 옵션이 없어 항상 요약만 반환.
// haecho의 서브 에이전트 사전요약 호출(TODO, haecho.ts 참고)이 구현되면
// 자연어 자금 질의 경로로 이 함수를 연결한다.
export async function handleMoneyQuery(payload: WakePayload, companyId: string, query: string): Promise<string> {
  const [credits, summary, fixedCosts, streamers] = await Promise.all([
    getRemainingOpenRouterCredits(),
    getMonthlyCostSummary(companyId),
    fixedCostApi.list(companyId),
    streamerApi.list(companyId),
  ]);

  const agentBreakdown =
    Object.entries(summary.byAgent).length
      ? Object.entries(summary.byAgent).sort((a, b) => b[1] - a[1]).map(([a, c]) => `  - ${a}: $${c.toFixed(4)}`).join("\n")
      : "  - (데이터 없음)";
  const modelBreakdown =
    Object.entries(summary.byModel).length
      ? Object.entries(summary.byModel).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, c]) => `  - ${m.split("/").pop()}: $${c.toFixed(4)}`).join("\n")
      : "  - (데이터 없음)";
  const fixedBreakdown = fixedCosts.length
    ? fixedCosts.map((c: any) => `• ${c.name}: ₩${c.amountKrw.toLocaleString()}`).join("\n")
    : "• (등록된 고정비 없음)";
  const fixedSum = fixedCosts.reduce((sum: number, c: any) => sum + c.amountKrw, 0);

  const context = `[현재 재무 스냅샷]
• 등록 스트리머: ${streamers.length}명
• OpenRouter 크레딧: 사용 $${credits.usage.toFixed(4)} / 총 $${credits.total.toFixed(4)} (${(credits.usage_ratio * 100).toFixed(1)}%)
• 잔여 크레딧: $${credits.remaining.toFixed(4)}
• 이번 달 AI 토큰 누적: $${summary.monthTotalUsd.toFixed(4)} (≈ ₩${Math.round(summary.monthTotalUsd * USD_KRW).toLocaleString()})

[에이전트별 누적 비용]
${agentBreakdown}

[모델별 누적 비용 (상위 5개)]
${modelBreakdown}

[월 고정비]
${fixedBreakdown}
• 합계: ₩${fixedSum.toLocaleString()}
`;

  const result = await chat(
    [
      {
        role: "system",
        content:
          "당신은 '인쵸'입니다. Cho의 매니지먼트 봇 자금 분석 전문가로서, " +
          "아래 실제 데이터만 근거로 답변하세요. 추측 금지. " +
          "숫자는 반드시 원문 그대로 인용하고, 필요 시 한화(원) 환산을 곁들이세요.\n\n" +
          context,
      },
      { role: "user", content: query },
    ],
    { companyId, agentId: payload.agentId, issueId: payload.issueId, agent: "inchyo", maxTokens: 600, temperature: 0.3 },
  );

  return (
    `💰 **인쵸 — 자금 분석**\n\n${result.content.slice(0, 3500)}\n\n` +
    `_${result.model.split("/").pop()} · $${result.cost.toFixed(5)} · 인쵸_`
  );
}

export async function runInchyo(payload: WakePayload): Promise<void> {
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

  try {
    let body: string;
    switch (command) {
      case "money":
        // ⚠️ 원본 /money는 옵션이 없다(자연어 질의는 /ask 경로). 항상 요약만 반환.
        body = await getFinancialSummary(issue.companyId);
        break;
      case "settlement":
        body = await getMonthlySettlement(issue.companyId);
        break;
      case "streamer_add": {
        const created = await streamerApi.create({
          companyId: issue.companyId,
          name: opts["name"],
          chzzkUrl: opts["chzzk_url"],
          youtubeUrl: opts["youtube_url"],
          soopUrl: opts["soop_url"],
        });
        body = `✅ 스트리머 등록 완료: ${created.name}`;
        break;
      }
      case "streamer_list": {
        const list = await streamerApi.list(issue.companyId);
        body = list.length
          ? list.map((s: any) => `• ${s.name}${s.active ? "" : " (비활성)"}`).join("\n")
          : "등록된 스트리머 없음";
        break;
      }
      case "fixedcost_list": {
        const costs = await fixedCostApi.list(issue.companyId);
        body = costs.length
          ? costs.map((c: any) => `• ${c.name}: ₩${c.amountKrw.toLocaleString()} (매월 ${c.payDay}일)`).join("\n")
          : "등록된 고정비 없음";
        break;
      }
      case "fixedcost_add": {
        const created = await fixedCostApi.create({
          companyId: issue.companyId,
          name: opts["name"],
          amountKrw: Number(opts["amount_krw"]),
          payDay: Number(opts["pay_day"]),
        });
        body = `✅ 고정비 등록 완료: ${created.name} (₩${created.amountKrw.toLocaleString()}/월)`;
        break;
      }
      case "fixedcost_remove":
        await fixedCostApi.removeByName(issue.companyId, opts["name"]);
        body = `🗑️ 고정비 삭제 완료: ${opts["name"]}`;
        break;
      case "fixedcost_paid":
        await fixedCostApi.markPaidByName(issue.companyId, opts["name"], payload.agentId);
        body = `✅ 납부 처리 완료: ${opts["name"]} — Notion 백업은 자동 동기화됩니다.`;
        break;
      case "fixedcost_sync":
        body =
          "ℹ️ Phase 3 설계상 Notion→Postgres 역방향 동기화는 지원하지 않습니다. " +
          "Postgres가 항상 source of truth이며, 변경은 여기서 직접 해주세요 " +
          "(Notion 쪽은 자동으로 따라옵니다).";
        break;
      default:
        body = `알 수 없는 인쵸 커맨드: ${command}`;
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
