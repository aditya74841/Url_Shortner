'use client';

import { useUrlStore } from '../store/useUrlStore';
import { X, BarChart2, Loader2, Globe, Monitor, Smartphone, Compass, Clock } from 'lucide-react';

function StatCard({ label, value }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: '#FAFAFA',
      border: '1px solid #EFEFEF',
      borderRadius: 10,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#171717', letterSpacing: '-0.5px' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function BreakdownRow({ label, value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#737373', fontFamily: 'ui-monospace, monospace' }}>
            {value} <span style={{ color: '#D4D4D4' }}>· {pct}%</span>
          </span>
        </div>
        {/* Mini bar */}
        <div style={{ height: 3, background: '#EFEFEF', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: '#171717',
            borderRadius: 99,
            transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, items = [], keyField, clickField, total }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon size={13} color="#A3A3A3" />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3' }}>{title}</span>
      </div>
      <div>
        {items.length === 0 && (
          <p style={{ fontSize: 12, color: '#D4D4D4' }}>No data</p>
        )}
        {items.map(item => (
          <BreakdownRow
            key={item[keyField]}
            label={item[keyField]}
            value={item[clickField]}
            total={total}
          />
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsModal() {
  const { isAnalyticsOpen, closeAnalytics, analyticsData, analyticsLoading } = useUrlStore();

  if (!isAnalyticsOpen) return null;

  const total = analyticsData?.totalClicks ?? 0;
  const d = analyticsData?.breakdown ?? {};

  return (
    /* Backdrop */
    <div
      onClick={closeAnalytics}
      className="animate-fade-up"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Panel – stop propagation so clicks inside don't close */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          background: '#fff',
          border: '1px solid #E8E8E8',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #EFEFEF',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: '#171717',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BarChart2 size={14} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#171717' }}>Analytics</div>
              {analyticsData?.short && (
                <div style={{ fontSize: 12, color: '#A3A3A3', fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>
                  /{analyticsData.short}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={closeAnalytics}
            style={{
              width: 30, height: 30, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid #E8E8E8',
              background: '#FAFAFA',
              cursor: 'pointer',
              color: '#737373',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#EFEFEF'}
            onMouseLeave={e => e.currentTarget.style.background = '#FAFAFA'}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {analyticsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 12, color: '#A3A3A3' }}>
              <Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite', color: '#171717' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Running aggregation pipeline...</span>
            </div>
          ) : analyticsData ? (
            <>
              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <StatCard label="Total Clicks" value={total} />
                <StatCard label="Top Browser" value={d.browsers?.[0]?.browser} />
                <StatCard label="Top Device" value={d.devices?.[0]?.device} />
              </div>

              {/* Breakdown grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <Section icon={Globe}     title="Browsers"   items={d.browsers}  keyField="browser" clickField="clicks" total={total} />
                <Section icon={Monitor}   title="OS"         items={d.os}         keyField="os"      clickField="clicks" total={total} />
                <Section icon={Smartphone} title="Devices"  items={d.devices}    keyField="device"  clickField="clicks" total={total} />
                <Section icon={Compass}   title="Referrers"  items={d.referrers}  keyField="referrer" clickField="clicks" total={total} />
              </div>

              {/* Recent activity */}
              {analyticsData.recentClicks?.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Clock size={13} color="#A3A3A3" />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3' }}>
                      Recent Activity
                    </span>
                  </div>
                  <div style={{ border: '1px solid #EFEFEF', borderRadius: 10, overflow: 'hidden' }}>
                    {analyticsData.recentClicks.slice(0, 8).map((c, i) => (
                      <div
                        key={c.eventId || i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 14px',
                          borderTop: i > 0 ? '1px solid #FAFAFA' : 'none',
                          fontSize: 12,
                          background: '#fff',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        <div style={{ color: '#404040', fontWeight: 500 }}>
                          {c.browser} / {c.os}
                          <span style={{ color: '#D4D4D4', marginLeft: 6 }}>{c.device}</span>
                        </div>
                        <div style={{ color: '#A3A3A3', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                          {new Date(c.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#A3A3A3' }}>
              No analytics data yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
