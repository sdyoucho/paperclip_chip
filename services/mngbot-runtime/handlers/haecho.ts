/**
 * mngbot-runtime/handlers/haecho.ts
 * modules/haecho.py 포팅. /ask 커맨드(즉시실행)의 실제 처리.
 * router.ts/openrouter-client.ts 포팅 완료분을 사용해 실제로 동작한다.
 *
 * ⚠️ 남은 TODO: 각 서브 에이전트(모쵸/분쵸/기쵸/스쵸/인쵸/개쵸/디쵸)의
 *    light 모델 사전요약 호출(callSubAgentPreSummary) — 이건 각 에이전트의
 *    모듈 로직(money.py, weekly_report.py 등) 자체를 포팅해야 의미있게
 *    구현되므로, 해당 모듈들의 "light 사전요약 버전"이 준비된 뒤 연결.
 *    지금은 라우팅 결과만으로 premium 종합을 만든다(서브 에이전트 결과 없이).
 */

import {
  checkoutIssue,
  getIssue,
  postIssueComment,
  updateIssueStatus,
  releaseIssue,
} from "../issue-client";
import type { WakePayload } from "../dispatch";
import { route } from "../router";
import { chat } from "../openrouter-client";

export async function runHaecho(payload: WakePayload): Promise<void> {
  const { runId, issueId, agentId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);
  const opts: Record<string, string> = Object.fromEntries(
    ((issue.metadata?.discordOptions as { name: string; value: string }[]) ?? []).map((o) => [
      o.name,
      String(o.value),
    ]),
  );
  const query = opts["query"] ?? ""; // 원본 /ask의 실제 옵션명: query (streamer는 선택)

  const chatOptions = { companyId: issue.companyId, agentId, issueId };

  try {
    const routed = await route(query, chatOptions);

    // TODO: routed.modules 각각에 대해 서브 에이전트의 light 사전요약 호출.
    // 지금은 라우팅 근거만 premium 모델에 함께 전달.
    const moduleSummary = routed.modules
      .map((m) => `- ${m.name} (우선순위 ${m.priority}): ${m.reason ?? ""}`)
      .join("\n");

    const synth = await chat(
      [
        {
          role: "system",
          content:
            "당신은 해쵸, Cho의 매니지먼트 봇 총괄 매니저입니다. " +
            "라우팅된 모듈 목록을 참고해 사용자 질문에 대한 종합 브리핑을 작성하세요.",
        },
        {
          role: "user",
          content: `질문: ${query}\n\n라우팅된 모듈:\n${moduleSummary}`,
        },
      ],
      { ...chatOptions, agent: "haecho" },
    );

    await postIssueComment(runId, issueId, synth.content);
    await updateIssueStatus(runId, issueId, "done");
  } catch (err) {
    await postIssueComment(
      runId,
      issueId,
      `❌ 처리 중 오류가 발생했어요: ${String((err as Error)?.message ?? err)}`,
    );
    await updateIssueStatus(runId, issueId, "failed");
  } finally {
    await releaseIssue(runId, issueId);
  }
}
