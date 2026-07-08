/**
 * packages/db/src/seed/mngbot-agents.seed.ts
 *
 * 매니봇 8개 페르소나를 Paperclip `agents` 테이블 row로 생성하는 시드 스크립트.
 *
 * 실행 방법(예시 — 실제 CLI 진입점은 Paperclip 코어 컨벤션에 맞춰 조정 필요):
 *   tsx packages/db/src/seed/mngbot-agents.seed.ts --companyId=<uuid>
 *
 * 동작:
 *   1) haecho를 reportsTo=null로 먼저 생성 (회사 내 최상위 매니저)
 *   2) haecho.id를 reportsTo로 사용해 나머지 7개 에이전트 생성
 *
 * ⚠️ adapterConfig의 url(`http://mngbot-runtime:4100/wake`)은 실제 배포 시
 *    mngbot-runtime 서비스의 내부 주소로 교체해야 합니다 (다음 단계: 어댑터 이식).
 * ⚠️ secrets.mngbot_internal_token은 Paperclip의 company secrets로 사전 등록 필요.
 */

import { db } from "../client.js"; // 실제 Paperclip db client import 경로는 리포지토리 컨벤션에 맞춰 조정
import { agents } from "../schema/agents.js";


type MngbotAgentSeed = {
  slug: string;
  name: string;
  role: string;
  title: string;
  icon: string;
  capabilities: string;
  modelTierKey: "premium" | "standard" | "light" | "research" | "vision";
  budgetMonthlyCents: number;
  timeoutMs: number;
  permissions: Record<string, string[]>;
  legacyColorHex: string;
};

// reportsTo는 haecho 생성 후 별도로 채움 (haecho 본인은 manager 제외)
const HAECHO: MngbotAgentSeed = {
  slug: "haecho",
  name: "해쵸",
  role: "manager",
  title: "총괄 매니저",
  icon: "🎯",
  capabilities:
    "라우팅된 다수 에이전트 결과를 종합해 우선순위별 브리핑 생성. " +
    "light 모델로 사전요약 → premium 모델로 최종 종합.",
  modelTierKey: "premium",
  budgetMonthlyCents: 4000,
  timeoutMs: 90_000,
  permissions: { autonomous: ["read", "summarize", "notify"] },
  legacyColorHex: "#1E293B",
};

const REPORTS: MngbotAgentSeed[] = [
  {
    slug: "gihyo",
    name: "기쵸",
    role: "planner",
    title: "기획·학습 담당",
    icon: "📋",
    capabilities:
      "콘텐츠/썸네일 개선 제안, 기획서·협업 제안서 작성, " +
      "트렌드/기획 기법 자율 학습(승인 필요).",
    modelTierKey: "standard",
    budgetMonthlyCents: 2000,
    timeoutMs: 60_000,
    permissions: {
      autonomous: ["read", "suggest", "request_learning"],
      requiresApproval: ["approve_learning"],
    },
    legacyColorHex: "#4F46E5",
  },
  {
    slug: "inchyo",
    name: "인쵸",
    role: "finance",
    title: "자금 담당",
    icon: "💰",
    capabilities:
      "자금 현황·API 비용 모니터링, 크레딧 임계치 알림, " +
      "고정비 납부 일정 관리, 월말정산.",
    modelTierKey: "light",
    budgetMonthlyCents: 300,
    timeoutMs: 30_000,
    permissions: { autonomous: ["read", "summarize", "notify"] },
    legacyColorHex: "#059669",
  },
  {
    slug: "bunchyo",
    name: "분쵸",
    role: "analyst",
    title: "분석·리서치 담당",
    icon: "🔍",
    capabilities:
      "유튜브 통계, 주간/월간 리포트 생성, " +
      "경쟁 채널(SOOP/Twitch/치지직) 분석.",
    modelTierKey: "research",
    budgetMonthlyCents: 1500,
    timeoutMs: 120_000,
    permissions: { autonomous: ["read", "research", "publish_report"] },
    legacyColorHex: "#7C3AED",
  },
  {
    slug: "sochyo",
    name: "스쵸",
    role: "coordinator",
    title: "스케줄 코디네이터",
    icon: "📅",
    capabilities: "일정 조회/등록/수정/삭제.",
    modelTierKey: "light",
    budgetMonthlyCents: 300,
    timeoutMs: 30_000,
    permissions: { autonomous: ["read", "summarize", "notify"] },
    legacyColorHex: "#0EA5E9",
  },
  {
    slug: "mochyo",
    name: "모쵸",
    role: "monitor",
    title: "방송 모니터",
    icon: "📡",
    capabilities: "치지직 실시간 방송 현황·채팅·시청자 모니터링.",
    modelTierKey: "light",
    budgetMonthlyCents: 500,
    timeoutMs: 30_000,
    permissions: { autonomous: ["read", "summarize", "notify"] },
    legacyColorHex: "#EAB308",
  },
  {
    slug: "gaechyo",
    name: "개쵸",
    role: "engineer",
    title: "R&D 엔지니어",
    icon: "🔧",
    capabilities:
      "코드 리뷰, 코드베이스 점검, 이슈 진단, 신규 설계서 작성, " +
      "자동 코드 변경(계획→승인→PR).",
    modelTierKey: "standard",
    budgetMonthlyCents: 2500,
    timeoutMs: 120_000,
    permissions: {
      autonomous: ["read", "plan_change", "generate_code"],
      requiresApproval: ["apply_to_github"],
    },
    legacyColorHex: "#06B6D4",
  },
  {
    slug: "dichyo",
    name: "디쵸",
    role: "designer",
    title: "디자이너",
    icon: "🎨",
    capabilities: "Figma 포스터/PPT 디자인 레퍼런스 제안.",
    modelTierKey: "vision",
    budgetMonthlyCents: 1000,
    timeoutMs: 60_000,
    permissions: { autonomous: ["read", "suggest_design"] },
    legacyColorHex: "#DB2777",
  },
];

