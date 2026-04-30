const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LIMITS = {
  free:       { chats: 50,   images: 3,  docs: 5 },
  pro:        { chats: 500,  images: 50, docs: 100 },
  team:       { chats: 2000, images: 200,docs: 500 },
  enterprise: { chats: 99999,images: 9999,docs:9999 }
};

function today() { return new Date().toISOString().slice(0, 10); }

async function getTodayUsage(userId) {
  const { data } = await sb.from('usage').select('*')
    .eq('user_id', userId).eq('date', today()).maybeSingle();
  return data || { chats: 0, images: 0, docs: 0 };
}

async function checkUsageAllowed(userId, type) {
  const usage = await getTodayUsage(userId);
  const tier = 'free';
  const limit = LIMITS[tier][type];
  const used = usage[type] || 0;
  return { allowed: used < limit, limit, remaining: limit - used, tier };
}

async function incrementUsage(userId, type) {
  const usage = await getTodayUsage(userId);
  const current = usage[type] || 0;
  await sb.from('usage').upsert({
    user_id: userId, date: today(),
    [type]: current + 1
  }, { onConflict: 'user_id,date' });
}

async function logRequest(userId, mode, model, search, fallback) {
  try {
    await sb.from('request_logs').insert({
      user_id: userId, mode, model,
      web_search: search, fallback_used: fallback,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Failed to log request:', err.message);
  }
}

module.exports = { checkUsageAllowed, incrementUsage, getTodayUsage, logRequest };
