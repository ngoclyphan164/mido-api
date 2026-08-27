CREATE TABLE "outing_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outing_id" uuid NOT NULL,
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
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outing_places_name_not_blank" CHECK (length(trim("outing_places"."name")) > 0),
	CONSTRAINT "outing_places_rating_range" CHECK ("outing_places"."rating" is null or "outing_places"."rating" between 0 and 5),
	CONSTRAINT "outing_places_rating_count_non_negative" CHECK ("outing_places"."user_rating_count" is null or "outing_places"."user_rating_count" >= 0),
	CONSTRAINT "outing_places_price_level_range" CHECK ("outing_places"."price_level" is null or "outing_places"."price_level" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "outing_places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outing_places" ADD CONSTRAINT "outing_places_outing_id_outings_id_fk" FOREIGN KEY ("outing_id") REFERENCES "public"."outings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outing_places_outing_uidx" ON "outing_places" USING btree ("outing_id");--> statement-breakpoint
CREATE INDEX "outing_places_provider_external_idx" ON "outing_places" USING btree ("provider","external_place_id");