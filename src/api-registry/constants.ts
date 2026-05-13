export const AUTH_VALUES = ['No', 'apiKey', 'OAuth', 'User-Agent', 'X-Mashape-Key', 'unknown'] as const;
export const CORS_VALUES = ['yes', 'no', 'unknown'] as const;
export const PRICING_VALUES = ['free', 'free_tier', 'paid', 'unknown'] as const;
export const STATUS_VALUES = ['trusted', 'needs_review', 'rejected'] as const;
export const CONSUMER_PROFILES = ['frontend-only', 'backend-required', 'prototype', 'production', 'mobile-app', 'dashboard', 'automation'] as const;
export const FIT_KEYS = ['frontend', 'backend', 'prototype', 'production', 'mobile', 'dashboard', 'automation'] as const;
export const CURRENT_DATE = '2026-05-13';
export const DEFAULT_FRESHNESS_DAYS = 90;
