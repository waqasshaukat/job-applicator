"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "JobPilot";

type StreamStatus = "idle" | "running" | "terminated" | "error";

export default function DashboardPage() {
  const router = useRouter();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [provider, setProvider] = useState("snaphunt");
  const [showModal, setShowModal] = useState(false);
  const [snaphuntEmail, setSnaphuntEmail] = useState("");
  const [snaphuntPassword, setSnaphuntPassword] = useState("");
  const [showSnaphuntPassword, setShowSnaphuntPassword] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionToken(data.session.access_token);
      setCheckingSession(false);
    });
  }, [router]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const canStart = useMemo(() => {
    return !!sessionToken && provider === "snaphunt" && !jobId && !starting;
  }, [sessionToken, provider, jobId, starting]);

  const startJob = async () => {
    if (!sessionToken) return;
    setStarting(true);
    setLogs([]);
    setStreamStatus("running");

    try {
      const response = await fetch("/api/jobs/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          provider,
          email: snaphuntEmail,
          password: snaphuntPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start job.");
      }

      const data = await response.json();
      setJobId(data.jobId);
      setShowModal(false);
      setSnaphuntPassword("");
      setStreamStatus("running");
    } catch (error) {
      setStreamStatus("error");
      setLogs((prev) => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setStarting(false);
    }
  };

  const endJob = async () => {
    if (!sessionToken || !jobId) return;
    setEnding(true);
    try {
      await fetch(`/api/jobs/${jobId}/end`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
    } finally {
      setEnding(false);
    }
  };

  useEffect(() => {
    if (!sessionToken || !jobId) return;

    const controller = new AbortController();

    const streamLogs = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/stream`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Unable to stream logs.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let event = "message";
            let data = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                event = line.replace("event:", "").trim();
              }
              if (line.startsWith("data:")) {
                data += line.replace("data:", "").trim();
              }
            }

            const payload = data.replace(/\\n/g, "\n");
            if (event === "log") {
              setLogs((prev) => [...prev, payload]);
            }
            if (event === "status" && payload === "terminated") {
              setStreamStatus("terminated");
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStreamStatus("error");
          setLogs((prev) => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
        }
      }
    };

    streamLogs();

    return () => {
      controller.abort();
    };
  }, [sessionToken, jobId]);

  const handleSignOut = async () => {
    await supabaseClient.auth.signOut();
    router.replace("/login");
  };

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center text-[var(--muted)]">
        Checking session...
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent-2)]">{appName}</p>
            <h1 className="mt-2 text-3xl font-semibold">Automation Control Room</h1>
            <p className="text-sm text-[var(--muted)]">Select a platform, start the run, and watch the logs live.</p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-white/60"
          >
            Sign out
          </button>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-8">
            <h2 className="text-xl font-semibold">Where should JobPilot apply?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Choose the platform you want to automate.</p>

            <div className="mt-6 space-y-4">
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <input
                  type="radio"
                  name="provider"
                  value="snaphunt"
                  checked={provider === "snaphunt"}
                  onChange={() => setProvider("snaphunt")}
                  className="mt-1"
                />
                <div>
                  <p className="text-base font-semibold">Snaphunt</p>
                  <p className="text-sm text-[var(--muted)]">
                    You must have an account and an updated profile on Snaphunt.
                  </p>
                </div>
              </label>
            </div>

            <button
              onClick={() => setShowModal(true)}
              disabled={!canStart}
              className="mt-6 w-full rounded-2xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {jobId ? "Job in progress" : "Start Job"}
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[var(--panel-2)]/90 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Live logs</h2>
              <button
                onClick={endJob}
                disabled={!jobId || streamStatus !== "running" || ending}
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition hover:border-white/60 disabled:opacity-40"
              >
                {ending ? "Ending..." : streamStatus === "terminated" ? "Ended" : "End"}
              </button>
            </div>
            <div className="mt-4 h-[360px] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-sm leading-relaxed">
              {logs.length === 0 ? (
                <p className="text-[var(--muted)]">Logs will appear here after the job starts.</p>
              ) : (
                logs.map((line, index) => (
                  <div key={`${index}-${line}`} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
            {streamStatus === "terminated" ? (
              <p className="mt-3 text-sm text-[var(--accent)]">Job terminated successfully. End button disabled.</p>
            ) : null}
          </div>
        </section>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--panel)]/95 p-6">
            <h3 className="text-xl font-semibold">Snaphunt credentials</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              These credentials are used only for logging in this time and are not stored.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm text-[var(--muted)]">Snaphunt email</label>
                <input
                  type="email"
                  value={snaphuntEmail}
                  onChange={(event) => setSnaphuntEmail(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="email@snaphunt.com"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--muted)]">Snaphunt password</label>
                <div className="relative mt-2">
                  <input
                    type={showSnaphuntPassword ? "text" : "password"}
                    value={snaphuntPassword}
                    onChange={(event) => setSnaphuntPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-12 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSnaphuntPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black/80"
                    aria-label={showSnaphuntPassword ? "Hide password" : "Show password"}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {showSnaphuntPassword ? (
                        <>
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      ) : (
                        <>
                          <path d="M3 3l18 18" />
                          <path d="M10.5 10.5a2.5 2.5 0 0 0 3 3" />
                          <path d="M6.5 6.5C4 8.5 2 12 2 12s3.5 6 10 6c2.2 0 4.1-.6 5.8-1.5" />
                          <path d="M9.9 4.2A10.2 10.2 0 0 1 12 4c6.5 0 10 8 10 8a18.7 18.7 0 0 1-2.3 3.3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl border border-white/20 px-4 py-3 text-sm text-white/80"
              >
                Cancel
              </button>
              <button
                onClick={startJob}
                disabled={starting || !snaphuntEmail || !snaphuntPassword}
                className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
