/**
 * mngbot-runtime/openrouter-client.ts
 * utils/openrouter_client.py 전체 포팅.
 *
 * 원본과의 유일한 의도적 차이: `record_usage()`(로컬 SQLite)를 Paperclip
 * 코어의 `cost_events` API 호출로 교체했다 (Phase 1 설계 원칙: 비용은
 * cost_events가 source of truth, mngbot 쪽에 따로 쌓지 않음).
 *
 * 모델 티어 오버라이드(/model_set, /model_agent)도 원본은 로컬 JSON
 * 파일(utils/model_config.py)로 영속화했지만, 여기서는 Paperclip
 * agents.adapterConfig/metadata를 영속 저장소로 사용한다(추후 구현,
 * 지금은 in-memory만 — TODO 표시).
 */

import crypto from "crypto";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";

export const MODEL_TIERS: Record<string, string> = {
  router: "google/gemini-3.1-flash-lite",
  light: "google/gemini-3.1-flash-lite",
  standard: "anthropic/claude-opus-4.7",
  premium: "anthropic/claude-opus-4.7",
  research: "perplexity/sonar-pro",
  vision: "openai/gpt-4o",
};

export const FALLBACK_CHAIN: Record<string, string[]> = {
  router: ["openai/gpt-5-nano"],
  light: ["openai/gpt-5-nano"],
  standard: ["anthropic/claude-3.5-sonnet", "anthropic/claude-3-opus"],
  premium: ["anthropic/claude-3.5-sonnet", "anthropic/claude-3-opus"],
  research: ["perplexity/sonar"],
  vision: ["openai/gpt-4o-mini"],
};

export const AGENT_TIER: Record<string, string> = {
  haecho: "premium",
  gihyo: "standard",
  bunchyo: "research",
  mochyo: "light",
  sochyo: "light",
  inchyo: "light",
  gaechyo: "standard",
  dichyo: "vision",
  router: "router",
};

// TODO: 부팅 시 Paperclip agents API에서 metadata.modelTierKey/adapterConfig
// 오버라이드를 읽어 MODEL_TIERS/AGENT_TIER에 반영 (원본 _load_persisted_config 대체).

// ── 응답 캐시 (TTL 600초, 원본과 동일) ───────────────────────────────
const CACHE_TTL_MS = 600_000;
const cache = new Map<string, { ts: number; value: ChatResult }>();

function cacheKey(model: string, messages: ChatMessage[]): string {
  return crypto
    .createHash("sha256")
    .update(`${model}:${JSON.stringify(messages)}`)
    .digest("hex");
}

function cacheGet(key: string): ChatResult | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  if (entry) cache.delete(key);
  return null;
}

function cacheSet(key: string, value: ChatResult): void {
  if (cache.size > 200) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { ts: Date.now(), value });
}

// ── Gemini 직접 호출 ─────────────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
  cost: number;
  model: string;
}

function toGeminiPayload(messages: ChatMessage[]) {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content);
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  return {
    contents,
    ...(systemParts.length
      ? { systemInstruction: { parts: [{ text: systemParts.join("\n") }] } }
      : {}),
  };
}

