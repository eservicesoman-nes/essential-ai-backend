// database.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DAILY_LIMITS = {
  free: { chats: 50, images: 3, docs: 5 },
  pro: { chats: 500, images: 50, docs: 100 },
  team: { chats: 2000, images: 200, docs: 500 },
  enterprise: { chats: 10000, images: 1000, docs: 5000 }
};

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, tier')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`getProfile: ${error.message}`);
  return data;
}

async function getTodayUsage(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('daily_usage')
    .select('chats, images, docs')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();
  if (error) throw new Error(`getTodayUsage: ${error.message}`);
  return data || { chats: 0, images: 0, docs: 0 };
}

async function incrementUsage(userId, type) {
  const { error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_type: type
  });
  if (error) throw new Error(`incrementUsage: ${error.message}`);
}

async function checkUsageAllowed(userId, type) {
  const profile = await getProfile(userId);
  const usage = await getTodayUsage(userId);
  const limits = DAILY_LIMITS[profile.tier] || DAILY_LIMITS.free;
  const current = usage[type] || 0;
  const limit = limits[type];
  return {
    allowed: current < limit,
    current,
    limit,
    tier: profile.tier,
    remaining: Math.max(0, limit - current)
  };
}

async function logRequest(userId, mode, modelUsed, fallbackUsed = false) {
  await supabase.from('request_logs').insert({
    user_id: userId,
    mode,
    model_used: modelUsed,
    fallback_used: fallbackUsed
  }).catch(err => console.warn('Log error:', err.message));
}

module.exports = { getProfile, getTodayUsage, incrementUsage, checkUsageAllowed, logRequest, DAILY_LIMITS };
