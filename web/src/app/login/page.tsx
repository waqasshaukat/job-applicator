"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "JobPilot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { error: signUpError } = await supabaseClient.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
        } else {
          router.replace("/dashboard");
        }
      }
    } else {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      } else {
        router.replace("/dashboard");
      }
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-4xl grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-[var(--panel)]/80 p-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent-2)]">{appName}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">Apply to dozens of jobs automatically — without the busywork.</h1>
          <p className="mt-4 text-base text-[var(--muted)]">
            Securely log in, connect your Snaphunt account, and watch each automation step live.
          </p>

          <div className="mt-10 flex gap-3">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                mode === "login" ? "bg-white text-black" : "border border-white/20 text-white"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                mode === "signup" ? "bg-white text-black" : "border border-white/20 text-white"
              }`}
            >
              Sign Up
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[var(--panel-2)]/90 p-8">
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm text-[var(--muted)]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-sm text-[var(--muted)]">Password</label>
              <div className="relative mt-2">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pr-12 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="Minimum 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-black hover:text-black/80"
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                    {showPassword ? (
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

            {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            {message ? <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create account"}
            </button>

            <p className="text-xs text-[var(--muted)]">We never store your Snaphunt credentials.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
