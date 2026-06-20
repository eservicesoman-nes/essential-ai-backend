const { supabase: sb, getClientCredentials, saveClientCredentials } = require("./credentials");
const { authenticate } = require("./router");

module.exports = function(app) {

  app.get('/api/clients', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('clients').select('id,name,industry,region,country,language,status,plan,primary_color,logo_url,lead_email,modules,created_at').order('name');
      if (error) throw error;
      res.json({ success: true, clients: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('clients').select('id,name,industry,region,country,language,status,plan,primary_color,logo_url,lead_email,modules,created_at').eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, client: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/client', authenticate, async (req, res) => {
    try {
      const { name, email, website, industry, region, country, language, lead_email, primary_color, logo_url, plan, status } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const { data, error } = await sb.from('clients').insert([{ name, email, website, industry, region, country, language, lead_email, primary_color: primary_color||'#1a56db', logo_url, plan: plan||'starter', status: status||'active', trial_start: new Date().toISOString(), trial_duration_days: 7 }]).select().single();
      if (error) throw error;
      res.json({ success: true, client: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/client/:id', authenticate, async (req, res) => {
    try {
      const allowed = ['name','email','website','industry','region','country','language','lead_email','primary_color','logo_url','plan','status'];
      const update = {};
      allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });
      const { error } = await sb.from('clients').update(update).eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/client/:id', authenticate, async (req, res) => {
    try {
      const { error } = await sb.from('clients').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id/modules', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('clients').select('modules').eq('id', req.params.id).single();
      if (error) throw error;
      res.json({ success: true, modules: data.modules });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/client/:id/modules', authenticate, async (req, res) => {
    try {
      const { error } = await sb.from('clients').update({ modules: req.body.modules }).eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id/feed', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('ceo_feed').select('*').order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      res.json({ success: true, feed: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id/leads', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('leads').select('*').eq('client_id', req.params.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      res.json({ success: true, leads: data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id/credentials', authenticate, async (req, res) => {
    try {
      const result = await getClientCredentials(req.params.id);
      res.json({ success: true, credentials: result.credentials });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/client/:id/credentials', authenticate, async (req, res) => {
    try {
      const { credentials } = req.body;
      if (!credentials) return res.status(400).json({ error: 'credentials required' });
      await saveClientCredentials(req.params.id, credentials, null);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/client/:id/users', authenticate, async (req, res) => {
    try {
      const { data, error } = await sb.from('profiles').select('id,role,created_at').eq('client_id', req.params.id);
      if (error) throw error;
      const usersWithEmail = await Promise.all((data||[]).map(async (p) => {
        try {
          const { data: u } = await sb.auth.admin.getUserById(p.id);
          return { ...p, email: u?.user?.email || '—' };
        } catch(e) { return { ...p, email: '—' }; }
      }));
      res.json({ success: true, users: usersWithEmail });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/client/:id/invite', authenticate, async (req, res) => {
    try {
      const { email, role } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!['ceo','manager','staff'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      const clientId = req.params.id;
      const { data: inviteData, error: inviteError } = await sb.auth.admin.inviteUserByEmail(email, {
        data: { role, client_id: clientId },
        redirectTo: 'https://app.nes-ai.com'
      });
      if (inviteError) throw inviteError;
      const userId = inviteData?.user?.id;
      if (userId) {
        await sb.from('profiles').upsert({ id: userId, role, client_id: clientId }, { onConflict: 'id' });
      }
      res.json({ success: true, message: 'Invite sent to ' + email });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/client/:id/user/:userId', authenticate, async (req, res) => {
    try {
      const { error } = await sb.from('profiles').update({ client_id: null }).eq('id', req.params.userId).eq('client_id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });



// ── SELF-REGISTRATION (intentionally public — no auth, this is the signup endpoint) ──
app.post('/api/register', async (req, res) => {
  const { name, company, email, phone, plan, partner_ref } = req.body;
  if (!name || !company || !email || !phone || !plan) {
    return res.status(400).json({ error: 'All fields required' });
  }
  const validPlans = ['presence', 'operations', 'workforce', 'infrastructure'];
  if (!validPlans.includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  // Validate partner ref code if provided
  let validPartnerRef = null;
  if (partner_ref) {
    const { data: partner } = await sb.from('partners').select('ref_code,status').eq('ref_code', partner_ref).eq('status','active').single();
    if (partner) {
      validPartnerRef = partner.ref_code;
      // Update partner last_active_at
      await sb.from('partners').update({ last_active_at: new Date().toISOString() }).eq('ref_code', partner_ref);
    }
  }
  try {
    const { data: authData, error: authError } = await sb.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(-10) + 'Aa1!',
      email_confirm: false,
      user_metadata: { name, company, phone }
    });
    if (authError) {
      if (authError.code === 'email_exists' || authError.message.includes('already registered')) {
        return res.status(409).json({ error: 'Email already registered. Please sign in.' });
      }
      throw authError;
    }
    const userId = authData.user.id;
    const { data: clientData, error: clientError } = await sb
      .from('clients')
      .insert({
        name: company, plan, status: 'trial', email,
        trial_start: new Date().toISOString(),
        trial_duration_days: 7,
        partner_ref: validPartnerRef || null,
        founder_discount_expires_at: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
        modules: {
          ai_chatbot: true, lead_capture: true, email_notifications: true,
          islam360: true, sara_receptionist: true, whatsapp_alerts: false,
          social_media: false,
          ceo_dashboard: plan !== 'presence',
          nes_command: plan !== 'presence',
          intel_feed: plan !== 'presence'
        }
      })
      .select().single();
    if (clientError) throw clientError;
    await sb.from('profiles').insert({
      id: userId, email, role: 'ceo',
      client_id: clientData.id, full_name: name
    });
    await sb.auth.admin.generateLink({
      type: 'magiclink', email,
      options: { redirectTo: 'https://app.nes-ai.com' }
    });
    // Auto-create 6 default departments
    const defaultDepts = [
      { name: 'Management', permissions: ['dashboard','leads','command','reports','billing','team'] },
      { name: 'Sales',      permissions: ['leads','command','pipeline'] },
      { name: 'IT',         permissions: ['credentials','email_setup','team','integrations'] },
      { name: 'Finance',    permissions: ['billing','reports','usage'] },
      { name: 'HR',         permissions: ['team','invites','roles'] },
      { name: 'Operations', permissions: ['command','tasks','reports'] }
    ];
    await sb.from('departments').insert(
      defaultDepts.map(d => ({ client_id: clientData.id, name: d.name, permissions: d.permissions, is_default: true }))
    );
    try {
      await fetch('https://n8n.essential-services.org/webhook/nes-new-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, email, phone, plan, client_id: clientData.id, registered_at: new Date().toISOString() })
      });
    } catch(e) { console.warn('n8n webhook failed:', e.message); }
    // Fraud check webhook
    if(partner_ref){
      fetch('https://n8n.essential-services.org/webhook/partner-fraud-check', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email, partner_ref })
      }).catch(e => console.log('Fraud check error:', e.message));
    }
    res.json({ success: true, message: 'Account created. Check your email to sign in.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

  // PATCH /api/client/:id/user/:userId/role
  app.patch('/api/client/:id/user/:userId/role', authenticate, async (req, res) => {
    try {
      const { role } = req.body;
      if (!['ceo','manager','staff'].includes(role))
        return res.status(400).json({ error: 'Invalid role' });
      const { error } = await sb.from('profiles')
        .update({ role })
        .eq('id', req.params.userId)
        .eq('client_id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });
  // POST /api/admin/partner-approve
  app.post('/api/admin/partner-approve', authenticate, async (req, res) => {
    try {
      const { partner_id, action, tier, rejection_reason } = req.body;
      if (!partner_id || !action) return res.status(400).json({ error: 'Missing partner_id or action' });

      if (action === 'approve') {
        const token = require('crypto').randomUUID();
        const { error } = await sb.from('partners')
          .update({
            status: 'approved',
            tier: tier || 'apex',
            agreement_token: token,
            approved_at: new Date().toISOString()
          })
          .eq('id', partner_id);
        if (error) throw error;

        // Fetch partner details for email
        const { data: partner } = await sb.from('partners')
          .select('name, email, company')
          .eq('id', partner_id)
          .single();

        // Trigger n8n approval workflow
        await fetch('https://n8n.essential-services.org/webhook/partner-agreement-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approve',
            partner_id,
            name: partner.name,
            email: partner.email,
            company: partner.company,
            tier: tier || 'apex',
            agreement_link: `https://nes-ai.com/partner-agreement.html?token=${token}`
          })
        });

        res.json({ success: true, message: 'Partner approved and agreement email sent.' });

      } else if (action === 'reject') {
        const { error } = await sb.from('partners')
          .update({ status: 'rejected', rejection_reason: rejection_reason || '' })
          .eq('id', partner_id);
        if (error) throw error;

        const { data: partner } = await sb.from('partners')
          .select('name, email, company')
          .eq('id', partner_id)
          .single();

        await fetch('https://n8n.essential-services.org/webhook/partner-agreement-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reject',
            partner_id,
            name: partner.name,
            email: partner.email,
            company: partner.company,
            rejection_reason: rejection_reason || 'Your application did not meet our current requirements.'
          })
        });

        res.json({ success: true, message: 'Partner rejected and email sent.' });
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch(e) { res.status(500).json({ error: e.message }); }
  });


};
