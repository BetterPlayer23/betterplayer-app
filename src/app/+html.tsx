import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering. It runs in Node.js, not the browser.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0A0C16" />
        <meta name="color-scheme" content="dark" />
        <ScrollViewStyleReset />
        {/* Dark background from the first paint, so there is no white flash. */}
        <style dangerouslySetInnerHTML={{ __html: 'body { background-color: #07080F; }' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
