"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "rate_limited" | "error"
  >("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;
    setStatus("loading");
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        setStatus("rate_limited");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      router.push(`/account/login/sent?email=${encodeURIComponent(email)}`);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label htmlFor="login-email" className="login-label">
        Email
      </label>
      <input
        id="login-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === "loading"}
        className="login-input"
      />

      {status === "rate_limited" ? (
        <p className="login-error">
          Too many requests. Please try again in an hour.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="login-error">Something went wrong. Please try again.</p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="login-submit"
      >
        {status === "loading" ? "Sending…" : "Send me a login link"}
      </button>

      <p className="login-secure">
        Secure &middot; one-time use &middot; 7-day expiry
      </p>

      <style>{`
        .login-form { margin-top: 4px; }
        .login-label {
          display: block;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--mute);
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .login-input {
          width: 100%;
          padding: 13px 14px;
          font-family: inherit;
          font-size: 15px;
          background: var(--cream);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--ink);
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .login-input:focus {
          outline: none;
          border-color: var(--orange);
          box-shadow: 0 0 0 3px rgba(242, 104, 47, 0.15);
        }
        .login-input:disabled { opacity: 0.6; cursor: not-allowed; }
        .login-error {
          font-size: 13px;
          color: #b91c1c;
          margin: 8px 0 0;
          line-height: 1.4;
        }
        .login-submit {
          width: 100%;
          background: var(--orange);
          color: #fff;
          border: none;
          cursor: pointer;
          padding: 14px 24px;
          border-radius: 100px;
          font-family: var(--f-body);
          font-size: 14px;
          font-weight: 500;
          margin-top: 18px;
          transition: background 0.15s, opacity 0.15s;
        }
        .login-submit:hover:not(:disabled) { background: var(--orange-deep); }
        .login-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .login-secure {
          text-align: center;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--mute);
          margin: 14px 0 0;
        }
      `}</style>
    </form>
  );
}
