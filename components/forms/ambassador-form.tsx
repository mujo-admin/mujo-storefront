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

const FIELD_WORDS: Record<string, string> = {
  ...Object.fromEntries(REQUIRED_FIELDS),
  otherLinks: "other platforms or links",
  engagement: "typical engagement",
  extra: "anything else",
};

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
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
    const missing = REQUIRED_FIELDS.filter(([key]) => !payload[key]);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email ?? "");
    if (missing.length || !emailOk) {
      const firstBad = missing[0]?.[0] ?? "email";
      setErrorMsg(
        missing.length
          ? `Please add ${joinWords(missing.map(([, words]) => words))}.`
          : "That email doesn't look right. Please check it.",
      );
      setStatus("error");
      form.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus();
      return;
    }
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
        // Name the fields the server rejected; never show a raw error code.
        const fields: string[] = Array.isArray(data.details)
          ? [
              ...new Set<string>(
                data.details
                  .map(
                    (d: { path?: unknown[] }) =>
                      FIELD_WORDS[String(d.path?.[0])],
                  )
                  .filter(Boolean),
              ),
            ]
          : [];
        setErrorMsg(
          fields.length
            ? `Please check ${joinWords(fields)}. It may be missing or too long.`
            : "Something went wrong. Please try again, or email hello@mujoworld.com.",
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
        <Field name="name" label="Full name" required />
        <Field name="email" label="Email" type="email" required />
      </div>
      <div className="amb-row">
        <Field name="country" label="Country you're based in" required />
        <Select
          name="platform"
          label="Primary platform"
          options={PLATFORMS}
          required
        />
      </div>
      <Field
        name="profileLink"
        label="Link to your profile"
        type="url"
        placeholder="https://instagram.com/yourhandle"
        required
      />
      <Field
        name="otherLinks"
        label="Other platforms or links"
        placeholder="Any other profiles you'd like us to see"
        optional
      />
      <div className="amb-row">
        <Select
          name="whoYouAre"
          label="Who are you?"
          options={WHO_YOU_ARE}
          required
        />
        <Select
          name="audienceSize"
          label="Rough audience size"
          options={AUDIENCE_SIZES}
          required
        />
      </div>
      <Field
        name="audience"
        label="Who's your audience?"
        placeholder="e.g. busy parents into clean wellness, padel players, biohackers"
        required
      />
      <div className="amb-row">
        <Field
          name="engagement"
          label="Typical engagement (avg likes or views per post)"
          optional
        />
        <Select
          name="usesMujo"
          label="Do you already use Mujo?"
          options={USES_MUJO}
          required
        />
      </div>
      <Field
        name="why"
        label="Why Mujo? What would you actually share?"
        multiline
        required
      />
      <Field
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
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  optional?: boolean;
  multiline?: boolean;
}) {
  return (
    <label htmlFor={`amb-${name}`}>
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
        />
      ) : (
        <input
          id={`amb-${name}`}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
        />
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
  }
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
  .amb-error { color: #ffd9cc; font-size: 14px; margin-top: 2px; }
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
