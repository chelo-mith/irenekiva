import { n as nodemailer } from "../../_libs/nodemailer.mjs";
import { r as readBody } from "../../_libs/h3.mjs";
import "events";
import "url";
import "util";
import "fs";
import "http";
import "https";
import "zlib";
import "stream";
import "net";
import "dns";
import "os";
import "path";
import "crypto";
import "tls";
import "child_process";
import "../../_libs/rou3.mjs";
import "../../_libs/srvx.mjs";
import "node:stream";
async function sendVerificationEmail$1({ email, token, firstName, appUrl, from }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const defaultFrom = process.env.SMTP_FROM ?? "KIVA <noreply@votre-domaine.com>";
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error("SMTP configuration manquante. Vérifiez SMTP_HOST, SMTP_USER et SMTP_PASS.");
  }
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  const verificationUrl = `${appUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Bienvenue sur KIVA !</h1>
      <p>Bonjour ${firstName},</p>
      <p>Merci de vous être inscrit sur KIVA. Pour activer votre compte, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :</p>
      <a href="${verificationUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Vérifier mon email
      </a>
      <p style="color: #666; font-size: 14px;">Ce lien expirera dans 24 heures.</p>
      <p style="color: #666; font-size: 14px;">Si vous n'avez pas créé de compte sur KIVA, ignorez cet email.</p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
      <p style="color: #999; font-size: 12px;">© 2024 KIVA. Tous droits réservés.</p>
    </div>
  `;
  const info = await transporter.sendMail({
    from: from ?? defaultFrom,
    to: email,
    subject: "Vérifiez votre adresse email - KIVA",
    html,
  });
  return info;
}
async function sendVerificationEmail(event) {
  try {
    const body = await readBody(event);
    if (!body) {
      return new Response(JSON.stringify({ error: "Body manquant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { email, token, firstName } = body;
    const appUrl = process.env.APP_URL ?? "https://irenekiva-delta.vercel.app";
    await sendVerificationEmail$1({
      email,
      token,
      firstName: firstName ?? "",
      appUrl,
    });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in /api/send-verification-email:", err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
export { sendVerificationEmail as default };
