'use client';

import { useEffect } from 'react';
import { useUrlStore } from '../store/useUrlStore';
import { Copy, Check, BarChart3, ExternalLink, RefreshCw, MousePointerClick } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function UrlList() {
  const { urls, fetchUrls, loading, fetchAnalytics, copySuccessId, setCopySuccessId } = useUrlStore();

  useEffect(() => { fetchUrls(); }, [fetchUrls]);

  const handleCopy = (short) => {
    navigator.clipboard.writeText(`${BASE}/${short}`);
    setCopySuccessId(short);
  };

  return (
    <div style={{ marginTop: 28 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3' }}>
          Your links {urls.length > 0 && `· ${urls.length}`}
        </span>
        <button
          onClick={fetchUrls}
          disabled={loading}
          title="Refresh"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 500,
            color: '#737373',
            background: 'none',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            padding: '4px 0',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={13} style={loading ? { animation: 'spin 0.8s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {/* Empty state */}
      {!loading && urls.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #E8E8E8',
        }}>
          <MousePointerClick size={28} color="#D4D4D4" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: '#737373' }}>No links yet</p>
          <p style={{ fontSize: 13, color: '#A3A3A3', marginTop: 4 }}>Paste a URL above to create your first short link.</p>
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {urls.map((item, idx) => {
          const short = `${BASE}/${item.short}`;
          const isCopied = copySuccessId === item.short;
          return (
            <div
              key={item._id || item.short}
              className="animate-fade-up"
              style={{
                animationDelay: `${idx * 30}ms`,
                background: '#fff',
                borderRadius: idx === 0 ? '12px 12px 4px 4px'
                           : idx === urls.length - 1 ? '4px 4px 12px 12px'
                           : '4px',
                border: '1px solid #E8E8E8',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              {/* Left: URL info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  {/* Short code pill */}
                  <span style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#171717',
                    background: '#F5F5F5',
                    border: '1px solid #E8E8E8',
                    borderRadius: 5,
                    padding: '1px 7px',
                    flexShrink: 0,
                  }}>
                    /{item.short}
                  </span>

                  {/* Click count */}
                  <span style={{
                    fontSize: 12,
                    color: '#A3A3A3',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}>
                    <MousePointerClick size={12} />
                    {item.clicks ?? 0}
                  </span>
                </div>

                {/* Destination */}
                <a
                  href={item.full}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: '#A3A3A3',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    textDecoration: 'none',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#525252'}
                  onMouseLeave={e => e.currentTarget.style.color = '#A3A3A3'}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.full}
                  </span>
                  <ExternalLink size={11} style={{ flexShrink: 0 }} />
                </a>
              </div>

              {/* Right: Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {/* Copy */}
                <button
                  onClick={() => handleCopy(item.short)}
                  title="Copy short link"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 11px',
                    borderRadius: 7,
                    border: '1px solid #E8E8E8',
                    background: '#FAFAFA',
                    fontSize: 12,
                    fontWeight: 500,
                    color: isCopied ? '#16a34a' : '#404040',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {isCopied ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy</>}
                </button>

                {/* Analytics */}
                <button
                  onClick={() => fetchAnalytics(item.short)}
                  title="View analytics"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 11px',
                    borderRadius: 7,
                    border: '1px solid #E8E8E8',
                    background: '#FAFAFA',
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#404040',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#171717'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#171717'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FAFAFA'; e.currentTarget.style.color = '#404040'; e.currentTarget.style.borderColor = '#E8E8E8'; }}
                >
                  <BarChart3 size={13} />
                  Analytics
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
