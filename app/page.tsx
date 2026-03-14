"use client";
import { useState, useEffect } from "react";

interface RunResult {
  messageId: string;
  status: "sent" | "skipped_no_email" | "error";
  jobTitle?: string;
  company?: string;
  recruiterEmail?: string;
  reason?: string;
}

interface RunData {
  success: boolean;
  results: RunResult[];
  message?: string;
}

export default function Dashboard() {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        })
      );
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  async function triggerRun() {
    setRunning(true);
    setError(null);
    setLastRun(null);
    try {
      const res = await fetch("/api/run-applications", {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setLastRun(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const sent = lastRun?.results.filter((r) => r.status === "sent") ?? [];
  const skipped =
    lastRun?.results.filter((r) => r.status === "skipped_no_email") ?? [];
  const errors = lastRun?.results.filter((r) => r.status === "error") ?? [];

  return (
    <div style={styles.root}>
      <div style={styles.grain} />

      <header style={styles.header}>
        <div style={styles.pill}>AUTO</div>
        <span style={styles.clock}>{time} IST</span>
      </header>

      <main style={styles.main}>
        <h1 style={styles.h1}>Job Autopilot</h1>
        <p style={styles.sub}>
          Forwards from WhatsApp → Gmail → Claude → Recruiter.{" "}
          <span style={styles.dim}>Runs every 30 min.</span>
        </p>

        <button
          style={{ ...styles.btn, opacity: running ? 0.5 : 1 }}
          onClick={triggerRun}
          disabled={running}
        >
          {running ? (
            <>
              <span style={styles.spinner} /> Running…
            </>
          ) : (
            "▶ Run now"
          )}
        </button>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>✕</span> {error}
          </div>
        )}

        {lastRun && (
          <div style={styles.results}>
            <div style={styles.statsRow}>
              <Stat n={sent.length} label="Sent" color="#4ade80" />
              <Stat n={skipped.length} label="Skipped" color="#facc15" />
              <Stat n={errors.length} label="Errors" color="#f87171" />
              <Stat
                n={lastRun.results.length}
                label="Total"
                color="#94a3b8"
              />
            </div>

            {lastRun.message && (
              <p style={styles.noNew}>{lastRun.message}</p>
            )}

            {sent.length > 0 && (
              <Section title="✅ Applications sent">
                {sent.map((r) => (
                  <Row key={r.messageId}>
                    <strong style={{ color: "#e2e8f0" }}>{r.jobTitle}</strong>
                    <span style={styles.at}>@</span>
                    <span style={{ color: "#94a3b8" }}>{r.company}</span>
                    <span style={styles.email}>→ {r.recruiterEmail}</span>
                  </Row>
                ))}
              </Section>
            )}

            {skipped.length > 0 && (
              <Section title="⏭ Skipped — no recruiter email found">
                {skipped.map((r) => (
                  <Row key={r.messageId}>
                    <span style={{ color: "#94a3b8" }}>
                      {r.jobTitle ?? "Unknown"} @ {r.company ?? "Unknown"}
                    </span>
                  </Row>
                ))}
              </Section>
            )}

            {errors.length > 0 && (
              <Section title="❌ Errors">
                {errors.map((r) => (
                  <Row key={r.messageId}>
                    <span style={{ color: "#f87171" }}>{r.reason}</span>
                  </Row>
                ))}
              </Section>
            )}
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <p>
          Cron runs every 30 min · Forward jobs to Gmail with label{" "}
          <code style={styles.code}>jobs-apply</code>
        </p>
        <p style={{ marginTop: 4 }}>
          Setup:{" "}
          <a href="/api/gmail-callback" style={styles.link}>
            Connect Gmail
          </a>
        </p>
      </footer>


    </div>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={styles.stat}>
      <span style={{ ...styles.statN, color }}>{n}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.section}>
      <p style={styles.sectionTitle}>{title}</p>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={styles.row}>{children}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#080b12",
    color: "#e2e8f0",
    fontFamily: "'DM Mono', monospace",
    position: "relative",
    overflowX: "hidden",
  },
  grain: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
    pointerEvents: "none",
    zIndex: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 32px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 1,
  },
  pill: {
    background: "rgba(74,222,128,0.12)",
    color: "#4ade80",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.15em",
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid rgba(74,222,128,0.25)",
  },
  clock: {
    color: "#475569",
    fontSize: 13,
  },
  main: {
    position: "relative",
    zIndex: 1,
    maxWidth: 640,
    margin: "0 auto",
    padding: "72px 32px 48px",
    animation: "fadeUp 0.5s ease both",
  },
  h1: {
    fontFamily: "'Syne', sans-serif",
    fontSize: "clamp(36px, 7vw, 56px)",
    fontWeight: 800,
    color: "#f1f5f9",
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    marginBottom: 16,
  },
  sub: {
    fontSize: 15,
    color: "#64748b",
    lineHeight: 1.6,
    marginBottom: 40,
  },
  dim: {
    color: "#334155",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(74,222,128,0.1)",
    color: "#4ade80",
    border: "1px solid rgba(74,222,128,0.3)",
    borderRadius: 8,
    padding: "12px 24px",
    fontSize: 14,
    fontFamily: "'DM Mono', monospace",
    fontWeight: 500,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "all 0.15s ease",
    marginBottom: 32,
  },
  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid rgba(74,222,128,0.3)",
    borderTopColor: "#4ade80",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  errorBox: {
    background: "rgba(248,113,113,0.08)",
    border: "1px solid rgba(248,113,113,0.2)",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#f87171",
    fontSize: 13,
    marginBottom: 24,
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
  },
  errorIcon: { flexShrink: 0 },
  results: {
    animation: "fadeUp 0.4s ease both",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 32,
  },
  stat: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 10,
    padding: "16px 12px",
    textAlign: "center",
  },
  statN: {
    display: "block",
    fontFamily: "'Syne', sans-serif",
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 1,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    color: "#475569",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  noNew: {
    color: "#475569",
    fontSize: 14,
    textAlign: "center",
    padding: "24px 0",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#475569",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 10,
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: 8,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: 13,
  },
  at: { color: "#334155" },
  email: {
    color: "#4ade80",
    marginLeft: "auto",
    fontSize: 12,
  },
  footer: {
    position: "relative",
    zIndex: 1,
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "20px 32px",
    color: "#334155",
    fontSize: 12,
    textAlign: "center",
  },
  code: {
    background: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    padding: "2px 6px",
    color: "#64748b",
    fontFamily: "'DM Mono', monospace",
  },
  link: {
    color: "#4ade80",
    textDecoration: "none",
  },
};
