-- Milestone 5: Dynamic system configuration table
-- Allows admins to update game settings (house edge, bot timing, etc.) at runtime
-- without restarting the server.

CREATE TABLE "SystemConfig" (
    "key"        TEXT NOT NULL,
    "value"      TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- Add index on FraudLog.resolved (missed in initial migration)
CREATE INDEX IF NOT EXISTS "FraudLog_resolved_idx" ON "FraudLog"("resolved");

-- Seed default rake configuration
INSERT INTO "SystemConfig" ("key", "value", "updated_at")
VALUES
  ('houseEdgePercent',        '10',   NOW()),
  ('matchmakingBetTolerance', '0.10', NOW()),
  ('botInjectWaitSeconds',    '30',   NOW()),
  ('turnTimeoutSeconds',      '30',   NOW()),
  ('disconnectGraceSeconds',  '15',   NOW())
ON CONFLICT ("key") DO NOTHING;
