import * as Joi from 'joi';

// Validates environment variables at boot. Fails fast on misconfiguration.
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('*'),

  DATABASE_URL: Joi.string().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  REDIS_ADAPTER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_TTL: Joi.string().default('30d'),

  R2_ACCOUNT_ID: Joi.string().allow('').optional(),
  R2_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  R2_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  R2_BUCKET: Joi.string().default('edugram-media'),
  R2_ENDPOINT: Joi.string().allow('').optional(),
  R2_PUBLIC_URL: Joi.string().allow('').optional(),
  R2_PRESIGN_TTL: Joi.number().default(900),

  FCM_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  FCM_SERVICE_ACCOUNT_PATH: Joi.string().default(
    './firebase-service-account.json',
  ),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(120),
});
