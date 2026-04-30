import { Resend } from "resend";

const FROM_ADDRESS = process.env.RESEND_FROM || "onboarding@resend.dev";
const REVIEWER_INBOX = process.env.DFY_REVIEWER_EMAIL || "gapsmith@draftlabs.org";

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export type DfyOrderForNotify = {
  id: string;
  service: "scout" | "forge" | "prove" | string;
  amount_cents: number;
  contact_email: string;
  contact_name?: string | null;
  brief_sectors?: string | null;
  brief_idea?: string | null;
  brief_target_market?: string | null;
  brief_constraints?: string | null;
  brief_what_you_want?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  stripe_session_id?: string | null;
  x402_tx_hash?: string | null;
  user_id?: string | null;
};

/**
 * Notifies the reviewer inbox that a new Done-For-You order has been paid.
 * Best-effort: failures are logged by the caller; we never block the verify
 * response on email delivery.
 */
export async function sendDfyOrderNotification(order: DfyOrderForNotify): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[DFY notify] RESEND_API_KEY not set, skipping email");
    return;
  }
  if (process.env.DEMO_MODE === "true") return;

  const resend = new Resend(process.env.RESEND_API_KEY);

  const dollars = (order.amount_cents / 100).toFixed(2);
  const subject = `[DFY] New ${order.service} order paid — $${dollars} (${order.id.slice(0, 8)})`;
  const briefBlocks = [
    order.brief_sectors && { label: "Target sectors", value: order.brief_sectors },
    order.brief_idea && { label: "Idea / hypothesis", value: order.brief_idea },
    order.brief_target_market && { label: "Target market", value: order.brief_target_market },
    order.brief_constraints && { label: "Constraints", value: order.brief_constraints },
    order.brief_what_you_want && { label: "What they want out", value: order.brief_what_you_want },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const briefHtml = briefBlocks.length
    ? briefBlocks
        .map(
          (b) => `<div style="margin-top:14px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">${escapeHtml(b.label)}</div><div style="margin-top:4px;color:#222;line-height:1.55;white-space:pre-wrap">${escapeHtml(b.value)}</div></div>`
        )
        .join("")
    : '<div style="margin-top:14px;color:#888;font-style:italic">(no brief fields submitted)</div>';

  const txLine = order.x402_tx_hash
    ? `<a href="https://solscan.io/tx/${escapeHtml(order.x402_tx_hash)}">${escapeHtml(order.x402_tx_hash.slice(0, 16))}...</a>`
    : order.stripe_session_id
    ? `Stripe session ${escapeHtml(order.stripe_session_id)}`
    : "(payment ref pending)";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="border-radius:8px;padding:20px;background:#fafaf7;border:1px solid #e5e3da">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666">New paid order</div>
        <h1 style="margin:6px 0 0 0;font-size:20px;color:#222">${escapeHtml(order.service)} run · $${dollars}</h1>
        <div style="margin-top:6px;font-size:13px;color:#666">Order ID <code style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e5e3da">${escapeHtml(order.id)}</code></div>

        <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e3da">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">Contact</div>
          <div style="margin-top:4px;color:#222">${escapeHtml(order.contact_name ?? "(no name)")} · <a href="mailto:${escapeHtml(order.contact_email)}">${escapeHtml(order.contact_email)}</a></div>
          ${order.user_id ? `<div style="margin-top:2px;font-size:12px;color:#888">Authenticated user: ${escapeHtml(order.user_id)}</div>` : ""}
        </div>

        <div style="margin-top:14px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">Payment</div>
          <div style="margin-top:4px;color:#222">${escapeHtml(order.payment_method ?? "?")} · ${txLine}</div>
        </div>

        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e5e3da">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">Brief</div>
          ${briefHtml}
        </div>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: REVIEWER_INBOX,
    replyTo: order.contact_email,
    subject,
    html,
  });
  if (error) throw error;
}

/**
 * Sends a confirmation email to the buyer right after payment confirms.
 * Best-effort — the caller logs failures but never blocks delivery on it.
 */
export async function sendDfyOrderConfirmation(order: DfyOrderForNotify): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[DFY confirm] RESEND_API_KEY not set, skipping email");
    return;
  }
  if (process.env.DEMO_MODE === "true") return;

  const resend = new Resend(process.env.RESEND_API_KEY);

  const dollars = (order.amount_cents / 100).toFixed(2);
  const serviceLabel: Record<string, string> = {
    scout: "Scout Run",
    forge: "Forge Run",
    prove: "Prove Run",
  };
  const label = serviceLabel[order.service] ?? `${order.service} run`;
  const turnaround =
    order.service === "scout" ? "24-48 hours" : "48-72 hours";

  const subject = `Order received — ${label} ($${dollars})`;
  const greetingName = order.contact_name?.trim() || "there";
  const txLine = order.x402_tx_hash
    ? `<a href="https://solscan.io/tx/${escapeHtml(order.x402_tx_hash)}" style="color:#3db5a6">${escapeHtml(order.x402_tx_hash.slice(0, 16))}…</a> (Solana)`
    : order.stripe_session_id
    ? `Card via Stripe`
    : "(reference pending)";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
      <div style="border-radius:8px;padding:24px;background:#fafaf7;border:1px solid #e5e3da">
        <h1 style="margin:0;font-size:22px;color:#222;letter-spacing:-0.5px">We've got your order, ${escapeHtml(greetingName)}.</h1>
        <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#444">
          Payment confirmed. Your <strong>${escapeHtml(label)}</strong> is in the queue.
          A human reviewer will start on it within the next business day.
        </p>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e3da">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">Order summary</div>
          <table style="margin-top:8px;width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:4px 0;color:#666">Service</td><td style="padding:4px 0;text-align:right;color:#222">${escapeHtml(label)}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Amount</td><td style="padding:4px 0;text-align:right;color:#222">$${dollars} USD</td></tr>
            <tr><td style="padding:4px 0;color:#666">Payment</td><td style="padding:4px 0;text-align:right;color:#222">${txLine}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Turnaround</td><td style="padding:4px 0;text-align:right;color:#222">${turnaround}</td></tr>
            <tr><td style="padding:4px 0;color:#666">Order ID</td><td style="padding:4px 0;text-align:right;color:#222"><code style="font-size:12px;background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e5e3da">${escapeHtml(order.id)}</code></td></tr>
          </table>
        </div>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e3da">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#888">What happens next</div>
          <ol style="margin:8px 0 0 0;padding-left:20px;font-size:14px;line-height:1.6;color:#333">
            <li><strong>Reviewer reads your brief</strong> — confirms scope, replies if anything looks ambiguous.</li>
            <li><strong>Pipeline runs on top-tier LLM</strong> — Claude Opus 4.7 / GPT-5.5 Pro via our internal CLI, with reviewer checkpoints between rounds.</li>
            <li><strong>Human review pass</strong> — every cited URL opened, every hard stat fact-checked, the final document tightened for clarity.</li>
            <li><strong>Delivery</strong> — PDF + interactive web view land in this inbox within ${turnaround}.</li>
          </ol>
        </div>

        <p style="margin:20px 0 0 0;font-size:13px;color:#666;line-height:1.5">
          Need to add anything to the brief or change scope? Just reply to this email — you're talking to the same human who'll review your report.
        </p>
      </div>
      <div style="margin-top:14px;text-align:center;font-size:11px;color:#999">
        GapSmith · gapsmith@draftlabs.org
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: order.contact_email,
    replyTo: REVIEWER_INBOX,
    subject,
    html,
  });
  if (error) throw error;
}
