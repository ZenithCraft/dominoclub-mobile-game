-- Migration: tournament bracket seeding + player withdrawal support

-- Seed rank for each player (1 = best, assigned at tournament start by league_points)
ALTER TABLE "TournamentPlayer" ADD COLUMN "seed" INTEGER;

-- Timestamp when player voluntarily withdrew (always set together with eliminated_at)
ALTER TABLE "TournamentPlayer" ADD COLUMN "withdrawn_at" TIMESTAMP(3);

-- Admin-set prize pool for in-person events (entry fees go to organiser, not this pool)
ALTER TABLE "Tournament" ADD COLUMN "initial_prize_pool" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Index to speed up seeded-bracket queries
CREATE INDEX "TournamentPlayer_seed_idx" ON "TournamentPlayer"("seed");
