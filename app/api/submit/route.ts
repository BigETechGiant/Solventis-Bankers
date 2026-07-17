import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createHmac, timingSafeEqual } from 'node:crypto'

// This route deals with signed tokens, HMAC and Redis — force the Node.js runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Clients are created lazily inside the handler so the route module can be
// evaluated at build time without the secrets being present.
const getResend = () => new Resend(process.env.RESEND_API_KEY)
const getSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// ── Anti-spam configuration ────────────────────────────────────────────────
const MIN_FILL_MS = 3_000 // reject submissions completed in under 3 seconds
const MAX_FILL_MS = 2 * 60 * 60 * 1000 // ...or older than 2 hours

// Secret used to sign the form-render timing token. Falls back to the service
// role key (always present) so the check keeps working even if the dedicated
// var is not set, without ever using a hardcoded key in production.
const TIMING_SECRET =
  process.env.FORM_TIMING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'solventis-dev-timing-secret'

// Rate limiter — the Upstash Redis credentials can arrive under several env var
// names depending on how the project is provisioned. The Vercel–Upstash
// integration commonly injects KV_REST_API_URL / KV_REST_API_TOKEN (or
// REST_API_* variants) rather than the canonical UPSTASH_REDIS_REST_* names, so
// we resolve each from the first candidate that is set.
function resolveEnv(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = process.env[name]
    if (value && value.trim() !== '') return { name, value }
  }
  return null
}

const redisUrl = resolveEnv([
  'UPSTASH_REDIS_REST_URL',
  'KV_REST_API_URL',
  'REST_API_URL',
])
const redisToken = resolveEnv([
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_TOKEN',
  'REST_API_TOKEN',
])

// Build the limiter from the resolved values (fail open if either is missing, so
// the form keeps working even when Redis is not configured).
const ratelimit =
  redisUrl && redisToken
    ? new Ratelimit({
        redis: new Redis({ url: redisUrl.value, token: redisToken.value }),
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'solventis:submit',
        analytics: false,
      })
    : null

// Startup log so the active configuration is confirmable from the Vercel logs.
if (ratelimit) {
  console.log(
    `[submit] Rate limiting ACTIVE — resolved URL from ${redisUrl!.name}, token from ${redisToken!.name}`
  )
} else {
  console.warn('Upstash rate limiting disabled: no Redis credentials found')
  console.log('[submit] Rate limiting DISABLED — form will continue without it (fail open)')
}

// A small, high-signal list of throwaway/disposable email providers. Kept
// intentionally short and lenient — this is a spam filter, not an allow-list.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com',
  'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mailnesia.com', 'mailcatch.com', 'spam4.me',
  'grr.la', 'guerrillamailblock.com', 'mytemp.email', 'tempmailo.com',
  'moakt.com', 'emailondeck.com', 'mohmal.com', 'burnermail.io',
  'tempr.email', 'discard.email', 'mailexpire.com', 'mintemail.com',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// ── Timing token helpers ───────────────────────────────────────────────────
function signTimestamp(ts: number): string {
  const sig = createHmac('sha256', TIMING_SECRET).update(String(ts)).digest('hex')
  return `${ts}.${sig}`
}

function verifyTimingToken(token: unknown): { ok: boolean } {
  if (typeof token !== 'string' || !token.includes('.')) return { ok: false }
  const [tsRaw, sig] = token.split('.')
  const ts = Number(tsRaw)
  if (!Number.isFinite(ts) || !sig) return { ok: false }

  const expected = createHmac('sha256', TIMING_SECRET).update(tsRaw).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false }

  const age = Date.now() - ts
  if (age < MIN_FILL_MS || age > MAX_FILL_MS) return { ok: false }
  return { ok: true }
}

// ── Turnstile verification ─────────────────────────────────────────────────
async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  // If Turnstile is not configured, skip verification (lenient in dev/rollout).
  if (!secret) return true
  if (typeof token !== 'string' || !token) return false

  try {
    const form = new URLSearchParams()
    form.append('secret', secret)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // Fail closed on any error verifying the token.
    return false
  }
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || '127.0.0.1'
}