function buildAdapterConfig(seed: MngbotAgentSeed) {
  return {
    url: "http://mngbot-runtime:4100/wake",
    method: "POST",
    headers: {
      Authorization: "Bearer {{secrets.mngbot_internal_token}}",
    },
    payloadTemplate: {
      agentSlug: seed.slug,
      agentId: "{{agent.id}}",
      runId: "{{run.id}}",
      issueId: "{{issue.id}}",
    },
    timeoutMs: seed.timeoutMs,
  };
}

function buildMetadata(seed: MngbotAgentSeed) {
  return {
    legacySlug: seed.slug,
    legacyDisplayName: `${seed.icon} ${seed.name}`,
    legacyColorHex: seed.legacyColorHex,
    modelTierKey: seed.modelTierKey,
  };
}

export async function seedMngbotAgents(companyId: string) {
  // 1) haecho 먼저 생성 (최상위 매니저, reportsTo=null)
  const [haechoRow] = await db
    .insert(agents)
    .values({
      companyId,
      name: HAECHO.name,
      role: HAECHO.role,
      title: HAECHO.title,
      icon: HAECHO.icon,
      status: "idle",
      reportsTo: null,
      capabilities: HAECHO.capabilities,
      adapterType: "http",
      adapterConfig: buildAdapterConfig(HAECHO),
      runtimeConfig: {},
      budgetMonthlyCents: HAECHO.budgetMonthlyCents,
      spentMonthlyCents: 0,
      permissions: HAECHO.permissions,
      metadata: buildMetadata(HAECHO),
    })
    .returning();

  // 2) 나머지 7개는 haecho.id로 reportsTo 연결
  const reportRows = await db
    .insert(agents)
    .values(
      REPORTS.map((seed) => ({
        companyId,
        name: seed.name,
        role: seed.role,
        title: seed.title,
        icon: seed.icon,
        status: "idle" as const,
        reportsTo: haechoRow.id,
        capabilities: seed.capabilities,
        adapterType: "http" as const,
        adapterConfig: buildAdapterConfig(seed),
        runtimeConfig: {},
        budgetMonthlyCents: seed.budgetMonthlyCents,
        spentMonthlyCents: 0,
        permissions: seed.permissions,
        metadata: buildMetadata(seed),
      })),
    )
    .returning();

  return { haecho: haechoRow, reports: reportRows };
}

// CLI 직접 실행 지원 (예: tsx mngbot-agents.seed.ts --companyId=<uuid>)
if (require.main === module) {
  const arg = process.argv.find((a) => a.startsWith("--companyId="));
  const companyId = arg?.split("=")[1];
  if (!companyId) {
    console.error("사용법: tsx mngbot-agents.seed.ts --companyId=<uuid>");
    process.exit(1);
  }
  seedMngbotAgents(companyId)
    .then(({ haecho, reports }) => {
      console.log(`✅ haecho 생성: ${haecho.id}`);
      console.log(`✅ 나머지 ${reports.length}개 에이전트 생성 (reportsTo=haecho)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ 시드 실패:", err);
      process.exit(1);
    });
}
