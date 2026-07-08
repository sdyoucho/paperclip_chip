/**
 * mngbot-runtime/server.ts
 * Phase 2 adapterConfig.url("http://mngbot-runtime:4100/wake")이 가리키는
 * 실제 서버. heartbeat wake를 받아 dispatch.ts로 넘긴다.
 */

import express from "express";
import { dispatchWake, type WakePayload } from "./dispatch";

const app = express();
app.use(express.json());

const INTERNAL_TOKEN = process.env.MNGBOT_INTERNAL_TOKEN!;

app.post("/wake", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${INTERNAL_TOKEN}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const payload = req.body as WakePayload;
  if (!payload.agentSlug || !payload.issueId) {
    return res.status(400).json({ error: "agentSlug/issueId 필요" });
  }

  // Paperclip이 동기 응답을 기대하는지, 비동기(202 즉시 반환 후 백그라운드
  // 처리)를 기대하는지는 adapter 계약 문서를 확인해야 함. premium 모델
  // 호출은 수십 초가 걸릴 수 있으므로(원본 timeout=90s) 여기서는 일단
  // 동기 처리하되, adapterConfig.timeoutMs(Phase 2에서 60~120s로 설정)를
  // 넘기지 않는다는 전제.
  try {
    await dispatchWake(payload);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[mngbot-runtime] wake 처리 실패 (${payload.agentSlug}):`, err);
    res.status(500).json({ ok: false, error: String((err as Error)?.message ?? err) });
  }
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => {
  console.log(`[mngbot-runtime] listening on :${port}`);
});
