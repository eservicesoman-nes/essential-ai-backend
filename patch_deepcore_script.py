with open('router.js', 'r') as f:
    c = f.read()

old = """router.post('/deepcore', authenticate, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const userId = req.user.id;
    const plan = req.user.client?.plan || 'presence';
    const planLimits = { presence: 0, operations: 20, workforce: 50, infrastructure: 200 };
    const limit = planLimits[plan] || 0;
    if (limit === 0) return res.status(403).json({ error: 'Deep Core is not available on your plan.' });
    const month = new Date().toISOString().slice(0, 7);
    const { data: usage } = await supabase.from('usage').select('advisory_used').eq('user_id', userId).eq('month', month).single();
    const advisoryUsed = usage?.advisory_used || 0;
    if (advisoryUsed >= limit) return res.status(429).json({ error: 'Monthly Deep Core limit reached', limit, used: advisoryUsed });
    const systemPrompt = 'You are a senior GCC business consultant with 20 years experience. Deep expertise in Oman, UAE, KSA. You know Vision 2030, Oman 2040, VAT, labour law, Omanisation, free zones. Give strategic actionable advice. Also help with coding, analysis and documents. Be direct and concise.';
    const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }];
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 2048, system: systemPrompt, messages });
    const reply = response.content[0].text;
    await supabase.from('usage').upsert({ user_id: userId, month, advisory_used: advisoryUsed + 1 }, { onConflict: 'user_id,month' });
    incrementApiCost('anthropic', 0.018);
    res.json({ reply, usage: { used: advisoryUsed + 1, limit, remaining: limit - (advisoryUsed + 1) } });
  } catch (error) {
    console.error('Deep Core error:', error);
    res.status(500).json({ error: 'Deep Core failed.' });
  }
});"""

new = """// ============================================================
// NOTE (Jun 17 2026): /deepcore is DORMANT/REDUNDANT — kept for possible
// future use, but no frontend UI calls this route anymore. "Deep Core" was
// merged into the regular unified "Ask NESAI" chat (see /chat and /chat/stream
// routes, which use the Gemini -> Claude -> DeepSeek chain). This route is
// NOT part of the active flow. If reactivated, route it through the same
// callGemini/callClaude/callDeepSeek chain for cost/consistency rather than
// calling Claude Sonnet directly as it did historically.
// ============================================================
router.post('/deepcore', authenticate, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const systemPrompt = 'You are a senior GCC business consultant with 20 years experience. Deep expertise in Oman, UAE, KSA. You know Vision 2030, Oman 2040, VAT, labour law, Omanisation, free zones. Give strategic actionable advice. Also help with coding, analysis and documents. Be direct and concise.';
    const messages = [...history.map(h => ({ role: h.role, content: h.content })), { role: 'user', content: message }];
    let reply;
    try {
      reply = await Promise.race([
        callGemini(message, history, systemPrompt),
        new Promise((_, r) => setTimeout(() => r(new Error('Gemini timeout')), 8000))
      ]);
      incrementApiCost('gemini', 0.0005);
    } catch (geminiError) {
      console.error('Deep Core: Gemini error, falling back to Claude:', geminiError.message);
      try {
        reply = await callClaude(messages, systemPrompt);
        incrementApiCost('anthropic', 0.006);
      } catch (claudeError) {
        console.error('Deep Core: Claude error, falling back to DeepSeek:', claudeError.message);
        reply = await callDeepSeek(messages, systemPrompt);
        incrementApiCost('deepseek', 0.0002);
      }
    }
    res.json({ reply });
  } catch (error) {
    console.error('Deep Core error:', error);
    res.status(500).json({ error: 'Deep Core failed.' });
  }
});"""

if old in c:
    c = c.replace(old, new)
    with open('router.js', 'w') as f:
        f.write(c)
    print('PATCHED')
else:
    print('NOT FOUND')
