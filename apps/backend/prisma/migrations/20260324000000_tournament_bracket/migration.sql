-- AlterTable: add tournament tracking fields to Game
ALTER TABLE "Game" ADD COLUMN "tournamentId" TEXT;
ALTER TABLE "Game" ADD COLUMN "tournament_round" INTEGER;

-- AlterTable: add current_round to Tournament
ALTER TABLE "Tournament" ADD COLUMN "current_round" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Game_tournamentId_idx" ON "Game"("tournamentId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey"
  FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
