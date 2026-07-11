export const cloudConfig = {
  url: String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
  anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim()
};

export const cloudConfigured = Boolean(cloudConfig.url && cloudConfig.anonKey);
