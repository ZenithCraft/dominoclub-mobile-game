/**
 * Runtime configuration service — Milestone 5
 *
 * Reads game settings from the SystemConfig table, caching values for
 * CACHE_TTL_MS to avoid a DB round-trip on every matchmaking call.
 * Falls back to env-var defaults when the DB is unreachable or the key
 * has not been seeded yet.
 *
 * Usage:
 *   import { getRuntimeConfig } from './runtime-config.service';
 *   const { houseEdgePercent } = await getRuntimeConfig();
 */

import { prisma } from './prisma.service';
import { config as envConfig } from '../config';
import { logger } from '../utils/logger';

export interface RuntimeGameConfig {
  houseEdgePercent: number;
  botInjectWaitSeconds: number;
  turnTimeoutSeconds: number;
  disconnectGraceSeconds: number;
}

const CACHE_TTL_MS = 60_000; // 60 s

let cachedConfig: RuntimeGameConfig | null = null;
let cacheExpiresAt = 0;

/** Env-var fallback values (used when DB has no override). */
function envDefaults(): RuntimeGameConfig {
  return {
    houseEdgePercent:        envConfig.game.houseEdgePercent,
    botInjectWaitSeconds:    envConfig.game.botInjectWaitSeconds,
    turnTimeoutSeconds:      envConfig.game.turnTimeoutSeconds,
    disconnectGraceSeconds:  envConfig.game.disconnectGraceSeconds,
  };
}

/**
 * Returns the current game config, preferring DB values over env-var defaults.
 * Results are cached for CACHE_TTL_MS milliseconds.
 */
export async function getRuntimeConfig(): Promise<RuntimeGameConfig> {
  if (cachedConfig && Date.now() < cacheExpiresAt) return cachedConfig;

  try {
    const rows = await prisma.systemConfig.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const defaults = envDefaults();

    cachedConfig = {
      houseEdgePercent:        parseFloat(map['houseEdgePercent']        ?? String(defaults.houseEdgePercent)),
      botInjectWaitSeconds:    parseInt(map['botInjectWaitSeconds']       ?? String(defaults.botInjectWaitSeconds), 10),
      turnTimeoutSeconds:      parseInt(map['turnTimeoutSeconds']         ?? String(defaults.turnTimeoutSeconds), 10),
      disconnectGraceSeconds:  parseInt(map['disconnectGraceSeconds']     ?? String(defaults.disconnectGraceSeconds), 10),
    };

    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedConfig;
  } catch (err: any) {
    logger.warn('[RuntimeConfig] DB read failed — using env defaults', { message: err.message });
    return envDefaults();
  }
}

/**
 * Invalidate the in-memory cache immediately (call after admin PATCH /config).
 */
export function invalidateRuntimeConfigCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

/**
 * Convenience helper — returns only the house edge percent.
 * Used in matchmaking prize calculations.
 */
export async function getHouseEdgePercent(): Promise<number> {
  const cfg = await getRuntimeConfig();
  return cfg.houseEdgePercent;
}
