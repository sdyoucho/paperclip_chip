CREATE TABLE IF NOT EXISTS "mngbot_streamers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"chzzk_url" text,
	"youtube_url" text,
	"soop_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_broadcast_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"streamer_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"log_date" date NOT NULL,
	"viewers_peak" integer DEFAULT 0 NOT NULL,
	"viewers_avg" integer DEFAULT 0 NOT NULL,
	"chat_count" integer DEFAULT 0 NOT NULL,
	"sentiment_positive_pct" numeric(5, 2),
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"generated_by_agent_id" uuid,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_schedule_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"streamer_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"category" text,
	"created_by_agent_id" uuid,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_fixed_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_krw" integer NOT NULL,
	"pay_day" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_fixed_cost_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"fixed_cost_id" uuid NOT NULL,
	"paid_at" date NOT NULL,
	"amount_krw" integer NOT NULL,
	"recorded_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"streamer_id" uuid,
	"period" text NOT NULL,
	"report_type" text DEFAULT 'weekly' NOT NULL,
	"content_markdown" text NOT NULL,
	"generated_by_agent_id" uuid,
	"cost_usd" numeric(12, 5) DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_learning_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"category" text DEFAULT '기타' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by" text DEFAULT 'Cho' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"summary" text,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_usd" numeric(12, 5) DEFAULT '0' NOT NULL,
	"error_message" text,
	"executed_by_agent_id" uuid,
	"notion_page_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_code_change_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"approval_id" uuid,
	"user_request" text NOT NULL,
	"enriched_request" text,
	"requester" text DEFAULT 'Cho' NOT NULL,
	"status" text DEFAULT 'plan_pending' NOT NULL,
	"intent" jsonb,
	"codebase_summary" jsonb,
	"plan" jsonb,
	"file_proposals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"github_repo" text,
	"github_branch" text,
	"github_pr_url" text,
	"total_cost_usd" numeric(12, 5) DEFAULT '0' NOT NULL,
	"error_message" text,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_notion_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"notion_database_key" text NOT NULL,
	"notion_page_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mngbot_discord_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"discord_guild_id" text NOT NULL,
	"discord_channel_id" text NOT NULL,
	"requested_by_discord_user_id" text NOT NULL,
	"last_seen_comment_count" text DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
