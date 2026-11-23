"use client";

import { useState } from "react";

const TOPICS = [
  "General question",
  "Product question",
  "Order issue",
  "Subscription help",
  "Wholesale / retail",
  "Partnership",
  "Press",
] as const;

type FormStatus = "idle" | "loading" | "sent" | "error";

/**
 * <ContactForm /> — POST → /api/contact (sends a Resend notification to
 * hello@mujoworld.com; adds the sender to the Klaviyo list only when they tick
 * the "send me Mujo news" box).
 */
export function ContactForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const fd = new FormData(e.currentTarget);
    const { marketingConsent, ...fields } = Object.fromEntries(fd.entries());
    const payload = { ...fields, marketingConsent: marketingConsent === "on" };
    try {
      const res = await fetch("/api/contact", {
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
      <div
        role="status"
        style={{
          padding: 32,
          background: "var(--orange-soft)",
          borderRadius: "var(--radius-card)",
          textAlign: "center",
        }}
      >
        <h3 style={{ marginBottom: 8 }}>Thanks — we got it.</h3>
        <p style={{ color: "var(--ink-soft)", margin: 0 }}>
          A real human will reply within a working day.
        </p>
      </div>
    );
  }

  return (
    <form className="mujo-contact-form" onSubmit={onSubmit} noValidate>
      <div className="row">
        <Field name="name" label="Name" required />
        <Field name="email" label="Email" type="email" required />
      </div>
      <div className="row">
        <SelectField name="topic" label="Topic" options={TOPICS} required />
        <Field name="orderNumber" label="Order number (optional)" />
      </div>
      <Field
        name="message"
        label="Message"
        multiline
        required
      />
      <label className="consent" htmlFor="marketingConsent">
        <input id="marketingConsent" name="marketingConsent" type="checkbox" />
        <span>Also send me Mujo news and recipes by email (optional)</span>
      </label>
      {/* Honeypot: hidden from people and screen readers; only bots fill it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label htmlFor="company">
          Company
          <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button
        type="submit"
        className="cta-primary"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Sending…" : "Send message"}
      </button>
      {status === "error" && (
        <p
          role="alert"
          style={{
            color: "var(--accent-text)",
            fontSize: 14,
            marginTop: 12,
          }}
        >
          {errorMsg}
        </p>
      )}
      <style>{`
        .mujo-contact-form { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }
        .mujo-contact-form .row { display: grid; grid-template-columns: 1fr; gap: 16px; }
        @media (min-width: 640px) {
          .mujo-contact-form .row { grid-template-columns: 1fr 1fr; }
        }
        .mujo-contact-form label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          color: var(--ink-soft);
        }
        .mujo-contact-form input,
        .mujo-contact-form select,
        .mujo-contact-form textarea {
          font-family: var(--f-body);
          font-size: 16px;
          padding: 12px 14px;
          background: #fff;
          border: 1px solid var(--line);
          border-radius: var(--radius-input);
          color: var(--ink);
          outline: none;
          transition: border-color 0.2s;
        }
        .mujo-contact-form textarea { min-height: 140px; resize: vertical; }
        .mujo-contact-form label.consent {
          flex-direction: row;
          align-items: flex-start;
          gap: 10px;
          font-size: 14px;
          font-weight: 400;
          cursor: pointer;
        }
        .mujo-contact-form label.consent input {
          width: 18px;
          height: 18px;
          padding: 0;
          margin: 2px 0 0;
          flex: 0 0 auto;
          accent-color: var(--brown, #2A1810);
        }
        .mujo-contact-form input:focus-visible,
        .mujo-contact-form select:focus-visible,
        .mujo-contact-form textarea:focus-visible {
          border-color: var(--orange-deep);
        }
      `}</style>
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
    <label htmlFor={name}>
      {label}
      {required && <span aria-hidden> *</span>}
      {multiline ? (
        <textarea id={name} name={name} required={required} />
      ) : (
        <input id={name} name={name} type={type} required={required} />
      )}
    </label>
  );
}

function SelectField({
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
    <label htmlFor={name}>
      {label}
      {required && <span aria-hidden> *</span>}
      <select id={name} name={name} required={required} defaultValue="">
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