function countUrls(text: string): number {
  const matches = text.match(/(https?:\/\/|www\.)/gi)
  return matches ? matches.length : 0
}

// A generic "success" that reveals nothing to a bot about why it was dropped.
const fakeSuccess = () => NextResponse.json({ success: true })

// ── GET: issue a signed render token + expose the Turnstile site key ────────
// The form is a client component and we intentionally keep the site key in a
// non-public env var, so it is delivered here at render time instead.
export async function GET() {
  return NextResponse.json(
    {
      ts_token: signTimestamp(Date.now()),
      turnstile_site_key: process.env.TURNSTILE_SITE_KEY ?? '',
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}

// ── POST: run every check before touching Supabase or Resend ───────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      company_name, industry, location, revenue_range, ebitda_range,
      transaction_type, timeline, description, contact_name, contact_title,
      contact_email, contact_phone,
      // anti-spam fields
      company_fax, ts_token, turnstile_token,
    } = body ?? {}

    // 1. HONEYPOT — a real user never sees or fills this. Pretend success.
    if (typeof company_fax === 'string' && company_fax.trim() !== '') {
      return fakeSuccess()
    }

    // 2. RATE LIMIT — 5 submissions per IP per hour.
    if (ratelimit) {
      const ip = getClientIp(req)
      const { success, reset } = await ratelimit.limit(ip)
      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
        return NextResponse.json(
          { error: 'Too many submissions. Please try again later.' },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }
    }

    // 3. TIMING TRAP — too fast (bot) or too stale (replay). Pretend success.
    if (!verifyTimingToken(ts_token).ok) {
      return fakeSuccess()
    }

    // 4. CLOUDFLARE TURNSTILE — fail closed. Return a real error so a genuine
    //    user whose challenge expired can retry.
    const ip = getClientIp(req)
    if (!(await verifyTurnstile(turnstile_token, ip))) {
      return NextResponse.json(
        { error: 'Verification failed. Please complete the challenge and try again.' },
        { status: 403 }
      )
    }

    // 5. VALIDATION — lenient, real errors so legitimate users can correct.
    const name = typeof company_name === 'string' ? company_name.trim() : ''
    const cName = typeof contact_name === 'string' ? contact_name.trim() : ''
    const email = typeof contact_email === 'string' ? contact_email.trim() : ''
    const desc = typeof description === 'string' ? description : ''

    if (!name || name.length > 200) {
      return NextResponse.json({ error: 'Please provide a valid company name.' }, { status: 400 })
    }
    if (!cName || cName.length > 120) {
      return NextResponse.json({ error: 'Please provide a valid contact name.' }, { status: 400 })
    }
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 400 })
    }
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return NextResponse.json(
        { error: 'Please use a permanent business email address.' },
        { status: 400 }
      )
    }
    if (desc.length > 5000) {
      return NextResponse.json({ error: 'Overview is too long.' }, { status: 400 })
    }
    // 3+ links in the body is a strong spam signal — drop silently.
    if (countUrls(desc) >= 3) {
      return fakeSuccess()
    }

    // ── All checks passed: persist and notify ─────────────────────────────
    const resend = getResend()
    const supabase = getSupabase()

    // Persist the lead first, and AWAIT it — a DB failure must be visible and
    // the lead reliably captured before we attempt (best-effort) notifications.
    const { error: dbError } = await supabase
      .from('solventis_deals')
      .insert([{ company_name, industry, location, revenue_range, ebitda_range, transaction_type, timeline, description, contact_name, contact_title, contact_email, contact_phone, status: 'new' }])
    if (dbError) console.error('[submit] Supabase insert FAILED:', dbError)
    else console.log('[submit] Lead saved to Supabase')

    // Resend's SDK RESOLVES with { data, error } instead of throwing on API
    // failures (unverified domain, invalid key, sandbox recipient limits, …),
    // so we MUST inspect each result — otherwise a silently-rejected send still
    // looks like success and no email ever arrives.
    const [adminRes, confirmRes] = await Promise.all([
      resend.emails.send({
        from: process.env.FROM_EMAIL ?? 'info@solventisbaa.com',
        to: 'info@solventisbaa.com',
        cc: ['Ethan.W@Delcapmanagement.com'],
        subject: `New Deal Submission: ${company_name} — ${transaction_type}`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#F2ECE2"><div style="background:#1C1610;padding:24px 32px;margin-bottom:32px"><h2 style="color:#C8A040;margin:0;font-size:20px">New Deal Submission</h2><p style="color:#C8BCA8;margin:6px 0 0;font-size:12px;letter-spacing:0.15em;text-transform:uppercase">Solventis Bankers & Advisors</p></div><table style="width:100%;border-collapse:collapse">${[['Company',company_name],['Transaction',transaction_type],['Industry',industry||'—'],['Location',location||'—'],['Revenue',revenue_range||'—'],['EBITDA',ebitda_range||'—'],['Timeline',timeline||'—'],['Contact',`${contact_name}${contact_title?', '+contact_title:''}`],['Email',contact_email],['Phone',contact_phone||'—']].map(([k,v])=>`<tr style="border-bottom:1px solid rgba(100,70,18,0.15)"><td style="padding:12px 0;color:#7A5010;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;width:120px">${k}</td><td style="padding:12px 0;color:#1C1610;font-size:16px">${v}</td></tr>`).join('')}</table>${description?`<div style="margin-top:24px;padding:20px;background:#EAE3D6;border-left:3px solid #7A5010"><div style="color:#7A5010;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px">Overview</div><div style="color:#2E2418;font-size:16px;line-height:1.7">${description}</div></div>`:''}</div>`
      }),
      resend.emails.send({
        from: process.env.FROM_EMAIL ?? 'info@solventisbaa.com',
        to: contact_email,
        replyTo: process.env.NOTIFICATION_EMAIL,
        subject: 'Your submission has been received — Solventis Bankers & Advisors',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#F2ECE2"><div style="background:#1C1610;padding:24px 32px;margin-bottom:32px"><h2 style="color:#C8A040;margin:0;font-size:18px">Solventis Bankers & Advisors</h2><p style="color:#C8BCA8;margin:6px 0 0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase">Investment Banking Advisory</p></div><p style="color:#1C1610;font-size:18px;line-height:1.75;margin-bottom:20px">Dear ${contact_name},</p><p style="color:#695C4C;font-size:17px;line-height:1.85;margin-bottom:20px">Thank you for reaching out to Solventis Bankers & Advisors. We have received your submission regarding <strong style="color:#1C1610">${company_name}</strong> and will review it personally.</p><p style="color:#695C4C;font-size:17px;line-height:1.85;margin-bottom:32px">If your transaction is a fit for our practice, we will reach out within two business days to schedule a confidential introductory conversation.</p><div style="border-top:1px solid rgba(100,70,18,0.2);padding-top:24px"><p style="color:#1C1610;font-size:15px;line-height:1.6;margin:0"><strong>Solventis Bankers & Advisors</strong><br/>801 Travis St, Suite 800 · Houston, TX 77002<br/><a href="tel:7135648192" style="color:#7A5010">713-564-8192</a> · <a href="https://solventisbaa.com" style="color:#7A5010">solventisbaa.com</a></p><p style="color:#8A7B6C;font-size:11px;margin-top:16px">Investment banking services provided through a registered representative of Finalis Securities LLC, Member FINRA/SIPC.</p></div></div>`
      })
    ])

    if (adminRes.error) console.error('[submit] Admin notification email FAILED:', adminRes.error)
    else console.log('[submit] Admin notification email sent, id:', adminRes.data?.id)
    if (confirmRes.error) console.error('[submit] Applicant confirmation email FAILED:', confirmRes.error)
    else console.log('[submit] Confirmation email sent, id:', confirmRes.data?.id)

    // Only report success if the lead was captured through at least one reliable
    // channel (team notification or the database). If both failed, the lead is
    // lost — tell the user so they can retry instead of silently dropping it.
    if (adminRes.error && dbError) {
      return NextResponse.json(
        { error: 'We could not process your submission. Please try again, or email info@solventisbaa.com directly.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Submit error:', error)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}
