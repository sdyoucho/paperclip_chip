/**
 * discord-adapter/handlers/ops-command.ts
 * ⚠️ STUB. Paperclip과 무관, discord-adapter 프로세스 자체 운영 명령
 * (reboot/uptime/restart_schedule/help).
 */
import type { ChatInputCommandInteraction } from "discord.js";

export async function handleOpsCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    content: `(운영 명령어 \`/${interaction.commandName}\` — 구현 대상, ADAPTER.md B절 참고)`,
    ephemeral: true,
  });
}
