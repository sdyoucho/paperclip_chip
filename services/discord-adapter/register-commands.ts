/**
 * services/discord-adapter/register-commands.ts
 *
 * commands-definitions.ts의 48개 커맨드를 Discord에 실제로 등록한다.
 * 디스코드 슬래시 커맨드 등록은 봇 코드와 별개로 "한 번 실행하면 되는" 작업
 * (변경할 때만 다시 실행) — bot.ts 시작 시마다 자동 실행하지 않는다.
 *
 * 사용법:
 *   GUILD_ID가 있으면 해당 길드에만 등록(전파 즉시, 테스트용 — 권장 시작점)
 *   GUILD_ID가 없으면 글로벌 등록(전파에 최대 1시간 소요, 운영 단계에서 전환)
 *
 *   DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... DISCORD_GUILD_ID=... \
 *     npx tsx register-commands.ts
 *
 * 삭제(모든 커맨드 해제)하려면:
 *   npx tsx register-commands.ts --clear
 */

import { REST, Routes } from "discord.js";
import { COMMANDS, COMMAND_NAMES } from "./commands-definitions";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID; // 없으면 글로벌 등록

if (!token || !clientId) {
  console.error("❌ DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID 환경변수가 필요합니다.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const clearMode = process.argv.includes("--clear");
  const body = clearMode ? [] : COMMANDS.map((c) => c.toJSON());

  const route = guildId
    ? Routes.applicationGuildCommands(clientId!, guildId)
    : Routes.applicationCommands(clientId!);

  console.log(
    clearMode
      ? `🧹 커맨드 전체 해제 중... (${guildId ? `길드 ${guildId}` : "글로벌"})`
      : `📤 커맨드 ${COMMANDS.length}개 등록 중... (${guildId ? `길드 ${guildId} — 즉시 적용` : "글로벌 — 전파에 최대 1시간"})`,
  );

  const result = (await rest.put(route, { body })) as unknown[];

  if (!clearMode) {
    console.log(`✅ 등록 완료: ${result.length}개`);
    console.log("등록된 커맨드:", COMMAND_NAMES.join(", "));
  } else {
    console.log("✅ 해제 완료");
  }
}

main().catch((err) => {
  console.error("❌ 커맨드 등록 실패:", err);
  process.exit(1);
});
