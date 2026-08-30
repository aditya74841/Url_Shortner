'use client';

import Link from 'next/link';
import { Link2 } from 'lucide-react';

export default function Header() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(245,245,245,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid #E8E8E8',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: '#171717',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Link2 size={15} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.3px', color: '#171717' }}>
            FastUrl
          </span>
        </div>

        {/* Status chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color: '#525252',
            background: '#FAFAFA',
            border: '1px solid #E8E8E8',
            borderRadius: 99,
            padding: '4px 12px',
          }}
        >
          <span
            className="animate-blink"
            style={{
              display: 'block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#22c55e',
            }}
          />
          6,800+ req/sec
        </div>
      </div>
    </header>
  );
}
