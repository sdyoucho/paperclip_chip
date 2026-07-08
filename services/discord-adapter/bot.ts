/**
 * discord-adapter/bot.ts
 * 엔트리포인트. 인터랙션 디스패치 + activity-listener 기동.
 *
 * 슬래시 커맨드 자체의 등록(SlashCommandBuilder 정의)은 commands-definitions.ts +
 * register-commands.ts로 분리돼 있다 — 배포 시 한 번(또는 옵션 변경 시마다)
 *   npm run register-commands
 * 를 따로 실행해야 한다. bot.ts는 이미 등록된 커맨드의 인터랙션만 처리한다.
 */

import { Client, GatewayIntentBits, Events } from "discord.js";
import { routeCommand } from "./command-router";
import { handleApprovalButton } from "./handlers/approval-button";
import { startActivityListener } from "./activity-listener";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, () => {
  console.log(`[discord-adapter] 로그인: ${client.user?.tag}`);
  startActivityListener(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await routeCommand(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("mngbot:")) {
      await handleApprovalButton(interaction);
    }
  } catch (err) {
    console.error("[discord-adapter] 인터랙션 처리 실패:", err);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: "처리 중 오류가 발생했어요.", ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

// 커맨드 등록은 register-commands.ts가 별도로 처리한다 (npm run register-commands).
// bot.ts는 등록된 커맨드의 인터랙션만 받아서 처리.
