import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface JobDetails {
  recruiterEmail: string | null;
  jobTitle: string;
  company: string;
  jdSummary: string;
  foundEmail: boolean;
  notRelevant: boolean;
  notRelevantReason: string | null;
}

/**
 * Step 0: Extract all job+email pairs from an email body in one fast Claude call.
 * Returns an array of {jobTitle, company, recruiterEmail, snippet} objects.
 * Much faster than splitting full text — one API call handles everything.
 */
export async function extractAllJobs(emailBody: string): Promise<Array<{
  jobTitle: string;
  company: string;
  recruiterEmail: string | null;
  jdSummary: string;
  notRelevant: boolean;
  notRelevantReason: string | null;
}>> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are parsing a forwarded WhatsApp message that contains one or more job postings.

Extract ALL jobs from the text below. For each job return an object in a JSON array.

For each job extract:
- jobTitle: the job title. Use only simple ASCII characters, replace any special chars or dashes with a plain hyphen (-).
- company: the company name, or "Unknown"
- recruiterEmail: the email address to apply to. Must be a real email (@...). Set to null if not explicitly present.
- jdSummary: one sentence summary of the role
- notRelevant: true if this is clearly NOT for a senior tech Product Manager with AI/ML/ecommerce background (e.g. pharmaceutical, agriculture, non-PM roles). false otherwise.
- notRelevantReason: short reason if notRelevant is true, otherwise null

Rules:
- Return ONLY a valid JSON array, no markdown, no explanation
- Include ALL jobs found, even if they have no email
- Never use em dashes anywhere in your output

Text:
---
${emailBody}
---`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";

  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const jobs = JSON.parse(clean);
    if (Array.isArray(jobs) && jobs.length > 0) return jobs;
    return [];
  } catch {
    return [];
  }
}

// Keep splitIntoJobs as a no-op fallback (unused but avoids import errors)
export function splitIntoJobs(emailBody: string): string[] {
  return [emailBody];
}

/**
 * Step 1: Parse a single job description.
 * Returns structured info including the recruiter email.
 */
export async function parseJobDescription(emailBody: string): Promise<JobDetails> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are parsing a job description forwarded from a WhatsApp job group. Extract the following from the text below. Respond ONLY with valid JSON, no explanation, no markdown.

Extract:
- recruiterEmail: the email address to send an application to. This must be an actual email address (@...). If there is NO explicit email address in the text, set this to null.
- jobTitle: the job title / role name. Remove any em dashes or special characters from the title, use a simple hyphen (-) instead if needed.
- company: the company name (or "Unknown" if not found)
- jdSummary: a 2-sentence summary of what the role involves and key requirements
- notRelevant: true if this job is clearly NOT suitable for a senior tech Product Manager with AI/ML background. Set to true for: pharmaceutical sales, agriculture, seeds, non-PM roles, or roles requiring domain-specific degrees (B.Sc Agriculture, B.Pharma etc). Set to false for all tech/product/digital roles.
- notRelevantReason: if notRelevant is true, a short reason (e.g. "Pharmaceutical domain"). Otherwise null.

Rules:
- recruiterEmail MUST be null if you cannot find a real email address in the text. Do not guess or infer.
- Only extract an email if it's clearly meant for applications (e.g. "send CV to...", "apply at...", "email:", "contact:").

Job description text:
---
${emailBody}
---`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      recruiterEmail: parsed.recruiterEmail ?? null,
      jobTitle: parsed.jobTitle ?? "Product Manager",
      company: parsed.company ?? "Unknown",
      jdSummary: parsed.jdSummary ?? "",
      foundEmail: !!parsed.recruiterEmail,
      notRelevant: parsed.notRelevant ?? false,
      notRelevantReason: parsed.notRelevantReason ?? null,
    };
  } catch {
    return {
      recruiterEmail: null,
      jobTitle: "Unknown Role",
      company: "Unknown",
      jdSummary: "",
      foundEmail: false,
      notRelevant: false,
      notRelevantReason: null,
    };
  }
}

/**
 * Step 2: Generate a brief, tailored cover letter (3-4 sentences).
 */
export async function generateCoverLetter({
  resumeText,
  jobTitle,
  company,
  jdSummary,
}: {
  resumeText: string;
  jobTitle: string;
  company: string;
  jdSummary: string;
}): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are writing a very brief, human-sounding cover letter for a Product Manager job application.

IMPORTANT RULES:
- Exactly 3-4 sentences. No more.
- Do NOT use hollow phrases like "I am excited to apply", "I am passionate about", "thrilled", "leverage", or "synergies".
- Sound like a confident PM, not a template. Be specific and direct.
- Do NOT use em dashes (--) or special punctuation. Use commas, full stops, and simple sentence structure only.
- Draw 1-2 specific, relevant details from the resume to connect to the role.

Job Title: ${jobTitle}
Company: ${company}
Role Summary: ${jdSummary}

Candidate Resume:
---
${resumeText}
---

Write the 3-4 sentence cover letter body now:`,
      },
    ],
  });

  return message.content[0].type === "text" ? message.content[0].text.trim() : "";
}

/**
 * Build the full email body from the cover letter.
 */
export function buildEmailBody({
  coverLetter,
  candidateName,
  jobTitle,
  company,
}: {
  coverLetter: string;
  candidateName: string;
  jobTitle: string;
  company: string;
}): { subject: string; body: string } {
  const safeTitle = jobTitle.replace(/[^\x00-\x7F]/g, "").replace(/\s+/g, " ").trim();
  const subject = `Application for ${safeTitle} - ${candidateName}`;

  const body = `Hi,

${coverLetter}

Highlights:
- Strong Technical Background
- Pursuing PhD in AI
- 0-1 Product Launch experience
- eCommerce and Enterprise Software Experience
- Developer Experience
- AI Product launch experience
- Can join in 2 weeks
- Available for an interview this week

Please find my resume attached. Happy to connect at your convenience.

Best regards,
${candidateName}
+91 98450 08844`;

  return { subject, body };
}
