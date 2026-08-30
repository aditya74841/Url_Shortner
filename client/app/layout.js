import './globals.css';

export const metadata = {
  title: 'FastUrl — URL Shortener',
  description: 'High-performance URL shortener. Sub-15ms latency, 6,800+ req/sec.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
