import { NextRequest, NextResponse } from "next/server";
import {
  fetchUnreadJobEmails,
  extractEmailBody,
  markAsRead,
  sendEmail,
  sendDigest,
} from "@/lib/gmail";
import { extractAllJobs, generateCoverLetter, buildEmailBody } from "@/lib/claude";
import { loadResume } from "@/lib/resume";
 
export const maxDuration = 60;
 
const MAX_JOBS_PER_RUN = 3;
 
interface RunResult {
  messageId: string;
  status: "sent" | "skipped_no_email" | "skipped_not_relevant" | "error";
  jobTitle?: string;
  company?: string;
  recruiterEmail?: string;
  reason?: string;
}
 
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
 
  const results: RunResult[] = [];
  const startedAt = new Date().toISOString();
 
  try {
    const resume = await loadResume();
    const emails = await fetchUnreadJobEmails();
 
    if (emails.length === 0) {
      return NextResponse.json({ message: "No new job emails.", results: [] });
    }
 
    let jobsProcessed = 0;
 
    for (const email of emails) {
      if (jobsProcessed >= MAX_JOBS_PER_RUN) break;
 
      const messageId = email.id ?? "unknown";
 
      try {
        const body = extractEmailBody(email);
        console.log("Body length:", body.length);
 
        if (!body || body.trim().length < 50) {
          await markAsRead(messageId);
          results.push({ messageId, status: "skipped_no_email", reason: "Email body too short" });
          continue;
        }
 
        // One Claude call extracts ALL jobs from the email at once
        const allJobs = await extractAllJobs(body);
        console.log("Jobs extracted:", allJobs.length);
 
        // Take up to MAX_JOBS_PER_RUN jobs, skip irrelevant/no-email ones first
        const eligibleJobs = allJobs.filter(j => j.recruiterEmail && !j.notRelevant);
        const skippedJobs = allJobs.filter(j => !j.recruiterEmail || j.notRelevant);
 
        // Log skipped jobs immediately
        for (const job of skippedJobs) {
          if (!job.recruiterEmail) {
            results.push({ messageId, status: "skipped_no_email", jobTitle: job.jobTitle, company: job.company, reason: "No recruiter email" });
          } else if (job.notRelevant) {
            results.push({ messageId, status: "skipped_not_relevant", jobTitle: job.jobTitle, company: job.company, reason: job.notRelevantReason ?? "Not a fit" });
          }
        }
 
        const jobsToSend = eligibleJobs.slice(0, MAX_JOBS_PER_RUN - jobsProcessed);
        const jobsRemaining = eligibleJobs.length - jobsToSend.length;
        jobsProcessed += jobsToSend.length;
 
        // Generate all cover letters in parallel
        const coverLetters = await Promise.all(
          jobsToSend.map(job => generateCoverLetter({
            resumeText: resume.text,
            jobTitle: job.jobTitle,
            company: job.company,
            jdSummary: job.jdSummary,
          }))
        );
 
        // Send all emails in parallel
        await Promise.all(
          jobsToSend.map(async (job, i) => {
            try {
              const { subject, body: emailBody } = buildEmailBody({
                coverLetter: coverLetters[i],
                candidateName: resume.candidateName,
                jobTitle: job.jobTitle,
                company: job.company,
              });
 
              await sendEmail({
                to: job.recruiterEmail!,
                subject,
                body: emailBody,
                attachmentBase64: resume.base64,
                attachmentFilename: resume.filename,
              });
 
              results.push({ messageId, status: "sent", jobTitle: job.jobTitle, company: job.company, recruiterEmail: job.recruiterEmail! });
            } catch (err: any) {
              results.push({ messageId, status: "error", reason: err?.message ?? "Unknown error" });
            }
          })
        );
 
        if (jobsRemaining === 0) {
          await markAsRead(messageId);
        }
 
      } catch (err: any) {
        results.push({ messageId, status: "error", reason: err?.message ?? "Unknown error" });
      }
    }
 
    const sent = results.filter((r) => r.status === "sent");
    const skipped = results.filter((r) => r.status === "skipped_no_email");
    const notRelevant = results.filter((r) => r.status === "skipped_not_relevant");
    const errors = results.filter((r) => r.status === "error");
 
    const digestLines = [
      `Job Autopilot -- Run at ${startedAt}`,
      `---------------------------------`,
      `Applications sent: ${sent.length}`,
      `Skipped (no email): ${skipped.length}`,
      `Skipped (not relevant): ${notRelevant.length}`,
      `Errors: ${errors.length}`,
      "",
    ];
 
    if (sent.length > 0) {
      digestLines.push("SENT:");
      sent.forEach((r) => digestLines.push(`  - ${r.jobTitle} @ ${r.company} -> ${r.recruiterEmail}`));
      digestLines.push("");
    }
    if (skipped.length > 0) {
      digestLines.push("SKIPPED (no email):");
      skipped.forEach((r) => digestLines.push(`  - ${r.jobTitle ?? "Unknown"} @ ${r.company ?? "Unknown"}`));
      digestLines.push("");
    }
    if (notRelevant.length > 0) {
      digestLines.push("SKIPPED (not relevant):");
      notRelevant.forEach((r) => digestLines.push(`  - ${r.jobTitle ?? "Unknown"} @ ${r.company ?? "Unknown"}: ${r.reason}`));
      digestLines.push("");
    }
    if (errors.length > 0) {
      digestLines.push("ERRORS:");
      errors.forEach((r) => digestLines.push(`  - ${r.reason}`));
    }
 
    if (jobsProcessed >= MAX_JOBS_PER_RUN) {
      digestLines.push("");
      digestLines.push(`Note: Hit the ${MAX_JOBS_PER_RUN}-job limit. Remaining jobs processed next run (30 min).`);
    }
 
    digestLines.push("---------------------------------");
    digestLines.push("Good luck!");
 
    if (sent.length > 0 || errors.length > 0) {
      await sendDigest(digestLines.join("\n"));
    }
 
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    console.error("Cron run failed:", err);
    return NextResponse.json({ error: err?.message ?? "Run failed" }, { status: 500 });
  }
}