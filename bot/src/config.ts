import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.BOT_ENV_PATH ?? undefined });

const configSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiToken: z.string().min(1, 'Se requiere un token de API para autenticar el bot'),
  pollIntervalMs: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 30000))
    .pipe(z.number().int().min(5000).max(600000)),
  lookAheadMinutes: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 30))
    .pipe(z.number().int().min(1).max(240)),
  maxBatch: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  sessionPath: z.string().default('storage/whatsapp-session'),
  defaultCountryCode: z.string().default('506'),
  logLevel: z.string().default('info')
});

const parsed = configSchema.parse({
  apiBaseUrl: process.env.BOT_API_BASE_URL,
  apiToken: process.env.BOT_API_TOKEN,
  pollIntervalMs: process.env.BOT_POLL_INTERVAL_MS,
  lookAheadMinutes: process.env.BOT_LOOK_AHEAD_MINUTES,
  maxBatch: process.env.BOT_MAX_BATCH,
  sessionPath: process.env.BOT_SESSION_PATH,
  defaultCountryCode: process.env.BOT_DEFAULT_COUNTRY_CODE,
  logLevel: process.env.BOT_LOG_LEVEL
});

export type AppConfig = z.infer<typeof configSchema> & {
  pollIntervalMs: number;
  lookAheadMinutes: number;
  maxBatch: number;
};

export const config: AppConfig = {
  ...parsed,
  pollIntervalMs: parsed.pollIntervalMs,
  lookAheadMinutes: parsed.lookAheadMinutes,
  maxBatch: parsed.maxBatch
};
