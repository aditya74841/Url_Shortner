'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUrlStore } from '../store/useUrlStore';
import { ArrowRight, Copy, Check, AlertCircle, Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { extractHostname, checkDomainResolvable, debounce } from '../lib/urlValidator';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Validation states:
 *  'idle'     — user hasn't typed anything meaningful yet
 *  'checking' — DNS query in flight
 *  'valid'    — domain resolves (NOERROR + Answer records)
 *  'invalid'  — NXDOMAIN (domain doesn't exist in DNS)
 *  'unknown'  — network error / timeout / ambiguous
 */
const BADGE = {
  idle:     null,
  checking: { icon: Loader2,       color: '#A3A3A3', spin: true,  label: 'Checking domain...' },
  valid:    { icon: CheckCircle2,   color: '#16a34a', spin: false, label: 'Domain resolves'    },
  invalid:  { icon: XCircle,        color: '#DC2626', spin: false, label: 'Domain not found'   },
  unknown:  { icon: HelpCircle,     color: '#D97706', spin: false, label: 'Could not verify'   },
};

const s = {
  card: {
    background: '#FFFFFF',
    border: '1px solid #E8E8E8',
    borderRadius: 14,
    padding: '20px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#A3A3A3',
    marginBottom: 10,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    border: '1px solid #E8E8E8',
    background: '#FAFAFA',
    padding: '0 14px',
    fontSize: 14,
    color: '#171717',
    outline: 'none',
    transition: 'border-color 0.15s, background 0.15s',
  },
  btn: {
    height: 42,
    padding: '0 18px',
    borderRadius: 9,
    background: '#171717',
    color: '#fff',
    fontWeight: 500,
    fontSize: 14,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    cursor: 'pointer',
    transition: 'background 0.15s, opacity 0.15s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  errBox: {
    marginTop: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 8,
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    fontSize: 13,
    color: '#DC2626',
  },
  resultCard: {
    marginTop: 10,
    padding: '14px 16px',
    borderRadius: 10,
    background: '#FAFAFA',
    border: '1px solid #E8E8E8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shortLink: {
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontWeight: 600,
    fontSize: 14,
    color: '#171717',
    textDecoration: 'none',
  },
  dest: {
    fontSize: 12,
    color: '#A3A3A3',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 340,
  },
  copyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 7,
    border: '1px solid #E8E8E8',
    background: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.12s',
    color: '#404040',
  },
};

export default function UrlShortenerForm() {
  const [fullUrl, setFullUrl] = useState('');
  const [focused, setFocused] = useState(false);
  const [validationState, setValidationState] = useState('idle');

  const { createShortUrl, loading, error, recentUrl, copySuccessId, setCopySuccessId, clearError } = useUrlStore();

  // ── Debounced DNS validation ────────────────────────────────────────────────
  const latestHostname = useRef('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedValidate = useCallback(
    debounce(async (rawInput) => {
      const hostname = extractHostname(rawInput);

      // Not enough to validate yet
      if (!hostname || !hostname.includes('.') || rawInput.trim().length < 4) {
        setValidationState('idle');
        return;
      }

      // Track latest so stale async results don't overwrite newer ones
      latestHostname.current = hostname;
      setValidationState('checking');

      const result = await checkDomainResolvable(hostname);

      // Only apply if this is still the latest query
      if (latestHostname.current === hostname) {
        setValidationState(result);
      }
    }, 600),
    []
  );

  useEffect(() => {
    if (!fullUrl.trim()) {
      setValidationState('idle');
      return;
    }
    debouncedValidate(fullUrl);
  }, [fullUrl, debouncedValidate]);
  // ────────────────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullUrl.trim()) return;
    let url = fullUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      await createShortUrl(url);
      setFullUrl('');
      setValidationState('idle');
    } catch {}
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopySuccessId('recent');
  };

  const shortHref = recentUrl
    ? recentUrl.shortUrl || `${BASE}/${recentUrl.short}`
    : '';

  const isDisabled = loading || !fullUrl.trim();
  const badge = BADGE[validationState];

  // Border colour hint on the input
  const inputBorderColor =
    validationState === 'valid'   ? '#86efac' :
    validationState === 'invalid' ? '#fca5a5' :
    focused                       ? '#A3A3A3' : '#E8E8E8';

  return (
    <div style={s.card}>
      <span style={s.label}>Shorten a link</span>

      <form onSubmit={handleSubmit} noValidate>
        <div style={s.row}>
          <input
            type="url"
            placeholder="https://example.com/very-long-link"
            value={fullUrl}
            onChange={(e) => { setFullUrl(e.target.value); if (error) clearError(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={loading}
            style={{
              ...s.input,
              borderColor: inputBorderColor,
              background: focused ? '#fff' : '#FAFAFA',
            }}
          />
          <button
            type="submit"
            disabled={isDisabled}
            style={{ ...s.btn, ...(isDisabled ? s.btnDisabled : {}) }}
          >
            {loading ? (
              <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <>Shorten <ArrowRight size={14} /></>
            )}
          </button>
        </div>

        {/* ── DNS Validation Badge ─────────────────────────────────────── */}
        {badge && (
          <div
            className="animate-fade-up"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              padding: '5px 10px',
              borderRadius: 7,
              border: `1px solid`,
              borderColor:
                validationState === 'valid'   ? '#dcfce7' :
                validationState === 'invalid' ? '#fee2e2' :
                validationState === 'unknown' ? '#fef3c7' : '#E8E8E8',
              background:
                validationState === 'valid'   ? '#f0fdf4' :
                validationState === 'invalid' ? '#fff5f5' :
                validationState === 'unknown' ? '#fffbeb' : '#FAFAFA',
              width: 'fit-content',
            }}
          >
            <badge.icon
              size={13}
              color={badge.color}
              style={badge.spin ? { animation: 'spin 0.8s linear infinite', flexShrink: 0 } : { flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: badge.color }}>
              {badge.label}
            </span>
          </div>
        )}
        {/* ─────────────────────────────────────────────────────────────── */}

        {/* Note shown only when invalid — still allows submit */}
        {validationState === 'invalid' && (
          <p style={{ fontSize: 11, color: '#A3A3A3', marginTop: 5, marginLeft: 2 }}>
            The domain doesn&apos;t appear to exist in DNS. You can still shorten it if you&apos;re sure.
          </p>
        )}

        {error && (
          <div style={s.errBox} className="animate-fade-up">
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}
      </form>

      {/* Instant result card */}
      {recentUrl && (
        <div style={s.resultCard} className="animate-fade-up">
          <div style={{ minWidth: 0 }}>
            <a href={shortHref} target="_blank" rel="noreferrer" style={s.shortLink}>
              {shortHref.replace(/^https?:\/\//, '')}
            </a>
            <div style={s.dest}>→ {recentUrl.full}</div>
          </div>
          <button onClick={() => handleCopy(shortHref)} style={s.copyBtn}>
            {copySuccessId === 'recent'
              ? <><Check size={13} color="#16a34a" /> <span style={{ color: '#16a34a' }}>Copied</span></>
              : <><Copy size={13} /> Copy</>}
          </button>
        </div>
      )}
    </div>
  );
}
