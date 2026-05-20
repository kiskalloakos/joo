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

// Desktop-only layout: center the app inside a phone-portrait-ish column
// (560px) so the web version feels intentional instead of a phone screen
// stretched across a huge canvas. Mobile + tablet portrait stays untouched.
//
// Setting max-width on <body> doesn't work because react-native-web puts a
// flex root div inside body that stretches to viewport width regardless.
// We instead (1) make body itself a centering flex container, then (2) cap
// width on body's first child (Expo Router's root div) so it stays in a
// 560px column with the outer canvas showing on either side. !important
// is required to outrank react-native-web's runtime-injected inline rules.
const DESKTOP_CSS = `
  @media (min-width: 768px) {
    html {
      background: radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(0, 200, 150, 0.06) 0%, transparent 50%), #060606 !important;
    }
    body {
      background-color: transparent !important;
      align-items: center !important;
    }
    body > div {
      width: 560px !important;
      max-width: 100% !important;
      flex-basis: auto !important;
      flex-grow: 0 !important;
      flex-shrink: 0 !important;
      background-color: #0D0D0D !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.05),
        0 0 100px rgba(0, 0, 0, 0.6) !important;
    }
  }
`;

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
        <style dangerouslySetInnerHTML={{ __html: DESKTOP_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
