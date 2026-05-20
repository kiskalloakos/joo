import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Root HTML template for the web export only (no effect on native).
// Tightens the Content-Security-Policy so an XSS regression cannot exfiltrate
// the session JWT that Supabase JS stores in localStorage on web.
//
// connect-src needs the project's Supabase host for REST + Realtime (wss).
// Update SUPABASE_HOST below if you ever rotate the project.
const SUPABASE_HOST = 'https://cisfnfcbqrpjxabxlcli.supabase.co';
const SUPABASE_WSS = 'wss://cisfnfcbqrpjxabxlcli.supabase.co';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // react-native-web injects element styles inline at runtime.
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WSS}`,
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
