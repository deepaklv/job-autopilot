# Job Autopilot 🚀

Automatically applies to PM jobs from your WhatsApp job group while you sleep.

**Flow:** WhatsApp job post → you forward to Gmail → cron picks it up → Claude parses JD + writes cover letter → sends to recruiter with your resume attached → you wake up to a digest.

---

## How it works

1. Someone posts a job in your WhatsApp group
2. You forward the message to your Gmail (5 seconds)
3. You label it `jobs-apply` in Gmail (or set up a filter to do this automatically)
4. Every 30 minutes, the cron job wakes up, reads new emails in that label
5. Claude extracts the recruiter's email from the JD
6. **Safety check**: if no clear recruiter email is found, the job is skipped (never sends blind)
7. Claude writes a 3-4 sentence tailored cover letter using your resume
8. Gmail API sends the email with your resume PDF attached
9. You get a morning digest of everything that went out

---

## Setup (one afternoon, I promise)

### Step 1 — Clone and install

```bash
git clone <your-repo>
cd job-autopilot
npm install
```

### Step 2 — Drop your resume in

Copy your resume PDF to:
```
public/resume.pdf
```

Make sure your name is on the first line — the app extracts it automatically for the email sign-off.

### Step 3 — Set up Google Cloud (the longest step, ~20 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Job Autopilot")
3. Go to **APIs & Services → Enable APIs** → enable **Gmail API**
4. Go to **APIs & Services → OAuth consent screen**
   - Choose **External**
   - Fill in app name ("Job Autopilot"), your email
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`
   - Add yourself as a **test user**
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/api/gmail-callback` (for local) + `https://your-app.vercel.app/api/gmail-callback` (for production)
   - Copy the **Client ID** and **Client Secret**

### Step 4 — Get your Gmail refresh token

1. Copy `.env.local.example` to `.env.local` and fill in `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `YOUR_EMAIL`, and `NEXT_PUBLIC_APP_URL=http://localhost:3000`
2. Run locally: `npm run dev`
3. Visit: [http://localhost:3000/api/gmail-callback](http://localhost:3000/api/gmail-callback)
4. Approve Gmail access
5. You'll see your **refresh token** on the page — copy it into `.env.local` as `GMAIL_REFRESH_TOKEN`

### Step 5 — Create the Gmail label

In Gmail:
- Click **+ Create new label** in the left sidebar
- Name it exactly: `jobs-apply`

**Optional automation**: Create a Gmail filter so any email you forward from WhatsApp (your own address) with "job" in the subject auto-gets this label.

### Step 6 — Fill in the rest of .env.local

```env
ANTHROPIC_API_KEY=sk-ant-...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...   ← from Step 4
YOUR_EMAIL=you@gmail.com
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
CRON_SECRET=make-up-a-long-random-string
```

### Step 7 — Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add all your environment variables in **Vercel → Settings → Environment Variables**.

The `vercel.json` cron job is already configured — Vercel will call `/api/run-applications` every 30 minutes automatically.

> **Note**: Cron jobs require Vercel's **Hobby plan** (free) or above.

### Step 8 — Repeat the Gmail OAuth for production

Once deployed, visit `https://your-app.vercel.app/api/gmail-callback` and go through the flow again to get a production refresh token (the localhost one won't work in production). Update `GMAIL_REFRESH_TOKEN` in Vercel env vars.

---

## Daily usage

1. See a job in WhatsApp → forward to your Gmail
2. Add the `jobs-apply` label (or let your filter do it)
3. Go to sleep
4. Wake up to a digest email like:

```
Job Autopilot — Run at 2024-01-15T02:30:00Z
─────────────────────────────────
Emails processed : 3
Applications sent: 2
Skipped (no email found): 1
Errors           : 0

✅ SENT:
  • Senior PM @ Razorpay → careers@razorpay.com
  • Product Manager @ Zepto → hrteam@zepto.app

⏭ SKIPPED (no recruiter email in JD):
  • Growth PM @ Unknown — no email in JD

Good luck! 🚀
```

---

## Customising the cover letter

Edit the prompt in `lib/claude.ts` → `generateCoverLetter()`. You can:
- Add more context about yourself that isn't in the resume
- Change the tone (more formal, more casual)
- Add a sentence about why you want to work at specific company types

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Label jobs-apply not found" | Create the label in Gmail — exact spelling matters |
| "Resume not found" | Make sure `public/resume.pdf` exists |
| OAuth errors | Refresh token may have expired — redo Step 4 |
| Cron not running | Check Vercel dashboard → Functions → Cron |
| Emails going to spam | Send a test email first to warm up the Gmail account |

---

## Security notes

- Your resume PDF is in `/public` — it will be accessible at `your-app.vercel.app/resume.pdf`. If you want to keep it private, move the loading logic to read from an env var (base64 encoded) or Vercel Blob instead.
- The `/api/run-applications` endpoint is protected by `CRON_SECRET` — don't share it.
- Gmail refresh tokens don't expire unless you revoke access or exceed Google's token limits.
