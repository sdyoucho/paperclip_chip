/**
 * mngbot-runtime/handlers/sochyo.ts
 * modules/schedule.py 전체 포팅. LLM 호출 없음 — 원본 그대로 단순 CRUD.
 * 즉시실행(C카테고리) 핸들러의 "완전 구현" 레퍼런스 — 다른 즉시실행
 * 핸들러(inchyo/mochyo/bunchyo/dichyo)도 이 구조를 따라 작성하면 된다.
 */

import {
  checkoutIssue,
  getIssue,
  postIssueComment,
  updateIssueStatus,
  releaseIssue,
} from "../issue-client";
import type { WakePayload } from "../dispatch";
import { scheduleApi } from "../mngbot-api-client";

function parseScheduleDate(dateStr: string): string {
  // 원본 _parse_schedule_date 그대로: "YYYY-MM-DD" 또는 "YYYY-MM-DD HH:MM"
  if (dateStr.length > 10) {
    return new Date(dateStr.replace(" ", "T")).toISOString();
  }
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

export async function runSochyo(payload: WakePayload): Promise<void> {
  const { runId, issueId } = payload;
  await checkoutIssue(runId, issueId);
  const issue = await getIssue(runId, issueId);

  const command = issue.metadata?.discordCommand as string;
  const opts: Record<string, string> = Object.fromEntries(
    ((issue.metadata?.discordOptions as { name: string; value: string }[]) ?? []).map(
      (o) => [o.name, String(o.value)],
    ),
  );

  try {
    let resultText: string;

    switch (command) {
      case "schedule": {
        const items = await scheduleApi.listThisWeek(issue.companyId);
        resultText = items.length
          ? items
              .map((it: any) => `• \`${it.id.slice(0, 8)}\` ${it.startAt} — ${it.title}`)
              .join("\n")
          : "📅 등록된 일정 없음\n\n`/schedule_add`로 일정을 등록해주세요.";
        break;
      }
      case "schedule_add": {
        const startAt = parseScheduleDate(opts["date"]);
        const created = await scheduleApi.create({
          companyId: issue.companyId,
          title: opts["title"],
          startAt,
          description: opts["memo"],
          createdByAgentId: payload.agentId,
        });
        resultText = `✅ 스케줄 등록 완료\n**제목**: ${created.title}\n**날짜**: ${created.startAt}`;
        break;
      }
      case "schedule_edit": {
        await scheduleApi.update(opts["short_id"], {
          title: opts["title"],
          startAt: opts["date"] ? parseScheduleDate(opts["date"]) : undefined,
          description: opts["memo"],
        });
        resultText = `✅ 스케줄 수정 완료 (\`${opts["short_id"]}\`)`;
        break;
      }
      case "schedule_remove": {
        await scheduleApi.remove(opts["short_id"]);
        resultText = `🗑️ 스케줄 삭제 완료 (\`${opts["short_id"]}\`)`;
        break;
      }
      default:
        resultText = `알 수 없는 커맨드: ${command}`;
    }

    await postIssueComment(runId, issueId, resultText);
    await updateIssueStatus(runId, issueId, "done");
  } catch (err) {
    await postIssueComment(
      runId,
      issueId,
      `❌ 날짜 형식 오류 또는 처리 실패: ${String((err as Error)?.message ?? err)}`,
    );
    await updateIssueStatus(runId, issueId, "failed");
  } finally {
    await releaseIssue(runId, issueId);
  }
}
