/**
 * mngbot-runtime/router.ts
 * bot/router.py 포팅. (log_raw_channel_id 영속화 게터/세터는 라우팅 로직과
 * 무관한 봇 설정값이라 이 파일에서 제외 — ADAPTER.md A카테고리
 * `rawdata_channel` 커맨드 쪽 책임으로 이동.)
 */

import { chat, type ChatOptions } from "./openrouter-client";

const SYSTEM_PROMPT = `당신은 Cho의 매니지먼트 봇 라우터입니다.
사용자(Cho) 입력을 분석해 **필요한 모듈만** 선별하세요. 관련 없는 모듈은 절대 호출하지 마세요.

모듈 목록:
- monitor  : 모쵸 — 실시간 방송 현황, 채팅, 시청자
- youtube  : 분쵸 — 유튜브 통계
- report   : 분쵸 — 주간/월간 리포트
- competitor: 분쵸 — 경쟁 채널 트렌드
- suggest  : 기쵸 — 콘텐츠/썸네일 개선 제안
- planning : 기쵸 — 기획서, 협업 제안서
- schedule : 스쵸 — 일정 조회
- money    : 인쵸 — 자금·토큰 비용
- rnd      : 개쵸 — 개발/기술/봇 유지보수/코드 분석
- design   : 디쵸 — 디자인(Figma 포스터/PPT)
- haecho   : 해쵸 — 총괄 브리핑(다수 모듈 종합이 필요할 때)
- streamer_add / streamer_list : 스트리머 관리

URL 처리 가이드:
- GitHub 링크 (github.com/...) → rnd (코드/기술 관련)
- YouTube 링크 → youtube + suggest (콘텐츠 분석)
- 뉴스/블로그 → planning 또는 suggest (콘텐츠 참고)
- 경쟁 채널 (chzzk.naver.com, twitch.tv) → competitor

반드시 아래 JSON 형식으로만 응답:
{
  "modules": [
    {"name": "모듈명", "priority": 1, "reason": "이유"}
  ],
  "needs_haecho_summary": true,
  "confidence": 0.9
}

규칙:
1. 단일 도메인 질문이면 modules=1개
2. 복합 도메인이면 modules=2~4개, needs_haecho_summary=true
3. URL이 포함되어 있으면 needs_haecho_summary=true (종합 분석 필요)
4. 확실하지 않으면 modules=[{"name":"haecho"}], needs_haecho_summary=true

JSON만 출력.`;

export interface RoutedModule {
  name: string;
  priority: number;
  reason?: string;
}

export interface RoutingResult {
  modules: RoutedModule[];
  needs_haecho_summary: boolean;
  confidence: number;
  extracted_urls: string[];
  url_categories: Record<string, string>;
}

const URL_CATEGORIES: Record<string, { domains: string[]; module: string; reason: string }> = {
  github: { domains: ["github.com", "gist.github.com"], module: "rnd", reason: "GitHub 코드/저장소 분석" },
  youtube: { domains: ["youtube.com", "youtu.be"], module: "suggest", reason: "YouTube 콘텐츠 분석" },
  chzzk: { domains: ["chzzk.naver.com"], module: "competitor", reason: "치지직 채널 분석" },
  twitch: { domains: ["twitch.tv"], module: "competitor", reason: "Twitch 채널 분석" },
  soop: { domains: ["sooplive.co.kr", "afreecatv.com"], module: "competitor", reason: "SOOP 채널 분석" },
  figma: { domains: ["figma.com"], module: "design", reason: "Figma 디자인 분석" },
  notion: { domains: ["notion.so", "notion.site"], module: "planning", reason: "Notion 문서 분석" },
};

function categorizeUrl(url: string): { category: string; module: string; reason: string } | null {
  const lower = url.toLowerCase();
  for (const [category, info] of Object.entries(URL_CATEGORIES)) {
    if (info.domains.some((d) => lower.includes(d))) {
      return { category, module: info.module, reason: info.reason };
    }
  }
  return null;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)>"']+/g);
  return matches ?? [];
}

