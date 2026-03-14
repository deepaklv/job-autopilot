import fs from "fs";
import path from "path";

/**
 * Returns:
 *  - base64: the PDF as a base64 string (for email attachment)
 *  - text: extracted plain text (for feeding to Claude)
 *  - filename: original filename
 */
export async function loadResume(): Promise<{
  base64: string;
  text: string;
  filename: string;
  candidateName: string;
}> {
  // Resume lives at /public/resume.pdf — drop your file there
  const resumePath = path.join(process.cwd(), "public", "resume.pdf");

  if (!fs.existsSync(resumePath)) {
    throw new Error(
      "Resume not found at /public/resume.pdf — please add your resume PDF there."
    );
  }

  const pdfBuffer = fs.readFileSync(resumePath);
  const base64 = pdfBuffer.toString("base64");

  // Extract text for Claude to read
  let text = "";
  try {
    // pdf-parse is a CommonJS module
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(pdfBuffer);
    text = data.text;
  } catch {
    // If pdf-parse fails, Claude will still write a reasonable letter
    text = "[Resume text could not be extracted — use job description only]";
  }

  // Try to extract the candidate's name from the first line of the resume
  const firstLine = text.split("\n").find((l) => l.trim().length > 2) ?? "";
  const candidateName = firstLine.trim() || "Candidate";

  return {
    base64,
    text,
    filename: "AIML_Product_Manager_8yrs_PhD_Ex_Intuit_Flipkart_SAP Labs.pdf",
    candidateName,
  };
}
