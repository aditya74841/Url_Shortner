'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUrlStore } from '../store/useUrlStore';
import { ArrowRight, Copy, Check, AlertCircle, Loader2, CheckCircle2, XCircle, HelpCircle, Link2, BarChart3, ExternalLink, MousePointerClick, RefreshCw, X, Globe, Monitor, Smartphone, Compass, Clock, BarChart2, Zap, Shield, Cpu } from 'lucide-react';
import { extractHostname, checkDomainResolvable, debounce } from '../lib/urlValidator';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// ─── Tokens ────────────────────────────────────────────────────────────────
const C = {
  bg:       '#F1F5F9',
  surface:  '#FFFFFF',
  raised:   '#F8FAFC',
  border:   '#E2E8F0',
  borderMd: '#CBD5E1',
  indigo:   '#6366F1',
  indigoDk: '#4F46E5',
  indigoLt: '#EEF2FF',
  indigoBd: '#C7D2FE',
  text:     '#0F172A',
  muted:    '#64748B',
  subtle:   '#94A3B8',
  green:    '#16a34a',
  greenLt:  '#F0FDF4',
  greenBd:  '#BBF7D0',
  red:      '#DC2626',
  redLt:    '#FFF5F5',
  redBd:    '#FECACA',
  amber:    '#D97706',
  amberLt:  '#FFFBEB',
  amberBd:  '#FDE68A',
};

// ─── Shared styles ──────────────────────────────────────────────────────────
const pill = (bg, bd, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', borderRadius: 99,
  background: bg, border: `1px solid ${bd}`,
  fontSize: 12, fontWeight: 500, color,
});

const card = (extra = {}) => ({
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 16, padding: 24,
  boxShadow: '0 1px 4px rgba(15,23,42,0.05)', ...extra,
});

const btnPrimary = (disabled) => ({
  height: 44, padding: '0 20px', borderRadius: 10,
  background: disabled ? C.indigo : C.indigoDk,
  color: '#fff', fontWeight: 600, fontSize: 14, border: 'none',
  display: 'flex', alignItems: 'center', gap: 8,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  transition: 'background 0.15s', flexShrink: 0,
  boxShadow: disabled ? 'none' : '0 2px 8px rgba(79,70,229,0.3)',
});

const btnGhost = (extra = {}) => ({
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.raised,
  fontSize: 12, fontWeight: 500, color: C.muted,
  cursor: 'pointer', transition: 'all 0.12s', ...extra,
});

// ─── Validation badge config ────────────────────────────────────────────────
const BADGE = {
  checking: { icon: Loader2,     color: C.muted,  bg: C.raised,   bd: C.border,   spin: true,  text: 'Checking…'          },
  valid:    { icon: CheckCircle2, color: C.green,  bg: C.greenLt,  bd: C.greenBd,  spin: false, text: 'Domain resolves'    },
  invalid:  { icon: XCircle,      color: C.red,    bg: C.redLt,    bd: C.redBd,    spin: false, text: 'Domain not found'   },
  unknown:  { icon: HelpCircle,   color: C.amber,  bg: C.amberLt,  bd: C.amberBd,  spin: false, text: 'Could not verify'   },
};

