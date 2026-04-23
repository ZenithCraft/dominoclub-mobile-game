-- =============================================================
-- DominoClub — PostgreSQL schema para HeidiSQL / Laragon
-- Execute conectado ao banco "dominoclub" ou ajuste abaixo.
-- =============================================================

-- Cria o banco (rode isso conectado ao banco "postgres" primeiro,
-- depois troque a conexão para "dominoclub" e execute o resto).
-- CREATE DATABASE dominoclub ENCODING 'UTF8';

BEGIN;

-- -------------------------------------------------------------
-- ENUMs
-- -------------------------------------------------------------

CREATE TYPE "GameMode" AS ENUM ('ARENA_1V1', 'CUP_1V1', 'TOURNAMENT_2V2', 'RECREATIONAL_2V2');
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'PLAYING', 'FINISHED', 'CANCELLED', 'ABANDONED');
CREATE TYPE "DominoVariant" AS ENUM ('CARROCA', 'L_E_L', 'CRUZADA');
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'BET', 'WIN', 'BONUS', 'REFUND', 'FEE');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "TournamentStatus" AS ENUM ('OPEN', 'FULL', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
CREATE TYPE "FraudType" AS ENUM (
    'MULTI_ACCOUNT_DEVICE', 'MULTI_ACCOUNT_IP', 'SUSPICIOUS_GPS',
    'GEOLOCATION_OUTSIDE_BRAZIL', 'RAPID_FIRE_BETS', 'BOT_PATTERN',
    'COLLUSION_SUSPECTED', 'UNUSUAL_WIN_RATE', 'IMPOSSIBLE_MOVEMENT',
    'INTEGRITY_FAIL', 'VELOCITY_ABUSE', 'DEVICE_LIMIT_EXCEEDED', 'ADMIN_ACTION'
);
CREATE TYPE "DocumentType" AS ENUM ('RG', 'CNH', 'PASSPORT');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "LeagueRank" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');

-- -------------------------------------------------------------
-- Tabelas
-- -------------------------------------------------------------

CREATE TABLE "User" (
    "id"                    TEXT            NOT NULL,
    "phone"                 TEXT            NOT NULL,
    "cpf"                   TEXT,
    "email"                 TEXT,
    "name"                  TEXT,
    "avatar"                TEXT,
    "date_of_birth"         TIMESTAMP,
    "gps_lat"               DOUBLE PRECISION,
    "gps_lng"               DOUBLE PRECISION,
    "gps_accuracy"          DOUBLE PRECISION,
    "gps_updated_at"        TIMESTAMP,
    "device_id"             TEXT,
    "ip_address"            TEXT,
    "push_token"            TEXT,
    "is_banned"             BOOLEAN         NOT NULL DEFAULT false,
    "ban_reason"            TEXT,
    "bot_score"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trust_score"           DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cpf_verified"          BOOLEAN         NOT NULL DEFAULT false,
    "phone_verified"        BOOLEAN         NOT NULL DEFAULT false,
    "otp_code"              TEXT,
    "otp_expires_at"        TIMESTAMP,
    "refresh_token"         TEXT,
    "kyc_document_type"     "DocumentType",
    "kyc_document_status"   "DocumentStatus",
    "kyc_document_front_url" TEXT,
    "kyc_document_back_url" TEXT,
    "kyc_selfie_url"        TEXT,
    "kyc_submitted_at"      TIMESTAMP,
    "kyc_reviewed_at"       TIMESTAMP,
    "kyc_review_notes"      TEXT,
    "league_points"         INTEGER         NOT NULL DEFAULT 0,
    "previous_rank"         "LeagueRank",
    "previous_rank_month"   TEXT,
    "created_at"            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Wallet" (
    "id"                TEXT            NOT NULL,
    "userId"            TEXT            NOT NULL,
    "real_balance"      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "bonus_balance"     DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "rollover_remaining" DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id"            TEXT                NOT NULL,
    "walletId"      TEXT                NOT NULL,
    "type"          "TransactionType"   NOT NULL,
    "amount"        DECIMAL(12,2)       NOT NULL,
    "balance_after" DECIMAL(12,2),
    "pix_id"        TEXT,
    "pix_qr_code"   TEXT,
    "pix_key"       TEXT,
    "description"   TEXT,
    "status"        "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "metadata"      JSONB,
    "created_at"    TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
    "id"                TEXT            NOT NULL,
    "mode"              "GameMode"      NOT NULL,
    "variant"           "DominoVariant" NOT NULL DEFAULT 'CARROCA',
    "status"            "GameStatus"    NOT NULL DEFAULT 'WAITING',
    "bet_amount"        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "prize_pool"        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "house_fee"         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "winner_id"         TEXT,
    "winning_team"      INTEGER,
    "replay_data"       JSONB,
    "room_code"         TEXT,
    "tournamentId"      TEXT,
    "tournament_round"  INTEGER,
    "created_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at"       TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GamePlayer" (
    "id"            TEXT        NOT NULL,
    "gameId"        TEXT        NOT NULL,
    "userId"        TEXT        NOT NULL,
    "team"          INTEGER     NOT NULL,
    "seat"          INTEGER     NOT NULL,
    "final_score"   INTEGER,
    "is_bot"        BOOLEAN     NOT NULL DEFAULT false,
    "connected"     BOOLEAN     NOT NULL DEFAULT true,
    "joined_at"     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamePlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tournament" (
    "id"                TEXT                NOT NULL,
    "name"              TEXT                NOT NULL,
    "mode"              "GameMode"          NOT NULL,
    "variant"           "DominoVariant"     NOT NULL DEFAULT 'CARROCA',
    "status"            "TournamentStatus"  NOT NULL DEFAULT 'OPEN',
    "entry_fee"         DECIMAL(12,2)       NOT NULL,
    "prize_pool"        DECIMAL(12,2)       NOT NULL DEFAULT 0,
    "max_players"       INTEGER             NOT NULL,
    "current_players"   INTEGER             NOT NULL DEFAULT 0,
    "current_round"     INTEGER             NOT NULL DEFAULT 0,
    "starts_at"         TIMESTAMP           NOT NULL,
    "finished_at"       TIMESTAMP,
    "created_at"        TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_in_person"      BOOLEAN             NOT NULL DEFAULT false,
    "address"           TEXT,
    "checkin_time"      TIMESTAMP,
    "banner_url"        TEXT,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentPlayer" (
    "id"                TEXT            NOT NULL,
    "tournamentId"      TEXT            NOT NULL,
    "userId"            TEXT            NOT NULL,
    "eliminated_at"     TIMESTAMP,
    "final_position"    INTEGER,
    "prize_won"         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "joined_at"         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "participant_name"  TEXT,
    "participant_cpf"   TEXT,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FraudLog" (
    "id"            TEXT        NOT NULL,
    "userId"        TEXT        NOT NULL,
    "type"          "FraudType" NOT NULL,
    "reason_code"   TEXT,
    "details"       JSONB       NOT NULL,
    "ip_address"    TEXT,
    "device_id"     TEXT,
    "resolved"      BOOLEAN     NOT NULL DEFAULT false,
    "created_at"    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceBind" (
    "id"            TEXT        NOT NULL,
    "userId"        TEXT        NOT NULL,
    "device_id"     TEXT        NOT NULL,
    "platform"      TEXT,
    "attest_key_id" TEXT,
    "first_seen"    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen"     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active"     BOOLEAN     NOT NULL DEFAULT true,

    CONSTRAINT "DeviceBind_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemConfig" (
    "key"       TEXT        NOT NULL,
    "value"     TEXT        NOT NULL,
    "updated_at" TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "PairBlock" (
    "id"        TEXT        NOT NULL,
    "userAId"   TEXT        NOT NULL,
    "userBId"   TEXT        NOT NULL,
    "reason"    TEXT,
    "active"    BOOLEAN     NOT NULL DEFAULT true,
    "created_at" TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Coupon" (
    "id"                TEXT            NOT NULL,
    "code"              TEXT            NOT NULL,
    "bonus_amount"      DECIMAL(12,2)   NOT NULL,
    "min_deposit_amount" DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "rollover_times"    INTEGER         NOT NULL DEFAULT 0,
    "max_players"       INTEGER,
    "eligible_rank"     "LeagueRank",
    "expires_at"        TIMESTAMP,
    "is_active"         BOOLEAN         NOT NULL DEFAULT true,
    "created_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponRedemption" (
    "id"            TEXT            NOT NULL,
    "couponId"      TEXT            NOT NULL,
    "userId"        TEXT            NOT NULL,
    "bonus_amount"  DECIMAL(12,2)   NOT NULL,
    "rollover_added" DECIMAL(12,2)  NOT NULL,
    "created_at"    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerCooldown" (
    "id"                    TEXT        NOT NULL,
    "userAId"               TEXT        NOT NULL,
    "userBId"               TEXT        NOT NULL,
    "consecutive_same_team" INTEGER     NOT NULL DEFAULT 0,
    "cooldown_remaining"    INTEGER     NOT NULL DEFAULT 0,
    "updated_at"            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerCooldown_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameRoom" (
    "id"            TEXT            NOT NULL,
    "mode"          "GameMode"      NOT NULL,
    "bet_amount"    DECIMAL(12,2)   NOT NULL,
    "label"         TEXT,
    "locked"        BOOLEAN         NOT NULL DEFAULT false,
    "created_at"    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Announcement" (
    "id"            TEXT            NOT NULL,
    "title"         TEXT            NOT NULL,
    "body"          TEXT,
    "html"          TEXT,
    "banner_url"    TEXT,
    "countdown_end" TIMESTAMP,
    "max_shows"     INTEGER,
    "target_rank"   "LeagueRank",
    "is_active"     BOOLEAN         NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserAnnouncementView" (
    "id"                TEXT        NOT NULL,
    "userId"            TEXT        NOT NULL,
    "announcementId"    TEXT        NOT NULL,
    "view_count"        INTEGER     NOT NULL DEFAULT 0,
    "last_seen_at"      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAnnouncementView_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------------
-- Índices únicos
-- -------------------------------------------------------------

CREATE UNIQUE INDEX "User_phone_key"       ON "User"("phone");
CREATE UNIQUE INDEX "User_cpf_key"         ON "User"("cpf");
CREATE UNIQUE INDEX "User_email_key"       ON "User"("email");
CREATE UNIQUE INDEX "Wallet_userId_key"    ON "Wallet"("userId");
CREATE UNIQUE INDEX "Game_room_code_key"   ON "Game"("room_code");
CREATE UNIQUE INDEX "GamePlayer_gameId_userId_key" ON "GamePlayer"("gameId", "userId");
CREATE UNIQUE INDEX "GamePlayer_gameId_seat_key"   ON "GamePlayer"("gameId", "seat");
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_userId_key" ON "TournamentPlayer"("tournamentId", "userId");
CREATE UNIQUE INDEX "DeviceBind_userId_device_id_key" ON "DeviceBind"("userId", "device_id");
CREATE UNIQUE INDEX "PairBlock_userAId_userBId_key"   ON "PairBlock"("userAId", "userBId");
CREATE UNIQUE INDEX "Coupon_code_key"      ON "Coupon"("code");
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");
CREATE UNIQUE INDEX "PartnerCooldown_userAId_userBId_key"  ON "PartnerCooldown"("userAId", "userBId");
CREATE UNIQUE INDEX "GameRoom_mode_bet_amount_key"         ON "GameRoom"("mode", "bet_amount");
CREATE UNIQUE INDEX "UserAnnouncementView_userId_announcementId_key" ON "UserAnnouncementView"("userId", "announcementId");

-- -------------------------------------------------------------
-- Índices comuns
-- -------------------------------------------------------------

CREATE INDEX "User_phone_idx"               ON "User"("phone");
CREATE INDEX "User_cpf_idx"                 ON "User"("cpf");
CREATE INDEX "User_device_id_idx"           ON "User"("device_id");
CREATE INDEX "User_ip_address_idx"          ON "User"("ip_address");
CREATE INDEX "User_kyc_document_status_idx" ON "User"("kyc_document_status");
CREATE INDEX "User_league_points_idx"       ON "User"("league_points");
CREATE INDEX "Wallet_userId_idx"            ON "Wallet"("userId");
CREATE INDEX "Transaction_walletId_idx"     ON "Transaction"("walletId");
CREATE INDEX "Transaction_pix_id_idx"       ON "Transaction"("pix_id");
CREATE INDEX "Transaction_status_idx"       ON "Transaction"("status");
CREATE INDEX "Transaction_created_at_idx"   ON "Transaction"("created_at");
CREATE INDEX "Game_status_idx"              ON "Game"("status");
CREATE INDEX "Game_mode_idx"                ON "Game"("mode");
CREATE INDEX "Game_created_at_idx"          ON "Game"("created_at");
CREATE INDEX "Game_tournamentId_idx"        ON "Game"("tournamentId");
CREATE INDEX "GamePlayer_gameId_idx"        ON "GamePlayer"("gameId");
CREATE INDEX "GamePlayer_userId_idx"        ON "GamePlayer"("userId");
CREATE INDEX "Tournament_status_idx"        ON "Tournament"("status");
CREATE INDEX "Tournament_starts_at_idx"     ON "Tournament"("starts_at");
CREATE INDEX "Tournament_is_in_person_idx"  ON "Tournament"("is_in_person");
CREATE INDEX "TournamentPlayer_tournamentId_idx" ON "TournamentPlayer"("tournamentId");
CREATE INDEX "TournamentPlayer_userId_idx"  ON "TournamentPlayer"("userId");
CREATE INDEX "FraudLog_userId_idx"          ON "FraudLog"("userId");
CREATE INDEX "FraudLog_type_idx"            ON "FraudLog"("type");
CREATE INDEX "FraudLog_reason_code_idx"     ON "FraudLog"("reason_code");
CREATE INDEX "FraudLog_resolved_idx"        ON "FraudLog"("resolved");
CREATE INDEX "FraudLog_created_at_idx"      ON "FraudLog"("created_at");
CREATE INDEX "DeviceBind_device_id_idx"     ON "DeviceBind"("device_id");
CREATE INDEX "DeviceBind_userId_idx"        ON "DeviceBind"("userId");
CREATE INDEX "PairBlock_active_idx"         ON "PairBlock"("active");
CREATE INDEX "PairBlock_userAId_idx"        ON "PairBlock"("userAId");
CREATE INDEX "PairBlock_userBId_idx"        ON "PairBlock"("userBId");
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");
CREATE INDEX "CouponRedemption_userId_idx"  ON "CouponRedemption"("userId");
CREATE INDEX "PartnerCooldown_userAId_idx"  ON "PartnerCooldown"("userAId");
CREATE INDEX "PartnerCooldown_userBId_idx"  ON "PartnerCooldown"("userBId");
CREATE INDEX "GameRoom_locked_idx"          ON "GameRoom"("locked");
CREATE INDEX "GameRoom_mode_idx"            ON "GameRoom"("mode");
CREATE INDEX "Announcement_is_active_idx"   ON "Announcement"("is_active");
CREATE INDEX "Announcement_target_rank_idx" ON "Announcement"("target_rank");
CREATE INDEX "UserAnnouncementView_userId_idx"         ON "UserAnnouncementView"("userId");
CREATE INDEX "UserAnnouncementView_announcementId_idx" ON "UserAnnouncementView"("announcementId");

-- -------------------------------------------------------------
-- Foreign Keys
-- -------------------------------------------------------------

ALTER TABLE "Wallet"
    ADD CONSTRAINT "Wallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Game"
    ADD CONSTRAINT "Game_winner_id_fkey"
    FOREIGN KEY ("winner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Game"
    ADD CONSTRAINT "Game_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GamePlayer"
    ADD CONSTRAINT "GamePlayer_gameId_fkey"
    FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GamePlayer"
    ADD CONSTRAINT "GamePlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentPlayer"
    ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentPlayer"
    ADD CONSTRAINT "TournamentPlayer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FraudLog"
    ADD CONSTRAINT "FraudLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeviceBind"
    ADD CONSTRAINT "DeviceBind_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_couponId_fkey"
    FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CouponRedemption"
    ADD CONSTRAINT "CouponRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAnnouncementView"
    ADD CONSTRAINT "UserAnnouncementView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAnnouncementView"
    ADD CONSTRAINT "UserAnnouncementView_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
