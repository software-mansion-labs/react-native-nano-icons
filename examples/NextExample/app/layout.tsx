import type { ReactNode } from 'react';
import Link from 'next/link';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', padding: 24 }}>
        <nav style={{ display: 'flex', gap: 16 }}>
          <Link href="/">Server component</Link>
          <Link href="/checks">Checks</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
