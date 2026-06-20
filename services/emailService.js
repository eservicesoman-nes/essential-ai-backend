const Imap = require('node-imap');
const nodemailer = require('nodemailer');

function getProviderSettings(provider) {
  const s = {
    gmail:   { imap_server:'imap.gmail.com',        imap_port:993, smtp_server:'smtp.gmail.com',     smtp_port:587 },
    outlook: { imap_server:'outlook.office365.com', imap_port:993, smtp_server:'smtp.office365.com', smtp_port:587 },
    yahoo:   { imap_server:'imap.mail.yahoo.com',   imap_port:993, smtp_server:'smtp.mail.yahoo.com',smtp_port:587 },
    cpanel:  { imap_server:null, imap_port:993, smtp_server:null, smtp_port:587 },
    other:   { imap_server:null, imap_port:993, smtp_server:null, smtp_port:587 },
  };
  return s[provider] || s.other;
}

function testConnection(account) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({ user:account.username||account.email_address, password:account.app_password, host:account.imap_server, port:account.imap_port||993, tls:true, tlsOptions:{rejectUnauthorized:false}, connTimeout:10000, authTimeout:10000 });
    imap.once('ready', () => { imap.end(); resolve({ success:true }); });
    imap.once('error', (err) => reject(new Error(err.message)));
    imap.connect();
  });
}

function fetchEmails(account, limit=20) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({ user:account.username||account.email_address, password:account.app_password, host:account.imap_server, port:account.imap_port||993, tls:true, tlsOptions:{rejectUnauthorized:false}, connTimeout:15000, authTimeout:15000 });
    const emails = [];
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if(err){ imap.end(); return reject(err); }
        const total = box.messages.total;
        if(total===0){ imap.end(); return resolve([]); }
        const start = Math.max(1, total-limit+1);
        const fetch = imap.seq.fetch(start+':'+total, { bodies:['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)'], struct:true });
        fetch.on('message', (msg) => {
          const email = {};
          msg.on('body', (stream) => {
            let buf = '';
            stream.on('data', (c) => buf += c.toString('utf8'));
            stream.once('end', () => {
              const p = Imap.parseHeader(buf);
              email.message_id = (p['message-id']||[''])[0];
              email.subject = (p.subject||['(no subject)'])[0];
              email.to_address = (p.to||[''])[0];
              email.received_at = new Date((p.date||[''])[0]);
              const fr = (p.from||[''])[0];
              const m = fr.match(/^(.*?)\s*<(.+?)>$/);
              email.from_name = m ? m[1].replace(/"/g,'').trim() : fr;
              email.from_address = m ? m[2] : fr;
            });
          });
          msg.once('attributes', (a) => { email.uid=a.uid; email.is_read=a.flags.includes('\Seen'); });
          msg.once('end', () => emails.push(email));
        });
        fetch.once('error', reject);
        fetch.once('end', () => { imap.end(); resolve(emails.reverse()); });
      });
    });
    imap.once('error', reject);
    imap.connect();
  });
}

async function sendEmail(account, { to, subject, body, replyTo }) {
  const t = nodemailer.createTransport({ host:account.smtp_server, port:account.smtp_port||587, secure:false, auth:{ user:account.username||account.email_address, pass:account.app_password }, tls:{rejectUnauthorized:false} });
  await t.sendMail({ from:account.email_address, to, subject, text:body, inReplyTo:replyTo });
  return { success:true };
}

module.exports = { getProviderSettings, testConnection, fetchEmails, sendEmail };
