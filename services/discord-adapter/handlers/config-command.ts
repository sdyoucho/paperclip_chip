/**
 * discord-adapter/handlers/config-command.ts
 * ⚠️ STUB. A카테고리 16개 커맨드는 Issue를 만들지 않고 Paperclip 설정 API를
 * 직접 호출한다 (agents.adapterConfig PATCH, plugin config PATCH 등).
 * 명령어별 정확한 동작은 bot/commands.py의 각 핸들러 본문을 참고해 이식.
 */
import type { ChatInputCommandInteraction } from "discord.js";

export async function handleConfigCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    content: `(설정 명령어 \`/${interaction.commandName}\` — 구현 대상, ADAPTER.md A절 참고)`,
    ephemeral: true,
  });
}
