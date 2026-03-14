import { google } from "googleapis";

/** Returns an authenticated Gmail client using your stored refresh token. */
export function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail-callback`
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/** Fetch all unread emails in the "jobs-apply" Gmail label. */
export async function fetchUnreadJobEmails() {
  const gmail = getGmailClient();

  // Find (or create) the label ID for "jobs-apply"
  const labelsRes = await gmail.users.labels.list({ userId: "me" });
  const label = labelsRes.data.labels?.find((l) => l.name === "jobs-apply");

  if (!label?.id) {
    throw new Error(
      'Gmail label "jobs-apply" not found. Please create it in Gmail first.'
    );
  }

  // Get unread messages in that label
  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds: [label.id, "UNREAD"],
    maxResults: 20,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  // Fetch full body for each message
  const fullMessages = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "full",
      })
    )
  );

  return fullMessages.map((r) => r.data);
}

/** Extract plain-text body from a Gmail message. */
export function extractEmailBody(message: any): string {
  const parts = message.payload?.parts ?? [message.payload];

  function decode(data: string) {
    return Buffer.from(data, "base64url").toString("utf-8");
  }

  for (const part of parts) {
    if (part?.mimeType === "text/plain" && part?.body?.data) {
      return decode(part.body.data);
    }
  }
  // fallback: try html part
  for (const part of parts) {
    if (part?.mimeType === "text/html" && part?.body?.data) {
      return decode(part.body.data).replace(/<[^>]+>/g, " ");
    }
  }
  // fallback: top-level body
  if (message.payload?.body?.data) {
    return decode(message.payload.body.data);
  }
  return "";
}

/** Mark a message as read and move it out of UNREAD. */
export async function markAsRead(messageId: string) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] },
  });
}

/**
 * Send an email via Gmail API.
 * attachmentBase64 should be the base64 content of your resume PDF.
 */
export async function sendEmail({
  to,
  subject,
  body,
  attachmentBase64,
  attachmentFilename,
}: {
  to: string;
  subject: string;
  body: string;
  attachmentBase64: string;
  attachmentFilename: string;
}) {
  const gmail = getGmailClient();
  const boundary = "boundary_job_autopilot_" + Date.now();

  const rawEmail = [
    `To: ${to}`,
    `From: ${process.env.YOUR_EMAIL}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    body,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachmentFilename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${attachmentFilename}"`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

/** Send yourself a plain-text digest email. */
export async function sendDigest(digestText: string) {
  const gmail = getGmailClient();
  const subject = `[Job Autopilot] Run summary — ${new Date().toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "short", year: "numeric" }
  )}`;

  const rawEmail = [
    `To: ${process.env.YOUR_EMAIL}`,
    `From: ${process.env.YOUR_EMAIL}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    digestText,
  ].join("\r\n");

  const encoded = Buffer.from(rawEmail).toString("base64url");
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
