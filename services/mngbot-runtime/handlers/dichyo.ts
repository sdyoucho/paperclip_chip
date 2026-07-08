/**
 * mngbot-runtime/handlers/dichyo.ts
 * modules/design.py 전체 포팅. vision 티어(gpt-4o)로 디자인 제안.
 */
import { checkoutIssue, getIssue, postIssueComment, updateIssueStatus, releaseIssue } from "../issue-client";
import type { WakePayload } from "../dispatch";
import { chat } from "../openrouter-client";

const SYSTEM =
  "당신은 '디쵸'입니다. 스트리머 채널 디자인·포스터·PPT·썸네일 레퍼런스와 " +
  "아이디어를 제안합니다. Figma 기반 디자인 구성을 제안할 수 있습니다.";

export async function runDichyo(payload: WakePayload): Promise<void> {
  const { runId, issueId, agentId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);
  const opts: Record<string, string> = Object.fromEntries(
    ((issue.metadata?.discordOptions as { name: string; value: string }[]) ?? []).map((o) => [
      o.name,
      String(o.value),
    ]),
  );
  const query = opts["requirements"] ?? ""; // 원본 /rnd_design의 실제 옵션명: requirements

  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: query },
      ],
      { companyId: issue.companyId, agentId, issueId, agent: "dichyo", maxTokens: 800, temperature: 0.8 },
    );

    const body =
      `🎨 **디쵸 — 디자인 제안**\n\n${result.content.slice(0, 3500)}\n\n` +
      `_${result.model.split("/").pop()} · $${result.cost.toFixed(5)}_`;

    await postIssueComment(runId, issueId, body);
    await updateIssueStatus(runId, issueId, "done");
  } catch (err) {
    await postIssueComment(runId, issueId, `❌ 디자인 오류: ${String((err as Error)?.message ?? err)}`);
    await updateIssueStatus(runId, issueId, "failed");
  } finally {
    await releaseIssue(runId, issueId);
  }
}
