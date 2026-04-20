import "server-only";
import { Resend } from "resend";

/**
 * Thin Resend wrapper. Keeps the rest of the app ignorant of the SDK and lets
 * us no-op in local dev when RESEND_API_KEY isn't set (or during CI builds).
 *
 * Every email uses a CME-branded HTML template — dark-green header bar +
 * yellow accent + Raleway fallback font — so the notifications match the
 * portal's design system.
 */

const FROM = "CME Client Portal <notifications@cme-client-portal.vercel.app>";

export type SendArgs = {
  to: string | string[];
  subject: string;
  heading: string;
  intro: string;
  bodyHtml?: string;
  cta?: { label: string; url: string };
  footer?: string;
};

let cachedClient: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

export async function sendCmeEmail(args: SendArgs): Promise<boolean> {
  const c = client();
  if (!c) {
    console.info(
      "[resend] RESEND_API_KEY missing — skipping email",
      args.subject,
    );
    return false;
  }
  try {
    const html = renderTemplate(args);
    const { error } = await c.emails.send({
      from: FROM,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html,
    });
    if (error) {
      console.warn("[resend] send failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[resend] threw", err);
    return false;
  }
}

function renderTemplate(args: SendArgs): string {
  const cta = args.cta
    ? `<p style="margin:28px 0;"><a href="${escape(
        args.cta.url,
      )}" style="background:#FFCB0E;color:#000;font-family:Oswald,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;padding:12px 24px;border-radius:4px;display:inline-block;">${escape(
        args.cta.label,
      )}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escape(args.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Raleway,Helvetica,Arial,sans-serif;color:#1f1f1f;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e4e2;">
        <tr>
          <td style="background:#25532E;padding:20px 28px;color:#fff;">
            <div style="font-family:Oswald,Impact,sans-serif;letter-spacing:.22em;font-size:12px;color:#FFCB0E;">CME</div>
            <div style="font-family:Oswald,Impact,sans-serif;letter-spacing:.12em;font-size:20px;margin-top:4px;">${escape(args.heading)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px;">
            <p style="margin:0 0 12px;font-size:14px;line-height:1.55;">${escape(args.intro)}</p>
            ${args.bodyHtml ?? ""}
            ${cta}
            ${args.footer ? `<p style="margin:28px 0 0;color:#666;font-size:12px;line-height:1.5;">${escape(args.footer)}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="background:#fafaf9;padding:16px 28px;font-size:11px;color:#888;border-top:1px solid #eee;">
            Cole Management &amp; Engineering · CME Client Portal
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
