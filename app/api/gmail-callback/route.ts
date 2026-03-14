import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * This route is only used ONCE during setup to get your Gmail refresh token.
 * Visit /api/gmail-callback/auth to start the OAuth flow.
 * After approving, Google redirects here and prints your refresh token.
 * Copy that token into GMAIL_REFRESH_TOKEN in your .env.local
 */

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail-callback`
  );
}

// Step 1: Visit /api/gmail-callback/auth to get the Google consent URL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  // ── Step 2: Google redirected back with ?code=... ──
  if (code) {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const html = `
      <html>
        <body style="font-family: monospace; padding: 40px; background: #0f0f0f; color: #e0e0e0;">
          <h2 style="color: #4ade80;">✅ Gmail connected!</h2>
          <p>Copy the refresh token below into your <code>.env.local</code> as <code>GMAIL_REFRESH_TOKEN</code>:</p>
          <pre style="background:#1a1a1a; padding:20px; border-radius:8px; overflow:auto; color: #fbbf24; font-size:13px;">${tokens.refresh_token ?? "ERROR: No refresh token returned. Make sure you added ?access_type=offline to the auth URL."}</pre>
          <p style="color:#9ca3af; font-size:13px;">Also add this to Vercel → Settings → Environment Variables.<br>
          You only need to do this once. This page won't work again.</p>
        </body>
      </html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // ── Step 1: No code yet — redirect to Google consent screen ──
  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Forces refresh token to be returned
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.labels",
    ],
  });

  return NextResponse.redirect(authUrl);
}
