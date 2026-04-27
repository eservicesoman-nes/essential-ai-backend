const axios = require('axios');

async function sendAlert(subject, message) {
  const key = process.env.WEB3FORMS_KEY;
  if (!key) {
    console.error(`[ALERT] ${subject}: ${message}`);
    return;
  }
  try {
    await axios.post('https://api.web3forms.com/submit', {
      access_key: key,
      subject: `[Essential AI Alert] ${subject}`,
      message: `${message}\n\nTimestamp: ${new Date().toISOString()}`
    }, { timeout: 5000 });
  } catch (err) {
    console.error(`sendAlert failed: ${err.message}`);
  }
}

module.exports = { sendAlert };
