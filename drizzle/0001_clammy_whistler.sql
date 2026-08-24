CREATE TABLE "place_content_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_place_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"geog" extensions.geography(Point,4326) NOT NULL,
	"types" text[] NOT NULL,
	"rating" numeric(3, 2),
	"user_rating_count" integer,
	"price_level" integer,
	"opening_hours" jsonb,
	"attribution" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "place_content_cache_no_google" CHECK ("place_content_cache"."provider" <> 'google_maps'),
	CONSTRAINT "place_content_cache_name_not_blank" CHECK (length(trim("place_content_cache"."name")) > 0),
	CONSTRAINT "place_content_cache_rating_range" CHECK ("place_content_cache"."rating" is null or "place_content_cache"."rating" between 0 and 5),
	CONSTRAINT "place_content_cache_rating_count_non_negative" CHECK ("place_content_cache"."user_rating_count" is null or "place_content_cache"."user_rating_count" >= 0),
	CONSTRAINT "place_content_cache_price_level_range" CHECK ("place_content_cache"."price_level" is null or "place_content_cache"."price_level" between 0 and 4),
	CONSTRAINT "place_content_cache_expiry_order" CHECK ("place_content_cache"."expires_at" > "place_content_cache"."fetched_at")
);
--> statement-breakpoint
ALTER TABLE "place_content_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "provider_place_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_place_id" varchar(255) NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_place_refs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_matrix_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_provider" varchar(40) NOT NULL,
	"origin_cell" varchar(100) NOT NULL,
	"destination_provider" varchar(40) NOT NULL,
	"destination_external_id" varchar(255) NOT NULL,
	"mode" "travel_mode" NOT NULL,
	"time_bucket" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"distance_meters" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "route_matrix_cache_no_google" CHECK ("route_matrix_cache"."route_provider" <> 'google_maps'),
	CONSTRAINT "route_matrix_cache_duration_positive" CHECK ("route_matrix_cache"."duration_sec" > 0),
	CONSTRAINT "route_matrix_cache_distance_non_negative" CHECK ("route_matrix_cache"."distance_meters" >= 0),
	CONSTRAINT "route_matrix_cache_expiry_order" CHECK ("route_matrix_cache"."expires_at" > "route_matrix_cache"."fetched_at")
);
--> statement-breakpoint
ALTER TABLE "route_matrix_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "place_content_cache_provider_external_uidx" ON "place_content_cache" USING btree ("provider","external_place_id");--> statement-breakpoint
CREATE INDEX "place_content_cache_geog_gist_idx" ON "place_content_cache" USING gist ("geog");--> statement-breakpoint
CREATE INDEX "place_content_cache_expires_idx" ON "place_content_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_place_refs_provider_external_uidx" ON "provider_place_refs" USING btree ("provider","external_place_id");--> statement-breakpoint
CREATE INDEX "provider_place_refs_refresh_idx" ON "provider_place_refs" USING btree ("last_verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "route_matrix_cache_lookup_uidx" ON "route_matrix_cache" USING btree ("route_provider","origin_cell","destination_provider","destination_external_id","mode","time_bucket");--> statement-breakpoint
CREATE INDEX "route_matrix_cache_expires_idx" ON "route_matrix_cache" USING btree ("expires_at");
