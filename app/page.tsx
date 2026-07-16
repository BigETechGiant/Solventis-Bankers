'use client'

import { useState, useEffect, useRef, FormEvent } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

type FormState = {
  company_name: string
  industry: string
  location: string
  revenue_range: string
  ebitda_range: string
  transaction_type: string
  timeline: string
  description: string
  contact_name: string
  contact_title: string
  contact_email: string
  contact_phone: string
}

const initialForm: FormState = {
  company_name: '',
  industry: '',
  location: '',
  revenue_range: '',
  ebitda_range: '',
  transaction_type: '',
  timeline: '',
  description: '',
  contact_name: '',
  contact_title: '',
  contact_email: '',
  contact_phone: '',
}

export default function Home() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDisclosure, setShowDisclosure] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const revealRefs = useRef<HTMLElement[]>([])

  // ── Anti-spam state ──────────────────────────────────────────────────────
  const [tsToken, setTsToken] = useState('') // signed form-render timing token
  const [siteKey, setSiteKey] = useState('') // Cloudflare Turnstile site key
  const [turnstileToken, setTurnstileToken] = useState('')
  const honeypotRef = useRef<HTMLInputElement>(null)
  const turnstileElRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Fetch a fresh signed timing token + the Turnstile site key on mount.
  const loadToken = () =>
    fetch('/api/submit')
      .then((r) => r.json())
      .then((d) => {
        setTsToken(d.ts_token || '')
        setSiteKey(d.turnstile_site_key || '')
      })
      .catch(() => {})

  useEffect(() => {
    loadToken()
  }, [])

  // Load the Turnstile script and explicitly render the widget once we have a site key.
  useEffect(() => {
    if (!siteKey) return
    const renderWidget = () => {
      if (!window.turnstile || !turnstileElRef.current || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(turnstileElRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (t: string) => setTurnstileToken(t),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      })
    }
    if (window.turnstile) {
      renderWidget()
      return
    }
    const id = 'cf-turnstile-script'
    let script = document.getElementById(id) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = id
      script.src = 'https://challenges.cloudflare.com/turnstile/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', renderWidget)
    return () => script?.removeEventListener('load', renderWidget)
  }, [siteKey])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.rev')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const resetTurnstile = () => {
    setTurnstileToken('')
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // If Turnstile is active, require the challenge to be completed first.
    if (siteKey && !turnstileToken) {
      alert('Please complete the verification challenge before submitting.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          company_fax: honeypotRef.current?.value ?? '',
          ts_token: tsToken,
          turnstile_token: turnstileToken,
        }),
      })
      if (!res.ok) {
        let message = 'There was a problem submitting your inquiry. Please try again or email us directly.'
        if (res.status === 429) {
          message = 'You have submitted several inquiries recently. Please try again later or email us directly.'
        } else {
          const data = await res.json().catch(() => null)
          if (data?.error) message = data.error
        }
        resetTurnstile()
        throw new Error(message)
      }
      setShowSuccess(true)
      setForm(initialForm)
      resetTurnstile()
      // Issue a fresh timing token for any subsequent submission.
      loadToken()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'There was a problem submitting your inquiry. Please try again or email us directly.')
    } finally {
      setSubmitting(false)
    }
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      {/* NAV */}
      <nav id="nav" className={scrolled ? 'scrolled' : ''}>
        <a href="#hero" className="logo" onClick={closeMenu}>
          <img src="/logo.png" alt="Solventis Bankers & Advisors" className="logo-coin" />
        </a>
        <div className="nav-right">
          <ul className={`nav-links ${menuOpen ? 'open' : ''}`}>
            <li><a href="#about" onClick={closeMenu}>Firm</a></li>
            <li><a href="#services" onClick={closeMenu}>Services</a></li>
            <li><a href="#process" onClick={closeMenu}>Process</a></li>
            <li><a href="#diff" onClick={closeMenu}>Why Solventis</a></li>
            <li><a href="#submit" className="nav-btn" onClick={closeMenu}>Submit a Deal</a></li>
          </ul>
          <button className="ham" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero">
        <div className="hero-texture"></div>
        <div className="hero-line-l"></div>
        <div className="hero-line-r"></div>
        <div className="hero-inner">
          <div className="hero-tag">Investment Banking · Advisory</div>
          <h1 className="hero-h1">
            Trusted Advisory<br />for Transactions <em>That Define</em>
          </h1>
          <div className="hero-rule"></div>
          <p className="hero-p">
            Solventis Bankers &amp; Advisors provides discreet, senior-led counsel to founders,
            owners, and boards navigating the most consequential moments in their company&apos;s history.
          </p>
          <div className="hero-btns">
            <a href="#submit" className="btn-dark">Submit a Transaction</a>
            <a href="#services" className="btn-outline-dark">Explore Practice</a>
          </div>
        </div>
        <div className="hero-scroll">
          <span>Scroll</span>
          <div className="scroll-tick"></div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section id="strip">
        <div className="strip-inner">
          <div className="strip-stat">
            <div className="strip-val">$5M+</div>
            <div className="strip-label">Minimum Engagement</div>
          </div>
          <div className="strip-stat">
            <div className="strip-val">National</div>
            <div className="strip-label">Reach &amp; Network</div>
          </div>
          <div className="strip-stat">
            <div className="strip-val">S79 · S63</div>
            <div className="strip-label">Licensed Professionals</div>
          </div>
          <div className="strip-stat">
            <div className="strip-val">Confidential</div>
            <div className="strip-label">Every Engagement</div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about">
        <div className="section-center">
          <div className="about-grid">
            <div className="about-left rev">
              <div className="eyebrow eyebrow-dark">The Firm</div>
              <h2 className="headline hd">
                A boutique practice built on <em>conviction</em>.
              </h2>
              <div className="about-metrics">
                <div className="about-metric">
                  <div className="about-metric-val">M&amp;A</div>
                  <div className="about-metric-label">Sell &amp; Buy-Side Advisory</div>
                </div>
                <div className="about-metric">
                  <div className="about-metric-val">Capital</div>
                  <div className="about-metric-label">Debt &amp; Equity Placement</div>
                </div>
                <div className="about-metric">
                  <div className="about-metric-val">IPO</div>
                  <div className="about-metric-label">Public Offering Advisory</div>
                </div>
                <div className="about-metric">
                  <div className="about-metric-val">Restructuring</div>
                  <div className="about-metric-label">Financial &amp; Operational</div>
                </div>
              </div>
            </div>
            <div className="about-right rev">
              <p>
                Solventis Bankers &amp; Advisors is a boutique investment banking firm advising
                founder-owned and middle-market companies on the transactions that shape their
                future. We bring the discretion of a private practice and the discipline of a
                bulge-bracket bank to every engagement.
              </p>
              <p>
                Our work is deliberately narrow. We accept a limited number of mandates each year
                so that <strong>each client receives the unbroken attention</strong> of senior
                bankers from the first conversation to the closing wire. There are no associates
                running the file in the background.
              </p>
              <p>
                We advise across <strong>mergers and acquisitions, capital raising, initial public
                offering preparation, and financial restructuring</strong>—always with a single
                obligation: to represent our client&apos;s interests with rigor, candor, and
                absolute confidentiality.
              </p>
              <p>
                Investment banking services are provided through a registered representative of
                <strong> Finalis Securities LLC, Member FINRA/SIPC</strong>—affording our clients
                the regulatory framework of an established broker-dealer alongside the senior
                counsel of an independent practice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services">
        <div className="section-center">
          <div className="svc-header">
            <div className="svc-header-l rev">
              <div className="eyebrow eyebrow-light">Practice Areas</div>
              <h2 className="headline hl">
                Four disciplines.<br /><em>One standard of care.</em>
              </h2>
            </div>
            <div className="svc-header-r rev">
              <p>
                Each engagement is led by a senior banker and supported by a small, dedicated
                team. We do not staff with leverage. We staff with experience.
              </p>
            </div>
          </div>

          <div className="svc-grid rev">
            <div className="svc-card">
              <div className="svc-n">01 — Practice</div>
              <h3 className="svc-title">Mergers &amp; Acquisitions</h3>
              <p className="svc-body">
                Sell-side and buy-side advisory for founders, owners, and boards considering a
                full sale, partial recapitalization, strategic combination, or programmatic
                acquisition.
              </p>
              <ul className="svc-list">
                <li>Full and partial sale processes</li>
                <li>Strategic and financial buyer outreach</li>
                <li>Valuation &amp; positioning</li>
                <li>Negotiation &amp; deal structuring</li>
              </ul>
            </div>

            <div className="svc-card">
              <div className="svc-n">02 — Practice</div>
              <h3 className="svc-title">Capital Raising</h3>
              <p className="svc-body">
                Senior debt, mezzanine, growth equity, and minority recapitalization placements
                with institutional sources aligned to long-term shareholder value.
              </p>
              <ul className="svc-list">
                <li>Growth &amp; minority equity</li>
                <li>Senior &amp; subordinated debt</li>
                <li>Recapitalizations &amp; refinancings</li>
                <li>Project &amp; structured finance</li>
              </ul>
            </div>

            <div className="svc-card">
              <div className="svc-n">03 — Practice</div>
              <h3 className="svc-title">IPO Advisory</h3>
              <p className="svc-body">
                Strategic guidance from initial readiness assessment through underwriter
                selection, S-1 preparation, and public market debut—positioning the company for
                durable post-listing performance.
              </p>
              <ul className="svc-list">
                <li>IPO readiness &amp; positioning</li>
                <li>Underwriter selection</li>
                <li>S-1 narrative &amp; financial preparation</li>
                <li>Investor targeting &amp; aftermarket strategy</li>
              </ul>
            </div>

            <div className="svc-card">
              <div className="svc-n">04 — Practice</div>
              <h3 className="svc-title">Financial Restructuring</h3>
              <p className="svc-body">
                Confidential counsel to companies, boards, and creditors navigating
                over-levered balance sheets, covenant pressure, liquidity constraints, or
                Chapter 11 considerations.
              </p>
              <ul className="svc-list">
                <li>Balance sheet restructuring</li>
                <li>Out-of-court workouts</li>
                <li>Section 363 sales</li>
                <li>Creditor &amp; lender negotiations</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section id="process">
        <div className="section-center">
          <div className="rev" style={{ marginBottom: '8px' }}>
            <div className="eyebrow eyebrow-dark">Engagement</div>
            <h2 className="headline hd">
              A disciplined <em>process</em>, beginning to end.
            </h2>
          </div>

          <div className="process-steps rev">
            <div className="pstep">
              <div className="pstep-dot"><span className="pstep-n">01</span></div>
              <div className="pstep-title">Confidential Introduction</div>
              <div className="pstep-body">
                A private conversation with a senior banker to understand your objectives,
                constraints, and timing.
              </div>
            </div>
            <div className="pstep">
              <div className="pstep-dot"><span className="pstep-n">02</span></div>
              <div className="pstep-title">Strategic Assessment</div>
              <div className="pstep-body">
                Diagnostic review of valuation, positioning, and the realistic universe of
                outcomes for your transaction.
              </div>
            </div>
            <div className="pstep">
              <div className="pstep-dot"><span className="pstep-n">03</span></div>
              <div className="pstep-title">Mandate &amp; Preparation</div>
              <div className="pstep-body">
                Engagement letter, materials preparation, and a written go-to-market plan
                tailored to your situation.
              </div>
            </div>
            <div className="pstep">
              <div className="pstep-dot"><span className="pstep-n">04</span></div>
              <div className="pstep-title">Execution</div>
              <div className="pstep-body">
                Disciplined outreach, diligence management, and negotiation—led by the same
                senior banker throughout.
              </div>
            </div>
            <div className="pstep">
              <div className="pstep-dot"><span className="pstep-n">05</span></div>
              <div className="pstep-title">Close &amp; Transition</div>
              <div className="pstep-body">
                Documentation, signing, funding, and a deliberate hand-off to the next chapter
                for you and your company.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section id="diff">
        <div className="section-center">
          <div className="rev">
            <div className="eyebrow eyebrow-light">Why Solventis</div>
            <h2 className="headline hl">
              The standard our clients <em>expect</em>.
            </h2>
          </div>

          <div className="diff-grid rev">
            <div className="diff-card">
              <div className="diff-num">01</div>
              <h3 className="diff-title">Senior Attention, End to End</h3>
              <p className="diff-body">
                The banker you meet on day one is the banker who runs your process and sits
                across the table at closing.
              </p>
            </div>
            <div className="diff-card">
              <div className="diff-num">02</div>
              <h3 className="diff-title">Absolute Confidentiality</h3>
              <p className="diff-body">
                Inquiry, mandate, and execution are handled with the discretion appropriate to
                a private financial matter.
              </p>
            </div>
            <div className="diff-card">
              <div className="diff-num">03</div>
              <h3 className="diff-title">Aligned Incentives</h3>
              <p className="diff-body">
                Compensation tied to outcomes, not transaction velocity. We only succeed when
                you do.
              </p>
            </div>
            <div className="diff-card">
              <div className="diff-num">04</div>
              <h3 className="diff-title">Regulatory Framework</h3>
              <p className="diff-body">
                Services delivered through Finalis Securities LLC, FINRA/SIPC—an established
                broker-dealer infrastructure behind every engagement.
              </p>
            </div>
            <div className="diff-card">
              <div className="diff-num">05</div>
              <h3 className="diff-title">Limited Engagements</h3>
              <p className="diff-body">
                A deliberately small mandate book ensures the focus and bandwidth that complex
                transactions require.
              </p>
            </div>
            <div className="diff-card">
              <div className="diff-num">06</div>
              <h3 className="diff-title">Candor Over Comfort</h3>
              <p className="diff-body">
                We tell clients what we believe to be true, even when it is not what they
                hoped to hear. Honest counsel is the only counsel worth paying for.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SUBMIT A DEAL */}
      <section id="submit">
        <div className="section-center">
          <div className="submit-grid">
            <div className="submit-l rev">
              <div className="eyebrow eyebrow-dark">Inquiries</div>
              <h2 className="headline hd">
                Submit a transaction <em>for review</em>.
              </h2>
              <div className="hr-gold"></div>
              <p>
                Share the outline of your situation below. A senior banker will personally
                review your inquiry and respond within two business days. All communications
                are held in strict confidence.
              </p>
              <div className="criteria-list">
                <div className="crit">
                  <div className="crit-k">Revenue</div>
                  <div className="crit-v">Companies with $10M – $500M in annual revenue</div>
                </div>
                <div className="crit">
                  <div className="crit-k">EBITDA</div>
                  <div className="crit-v">$2M+ in trailing EBITDA, or clear path to profitability</div>
                </div>
                <div className="crit">
                  <div className="crit-k">Geography</div>
                  <div className="crit-v">United States &amp; select cross-border situations</div>
                </div>
                <div className="crit">
                  <div className="crit-k">Sectors</div>
                  <div className="crit-v">Industrials, business services, healthcare, technology, energy &amp; infrastructure</div>
                </div>
                <div className="crit">
                  <div className="crit-k">Mandate</div>
                  <div className="crit-v">Sell-side, buy-side, capital raise, IPO, or restructuring</div>
                </div>
              </div>
            </div>

            <div className="submit-r rev">
              <form className="form-box" onSubmit={handleSubmit}>
                {/* Honeypot — hidden from real users, catches bots. Not display:none. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: 'auto',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden',
                    opacity: 0,
                  }}
                >
                  <label htmlFor="company_fax">Company Fax (leave blank)</label>
                  <input
                    ref={honeypotRef}
                    type="text"
                    id="company_fax"
                    name="company_fax"
                    tabIndex={-1}
                    autoComplete="off"
                    defaultValue=""
                  />
                </div>

                <div className="fsec">Company</div>
                <div className="fg">
                  <label className="fl">Company Name *</label>
                  <input className="fi" name="company_name" value={form.company_name} onChange={handleChange} required placeholder="Legal entity name" />
                </div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Industry</label>
                    <input className="fi" name="industry" value={form.industry} onChange={handleChange} placeholder="e.g. Industrials" />
                  </div>
                  <div className="fg">
                    <label className="fl">Location</label>
                    <input className="fi" name="location" value={form.location} onChange={handleChange} placeholder="City, State" />
                  </div>
                </div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Revenue Range</label>
                    <select className="fs" name="revenue_range" value={form.revenue_range} onChange={handleChange}>
                      <option value="">Select</option>
                      <option value="Under $10M">Under $10M</option>
                      <option value="$10M – $25M">$10M – $25M</option>
                      <option value="$25M – $50M">$25M – $50M</option>
                      <option value="$50M – $100M">$50M – $100M</option>
                      <option value="$100M – $250M">$100M – $250M</option>
                      <option value="$250M – $500M">$250M – $500M</option>
                      <option value="$500M+">$500M+</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">EBITDA Range</label>
                    <select className="fs" name="ebitda_range" value={form.ebitda_range} onChange={handleChange}>
                      <option value="">Select</option>
                      <option value="Under $2M">Under $2M</option>
                      <option value="$2M – $5M">$2M – $5M</option>
                      <option value="$5M – $10M">$5M – $10M</option>
                      <option value="$10M – $25M">$10M – $25M</option>
                      <option value="$25M – $50M">$25M – $50M</option>
                      <option value="$50M+">$50M+</option>
                    </select>
                  </div>
                </div>

                <div className="fsec">Transaction</div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Transaction Type *</label>
                    <select className="fs" name="transaction_type" value={form.transaction_type} onChange={handleChange} required>
                      <option value="">Select</option>
                      <option value="Sell-Side M&A">Sell-Side M&amp;A</option>
                      <option value="Buy-Side M&A">Buy-Side M&amp;A</option>
                      <option value="Capital Raise — Equity">Capital Raise — Equity</option>
                      <option value="Capital Raise — Debt">Capital Raise — Debt</option>
                      <option value="Recapitalization">Recapitalization</option>
                      <option value="IPO Advisory">IPO Advisory</option>
                      <option value="Restructuring">Restructuring</option>
                      <option value="Strategic Advisory">Strategic Advisory</option>
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Timeline</label>
                    <select className="fs" name="timeline" value={form.timeline} onChange={handleChange}>
                      <option value="">Select</option>
                      <option value="Immediate (0–3 months)">Immediate (0–3 months)</option>
                      <option value="Near-term (3–6 months)">Near-term (3–6 months)</option>
                      <option value="6–12 months">6–12 months</option>
                      <option value="12+ months">12+ months</option>
                      <option value="Exploratory">Exploratory</option>
                    </select>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Brief Overview</label>
                  <textarea className="fa" name="description" value={form.description} onChange={handleChange} placeholder="A few sentences on the situation, objectives, and any timing considerations." />
                </div>

                <div className="fsec">Contact</div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Full Name *</label>
                    <input className="fi" name="contact_name" value={form.contact_name} onChange={handleChange} required />
                  </div>
                  <div className="fg">
                    <label className="fl">Title</label>
                    <input className="fi" name="contact_title" value={form.contact_title} onChange={handleChange} placeholder="e.g. CEO" />
                  </div>
                </div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Email *</label>
                    <input className="fi" type="email" name="contact_email" value={form.contact_email} onChange={handleChange} required />
                  </div>
                  <div className="fg">
                    <label className="fl">Phone</label>
                    <input className="fi" type="tel" name="contact_phone" value={form.contact_phone} onChange={handleChange} />
                  </div>
                </div>

                {siteKey && (
                  <div
                    ref={turnstileElRef}
                    className="cf-turnstile"
                    style={{ marginBottom: '18px' }}
                  />
                )}

                <button type="submit" className="fsub" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit for Confidential Review'}
                </button>
                <div className="fnote">
                  Submissions are reviewed personally by a senior banker. By submitting, you
                  acknowledge our <a href="#" onClick={(e) => { e.preventDefault(); setShowDisclosure(true) }} style={{ color: 'var(--gold)' }}>regulatory disclosures</a>.
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section id="closing">
        <div className="section-center" style={{ position: 'relative', zIndex: 1 }}>
          <div className="rev">
            <div className="eyebrow eyebrow-light" style={{ justifyContent: 'center' }}>Direct Contact</div>
            <h2 className="headline hl" style={{ marginBottom: '20px' }}>
              When the matter is <em>private</em>, call directly.
            </h2>
            <div className="hr-gold-light" style={{ margin: '22px auto' }}></div>
            <p className="closing-p">
              For sensitive inquiries, a brief conversation is often the most efficient
              starting point. A senior banker is reachable at the contacts below.
            </p>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="tel:7135648192" className="btn-gold">713-564-8192</a>
              <a href="mailto:info@solventisbaa.com" className="btn-pale-out">info@solventisbaa.com</a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <div className="footer-top">
            <div>
              <div className="footer-brand-logo">
                <img src="/logo.png" alt="Solventis" className="footer-coin" />
              </div>
              <p className="footer-about">
                Solventis Bankers &amp; Advisors is a boutique investment banking firm serving
                founders, owners, and boards on the transactions that define their company&apos;s next chapter.
              </p>
              <div className="footer-reg">
                Securities offered through Finalis Securities LLC, Member FINRA/SIPC.
              </div>
            </div>
            <div>
              <div className="ft">Services</div>
              <ul className="fl2">
                <li><a href="#services">Mergers &amp; Acquisitions</a></li>
                <li><a href="#services">Capital Raising</a></li>
                <li><a href="#services">IPO Advisory</a></li>
                <li><a href="#services">Restructuring</a></li>
              </ul>
            </div>
            <div>
              <div className="ft">Firm</div>
              <ul className="fl2">
                <li><a href="#about">About</a></li>
                <li><a href="#process">Process</a></li>
                <li><a href="#diff">Why Solventis</a></li>
                <li><a href="#submit">Submit a Deal</a></li>
              </ul>
            </div>
            <div>
              <div className="ft">Contact</div>
              <div className="fi2">801 Travis St, Suite 800<br />Houston, TX 77002</div>
              <div className="fi2"><a href="tel:7135648192">713-564-8192</a></div>
              <div className="fi2"><a href="mailto:info@solventisbaa.com">info@solventisbaa.com</a></div>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-legal">
              © {new Date().getFullYear()} Solventis Bankers &amp; Advisors. All rights reserved.
              Investment banking services provided through a registered representative of Finalis
              Securities LLC, Member FINRA/SIPC. Solventis Bankers &amp; Advisors is not a
              broker-dealer. This website is for informational purposes only and does not
              constitute an offer to sell or a solicitation of an offer to buy any security.
            </div>
            <div className="footer-finra">
              Member <a href="https://www.finra.org" target="_blank" rel="noopener noreferrer">FINRA</a> / <a href="https://www.sipc.org" target="_blank" rel="noopener noreferrer">SIPC</a>
            </div>
          </div>
        </div>
      </footer>

      {/* DISCLOSURE MODAL */}
      <div className={`overlay ${showDisclosure ? 'on' : ''}`} onClick={() => setShowDisclosure(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon">§</div>
          <div className="modal-title">Regulatory Disclosures</div>
          <div className="modal-body">
            Investment banking services are provided by registered representatives of Finalis
            Securities LLC, Member FINRA/SIPC. Solventis Bankers &amp; Advisors is a trade name
            and is not itself a broker-dealer. All securities transactions are conducted
            through Finalis Securities LLC. Information submitted is held in confidence and
            used solely to evaluate engagement suitability.
          </div>
          <button className="modal-btn" onClick={() => setShowDisclosure(false)}>Acknowledged</button>
        </div>
      </div>

      {/* SUCCESS MODAL */}
      <div className={`overlay ${showSuccess ? 'on' : ''}`} onClick={() => setShowSuccess(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-icon">✓</div>
          <div className="modal-title">Submission Received</div>
          <div className="modal-body">
            Thank you. A senior banker will personally review your inquiry and respond within
            two business days. A confirmation has been sent to the email address you provided.
          </div>
          <button className="modal-btn" onClick={() => setShowSuccess(false)}>Close</button>
        </div>
      </div>
    </>
  )
}
