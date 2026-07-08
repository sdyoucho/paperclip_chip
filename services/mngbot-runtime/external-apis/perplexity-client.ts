/**
 * mngbot-runtime/external-apis/perplexity-client.ts
 * modules/competitor_analysis.py의 _analyze_one() 포팅.
 * 원본처럼 OpenRouter를 거치지 않고 Perplexity API를 직접 호출한다
 * (Perplexity의 웹 검색 grounding을 그대로 쓰기 위한 원본의 의도적 선택 — 유지).
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export async function analyzeCompetitor(streamerName: string): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return "PERPLEXITY_API_KEY 미설정";

  const prompt = `
한국 스트리머 '${streamerName}'와 비슷한 카테고리의 경쟁 채널 상위 3개를 조사하고,
이번 주 주목할 만한 트렌드나 콘텐츠 변화를 요약해주세요.
각 채널별로 최근 성과나 화제가 된 콘텐츠를 포함해주세요.
한국어로 간결하게 200자 이내로 작성하세요.
`;

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
      }),
    });
    if (!res.ok) return "API 호출 실패";
    const data = await res.json();
    return (data.choices[0].message.content as string).trim();
  } catch (err) {
    return `오류: ${String((err as Error)?.message ?? err)}`;
  }
}
