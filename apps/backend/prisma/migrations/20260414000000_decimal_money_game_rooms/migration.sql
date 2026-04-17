-- AlterTable: Float → Decimal(12,2) for all money fields
ALTER TABLE "Coupon" ALTER COLUMN "bonus_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "min_deposit_amount" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "CouponRedemption" ALTER COLUMN "bonus_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "rollover_added" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "Game" ALTER COLUMN "bet_amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "prize_pool" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "house_fee" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "Tournament" ALTER COLUMN "entry_fee" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "prize_pool" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "TournamentPlayer" ALTER COLUMN "prize_won" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balance_after" SET DATA TYPE DECIMAL(12,2);

ALTER TABLE "Wallet" ALTER COLUMN "real_balance" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "bonus_balance" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "rollover_remaining" SET DATA TYPE DECIMAL(12,2);

-- CreateTable: PartnerCooldown (2v2 anti-collusion)
CREATE TABLE "PartnerCooldown" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "consecutive_same_team" INTEGER NOT NULL DEFAULT 0,
    "cooldown_remaining" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCooldown_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PartnerCooldown_userAId_idx" ON "PartnerCooldown"("userAId");
CREATE INDEX "PartnerCooldown_userBId_idx" ON "PartnerCooldown"("userBId");
CREATE UNIQUE INDEX "PartnerCooldown_userAId_userBId_key" ON "PartnerCooldown"("userAId", "userBId");

-- CreateTable: GameRoom (bet value + lock control per room)
CREATE TABLE "GameRoom" (
    "id" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "bet_amount" DECIMAL(12,2) NOT NULL,
    "label" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameRoom_locked_idx" ON "GameRoom"("locked");
CREATE INDEX "GameRoom_mode_idx" ON "GameRoom"("mode");
CREATE UNIQUE INDEX "GameRoom_mode_bet_amount_key" ON "GameRoom"("mode", "bet_amount");
