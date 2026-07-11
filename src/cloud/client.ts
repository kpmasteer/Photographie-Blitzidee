import { createClient } from "@supabase/supabase-js";
import { cloudConfig, cloudConfigured } from "./config";

export const supabase = cloudConfigured ? createClient(cloudConfig.url, cloudConfig.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 10 } }
}) : undefined;
