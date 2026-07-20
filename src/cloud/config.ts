const PRODUCTION_SUPABASE_URL = "https://juknaidnlckrjwudotii.supabase.co";
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_julrbpQuGx_sP3e9UWCDsw_t9hS91WX";

export const cloudConfig = {
  url: String(import.meta.env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL).trim(),
  anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || PRODUCTION_SUPABASE_PUBLISHABLE_KEY).trim()
};

export const cloudConfigured = Boolean(cloudConfig.url && cloudConfig.anonKey);
