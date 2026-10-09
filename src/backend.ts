import { createClient } from "@supabase/supabase-js";
import { publicKeyAllowed } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configurationError =
  Boolean(url || key) &&
  (!url ||
    !key ||
    !publicKeyAllowed(key) ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url));
export const db =
  !configurationError && url && key ? createClient(url, key) : null;
