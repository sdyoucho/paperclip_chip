/**
 * discord-adapter/persona-registry.ts
 * Phase 2에서 각 agent의 metadata(legacySlug/legacyDisplayName/legacyColorHex)에
 * 저장해둔 값을 읽어서 구성. 하드코딩 대신 Paperclip agents API에서 fetch.
 *
 * ⚠️ STUB: 부팅 시 listAgents(companyId)를 호출해 채우는 초기화 함수가 필요.
 */
import type { MngbotPersona } from "./persona-webhook";

export const PERSONA_REGISTRY: Record<string, MngbotPersona> = {
  haecho: { slug: "haecho", displayName: "🎯 해쵸", colorHex: "#1E293B" },
  gihyo: { slug: "gihyo", displayName: "📋 기쵸", colorHex: "#4F46E5" },
  inchyo: { slug: "inchyo", displayName: "💰 인쵸", colorHex: "#059669" },
  bunchyo: { slug: "bunchyo", displayName: "🔍 분쵸", colorHex: "#7C3AED" },
  sochyo: { slug: "sochyo", displayName: "📅 스쵸", colorHex: "#0EA5E9" },
  mochyo: { slug: "mochyo", displayName: "📡 모쵸", colorHex: "#EAB308" },
  gaechyo: { slug: "gaechyo", displayName: "🔧 개쵸", colorHex: "#06B6D4" },
  dichyo: { slug: "dichyo", displayName: "🎨 디쵸", colorHex: "#DB2777" },
};

// TODO(권장): 부팅 시 listAgents(companyId)로 실제 avatarUrl까지 채워서
// 이 객체를 덮어쓰기 — 지금은 Phase 2 ORGCHART.md의 색상값으로 하드코딩.
