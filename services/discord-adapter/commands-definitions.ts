/**
 * services/discord-adapter/commands-definitions.ts
 *
 * 원본 bot/commands.py의 @bot.tree.command + @app_commands.describe/choices를
 * 그대로 옮긴 SlashCommandBuilder 정의. command-router.ts의 COMMAND_TABLE과
 * 1:1로 이름이 맞아야 한다(둘 다 동일한 49→48개 목록).
 *
 * ⚠️ `gicho_learn_approve`는 의도적으로 제외했다 — ADAPTER.md D'절 결정대로
 *    Discord 버튼(approval-button.ts)으로 대체했기 때문. command-router.ts의
 *    COMMAND_TABLE에도 이 커맨드는 없다.
 *
 * 옵션명은 전부 원본과 동일한 영어 키를 썼다 (instant-command.ts/
 * governance-command.ts가 interaction.options.data를 그대로 issue.metadata에
 * 실어 보내고, mngbot-runtime 핸들러들이 그 키로 다시 꺼내 쓰기 때문에
 * 여기서 한 글자라도 다르면 전부 깨진다 — 실제로 이전 라운드에서 한글
 * placeholder 키와 안 맞아서 한 차례 수정했다).
 */

import { SlashCommandBuilder } from "discord.js";

export const COMMANDS = [
  // ── C: 즉시실행 ──
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("자연어로 무엇이든 물어보세요")
    .addStringOption((o) => o.setName("query").setDescription("질문 또는 명령").setRequired(true))
    .addStringOption((o) => o.setName("streamer").setDescription("(선택) 스트리머 이름")),

  new SlashCommandBuilder()
    .setName("monitor")
    .setDescription("스트리머 방송 현황")
    .addStringOption((o) => o.setName("streamer").setDescription("스트리머 이름 (미입력 시 전체)")),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("주간 분석 리포트")
    .addStringOption((o) => o.setName("streamer").setDescription("스트리머 이름 (미입력 시 전체)")),

  new SlashCommandBuilder()
    .setName("youtube")
    .setDescription("유튜브 채널 통계")
    .addStringOption((o) => o.setName("streamer").setDescription("스트리머 이름").setRequired(true)),

  new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("스케줄 조회")
    .addStringOption((o) => o.setName("query").setDescription("조회할 기간")),

  new SlashCommandBuilder().setName("money").setDescription("자금 현황 및 API 비용"),
  new SlashCommandBuilder().setName("settlement").setDescription("월말정산 + 다음 달 예상"),

  new SlashCommandBuilder()
    .setName("streamer_add")
    .setDescription("신규 스트리머 등록")
    .addStringOption((o) => o.setName("name").setDescription("스트리머 이름").setRequired(true))
    .addStringOption((o) => o.setName("chzzk_url").setDescription("치지직 채널 URL"))
    .addStringOption((o) => o.setName("youtube_url").setDescription("유튜브 채널 URL"))
    .addStringOption((o) => o.setName("soop_url").setDescription("SOOP 채널 URL")),

  new SlashCommandBuilder().setName("streamer_list").setDescription("등록된 스트리머 목록"),

  new SlashCommandBuilder()
    .setName("fixedcost_list")
    .setDescription("고정비 납부 일정 목록"),

  new SlashCommandBuilder()
    .setName("fixedcost_add")
    .setDescription("고정비 등록")
    .addStringOption((o) => o.setName("name").setDescription("서비스 이름").setRequired(true))
    .addIntegerOption((o) => o.setName("amount_krw").setDescription("월 금액 (원)").setRequired(true))
    .addIntegerOption((o) => o.setName("pay_day").setDescription("매월 납부일 (1~31)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("fixedcost_remove")
    .setDescription("고정비 삭제")
    .addStringOption((o) => o.setName("name").setDescription("삭제할 서비스 이름").setRequired(true)),

  new SlashCommandBuilder()
    .setName("fixedcost_paid")
    .setDescription("고정비 납부 완료 기록")
    .addStringOption((o) => o.setName("name").setDescription("납부한 서비스").setRequired(true)),

  new SlashCommandBuilder()
    .setName("fixedcost_sync")
    .setDescription("Notion 고정비 DB → 로컬 동기화 (⚠️ Phase 3 설계상 비활성 안내만 반환)"),

  new SlashCommandBuilder()
    .setName("schedule_add")
    .setDescription("스케줄 등록")
    .addStringOption((o) => o.setName("title").setDescription("제목").setRequired(true))
    .addStringOption((o) =>
      o.setName("date").setDescription("날짜 (예: 2026-05-15 또는 2026-05-15 14:00)").setRequired(true),
    )
    .addStringOption((o) => o.setName("memo").setDescription("메모")),

  new SlashCommandBuilder()
    .setName("schedule_edit")
    .setDescription("스케줄 수정")
    .addStringOption((o) => o.setName("short_id").setDescription("8자리 ID").setRequired(true))
    .addStringOption((o) => o.setName("title").setDescription("새 제목"))
    .addStringOption((o) => o.setName("date").setDescription("새 날짜")),

  new SlashCommandBuilder()
    .setName("schedule_remove")
    .setDescription("스케줄 삭제")
    .addStringOption((o) => o.setName("short_id").setDescription("삭제할 8자리 ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rnd_health")
    .setDescription("전체 코드베이스 점검 (문법/참조/인자 오류, LLM 미사용)"),

  new SlashCommandBuilder()
    .setName("rnd_code_review")
    .setDescription("코드 리뷰 (파일 경로 또는 코드/문장)")
    .addStringOption((o) =>
      o.setName("target").setDescription("리뷰할 파일 경로 또는 코드/리뷰 요청 문장").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("rnd_diagnose")
    .setDescription("이슈 진단")
    .addStringOption((o) => o.setName("issue").setDescription("문제 설명").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rnd_design")
    .setDescription("신규 봇 설계서")
    .addStringOption((o) => o.setName("requirements").setDescription("요구사항").setRequired(true)),

  new SlashCommandBuilder().setName("rnd_errors").setDescription("최근 에러 요약"),

  new SlashCommandBuilder()
    .setName("rnd_announce")
    .setDescription("R&D 채널 공지")
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("공지 유형")
        .setRequired(true)
        .addChoices(
          { name: "🚀 업데이트", value: "update" },
          { name: "🔧 유지보수", value: "maintenance" },
          { name: "✨ 신규 기능", value: "feature" },
          { name: "⚠️ 이슈/장애", value: "issue" },
        ),
    )
    .addStringOption((o) => o.setName("title").setDescription("제목").setRequired(true))
    .addStringOption((o) => o.setName("content").setDescription("내용").setRequired(true)),

  new SlashCommandBuilder().setName("code_sessions").setDescription("최근 코드 변경 세션 목록"),
  new SlashCommandBuilder().setName("code_diagnose").setDescription("GitHub 연동 상태 진단"),

  new SlashCommandBuilder()
    .setName("gicho_learn_status")
    .setDescription("학습 항목 조회")
    .addStringOption((o) => o.setName("item_id").setDescription("(선택) 특정 ID 조회. 비우면 전체 목록")),

  // ── D: 거버넌스 ──
  new SlashCommandBuilder()
    .setName("code_propose")
    .setDescription("자연어로 코드 변경 요청 (개쵸가 알아서 분석 + 수정)")
    .addStringOption((o) =>
      o.setName("request").setDescription("변경 요청 (예: 디쵸 figma 연동, /money 응답 개선, ...)").setRequired(true),
    )
    .addBooleanOption((o) => o.setName("use_context").setDescription("이전 대화 자동 참조 (기본 True)")),

  new SlashCommandBuilder()
    .setName("gicho_learn_add")
    .setDescription("기쵸 학습 항목 등록")
    .addStringOption((o) => o.setName("subject").setDescription("학습 주제").setRequired(true))
    .addStringOption((o) => o.setName("sources").setDescription("소스 URL들 (쉼표로 구분)").setRequired(true))
    .addStringOption((o) =>
      o
        .setName("category")
        .setDescription("카테고리")
        .addChoices(
          ...["콘텐츠_트렌드", "기획_기법", "협업_사례", "썸네일_분석", "제목_분석", "스트리밍_기술", "스폰서십", "기타"].map(
            (c) => ({ name: c, value: c }),
          ),
        ),
    )
    .addBooleanOption((o) => o.setName("auto_approve").setDescription("등록 즉시 자동 학습 시작 (기본 False)")),

  // ── A: 설정 ──
  new SlashCommandBuilder().setName("config_ai").setDescription("AI API 키 설정 조회 및 변경"),
  new SlashCommandBuilder().setName("config_notion").setDescription("Notion 설정 조회 및 변경"),
  new SlashCommandBuilder().setName("config_discord").setDescription("Discord 오퍼레이터 설정 조회 및 변경"),
  new SlashCommandBuilder().setName("config_status").setDescription("현재 API 키 설정 현황 (전체 조회 및 변경)"),

  new SlashCommandBuilder()
    .setName("rawdata")
    .setDescription("Raw Data 트레이스 출력 모드")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("출력 모드")
        .setRequired(true)
        .addChoices(
          { name: "off — 비활성", value: "off" },
          { name: "ephemeral — 나에게만", value: "ephemeral" },
          { name: "channel — 채널 기록", value: "channel" },
          { name: "both — 둘 다", value: "both" },
        ),
    ),

  new SlashCommandBuilder()
    .setName("rawdata_channel")
    .setDescription("Raw Data 기록 채널 설정")
    .addChannelOption((o) => o.setName("channel").setDescription("채널 (비우면 해제)")),

  new SlashCommandBuilder().setName("model_status").setDescription("현재 모델 티어링 조회"),

  new SlashCommandBuilder()
    .setName("model_set")
    .setDescription("티어의 모델 변경")
    .addStringOption((o) => o.setName("tier").setDescription("티어").setRequired(true))
    .addStringOption((o) => o.setName("model").setDescription("새 모델 ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("model_agent")
    .setDescription("에이전트 티어 변경")
    .addStringOption((o) => o.setName("agent").setDescription("에이전트").setRequired(true))
    .addStringOption((o) => o.setName("tier").setDescription("새 티어").setRequired(true)),

  new SlashCommandBuilder().setName("model_reset").setDescription("모델 설정 초기화"),

  new SlashCommandBuilder()
    .setName("credit_settings")
    .setDescription("크레딧 알림 설정 조회 (월 한도/임계치)"),

  new SlashCommandBuilder()
    .setName("credit_limit")
    .setDescription("월 크레딧 한도(USD) 설정")
    .addNumberOption((o) => o.setName("amount").setDescription("월 한도 (USD, 예: 50)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("credit_thresholds")
    .setDescription("크레딧 알림 임계치(%) 설정")
    .addStringOption((o) =>
      o.setName("thresholds").setDescription("쉼표로 구분된 퍼센트 (예: 50,70,90)").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("rnd_channel")
    .setDescription("R&D 공지 채널 설정")
    .addChannelOption((o) => o.setName("channel").setDescription("R&D 채널 (비우면 해제)")),

  new SlashCommandBuilder()
    .setName("forum_channel")
    .setDescription("해쵸 포럼 세션 채널 설정")
    .addChannelOption((o) => o.setName("channel").setDescription("포럼 채널 (비우면 해제)")),

  new SlashCommandBuilder()
    .setName("rnd_forum_channel")
    .setDescription("개쵸 코드 변경 포럼 채널 설정")
    .addChannelOption((o) => o.setName("channel").setDescription("포럼 채널 (비우면 해제)")),

  // ── B: 봇 운영 ──
  new SlashCommandBuilder()
    .setName("reboot")
    .setDescription("봇 재부팅")
    .addStringOption((o) => o.setName("reason").setDescription("재부팅 사유")),

  new SlashCommandBuilder().setName("uptime").setDescription("봇 가동 시간"),

  new SlashCommandBuilder()
    .setName("restart_schedule")
    .setDescription("자동 재부팅 시각 변경")
    .addIntegerOption((o) => o.setName("hour").setDescription("시 (0~23, 비우면 현재 설정 조회)"))
    .addIntegerOption((o) => o.setName("minute").setDescription("분 (0~59, 기본 0)")),

  new SlashCommandBuilder().setName("help").setDescription("명령어 도움말 (페이지별)"),
];

// command-router.ts의 COMMAND_TABLE 키와 1:1로 맞는지 빌드 타임에 검증하고 싶다면
// 아래처럼 이름만 뽑아 비교하는 스크립트를 CI에 추가하는 것을 권장.
export const COMMAND_NAMES = COMMANDS.map((c) => c.name);
