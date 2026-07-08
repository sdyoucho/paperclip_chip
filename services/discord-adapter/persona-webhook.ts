/**
 * discord-adapter/persona-webhook.ts
 *
 * chip_bot의 utils/persona.py를 그대로 포팅. 채널당 webhook 1개를
 * "ChoMgmtAgents" 이름으로 재사용하고, 페르소나별로 username/avatar_url을
 * 바꿔가며 같은 webhook으로 발화 — 원본과 동일한 "한 채널, 8명이 각자
 * 캐릭터로 말하는" UX를 유지한다.
 */

import {
  Client,
  TextChannel,
  ForumChannel,
  ThreadChannel,
  Webhook,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  ActionRowBuilder,
} from "discord.js";

export interface MngbotPersona {
  slug: string;
  displayName: string; // 예: "🎯 해쵸" (legacyDisplayName, Phase 2 metadata에서 가져옴)
  colorHex: string; // 예: "#1E293B"
  avatarUrl?: string;
}

// Phase 2 agents.metadata(legacySlug/legacyDisplayName/legacyColorHex)를
// 그대로 읽어서 채우는 걸 권장 — 하드코딩 중복 방지.
export type PersonaRegistry = Record<string, MngbotPersona>;

const webhookCache = new Map<string, Webhook>();

async function getOrCreateWebhook(
  channel: TextChannel | ForumChannel,
): Promise<Webhook> {
  const cached = webhookCache.get(channel.id);
  if (cached) return cached;

  const hooks = await channel.fetchWebhooks();
  let hook = hooks.find((h) => h.name === "ChoMgmtAgents");
  if (!hook) {
    hook = await channel.createWebhook({ name: "ChoMgmtAgents" });
  }
  webhookCache.set(channel.id, hook);
  return hook;
}

export interface SpeakOptions {
  content?: string;
  embed?: EmbedBuilder;
  thread?: ThreadChannel;
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/**
 * persona의 캐릭터로 채널/스레드에 발화.
 * Webhook 가능한 채널(TextChannel/ForumChannel)이면 webhook으로,
 * 아니면 일반 send + embed author 폴백 (원본 동일 로직).
 */
export async function speak(
  channel: TextChannel | ForumChannel | ThreadChannel,
  persona: MngbotPersona,
  options: SpeakOptions,
): Promise<void> {
  const targetChannel =
    channel instanceof ThreadChannel
      ? (channel.parent as TextChannel | ForumChannel | null)
      : channel;

  if (
    targetChannel &&
    (targetChannel instanceof TextChannel || targetChannel instanceof ForumChannel)
  ) {
    try {
      const hook = await getOrCreateWebhook(targetChannel);

      const embed = options.embed;
      if (embed) {
        embed.setColor(parseInt(persona.colorHex.replace("#", ""), 16));
        if (!embed.data.author) {
          embed.setAuthor({
            name: persona.displayName,
            iconURL: persona.avatarUrl,
          });
        }
      }

      await hook.send({
        username: persona.displayName,
        avatarURL: persona.avatarUrl,
        content: options.content || undefined,
        embeds: embed ? [embed] : undefined,
        components: options.components,
        threadId: channel instanceof ThreadChannel ? channel.id : undefined,
      });
      return;
    } catch (err) {
      // 원본: 웹훅 실패 시 일반 embed 폴백 (조용히 넘어가지 않고 로그만 남김)
      console.warn(`[persona-webhook] webhook 전송 실패 (${persona.slug}):`, err);
    }
  }

  // 폴백: 일반 메시지 + embed author
  const embed = options.embed;
  if (embed) {
    embed.setColor(parseInt(persona.colorHex.replace("#", ""), 16));
    embed.setAuthor({ name: persona.displayName, iconURL: persona.avatarUrl });
    await channel.send({ embeds: [embed], components: options.components });
  } else if (options.content) {
    await channel.send(`**${persona.displayName}**\n${options.content}`);
  }
}
