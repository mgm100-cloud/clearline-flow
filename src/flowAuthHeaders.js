// The signed-in person's Supabase session, attached to calls to our own /api functions (2026-10-21).
// /api/send-email and /api/superllm-stream now refuse a caller without one (lib/flowAuth.js); before this they
// answered anyone on the internet.
import { supabase } from './supabaseClient';

export async function flowAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch (_e) {
    return {};
  }
}
