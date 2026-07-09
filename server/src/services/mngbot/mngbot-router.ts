/**
 * core-fork/server/src/services/mngbot/mngbot-router.ts
 *
 * services/mngbot-runtime + services/discord-adapter가 호출하는 모든
 * /api/mngbot/* 엔드포인트의 실제 Express 구현.
 *
 * ⚠️ 이 파일을 server 코드에 등록하는 방법은 이 폴더의 REGISTER.md 참고.
 *    (기존 라우팅 파일에 registerMngbotRoutes(app)를 한 줄 추가)
 *
 * 설계 원칙:
 *  - Paperclip 내부 헬퍼에 최대한 의존하지 않고, drizzle db 하나만 받아서 동작.
 *  - 인증은 간단한 Bearer 토큰(MNGBOT_API_KEY) 확인. 이 값을 mngbot-runtime과
 *    discord-adapter의 PAPERCLIP_AGENT_API_KEY / PAPERCLIP_DISCORD_ADAPTER_API_KEY와
 *    동일하게 맞추면 된다.
 *  - 모든 응답은 JSON.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  mngbotStreamers,
  mngbotScheduleItems,
  mngbotFixedCosts,
  mngbotFixedCostPayments,
  mngbotReports,
  mngbotBroadcastLogs,
  mngbotLearningItems,
  mngbotCodeChangeSessions,
  mngbotDiscordLinks,
} from "@paperclipai/db";

// db 타입은 느슨하게 받는다(코어의 정확한 Db 타입에 의존하지 않도록).
type AnyDb = any;

// ── 인증 미들웨어 ──────────────────────────────────────────────────
function makeAuthMiddleware() {
  const expected = process.env.MNGBOT_API_KEY;
  return (req: Request, res: Response, next: NextFunction) => {
    // MNGBOT_API_KEY가 설정 안 돼 있으면 인증 스킵(로컬 테스트 편의).
    if (!expected) return next();
    const auth = req.headers.authorization;
    if (auth === `Bearer ${expected}`) return next();
    res.status(401).json({ error: "unauthorized" });
  };
}

// 비동기 핸들러 에러를 자동으로 500으로 변환하는 래퍼
function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("[mngbot-router]", req.method, req.path, err);
      res.status(500).json({ error: String(err?.message ?? err) });
    });
  };
}

export function registerMngbotRoutes(app: Express, db: AnyDb): void {
  const auth = makeAuthMiddleware();
  const r = "/api/mngbot";

  // ═══════════════ 스트리머 ═══════════════
  app.get(`${r}/streamers`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    const rows = await db.select().from(mngbotStreamers)
      .where(eq(mngbotStreamers.companyId, companyId));
    res.json(rows);
  }));

  app.post(`${r}/streamers`, auth, h(async (req, res) => {
    const { companyId, name, chzzkUrl, youtubeUrl, soopUrl } = req.body;
    const [row] = await db.insert(mngbotStreamers).values({
      companyId, name, chzzkUrl, youtubeUrl, soopUrl,
    }).returning();
    res.json(row);
  }));

  // ═══════════════ 방송 로그 ═══════════════
  app.get(`${r}/broadcast-logs`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    const streamerId = String(req.query.streamerId);
    const days = Number(req.query.days ?? 7);
    const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const rows = await db.select().from(mngbotBroadcastLogs).where(and(
      eq(mngbotBroadcastLogs.companyId, companyId),
      eq(mngbotBroadcastLogs.streamerId, streamerId),
      gte(mngbotBroadcastLogs.logDate, since),
    ));
    res.json(rows);
  }));

  // ═══════════════ 스케줄 ═══════════════
  app.get(`${r}/schedule-items`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    // range=this_week 이면 이번 주(오늘~+7일)만. 아니면 전체.
    if (req.query.range === "this_week") {
      const now = new Date();
      const weekLater = new Date(Date.now() + 7 * 86400_000);
      const rows = await db.select().from(mngbotScheduleItems).where(and(
        eq(mngbotScheduleItems.companyId, companyId),
        gte(mngbotScheduleItems.startAt, now),
      )).orderBy(mngbotScheduleItems.startAt);
      res.json(rows.filter((x: any) => new Date(x.startAt) <= weekLater));
      return;
    }
    const rows = await db.select().from(mngbotScheduleItems)
      .where(eq(mngbotScheduleItems.companyId, companyId))
      .orderBy(mngbotScheduleItems.startAt);
    res.json(rows);
  }));

  app.post(`${r}/schedule-items`, auth, h(async (req, res) => {
    const { companyId, title, startAt, description, createdByAgentId } = req.body;
    const [row] = await db.insert(mngbotScheduleItems).values({
      companyId, title, startAt: new Date(startAt), description, createdByAgentId,
    }).returning();
    res.json(row);
  }));

  app.patch(`${r}/schedule-items/:id`, auth, h(async (req, res) => {
    const patch: any = { updatedAt: new Date() };
    if (req.body.title !== undefined) patch.title = req.body.title;
    if (req.body.startAt !== undefined) patch.startAt = new Date(req.body.startAt);
    if (req.body.description !== undefined) patch.description = req.body.description;
    // 8자리 짧은 ID 지원: 앞자리가 일치하는 행을 찾아 갱신
    const [row] = await db.update(mngbotScheduleItems).set(patch)
      .where(sql`${mngbotScheduleItems.id}::text like ${req.params.id + "%"}`)
      .returning();
    res.json(row ?? { error: "not found" });
  }));

  app.delete(`${r}/schedule-items/:id`, auth, h(async (req, res) => {
    await db.delete(mngbotScheduleItems)
      .where(sql`${mngbotScheduleItems.id}::text like ${req.params.id + "%"}`);
    res.json({ ok: true });
  }));

  // ═══════════════ 고정비 ═══════════════
  app.get(`${r}/fixed-costs`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    const rows = await db.select().from(mngbotFixedCosts)
      .where(eq(mngbotFixedCosts.companyId, companyId));
    res.json(rows);
  }));

  app.get(`${r}/fixed-costs/total-monthly-krw`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    const rows = await db.select().from(mngbotFixedCosts).where(and(
      eq(mngbotFixedCosts.companyId, companyId),
      eq(mngbotFixedCosts.active, true),
    ));
    const total = rows.reduce((sum: number, c: any) => sum + Number(c.amountKrw), 0);
    res.json({ total });
  }));

  app.post(`${r}/fixed-costs`, auth, h(async (req, res) => {
    const { companyId, name, amountKrw, payDay } = req.body;
    const [row] = await db.insert(mngbotFixedCosts).values({
      companyId, name, amountKrw, payDay,
    }).returning();
    res.json(row);
  }));

  app.delete(`${r}/fixed-costs/by-name/:name`, auth, h(async (req, res) => {
    const companyId = String(req.query.companyId);
    const name = decodeURIComponent(String(req.params.name));
    await db.delete(mngbotFixedCosts).where(and(
      eq(mngbotFixedCosts.companyId, companyId),
      eq(mngbotFixedCosts.name, name),
    ));
    res.json({ ok: true });
  }));

  app.post(`${r}/fixed-costs/by-name/:name/payments`, auth, h(async (req, res) => {
    const { companyId, paidAt, recordedByAgentId } = req.body;
    const name = decodeURIComponent(String(req.params.name));
    const [cost] = await db.select().from(mngbotFixedCosts).where(and(
      eq(mngbotFixedCosts.companyId, companyId),
      eq(mngbotFixedCosts.name, name),
    )).limit(1);
    if (!cost) { res.status(404).json({ error: "fixed cost not found" }); return; }
    const [row] = await db.insert(mngbotFixedCostPayments).values({
      companyId, fixedCostId: cost.id, paidAt, amountKrw: cost.amountKrw, recordedByAgentId,
    }).returning();
    res.json(row);
  }));

  // ═══════════════ 리포트 ═══════════════
  app.post(`${r}/reports`, auth, h(async (req, res) => {
    const { companyId, streamerId, period, contentMarkdown, generatedByAgentId, costUsd } = req.body;
    const [row] = await db.insert(mngbotReports).values({
      companyId, streamerId, period, contentMarkdown, generatedByAgentId,
      costUsd: String(costUsd ?? 0),
    }).returning();
    res.json(row);
  }));

  // ═══════════════ 학습 항목 ═══════════════
  app.post(`${r}/learning-items`, auth, h(async (req, res) => {
    const { companyId, issueId, subject, category, sources, requestedBy, executedByAgentId, status } = req.body;
    const [row] = await db.insert(mngbotLearningItems).values({
      companyId, issueId, subject, category, sources, requestedBy, executedByAgentId,
      status: status ?? "requested",
    }).returning();
    res.json(row);
  }));

  app.get(`${r}/learning-items`, auth, h(async (req, res) => {
    if (req.query.issueId) {
      const rows = await db.select().from(mngbotLearningItems)
        .where(eq(mngbotLearningItems.issueId, String(req.query.issueId)));
      res.json(rows);
      return;
    }
    const companyId = String(req.query.companyId);
    const rows = await db.select().from(mngbotLearningItems)
      .where(eq(mngbotLearningItems.companyId, companyId));
    res.json(rows);
  }));

  app.patch(`${r}/learning-items/:id`, auth, h(async (req, res) => {
    const patch: any = { ...req.body, updatedAt: new Date() };
    if (patch.approvedAt) patch.approvedAt = new Date(patch.approvedAt);
    if (patch.completedAt) patch.completedAt = new Date(patch.completedAt);
    const [row] = await db.update(mngbotLearningItems).set(patch)
      .where(eq(mngbotLearningItems.id, req.params.id)).returning();
    res.json(row);
  }));

  // ═══════════════ 코드 변경 세션 ═══════════════
  app.post(`${r}/code-change-sessions`, auth, h(async (req, res) => {
    const { companyId, issueId, userRequest, requester, createdByAgentId, status } = req.body;
    const [row] = await db.insert(mngbotCodeChangeSessions).values({
      companyId, issueId, userRequest, requester, createdByAgentId,
      status: status ?? "plan_pending",
    }).returning();
    res.json(row);
  }));

  app.get(`${r}/code-change-sessions`, auth, h(async (req, res) => {
    const rows = await db.select().from(mngbotCodeChangeSessions)
      .where(eq(mngbotCodeChangeSessions.issueId, String(req.query.issueId)));
    res.json(rows);
  }));

  app.patch(`${r}/code-change-sessions/:id`, auth, h(async (req, res) => {
    const patch: any = { ...req.body, updatedAt: new Date() };
    const [row] = await db.update(mngbotCodeChangeSessions).set(patch)
      .where(eq(mngbotCodeChangeSessions.id, req.params.id)).returning();
    res.json(row);
  }));

  // ═══════════════ Discord 링크 매핑 ═══════════════
  app.post(`${r}/discord-links`, auth, h(async (req, res) => {
    const { companyId, issueId, discordGuildId, discordChannelId, requestedByDiscordUserId } = req.body;
    const [row] = await db.insert(mngbotDiscordLinks).values({
      companyId, issueId, discordGuildId, discordChannelId, requestedByDiscordUserId,
    }).returning();
    res.json(row);
  }));

  app.get(`${r}/discord-links`, auth, h(async (_req, res) => {
    // status=pending 개념은 issue 상태와 연동돼야 하나, 지금은 전체 반환(단순화).
    const rows = await db.select().from(mngbotDiscordLinks);
    res.json(rows);
  }));

  app.patch(`${r}/discord-links/:issueId`, auth, h(async (req, res) => {
    const patch: any = {};
    if (req.body.lastSeenCommentCount !== undefined) {
      patch.lastSeenCommentCount = String(req.body.lastSeenCommentCount);
    }
    const [row] = await db.update(mngbotDiscordLinks).set(patch)
      .where(eq(mngbotDiscordLinks.issueId, req.params.issueId)).returning();
    res.json(row);
  }));

  console.log("[mngbot-router] /api/mngbot/* 라우트 등록 완료");
}