// ─── Sub-components ─────────────────────────────────────────────────────────
function StatCard({ label, value }) {
  return (
    <div style={{ padding: '14px 16px', background: C.raised, border: `1px solid ${C.border}`, borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.subtle, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.5px' }}>{value ?? '—'}</div>
    </div>
  );
}

function BreakdownRow({ label, value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ padding: '5px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
        <span style={{ fontSize: 12, color: C.muted, fontFamily: 'ui-monospace,monospace' }}>{value} · {pct}%</span>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${C.indigo}, ${C.indigoDk})`, borderRadius: 99, transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, items = [], keyField, clickField, total }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon size={13} color={C.indigo} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.subtle }}>{title}</span>
      </div>
      {items.length === 0
        ? <p style={{ fontSize: 12, color: C.subtle }}>No data yet</p>
        : items.map(item => <BreakdownRow key={item[keyField]} label={item[keyField]} value={item[clickField]} total={total} />)
      }
    </div>
  );
}

// ─── Analytics Modal ────────────────────────────────────────────────────────
function AnalyticsModal() {
  const { isAnalyticsOpen, closeAnalytics, analyticsData, analyticsLoading } = useUrlStore();
  if (!isAnalyticsOpen) return null;
  const total = analyticsData?.totalClicks ?? 0;
  const d = analyticsData?.breakdown ?? {};

  return (
    <div onClick={closeAnalytics} className="animate-fade-up" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="animate-slide-in" style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: '0 20px 60px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${C.border}`, background: C.raised, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.indigo}, ${C.indigoDk})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
              <BarChart2 size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Analytics</div>
              {analyticsData?.short && <div style={{ fontSize: 12, color: C.muted, fontFamily: 'ui-monospace,monospace' }}>/{analyticsData.short}</div>}
            </div>
          </div>
          <button onClick={closeAnalytics} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', color: C.muted }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {analyticsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 0', gap: 14, color: C.muted }}>
              <Loader2 size={28} className="animate-spin" color={C.indigo} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Running aggregation pipeline…</span>
            </div>
          ) : analyticsData ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <StatCard label="Total Clicks" value={total} />
                <StatCard label="Top Browser" value={d.browsers?.[0]?.browser} />
                <StatCard label="Top Device" value={d.devices?.[0]?.device} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
                <Section icon={Globe}      title="Browsers"  items={d.browsers}  keyField="browser"  clickField="clicks" total={total} />
                <Section icon={Monitor}    title="OS"        items={d.os}        keyField="os"       clickField="clicks" total={total} />
                <Section icon={Smartphone} title="Devices"   items={d.devices}   keyField="device"   clickField="clicks" total={total} />
                <Section icon={Compass}    title="Referrers" items={d.referrers} keyField="referrer" clickField="clicks" total={total} />
              </div>
              {analyticsData.recentClicks?.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Clock size={13} color={C.indigo} />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.subtle }}>Recent Activity</span>
                  </div>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    {analyticsData.recentClicks.slice(0, 8).map((c, i) => (
                      <div key={c.eventId || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none', fontSize: 12, background: C.surface }}>
                        <span style={{ fontWeight: 500, color: C.text }}>{c.browser} / {c.os} <span style={{ color: C.subtle, fontWeight: 400 }}>({c.device})</span></span>
                        <span style={{ color: C.subtle, fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>{new Date(c.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 14, color: C.muted }}>No analytics data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── URL Shortener Form ──────────────────────────────────────────────────────
function UrlShortenerForm() {
  const [fullUrl, setFullUrl] = useState('');
  const [focused, setFocused] = useState(false);
  const [vState, setVState] = useState('idle');
  const latestHost = useRef('');
  const { createShortUrl, loading, error, recentUrl, copySuccessId, setCopySuccessId, clearError } = useUrlStore();

  const debouncedValidate = useCallback(debounce(async (raw) => {
    const host = extractHostname(raw);
    if (!host || !host.includes('.') || raw.trim().length < 4) { setVState('idle'); return; }
    latestHost.current = host;
    setVState('checking');
    const result = await checkDomainResolvable(host);
    if (latestHost.current === host) setVState(result);
  }, 600), []);

  useEffect(() => {
    if (!fullUrl.trim()) { setVState('idle'); return; }
    debouncedValidate(fullUrl);
  }, [fullUrl, debouncedValidate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullUrl.trim()) return;
    let url = fullUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { await createShortUrl(url); setFullUrl(''); setVState('idle'); } catch {}
  };

  const badge = BADGE[vState];
  const shortHref = recentUrl ? (recentUrl.shortUrl || `${BASE}/${recentUrl.short}`) : '';
  const disabled = loading || !fullUrl.trim();

  const inputBorder = vState === 'valid' ? C.greenBd : vState === 'invalid' ? C.redBd : focused ? C.indigoBd : C.border;
  const inputShadow = focused ? `0 0 0 3px ${C.indigoLt}` : 'none';

  return (
    <div style={card()}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>Paste your link</div>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="url"
            placeholder="https://example.com/a-very-long-link"
            value={fullUrl}
            onChange={e => { setFullUrl(e.target.value); if (error) clearError(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
            style={{ flex: 1, height: 44, borderRadius: 10, border: `1.5px solid ${inputBorder}`, background: focused ? '#fff' : C.raised, padding: '0 16px', fontSize: 14, color: C.text, outline: 'none', transition: 'all 0.15s', boxShadow: inputShadow }}
          />
          <button type="submit" disabled={disabled} style={btnPrimary(disabled)}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Shorten</span><ArrowRight size={15} /></>}
          </button>
        </div>

        {badge && (
          <div className="animate-fade-up" style={{ marginTop: 10, width: 'fit-content', ...pill(badge.bg, badge.bd, badge.color) }}>
            <badge.icon size={13} color={badge.color} className={badge.spin ? 'animate-spin' : ''} />
            <span>{badge.text}</span>
          </div>
        )}
        {vState === 'invalid' && (
          <p style={{ fontSize: 11, color: C.subtle, marginTop: 4, marginLeft: 2 }}>
            Looks like this domain doesn&apos;t exist. You can still shorten it if you&apos;re sure.
          </p>
        )}

        {error && (
          <div className="animate-fade-up" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 9, background: '#FFF5F5', border: `1px solid ${C.redBd}`, fontSize: 13, color: C.red }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />{error}
          </div>
        )}
      </form>

      {recentUrl && (
        <div className="animate-fade-up" style={{ marginTop: 14, padding: '14px 16px', borderRadius: 12, background: C.indigoLt, border: `1px solid ${C.indigoBd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.indigo, marginBottom: 3 }}>Short Link Ready</div>
            <a href={shortHref} target="_blank" rel="noreferrer" style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 700, fontSize: 14, color: C.indigoDk }}>
              {shortHref.replace(/^https?:\/\//, '')}
            </a>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {recentUrl.full}</div>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(shortHref); setCopySuccessId('recent'); }} style={btnGhost({ flexShrink: 0, background: '#fff', borderColor: C.indigoBd })}>
            {copySuccessId === 'recent' ? <><Check size={13} color={C.green} /><span style={{ color: C.green }}>Copied!</span></> : <><Copy size={13} />Copy</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── URL List ────────────────────────────────────────────────────────────────
function UrlList() {
  const { urls, fetchUrls, loading, fetchAnalytics, copySuccessId, setCopySuccessId } = useUrlStore();
  useEffect(() => { fetchUrls(); }, [fetchUrls]);

  const copy = (short) => { navigator.clipboard.writeText(`${BASE}/${short}`); setCopySuccessId(short); };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Your links {urls.length > 0 && `(${urls.length})`}</span>
        <button onClick={fetchUrls} disabled={loading} style={btnGhost({ opacity: loading ? 0.5 : 1 })}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh
        </button>
      </div>

      {!loading && urls.length === 0 && (
        <div style={{ textAlign: 'center', padding: '52px 24px', ...card() }}>
          <MousePointerClick size={32} color={C.border} style={{ margin: '0 auto 14px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>No links yet</p>
          <p style={{ fontSize: 13, color: C.muted }}>Paste a URL above to generate your first short link.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {urls.map((item, idx) => {
          const copied = copySuccessId === item.short;
          const r = idx === 0, last = idx === urls.length - 1;
          return (
            <div key={item._id || item.short} className="animate-fade-up"
              style={{ animationDelay: `${idx * 25}ms`, background: C.surface, border: `1px solid ${C.border}`, borderRadius: r && last ? 14 : r ? '14px 14px 4px 4px' : last ? '4px 4px 14px 14px' : 4, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, transition: 'background 0.1s, box-shadow 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.raised; e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 13, fontWeight: 700, color: C.indigoDk, background: C.indigoLt, border: `1px solid ${C.indigoBd}`, borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>/{item.short}</span>
                  <span style={pill(C.raised, C.border, C.muted)}>
                    <MousePointerClick size={11} />{item.clicks ?? 0} clicks
                  </span>
                </div>
                <a href={item.full} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.subtle, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.full}</span>
                  <ExternalLink size={11} style={{ flexShrink: 0 }} />
                </a>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => copy(item.short)} style={btnGhost({ color: copied ? C.green : C.muted, borderColor: copied ? C.greenBd : C.border, background: copied ? C.greenLt : C.raised })}>
                  {copied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                </button>
                <button onClick={() => fetchAnalytics(item.short)} style={btnGhost()}
                  onMouseEnter={e => { e.currentTarget.style.background = C.indigo; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = C.indigo; }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.raised; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
                >
                  <BarChart3 size={13} />Analytics
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(241,245,249,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.indigo}, ${C.indigoDk})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
              <Link2 size={16} color="#fff" strokeWidth={2.2} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: C.text, letterSpacing: '-0.3px' }}>FastUrl</span>
          </div>
          <div style={pill(C.surface, C.border, C.muted)}>
            <span className="animate-blink" style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'block' }} />
            6,800+ req/sec
          </div>
        </div>
      </nav>

      {/* Main */}
      <main style={{ maxWidth: 700, margin: '0 auto', padding: '56px 24px 80px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...pill(C.indigoLt, C.indigoBd, C.indigo), marginBottom: 18, fontSize: 12 }}>
            <Zap size={12} />High-Performance URL Shortener
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1px', color: C.text, lineHeight: 1.15, marginBottom: 14 }}>
            Shorten any link,{' '}
            <span style={{ background: `linear-gradient(135deg, ${C.indigo}, ${C.indigoDk})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              instantly.
            </span>
          </h1>
          <p style={{ fontSize: 15, color: C.muted, maxWidth: 480, lineHeight: 1.7 }}>
            Backed by Fastify + Redis. Reliably routing{' '}
            <span style={{ fontWeight: 600, color: C.text }}>6,800+ requests/sec</span>{' '}
            with sub-15ms latency and 100% data integrity.
          </p>
          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            {[['Zap', Zap, 'Sub-15ms Latency'], ['Shield', Shield, 'Rate Limited'], ['Cpu', Cpu, 'Multi-Core Cluster']].map(([k, Icon, label]) => (
              <div key={k} style={pill(C.surface, C.border, C.muted)}>
                <Icon size={12} color={C.indigo} />{label}
              </div>
            ))}
          </div>
        </div>

        <UrlShortenerForm />
        <UrlList />
      </main>

      <AnalyticsModal />
    </div>
  );
}