export const RND_CODE_REVIEW_USAGE =
  "ℹ️ 사용법: `rnd_code_review <파일경로 또는 리뷰 요청 문장>`\n" +
  "예) `rnd_code_review bot/router.py`\n" +
  "예) `rnd_code_review modules/rnd.py 의 예외처리가 안전한지 봐줘`";

export function parseRndCodeReviewArgs(args: string): [boolean, string] {
  const joined = args.trim();
  if (!joined) return [false, RND_CODE_REVIEW_USAGE];
  return [true, joined];
}

export async function route(
  userInput: string,
  chatOptions: ChatOptions,
): Promise<RoutingResult> {
  const extractedUrls = extractUrls(userInput);
  const urlCategories: Record<string, string> = {};
  for (const url of extractedUrls) {
    const cat = categorizeUrl(url);
    if (cat) urlCategories[url] = cat.category;
  }

  let routingResult: RoutingResult | null = null;
  try {
    const result = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userInput },
      ],
      { ...chatOptions, agent: "router", tier: "router", maxTokens: 500, temperature: 0.1, useCache: true },
    );
    const jsonMatch = result.content.trim().match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.modules)) {
        routingResult = {
          modules: parsed.modules,
          needs_haecho_summary: parsed.needs_haecho_summary ?? false,
          confidence: parsed.confidence ?? 0.7,
          extracted_urls: [],
          url_categories: {},
        };
      }
    }
  } catch (err) {
    console.error("[router] LLM 라우팅 오류:", err);
  }

  if (!routingResult) {
    routingResult = fallbackRoute(userInput);
  }

  if (extractedUrls.length > 0) {
    routingResult = enrichRoutingWithUrls(routingResult, extractedUrls, urlCategories);
  }

  routingResult.extracted_urls = extractedUrls;
  routingResult.url_categories = urlCategories;

  return routingResult;
}

function enrichRoutingWithUrls(
  routing: RoutingResult,
  urls: string[],
  urlCategories: Record<string, string>,
): RoutingResult {
  const existing = new Set(routing.modules.map((m) => m.name));
  const added: RoutedModule[] = [];

  for (const [url, category] of Object.entries(urlCategories)) {
    const info = URL_CATEGORIES[category];
    if (!info) continue;
    if (!existing.has(info.module)) {
      added.push({
        name: info.module,
        priority: routing.modules.length + added.length + 1,
        reason: `URL 분석: ${info.reason}`,
      });
      existing.add(info.module);
    }
  }

  const uncategorized = urls.filter((u) => !(u in urlCategories));
  if (uncategorized.length > 0 && !existing.has("planning")) {
    added.push({
      name: "planning",
      priority: routing.modules.length + added.length + 1,
      reason: `URL 분석 (일반): ${uncategorized.length}개`,
    });
  }

  return {
    ...routing,
    modules: [...routing.modules, ...added],
    needs_haecho_summary: true,
  };
}

function fallbackRoute(text: string): RoutingResult {
  const lower = text.toLowerCase();
  const rules: [string[], string][] = [
    [["방송", "모니터", "채팅", "시청자", "라이브"], "monitor"],
    [["유튜브", "영상", "조회수", "구독"], "youtube"],
    [["리포트", "주간", "분석", "요약"], "report"],
    [["경쟁", "비교", "트렌드"], "competitor"],
    [["썸네일", "제목", "클릭률"], "suggest"],
    [["기획서", "제안서", "협업"], "planning"],
    [["스케줄", "일정", "캘린더"], "schedule"],
    [["자금", "비용", "토큰", "요금", "돈"], "money"],
    [["개발", "코드", "기술", "github"], "rnd"],
    [["디자인", "포스터", "ppt", "figma"], "design"],
    [["전체", "총괄", "브리핑", "종합"], "haecho"],
  ];

  const matched: RoutedModule[] = [];
  rules.forEach(([keywords, moduleName], i) => {
    if (keywords.some((k) => lower.includes(k))) {
      matched.push({ name: moduleName, priority: i + 1, reason: "키워드 폴백" });
    }
  });

  const modules = matched.length
    ? matched
    : [{ name: "haecho", priority: 1, reason: "판단 불가 → 총괄" }];

  return {
    modules,
    needs_haecho_summary: modules.length >= 2,
    confidence: 0.5,
    extracted_urls: [],
    url_categories: {},
  };
}