async function callGeminiDirect(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<ChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const bareModel = model.replace(/^google\//, "");
  const payload = {
    ...toGeminiPayload(messages),
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };

  const url = GEMINI_URL.replace("{model}", bareModel);
  const res = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(data).slice(0, 150)}`);
  }
  const content = data.candidates[0].content.parts[0].text;
  const meta = data.usageMetadata ?? {};
  return {
    content,
    usage: {
      prompt_tokens: meta.promptTokenCount ?? 0,
      completion_tokens: meta.candidatesTokenCount ?? 0,
      total_tokens: meta.totalTokenCount ?? 0,
    },
    cost: 0.0,
    model,
  };
}

// ── 런타임 모델 변경 API (원본 set_tier_model/set_agent_tier) ───────
export function setTierModel(tier: string, model: string): void {
  if (!(tier in MODEL_TIERS)) throw new Error(`알 수 없는 tier: ${tier}`);
  MODEL_TIERS[tier] = model;
  // TODO: Paperclip agents/company 설정에 영속화
}

export function setAgentTier(agent: string, tier: string): void {
  if (!(agent in AGENT_TIER)) throw new Error(`알 수 없는 agent: ${agent}`);
  if (!(tier in MODEL_TIERS)) throw new Error(`알 수 없는 tier: ${tier}`);
  AGENT_TIER[agent] = tier;
  // TODO: Paperclip agents 설정에 영속화
}

export function getCurrentConfig() {
  return { tiers: { ...MODEL_TIERS }, agents: { ...AGENT_TIER } };
}

// ── 비용 기록: cost_events API (원본 record_usage 대체) ─────────────
async function recordCostEvent(input: {
  companyId: string;
  agentId: string;
  issueId?: string;
  model: string;
  usage: ChatUsage;
  costUsd: number;
}): Promise<void> {
  try {
    await fetch(
      `${process.env.PAPERCLIP_API_BASE ?? "http://localhost:3100"}/api/companies/${input.companyId}/cost-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PAPERCLIP_AGENT_API_KEY}`,
        },
        body: JSON.stringify({
          agentId: input.agentId,
          issueId: input.issueId,
          provider: input.model.split("/")[0],
          model: input.model,
          inputTokens: input.usage.prompt_tokens ?? 0,
          outputTokens: input.usage.completion_tokens ?? 0,
          costCents: Math.round(input.costUsd * 100),
          occurredAt: new Date().toISOString(),
        }),
      },
    );
  } catch (err) {
    // 비용 기록 실패가 본 작업 흐름을 막으면 안 됨 — 로그만 남김
    console.warn("[openrouter-client] cost-event 기록 실패:", err);
  }
}

// ── 메인 호출 함수 (원본 chat()) ────────────────────────────────────
export interface ChatOptions {
  companyId: string;
  agentId: string;
  issueId?: string;
  agent?: string; // AGENT_TIER 조회용 slug (companyId/agentId와 별개)
  tier?: string;
  modelOverride?: string;
  maxTokens?: number;
  temperature?: number;
  useCache?: boolean;
  responseFormat?: Record<string, unknown>;
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResult> {
  const agent = options.agent ?? "haecho";
  const maxTokens = options.maxTokens ?? 16000;
  const temperature = options.temperature ?? 0.7;

  let primaryModel: string;
  let tierName: string;
  if (options.modelOverride) {
    primaryModel = options.modelOverride;
    tierName = "override";
  } else {
    tierName = options.tier ?? AGENT_TIER[agent] ?? "standard";
    primaryModel = MODEL_TIERS[tierName];
  }

  const modelsToTry = [primaryModel, ...(FALLBACK_CHAIN[tierName] ?? [])];
  const key = cacheKey(primaryModel, messages);

  // google/ 모델 + GEMINI_API_KEY → 직접 호출 우선
  if (primaryModel.startsWith("google/") && process.env.GEMINI_API_KEY) {
    if (options.useCache) {
      const cached = cacheGet(key);
      if (cached) return cached;
    }
    try {
      const result = await callGeminiDirect(primaryModel, messages, maxTokens, temperature);
      await recordCostEvent({
        companyId: options.companyId,
        agentId: options.agentId,
        issueId: options.issueId,
        model: result.model,
        usage: result.usage,
        costUsd: result.cost,
      });
      if (options.useCache) cacheSet(key, result);
      return result;
    } catch (err) {
      console.warn("[openrouter-client] Gemini 직접 호출 실패, OpenRouter로 폴백:", err);
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY 미설정 (GEMINI_API_KEY 직접 호출도 실패/미설정)");
  }

  if (options.useCache) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://chos-management.bot",
    "X-Title": "Cho's Management Bot",
  };

  let lastError = "";
  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const payload: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      usage: { include: true },
    };
    if (options.responseFormat) payload.response_format = options.responseFormat;

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
      const data = await res.json();

      if (!res.ok) {
        lastError = `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 120)}`;
        if (i < modelsToTry.length - 1) continue;
        throw new Error(`모든 모델 실패: ${lastError}`);
      }

      const content = data.choices[0].message.content;
      const usage: ChatUsage = data.usage ?? {};
      const cost = Number(usage.cost ?? 0);

      const result: ChatResult = { content, usage, cost, model };
      await recordCostEvent({
        companyId: options.companyId,
        agentId: options.agentId,
        issueId: options.issueId,
        model,
        usage,
        costUsd: cost,
      });
      if (options.useCache) cacheSet(key, result);
      return result;
    } catch (err) {
      lastError = String((err as Error)?.message ?? err).slice(0, 80);
      if (i < modelsToTry.length - 1) continue;
      throw err;
    }
  }

  throw new Error(`OpenRouter 호출 최종 실패: ${lastError}`);
}

export async function getRemainingCredits() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { total: 0, usage: 0, remaining: 0, usage_ratio: 0 };
  const res = await fetch(CREDITS_URL, { headers: { Authorization: `Bearer ${key}` } });
  const data = (await res.json()).data ?? {};
  const total = Number(data.total_credits ?? 0);
  const used = Number(data.total_usage ?? 0);
  return { total, usage: used, remaining: total - used, usage_ratio: total ? used / total : 0 };
}

export async function listAvailableModels(): Promise<unknown[]> {
  const key = process.env.OPENROUTER_API_KEY;
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data ?? [];
}
