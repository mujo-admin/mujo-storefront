"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Blog / Newsletter",
  "Podcast",
  "Other",
] as const;

const AUDIENCE_TYPES = [
  "Creator / writer",
  "Functional-medicine practitioner",
  "Coach / trainer / therapist",
  "Parent / mama voice",
  "Padel / tennis / performance athlete",
  "Other",
] as const;

const AUDIENCE_SIZES = [
  "Under 1k",
  "1k–5k",
  "5k–25k",
  "25k–100k",
  "100k+",
] as const;

const USES_MUJO = [
  "Yes, daily",
  "Yes, sometimes",
  "Not yet, but I want to",
] as const;

type FormStatus = "idle" | "loading" | "sent" | "error";

/** Resolve the splice mount marker once it's in the DOM. */
function useMountTarget(mountId: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.querySelector<HTMLElement>(`[data-mujo-mount="${mountId}"]`));
  }, [mountId]);
  return el;
}

/**
 * <AmbassadorForm /> — portal-mounted into the /ambassador apply section
 * (replaces the dead Tally button). POSTs to /api/ambassador (Klaviyo
 * `ambassador_applicant` tag + Resend notification to kinga@mujoworld.com).
 */
export function AmbassadorForm() {
  const target = useMountTarget("ambassador-form");
  if (!target) return null;
  return createPortal(<Form />, target);
}

function Form() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      const res = await fetch("/api/ambassador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStatus("sent");
        e.currentTarget.reset();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error. Try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="amb-thanks">
        <h3>Thanks — we got it.</h3>
        <p>
          Kinga reads every application personally. We&rsquo;ll be in touch
          within a few days.
        </p>
        <style>{ambStyles}</style>
      </div>
    );
  }

  return (
    <form className="amb-form" onSubmit={onSubmit} noValidate>
      <div className="amb-row">
        <Field name="name" label="Full name" required />
        <Field name="email" label="Email" type="email" required />
      </div>
      <div className="amb-row">
        <Field name="country" label="Country you're based in" required />
        <Select name="platform" label="Primary platform" options={PLATFORMS} required />
      </div>
      <Field name="handle" label="Your handle or profile link" required />
      <Field name="otherLinks" label="Other platforms / links (optional)" />
      <div className="amb-row">
        <Select
          name="audienceType"
          label="Who's your audience?"
          options={AUDIENCE_TYPES}
          required
        />
        <Select
          name="audienceSize"
          label="Rough audience size"
          options={AUDIENCE_SIZES}
          required
        />
      </div>
      <div className="amb-row">
        <Field
          name="engagement"
          label="Typical engagement, avg likes/views (optional)"
        />
        <Select name="usesMujo" label="Do you already use Mujo?" options={USES_MUJO} required />
      </div>
      <Field
        name="why"
        label="Why Mujo? What would you actually share?"
        multiline
        required
      />
      <Field
        name="extra"
        label="Anything else / a recent post you're proud of (optional)"
        multiline
      />
      <button type="submit" className="amb-submit" disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : "Submit application →"}
      </button>
      {status === "error" && (
        <p role="alert" className="amb-error">
          {errorMsg}
        </p>
      )}
      <style>{ambStyles}</style>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
  multiline = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label htmlFor={`amb-${name}`}>
      {label}
      {required && <span aria-hidden> *</span>}
      {multiline ? (
        <textarea id={`amb-${name}`} name={name} required={required} />
      ) : (
        <input id={`amb-${name}`} name={name} type={type} required={required} />
      )}
    </label>
  );
}

function Select({
  name,
  label,
  options,
  required = false,
}: {
  name: string;
  label: string;
  options: readonly string[];
  required?: boolean;
}) {
  return (
    <label htmlFor={`amb-${name}`}>
      {label}
      {required && <span aria-hidden> *</span>}
      <select id={`amb-${name}`} name={name} required={required} defaultValue="">
        <option value="" disabled>
          Choose one
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// Styled for the sage (--sage) apply section: white labels, light inputs.
const ambStyles = `
  .amb-form { display: flex; flex-direction: column; gap: 16px; max-width: 560px; margin-top: 8px; }
  .amb-form .amb-row { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 600px) {
    .amb-form .amb-row { grid-template-columns: 1fr 1fr; }
  }
  .amb-form label {
    display: flex; flex-direction: column; gap: 6px;
    font-family: var(--f-body);
    font-size: 13px; font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }
  .amb-form label span { color: var(--orange); }
  .amb-form input,
  .amb-form select,
  .amb-form textarea {
    font-family: var(--f-body);
    font-size: 16px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: var(--radius-input, 8px);
    color: var(--ink);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .amb-form textarea { min-height: 96px; resize: vertical; line-height: 1.5; }
  .amb-form input:focus-visible,
  .amb-form select:focus-visible,
  .amb-form textarea:focus-visible {
    border-color: var(--orange);
    box-shadow: 0 0 0 3px rgba(242, 104, 47, 0.25);
  }
  .amb-submit {
    align-self: flex-start;
    margin-top: 4px;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--orange); color: #fff;
    font-family: var(--f-body); font-size: 15px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 14px 28px; border-radius: 100px;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .amb-submit:hover:not(:disabled) {
    background: var(--orange-deep, #d9531f);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(242, 104, 47, 0.3);
  }
  .amb-submit:disabled { opacity: 0.6; cursor: default; }
  .amb-error { color: #ffd9cc; font-size: 14px; margin-top: 4px; }
  .amb-thanks {
    padding: 32px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: var(--radius-card, 16px);
    max-width: 560px;
  }
  .amb-thanks h3 { color: #fff; margin: 0 0 8px; }
  .amb-thanks p { color: rgba(255, 255, 255, 0.8); margin: 0; line-height: 1.6; }
`;
