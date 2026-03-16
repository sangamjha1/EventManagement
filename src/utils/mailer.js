const nodemailer = require("nodemailer");

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendMail({ to, subject, text, html }) {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || "EventFlow <no-reply@eventflow.local>";

  if (!transporter) {
    console.log("MAIL_FALLBACK", { to, subject, text });
    return { fallback: true };
  }

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { fallback: false };
}

module.exports = {
  sendMail,
};
