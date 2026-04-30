import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function sanitizeSubject(str: string): string {
  return str.replace(/[\r\n\0]/g, "");
}

function safeUrl(url: string): string {
  if (url === "/" || (url.startsWith("/") && !url.startsWith("//"))) return url;
  if (url.startsWith("https://")) return url;
  throw new Error("Invalid URL: must be https:// or a relative path");
}

const FROM_ADDRESS = process.env.RESEND_FROM || "onboarding@resend.dev";

export async function sendWelcomeEmail(to: string, name: string, ctaUrl: string) {
  if (process.env.DEMO_MODE === "true" && !!process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("DEMO_MODE is not allowed in production");
  }
  if (process.env.DEMO_MODE === "true") return;
  const safeName = escapeHtml(name);
  const safeCtaUrl = safeUrl(ctaUrl);
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Welcome to GapSmith, ${sanitizeSubject(name)}!`,
    html: `
      <h1>Welcome, ${safeName}!</h1>
      <p>Thanks for signing up. GapSmith automates the full startup discovery journey — Scout market signals, Forge ideas, and Prove them with multi-agent debate.</p>
      <p><a href="${safeCtaUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Start Finding Gaps</a></p>
    `,
  });
  if (error) throw error;
}

export async function sendActivationNudge(to: string, name: string, activationAction: string, ctaUrl: string) {
  if (process.env.DEMO_MODE === "true" && !!process.env.RAILWAY_ENVIRONMENT) {
    throw new Error("DEMO_MODE is not allowed in production");
  }
  if (process.env.DEMO_MODE === "true") return;
  const safeName = escapeHtml(name);
  const safeAction = escapeHtml(activationAction);
  const safeCtaUrl = safeUrl(ctaUrl);
  const { error } = await getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Quick reminder: ${sanitizeSubject(activationAction)}`,
    html: `
      <h1>Hey ${safeName}, you're almost there</h1>
      <p>You signed up but haven't ${safeAction} yet. It only takes a minute.</p>
      <p><a href="${safeCtaUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">${safeAction}</a></p>
    `,
  });
  if (error) throw error;
}
