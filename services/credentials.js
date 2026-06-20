const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: WebSocket } }
);

const ENC_KEY = process.env.NES_ENCRYPTION_KEY;

async function encrypt(plaintext) {
  const { data, error } = await supabase.rpc('nes_encrypt', { plaintext, enc_key: ENC_KEY });
  if (error) throw new Error('Encrypt failed: ' + error.message);
  return data;
}

async function decrypt(ciphertext) {
  if (ciphertext.startsWith('{') || ciphertext.startsWith('[')) return ciphertext;
  try {
    const { data, error } = await supabase.rpc('nes_decrypt', { ciphertext, enc_key: ENC_KEY });
    if (error) throw new Error('Decrypt failed: ' + error.message);
    return data;
  } catch (err) {
    console.warn('Decrypt warning:', err.message);
    return ciphertext;
  }
}

async function getClientCredentials(clientId) {
  const { data, error } = await supabase.from('clients').select('id, name, credentials, settings, modules').eq('id', clientId).single();
  if (error) throw new Error('Client not found: ' + error.message);
  const decryptedCredentials = data.credentials ? JSON.parse(await decrypt(data.credentials)) : {};
  const decryptedSettings = data.settings ? JSON.parse(await decrypt(data.settings)) : {};
  return { id: data.id, name: data.name, modules: data.modules, credentials: decryptedCredentials, settings: decryptedSettings };
}

async function saveClientCredentials(clientId, credentials, settings) {
  const encCredentials = credentials ? await encrypt(JSON.stringify(credentials)) : null;
  const encSettings = settings ? await encrypt(JSON.stringify(settings)) : null;
  const updateData = {};
  if (encCredentials !== null) updateData.credentials = encCredentials;
  if (encSettings !== null) updateData.settings = encSettings;
  const { error } = await supabase.from('clients').update(updateData).eq('id', clientId);
  if (error) throw new Error('Save failed: ' + error.message);
  return { success: true };
}

module.exports = { encrypt, decrypt, getClientCredentials, saveClientCredentials, supabase };
