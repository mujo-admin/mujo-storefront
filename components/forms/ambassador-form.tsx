"use client";

import { useEffect, useState } from "react";
import { track, identify } from "lib/analytics";
import { createPortal } from "react-dom";

const PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Blog / Newsletter",
  "Podcast",
  "Other",
] as const;

const WHO_YOU_ARE = [
  "Creator",
  "Entrepreneur",
  "Wellness professional",
  "Athlete",
  "Student",
  "Parent",
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

// Required fields in form order, with the words shown when one is missing.
const REQUIRED_FIELDS: readonly (readonly [string, string])[] = [
  ["name", "your full name"],
  ["email", "your email"],
  ["country", "your country"],
  ["platform", "your primary platform"],
  ["profileLink", "a link to your profile"],
  ["whoYouAre", "who you are"],
  ["audienceSize", "your audience size"],
  ["audience", "who your audience is"],
  ["usesMujo", "whether you already use Mujo"],
  ["why", "why Mujo"],
];

const SELECT_FIELDS = new Set([
  "platform",
  "whoYouAre",
  "audienceSize",
  "usesMujo",
]);

// Same limits as the server (app/api/ambassador/route.ts).
const MAX_LENGTHS: Record<string, number> = {
  name: 120,
  country: 80,
  profileLink: 300,
  otherLinks: 400,
  audience: 300,
  engagement: 120,
  why: 2000,
  extra: 2000,
};

// Order the fields appear in, to jump to the first one that needs fixing.
const FIELD_ORDER = [
  "name",
  "email",
  "country",
  "platform",
  "profileLink",
  "otherLinks",
  "whoYouAre",
  "audienceSize",
  "audience",
  "engagement",
  "usesMujo",
  "why",
  "extra",
];

/**
 * People type their profile every which way: a full link, a link without
 * https://, or just a handle. Accept all of them. A bare domain gets
 * https:// in front so the link is clickable in the notification email;
 * a handle is left exactly as typed.
 */
function tidyLink(raw: string): string {
  const value = raw.trim();
  if (!value || /^https?:\/\//i.test(value) || value.startsWith("@")) {
    return value;
  }
  return /^[^\s/@]+\.[a-z]{2,}(\/|$)/i.test(value) ? `https://${value}` : value;
}

/** Resolve the splice mount marker once it's in the DOM. */
function useMountTarget(mountId: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(
      document.querySelector<HTMLElement>(`[data-mujo-mount="${mountId}"]`),
    );
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
  // Field name -> the line shown under that field.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form node BEFORE awaiting — React/the browser nulls
    // e.currentTarget once the event finishes dispatching, so reading it
    // after `await` throws (which previously surfaced as a false "network
    // error" even though the request succeeded).
    const form = e.currentTarget;
    // Trim everything: phone autofill often adds a trailing space, which
    // the server's email check rejects.
    const payload: Record<string, string> = {};
    for (const [key, value] of new FormData(form).entries()) {
      payload[key] = String(value).trim();
    }
    // The form is noValidate (the browser's own bubbles are unstyled), so
    // check here. An unchosen dropdown is absent from FormData entirely.
    if (payload.profileLink)
      payload.profileLink = tidyLink(payload.profileLink);
    const problems: Record<string, string> = {};
    for (const [key] of REQUIRED_FIELDS) {
      if (!payload[key]) {
        problems[key] = SELECT_FIELDS.has(key)
          ? "Please choose one."
          : "Please fill this in.";
      }
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      problems.email = "Please check this email.";
    }
    for (const [key, max] of Object.entries(MAX_LENGTHS)) {
      if ((payload[key] ?? "").length > max) {
        problems[key] = `Please keep this under ${max} characters.`;
      }
    }
    const bad = Object.keys(problems);
    if (bad.length) {
      setFieldErrors(problems);
      setErrorMsg(
        bad.length === 1
          ? "One thing to fix above, marked in red."
          : `${bad.length} things to fix above, marked in red.`,
      );
      setStatus("error");
      const first = FIELD_ORDER.find((key) => problems[key]) ?? bad[0];
      const el = form.querySelector<HTMLElement>(`[name="${first}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    setFieldErrors({});
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/ambassador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const email = String(payload.email ?? "").trim();
        // generate_lead: mirrored to Meta as Lead with the hashed email.
        track("generate_lead", { method: "ambassador" }, { email });
        identify(email);
        form.reset();
        setStatus("sent");
      } else {
        const data = await res.json().catch(() => ({}));
        // Mark the fields the server rejected; never show a raw error code.
        const rejected: Record<string, string> = {};
        if (Array.isArray(data.details)) {
          for (const d of data.details as { path?: unknown[] }[]) {
            const key = String(d.path?.[0]);
            if (FIELD_ORDER.includes(key)) {
              rejected[key] =
                "Please check this. It may be missing or too long.";
            }
          }
        }
        setFieldErrors(rejected);
        setErrorMsg(
          Object.keys(rejected).length
            ? "Something above needs another look, marked in red."
            : "Something went wrong on our side. Please try again, or email hello@mujoworld.com.",
        );
        setStatus("error");
      }
    } catch {
      setErrorMsg("Couldn't send just now. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="amb-thanks">
        <h3>Thanks for your application.</h3>
        <p>We&rsquo;ll be in touch soon.</p>
        <style>{ambStyles}</style>
      </div>
    );
  }

  return (
    <form className="amb-form" onSubmit={onSubmit} noValidate>
      {/* Honeypot — hidden from people, catches naive bots. Real submissions
          leave this blank; the server silently drops any submission that
          fills it. */}
      <div className="amb-hp" aria-hidden="true">
        <label htmlFor="amb-website">
          Website (leave blank)
          <input
            id="amb-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="amb-row">
        <Field errors={fieldErrors} name="name" label="Full name" required />
        <Field
          errors={fieldErrors}
          name="email"
          label="Email"
          type="email"
          required
        />
      </div>
      <div className="amb-row">
        <Field
          errors={fieldErrors}
          name="country"
          label="Country you're based in"
          required
        />
        <Select
          errors={fieldErrors}
          name="platform"
          label="Primary platform"
          options={PLATFORMS}
          required
        />
      </div>
      <Field
        errors={fieldErrors}
        name="profileLink"
        label="Your profile"
        hint="A link or just your handle is fine, for example instagram.com/yourhandle or @yourhandle. No need to type https://."
        placeholder="instagram.com/yourhandle"
        required
      />
      <Field
        errors={fieldErrors}
        name="otherLinks"
        label="Other platforms or links"
        placeholder="Any other profiles you'd like us to see"
        optional
      />
      <div className="amb-row">
        <Select
          errors={fieldErrors}
          name="whoYouAre"
          label="Who are you?"
          options={WHO_YOU_ARE}
          required
        />
        <Select
          errors={fieldErrors}
          name="audienceSize"
          label="Rough audience size"
          options={AUDIENCE_SIZES}
          required
        />
      </div>
      <Field
        errors={fieldErrors}
        name="audience"
        label="Who's your audience?"
        placeholder="e.g. busy parents into clean wellness, padel players, biohackers"
        required
      />
      <div className="amb-row">
        <Field
          errors={fieldErrors}
          name="engagement"
          label="Typical engagement (avg likes or views per post)"
          optional
        />
        <Select
          errors={fieldErrors}
          name="usesMujo"
          label="Do you already use Mujo?"
          options={USES_MUJO}
          required
        />
      </div>
      <Field
        errors={fieldErrors}
        name="why"
        label="Why Mujo? What would you actually share?"
        multiline
        required
      />
      <Field
        errors={fieldErrors}
        name="extra"
        label="Anything else, or a recent post you're proud of"
        multiline
        optional
      />
      <button
        type="submit"
        className="amb-submit"
        disabled={status === "loading"}
      >
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
  placeholder,
  required = false,
  optional = false,
  multiline = false,
  hint,
  errors,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  multiline?: boolean;
  hint?: string;
  errors: Record<string, string>;
}) {
  const error = errors[name];
  return (
    <label
      htmlFor={`amb-${name}`}
      className={error ? "amb-invalid" : undefined}
    >
      <span className="amb-label-text">
        {label}
        {required && <span className="amb-req">*</span>}
        {optional && <span className="amb-optional"> (optional)</span>}
      </span>
      {multiline ? (
        <textarea
          id={`amb-${name}`}
          name={name}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? true : undefined}
        />
      ) : (
        <input
          id={`amb-${name}`}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? true : undefined}
        />
      )}
      {hint && !error && <span className="amb-hint">{hint}</span>}
      {error && (
        <span className="amb-field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Select({
  name,
  label,
  options,
  required = false,
  errors,
}: {
  name: string;
  label: string;
  options: readonly string[];
  required?: boolean;
  errors: Record<string, string>;
}) {
  const error = errors[name];
  return (
    <label
      htmlFor={`amb-${name}`}
      className={error ? "amb-invalid" : undefined}
    >
      <span className="amb-label-text">
        {label}
        {required && <span className="amb-req">*</span>}
      </span>
      <select
        id={`amb-${name}`}
        name={name}
        required={required}
        defaultValue=""
      >
        <option value="" disabled>
          Choose one…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <span className="amb-field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

// Styled for the sage (--sage) apply section: white labels, light inputs.
// Each label is a grid (label-text row flexes, input pinned to the bottom)
// so side-by-side boxes always align even when one label wraps to two lines.
const ambStyles = `
  .amb-form { display: flex; flex-direction: column; gap: 26px; max-width: 560px; margin-top: 8px; }
  .amb-form .amb-row { display: grid; grid-template-columns: 1fr; gap: 26px; align-items: stretch; }
  @media (min-width: 600px) {
    .amb-form .amb-row { grid-template-columns: 1fr 1fr; }
  }
  .amb-hp {
    position: absolute !important;
    width: 1px; height: 1px;
    overflow: hidden; clip: rect(0 0 0 0);
    white-space: nowrap; border: 0; padding: 0; margin: -1px;
  }
  .amb-form label {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 7px;
    align-content: start;
  }
  /* Side-by-side fields share their three rows (label, box, message), so the
     boxes stay level when one label wraps or one field shows a message. */
  .amb-form .amb-row { grid-template-rows: auto auto auto; row-gap: 0; }
  .amb-form .amb-row label {
    grid-row: span 3;
    grid-template-rows: subgrid;
    align-content: stretch;
  }
  .amb-form .amb-row label .amb-label-text { align-self: end; }
  @media (max-width: 599px) {
    .amb-form .amb-row label + label { margin-top: 26px; }
  }
  .amb-hint { font-family: var(--f-body); font-size: 13px; line-height: 1.4; color: rgba(255, 255, 255, 0.7); }
  .amb-field-error { font-family: var(--f-body); font-size: 13.5px; line-height: 1.4; font-weight: 600; color: #ffb59e; }
  .amb-form .amb-invalid input,
  .amb-form .amb-invalid select,
  .amb-form .amb-invalid textarea { border: 2px solid #ff8a66; }
  .amb-label-text {
    font-family: var(--f-body);
    font-size: 14px; font-weight: 600;
    line-height: 1.3;
    color: rgba(255, 255, 255, 0.94);
  }
  .amb-req { color: var(--accent-text); margin-left: 3px; }
  .amb-optional { font-weight: 400; color: rgba(255, 255, 255, 0.55); }
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
  .amb-form input::placeholder,
  .amb-form textarea::placeholder { color: #9b968f; }
  .amb-form textarea { min-height: 96px; resize: vertical; line-height: 1.5; }
  .amb-form input:focus-visible,
  .amb-form select:focus-visible,
  .amb-form textarea:focus-visible {
    border-color: var(--orange);
    box-shadow: 0 0 0 3px rgba(174, 67, 41, 0.25);
  }
  .amb-submit {
    align-self: flex-start;
    margin-top: 2px;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--btn-bg); color: var(--btn-fg);
    font-family: var(--f-body); font-size: 15px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 14px 28px; border-radius: 100px;
    transition: background 0.2s, transform 0.2s, box-shadow 0.2s;
  }
  .amb-submit:hover:not(:disabled) {
    background: var(--orange-deep, #d9531f);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(174, 67, 41, 0.3);
  }
  .amb-submit:disabled { opacity: 0.6; cursor: default; }
  .amb-error { color: #ffb59e; font-size: 15px; font-weight: 600; margin-top: 2px; }
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
