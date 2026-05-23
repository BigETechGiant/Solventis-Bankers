import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company_name, industry, location, revenue_range, ebitda_range, transaction_type, timeline, description, contact_name, contact_title, contact_email, contact_phone } = body

    supabase
      .from('solventis_deals')
      .insert([{ company_name, industry, location, revenue_range, ebitda_range, transaction_type, timeline, description, contact_name, contact_title, contact_email, contact_phone, status: 'new' }])
      .select().single().then(() => {}, console.error)

    await Promise.all([
      resend.emails.send({
        from: process.env.FROM_EMAIL ?? 'info@solventisbaa.com',
        to: process.env.NOTIFICATION_EMAIL ?? 'Ethan.W@Delcapmanagement.com',
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Submit error:', error)
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 })
  }
}
