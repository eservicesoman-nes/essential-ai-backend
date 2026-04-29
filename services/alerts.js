async function sendAlert(title, message) {
  console.warn(`[ALERT] ${title}: ${message}`);
}
module.exports = { sendAlert };
