CREATE TABLE "suggestion_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"external_place_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"formatted_address" varchar(512),
	"geog" extensions.geography(Point,4326) NOT NULL,
	"primary_type" varchar(80),
	"types" text[] NOT NULL,
	"rating" numeric(3, 2),
	"user_rating_count" integer,
	"price_level" integer,
	"maps_uri" varchar(512),
	"photo_names" text[] NOT NULL,
	"photo_uri" varchar(2048),
	"photo_uri_fetched_at" timestamp with time zone,
	"availability" varchar(16) NOT NULL,
	"score" numeric(8, 4),
	"score_breakdown" jsonb,
	"travel_times" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestion_places_name_not_blank" CHECK (length(trim("suggestion_places"."name")) > 0),
	CONSTRAINT "suggestion_places_rating_range" CHECK ("suggestion_places"."rating" is null or "suggestion_places"."rating" between 0 and 5),
	CONSTRAINT "suggestion_places_rating_count_non_negative" CHECK ("suggestion_places"."user_rating_count" is null or "suggestion_places"."user_rating_count" >= 0),
	CONSTRAINT "suggestion_places_price_level_range" CHECK ("suggestion_places"."price_level" is null or "suggestion_places"."price_level" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "suggestion_places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suggestion_places" ADD CONSTRAINT "suggestion_places_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suggestion_places_suggestion_uidx" ON "suggestion_places" USING btree ("suggestion_id");--> statement-breakpoint
CREATE INDEX "suggestion_places_provider_external_idx" ON "suggestion_places" USING btree ("provider","external_place_id");