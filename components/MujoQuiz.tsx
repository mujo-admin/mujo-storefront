/**
 * MujoQuiz.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A two-component quiz module:
 *   <QuizPill />   floating orange button bottom-right of the viewport.
 *                   Appears after 600px scroll. Pulses subtly. Opens the sheet.
 *   <QuizSheet />  bottom-up modal that runs the 6-question Reset Plan flow
 *                   and submits to Klaviyo on email capture.
 *
 * They share state through `useQuizSheet()`. Drop both in your layout, or
 * either one alone (e.g., put <QuizSheet /> in the layout and trigger it
 * from a custom button via the hook).
 *
 * Usage in app/layout.tsx (Next.js App Router):
 *
 *   import { QuizPill, QuizSheet, QuizProvider } from '@/components/MujoQuiz';
 *
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html><body>
 *         <QuizProvider>
 *           {children}
 *           <QuizPill />
 *           <QuizSheet />
 *         </QuizProvider>
 *       </body></html>
 *     );
 *   }
 *
 * To trigger the sheet from your own button (e.g., the mobile menu's
 * "Take the audit" link), use the hook:
 *
 *   import { useQuizSheet } from '@/components/MujoQuiz';
 *   const { open } = useQuizSheet();
 *   <button onClick={open}>Take the audit →</button>
 *
 * Environment variables (add to .env.local and Vercel dashboard):
 *
 *   NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY=XXXXXX
 *     6-character Klaviyo company ID. Account → Settings → API Keys → Public Key.
 *
 *   NEXT_PUBLIC_KLAVIYO_QUIZ_LIST_ID=YYYYYY
 *     List ID for quiz completers. Lists & Segments → [List] → Settings.
 *
 * Tailwind: this component uses arbitrary values for the Mujo brand colors
 * (e.g., bg-[#F2682F]) so it works regardless of your tailwind.config.ts.
 * To clean up the markup, register the brand tokens in your config:
 *
 *   // tailwind.config.ts
 *   theme: {
 *     extend: {
 *       colors: {
 *         'mujo-orange': '#F2682F',
 *         'mujo-orange-deep': '#D85A22',
 *         'mujo-sage': '#2F3D33',
 *         'mujo-sage-light': '#8FA396',
 *         'mujo-cream': '#F3F2E9',
 *         'mujo-ink': '#1A1A1A',
 *       },
 *       fontFamily: {
 *         display: ['var(--font-hanken)', 'sans-serif'],
 *         serif: ['var(--font-instrument-serif)', 'serif'],
 *         mono: ['var(--font-dm-mono)', 'monospace'],
 *       },
 *     },
 *   },
 *
 * Then you can swap `bg-[#F2682F]` for `bg-mujo-orange` everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type Persona = 'performer' | 'burnout' | 'mama' | 'calm';

type Answers = {
  q1?: 'crash' | 'wired' | 'fog' | 'anxious';
  q2?: 'new' | 'mid' | 'long' | 'free';
  q3?: 'performer' | 'burnout' | 'mama' | 'calm';
  q4?: 'focus' | 'calm' | 'energy' | 'sleep';
  q5?: 'broken' | 'fragmented' | 'sleep_anx' | 'okay';
  q6?: 'light' | 'mid' | 'heavy' | 'free';
};

type QuestionTile = {
  primary: string;
  secondary?: string;
  value: string;
};

type Question = {
  id: keyof Answers;
  step: number;
  question: string;
  hint: string;
  tiles: QuestionTile[];
};

type ResultCopy = {
  headline: string; // may include <em> for serif italic accent
  body: string; // may include <strong>
  pdfTitle: string;
};

// ─── Quiz content ───────────────────────────────────────────────────────────

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    step: 1,
    question: 'Which of these sounds most like your energy right now?',
    hint: 'Be honest. This is the first clue to your pattern.',
    tiles: [
      { primary: "I hit a wall at 2pm and can't think past it", secondary: 'Reliable. Predictable. Frustrating.', value: 'crash' },
      { primary: 'Wired and exhausted at the same time', secondary: "Can't focus. Can't switch off.", value: 'wired' },
      { primary: 'Functional but foggy, like 70% showed up', secondary: 'Words take longer. Recall is slower.', value: 'fog' },
      { primary: 'Anxious underneath everything', secondary: 'Even when things are going well.', value: 'anxious' },
    ],
  },
  {
    id: 'q2',
    step: 2,
    question: 'How long have you been relying on caffeine to manage this?',
    hint: 'This tells us how deep the pattern runs.',
    tiles: [
      { primary: 'Less than a year. Gotten worse lately.', value: 'new' },
      { primary: "1 to 3 years. It's become my normal.", value: 'mid' },
      { primary: "3+ years. I can't remember without it.", value: 'long' },
      { primary: "I've already quit. Looking for what fills the gap.", value: 'free' },
    ],
  },
  {
    id: 'q3',
    step: 3,
    question: 'What does your morning look like before 9am?',
    hint: 'No judgement. This shapes which steps matter most.',
    tiles: [
      { primary: 'Coffee first, then I check my metrics', secondary: 'HRV, sleep score, readiness', value: 'performer' },
      { primary: 'Coffee and straight into work', secondary: 'No warm-up. Just output.', value: 'burnout' },
      { primary: 'The morning belongs to everyone else first', secondary: 'Kids, logistics, then maybe me', value: 'mama' },
      { primary: 'I try to start slow. It rarely works.', secondary: 'The day hijacks the intention', value: 'calm' },
    ],
  },
  {
    id: 'q4',
    step: 4,
    question: 'If you could change one thing about how you feel by 10am, what would it be?',
    hint: 'This becomes the goal of your personalized plan.',
    tiles: [
      { primary: "Calm, clear focus that doesn't need a spike", value: 'focus' },
      { primary: 'No anxiety underneath the productivity', value: 'calm' },
      { primary: 'Enough in the tank to still be present at 7pm', value: 'energy' },
      { primary: 'Sleep that actually means something', value: 'sleep' },
    ],
  },
  {
    id: 'q5',
    step: 5,
    question: 'How is your sleep, honestly?',
    hint: 'This is the first place adaptogens usually move the needle.',
    tiles: [
      { primary: "I wake up feeling like I didn't sleep", secondary: '7+ hours and still depleted', value: 'broken' },
      { primary: 'I fall asleep fine but wake up at 3am', secondary: 'Cortisol hijacks the second half of the night', value: 'fragmented' },
      { primary: "My mind won't switch off when I get into bed", secondary: 'Wired tired, even at midnight', value: 'sleep_anx' },
      { primary: 'Sleep is alright. Energy is the real issue.', value: 'okay' },
    ],
  },
  {
    id: 'q6',
    step: 6,
    question: 'How many caffeinated drinks does a typical day include?',
    hint: 'No judgement. This sets the right pace for the transition.',
    tiles: [
      { primary: 'One in the morning', secondary: 'Just the ritual, never more', value: 'light' },
      { primary: 'Two or three across the day', secondary: 'Morning + a 3pm pickup', value: 'mid' },
      { primary: "Four or more, and I'm still tired", secondary: "Cortisol's already running the show", value: 'heavy' },
      { primary: 'Caffeine-free already', secondary: 'Looking for what fills the gap', value: 'free' },
    ],
  },
];

const RESULTS: Record<Persona, ResultCopy> = {
  performer: {
    headline: 'Your pattern is <em>The Dialed-In but Overcaffeinated.</em>',
    body: "You've done the hard work, tracking, training, dialing in the inputs. But caffeine is quietly capping your ceiling. It's keeping cortisol elevated when it should be recovering, disrupting the deep sleep your metrics are measuring, and creating the 3pm wall your zone 2 sessions can't fix. <strong>Your plan targets the HPA axis recalibration your nervous system is ready for.</strong>",
    pdfTitle: 'Your 5-Step Reset Plan, Performer Edition',
  },
  burnout: {
    headline: 'Your pattern is <em>The High-Function Depleted.</em>',
    body: "You've built the discipline. You show up. But underneath the productivity is a nervous system running on stress hormones instead of real energy. Caffeine is masking the depletion rather than addressing it. <strong>Your plan focuses on rebuilding the energy system, not just managing the symptoms.</strong>",
    pdfTitle: 'Your 5-Step Reset Plan, Performance Edition',
  },
  mama: {
    headline: 'Your pattern is <em>The Constant Giver.</em>',
    body: "You give everything to everyone, and your nervous system is running the bill. The caffeine isn't giving you energy. It's preventing the exhaustion from fully landing while keeping cortisol elevated. The anxiety hum, the sleep that doesn't recover you, the 3pm wall, these are connected. <strong>Your plan is built around your actual morning, not someone else's protocol.</strong>",
    pdfTitle: 'Your 5-Step Reset Plan, Mamas Edition',
  },
  calm: {
    headline: 'Your pattern is <em>The Wired-Anxious Achiever.</em>',
    body: "The anxiety sitting underneath everything isn't a character trait. It's a sympathetic nervous system that's been stuck in high gear. Every cup of caffeine activates the same stress response your body is trying to downregulate. <strong>Your plan targets the specific adaptogens that calibrate cortisol without sedating you.</strong>",
    pdfTitle: 'Your 5-Step Reset Plan, Calm Edition',
  },
};

const DISCOUNT_CODE = 'RITUAL15';
const TOTAL_STEPS = 6;

// ─── Klaviyo submission ─────────────────────────────────────────────────────

type KlaviyoPayload = {
  email: string;
  answers: Answers;
  persona: Persona;
  /** "homepage_quiz" | "ritual_landing_quiz" — set by where the quiz was opened. */
  signupSource: string;
};

/**
 * Submit the quiz through the hardened server route (single master list +
 * private key + profile-property upsert + a server-fired "Completed Quiz"
 * event). This replaces the prior client-side Klaviyo call against a separate
 * quiz list, so quiz takers land on the same master list as every other signup
 * and the result flow can be sequenced ahead of the welcome flow.
 */
async function submitToKlaviyo({ email, answers, persona, signupSource }: KlaviyoPayload): Promise<void> {
  const response = await fetch('/api/klaviyo/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      list: 'ritual_quiz',
      source: 'Ritual quiz',
      properties: {
        signup_source: signupSource,
        quiz_profile: persona,
        quiz_completed: true,
        quiz_completed_at: new Date().toISOString(),
        quiz_q1_energy_pattern: answers.q1 ?? null,
        quiz_q2_caffeine_history: answers.q2 ?? null,
        quiz_q3_morning_pattern: answers.q3 ?? null,
        quiz_q4_goal: answers.q4 ?? null,
        quiz_q5_sleep: answers.q5 ?? null,
        quiz_q6_caffeine_load: answers.q6 ?? null,
        discount_code_issued: DISCOUNT_CODE,
        page_url: typeof window !== 'undefined' ? window.location.href : '',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Klaviyo submission failed (${response.status})`);
  }
}

// ─── Context for sharing open/close state ───────────────────────────────────

type QuizContextValue = {
  isOpen: boolean;
  /** Where the quiz was opened from — drives the signup_source on submit. */
  source: string;
  open: (source?: string) => void;
  close: () => void;
  toggle: () => void;
};

const QuizContext = createContext<QuizContextValue | null>(null);

export function QuizProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState('homepage_quiz');

  const open = useCallback((src?: string) => {
    if (src) setSource(src);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((s) => !s), []);

  // Lock body scroll while open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const original = document.body.style.overflow;
    document.body.style.overflow = isOpen ? 'hidden' : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const value = useMemo(() => ({ isOpen, source, open, close, toggle }), [isOpen, source, open, close, toggle]);

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuizSheet(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) {
    throw new Error('useQuizSheet must be used within <QuizProvider>. Wrap your layout in <QuizProvider>.');
  }
  return ctx;
}

// ─── QuizPill ───────────────────────────────────────────────────────────────
// Floating bottom-right entry point. Appears after 600px of scroll.

export function QuizPill() {
  const { open, isOpen } = useQuizSheet();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      if (window.scrollY > 600) {
        setShown(true);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Hide pill when sheet is open (avoid double-tap confusion).
  if (isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes mujoPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(242, 104, 47, 0.45); }
          50% { box-shadow: 0 4px 28px rgba(242, 104, 47, 0.7); }
        }
        .mujo-pill-pulse { animation: mujoPulse 3s ease-in-out 4s infinite; }
        .mujo-pill-pulse:hover { animation: none; }
      `}</style>
      <button
        type="button"
        onClick={() =>
          open(
            typeof window !== 'undefined' && window.location.pathname === '/ritual'
              ? 'ritual_landing_quiz'
              : 'homepage_quiz',
          )
        }
        className={`mujo-pill-pulse fixed z-[270] flex items-center justify-center rounded-full border-0 bg-[#F2682F] font-medium text-white shadow-[0_4px_20px_rgba(242,104,47,0.45)] transition-[opacity,background] duration-300 hover:bg-[#D85A22] ${
          shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 12px))',
          right: '20px',
          padding: '14px 24px',
          fontSize: 13,
          lineHeight: 1,
          color: '#ffffff',
        }}
        aria-label="Get your free Reset Plan"
      >
        Get your free Reset Plan
      </button>
    </>
  );
}

// ─── QuizSheet ──────────────────────────────────────────────────────────────
// Bottom-up modal with the 6-question flow + email gate + result panel.

export function QuizSheet() {
  const { isOpen, close, source } = useQuizSheet();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resultPersona, setResultPersona] = useState<Persona | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when sheet closes (so re-opening starts fresh)
  useEffect(() => {
    if (!isOpen) {
      // small delay to let the close animation play before resetting visible state
      const timer = setTimeout(() => {
        setCurrentStep(1);
        setAnswers({});
        setEmail('');
        setEmailError(false);
        setSubmitError(null);
        setResultPersona(null);
        setSubmitting(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleAnswer = useCallback((questionId: keyof Answers, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS + 1));
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setSubmitting(true);
    setSubmitError(null);

    const persona: Persona = (answers.q3 as Persona) || 'burnout';

    try {
      await submitToKlaviyo({ email: trimmed, answers, persona, signupSource: source });
      setResultPersona(persona);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [email, answers, source]);

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) close();
    },
    [close]
  );

  const progressPct = resultPersona
    ? 100
    : currentStep <= TOTAL_STEPS
    ? Math.round((currentStep / TOTAL_STEPS) * 100)
    : 100;

  const progressLabel = resultPersona
    ? 'Plan ready'
    : currentStep <= TOTAL_STEPS
    ? `Step ${currentStep} of ${TOTAL_STEPS}`
    : '';

  return (
    <>
      <style>{`
        @keyframes mujoQuizIn {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes mujoScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .mujo-step-enter { animation: mujoQuizIn 0.3s ease forwards; }
        .mujo-result-enter { animation: mujoScaleIn 0.4s ease forwards; }
      `}</style>

      {/* Overlay — flex-centered so the sheet sits in the middle of the viewport */}
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className={`fixed inset-0 z-[500] flex items-center justify-center bg-black/55 transition-opacity duration-300 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ padding: '24px 20px' }}
        aria-hidden={!isOpen}
      >
        {/* Sheet — centered, scale-fade in. Inline styles for layout-critical
            dimensions to bypass any Tailwind/cascade weirdness */}
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Free Reset Plan quiz"
          className={`relative z-[510] flex flex-col overflow-y-auto bg-[#2F3D33] transition-[opacity,transform] duration-[300ms] ease-[cubic-bezier(0.34,1.2,0.64,1)] ${
            isOpen
              ? 'scale-100 opacity-100'
              : 'pointer-events-none scale-95 opacity-0'
          }`}
          style={{
            color: '#ffffff',
            width: '100%',
            maxWidth: '540px',
            maxHeight: '88vh',
            borderRadius: 4,
            padding: '28px 22px 28px',
            boxSizing: 'border-box',
          }}
        >
          {/* Close (X) */}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 999,
              border: 0,
              background: 'rgba(255,255,255,0.1)',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>

          {/* Progress */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: 'var(--f-mono), "DM Mono", monospace',
                fontSize: 11,
                letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              {progressLabel}
            </div>
          </div>
          <div
            style={{
              marginBottom: 24,
              height: 2,
              overflow: 'hidden',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.1)',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 999,
                background: '#F2682F',
                width: `${progressPct}%`,
                transition: 'width 500ms cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>

          {/* Quiz steps */}
          {!resultPersona && currentStep <= TOTAL_STEPS && QUESTIONS[currentStep - 1] && (
            <QuestionStep
              question={QUESTIONS[currentStep - 1]!}
              onAnswer={handleAnswer}
              onBack={currentStep > 1 ? handleBack : null}
            />
          )}

          {/* Email gate */}
          {!resultPersona && currentStep === TOTAL_STEPS + 1 && (
            <EmailGate
              email={email}
              onEmailChange={(v) => {
                setEmail(v);
                setEmailError(false);
              }}
              onSubmit={handleSubmit}
              onBack={handleBack}
              error={emailError}
              submitting={submitting}
              submitError={submitError}
            />
          )}

          {/* Result */}
          {resultPersona && <ResultPanel persona={resultPersona} onClose={close} />}
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function QuestionStep({
  question,
  onAnswer,
  onBack,
}: {
  question: Question;
  onAnswer: (id: keyof Answers, value: string) => void;
  onBack: (() => void) | null;
}) {
  return (
    <div className="mujo-step-enter" key={question.id}>
      <h2
        className="font-medium"
        style={{
          color: '#ffffff',
          fontSize: 'clamp(19px, 4.6vw, 23px)',
          lineHeight: 1.32,
          letterSpacing: '-0.01em',
          marginBottom: 8,
        }}
      >
        {question.question}
      </h2>
      <p
        style={{
          color: 'rgba(255,255,255,0.5)',
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 22,
        }}
      >
        {question.hint}
      </p>

      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: 10 }}
      >
        {question.tiles.map((tile, i) => (
          <button
            key={tile.value}
            type="button"
            onClick={() => onAnswer(question.id, tile.value)}
            className="flex items-start text-left transition-all duration-[180ms] hover:border-[#8FA396] hover:bg-[rgba(143,163,150,0.08)]"
            style={{
              gap: 12,
              borderRadius: 4,
              border: '1.5px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              padding: '14px 18px',
              boxSizing: 'border-box',
              minHeight: 56,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                marginTop: 1,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                borderRadius: 2,
                border: '1.5px solid rgba(242,104,47,0.6)',
                background: 'rgba(242,104,47,0.12)',
                color: '#F2682F',
                fontFamily: 'var(--f-mono), "DM Mono", monospace',
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {String.fromCharCode(65 + i)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  color: 'rgba(255,255,255,0.94)',
                }}
              >
                {tile.primary}
              </span>
              {tile.secondary && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 11,
                    lineHeight: 1.4,
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  {tile.secondary}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 border-0 bg-transparent p-1 text-[13px] text-white/35 transition-colors hover:text-white/70"
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        <div className="font-mono text-[11px] tracking-[0.08em] text-white/25">
          {question.step} of {TOTAL_STEPS}
        </div>
      </div>
    </div>
  );
}

function EmailGate({
  email,
  onEmailChange,
  onSubmit,
  onBack,
  error,
  submitting,
  submitError,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error: boolean;
  submitting: boolean;
  submitError: string | null;
}) {
  return (
    <div className="mujo-step-enter">
      <h2
        className="mb-6 text-[clamp(19px,4.6vw,23px)] font-medium leading-[1.32] tracking-[-0.01em]"
        style={{ color: '#ffffff' }}
      >
        Your plan is ready.
      </h2>

      <div
        style={{
          marginBottom: 22,
          borderRadius: 4,
          border: '1px solid rgba(242,104,47,0.25)',
          background: 'rgba(242,104,47,0.1)',
          padding: '16px 18px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            fontSize: 14,
            fontWeight: 500,
            color: '#ffffff',
          }}
        >
          Your 5-Step Nervous System Reset Plan
        </div>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {[
            'The root cause driving your specific pattern',
            'Your personalized morning sequence with timing',
            'The 2 to 3 ingredients most critical for you',
            'One thing to stop doing immediately',
            '15% off your first Mujo Ritual order',
          ].map((line) => (
            <li
              key={line}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <span style={{ marginTop: 2, flexShrink: 0, color: '#8FA396', lineHeight: 0 }} aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.5 3.5L13 4.5" />
                </svg>
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
        }}
        placeholder="your@email.com"
        aria-label="Email address"
        autoComplete="email"
        disabled={submitting}
        className="placeholder:text-white/[0.32] focus:border-[#F2682F]"
        style={{
          marginBottom: 12,
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: 4,
          borderWidth: 1.5,
          borderStyle: 'solid',
          borderColor: error ? '#F2682F' : 'rgba(255,255,255,0.16)',
          background: 'rgba(255,255,255,0.07)',
          padding: '14px 18px',
          fontSize: 15,
          color: '#ffffff',
          outline: 'none',
          opacity: submitting ? 0.6 : 1,
        }}
      />

      {submitError && (
        <p style={{ marginBottom: 8, fontSize: 12, color: '#F2682F' }}>{submitError}</p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="hover:bg-[#D85A22]"
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 999,
          border: 0,
          background: '#F2682F',
          padding: '15px 16px',
          fontSize: 15,
          fontWeight: 500,
          color: '#ffffff',
          cursor: submitting ? 'wait' : 'pointer',
          opacity: submitting ? 0.7 : 1,
          transition: 'background 200ms',
        }}
      >
        {submitting ? 'Sending…' : 'Send me my plan'}
        {!submitting && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div
        style={{
          marginTop: 12,
          textAlign: 'center',
          fontFamily: 'var(--f-mono), "DM Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.04em',
          color: 'rgba(255,255,255,0.32)',
        }}
      >
        No spam. Unsubscribe any time.
      </div>

      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: 0,
            background: 'transparent',
            padding: 4,
            fontSize: 13,
            color: 'rgba(255,255,255,0.42)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.4 : 1,
            transition: 'color 200ms',
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

function ResultPanel({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const result = RESULTS[persona];

  return (
    <div className="mujo-result-enter">
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            background: '#F2682F',
            padding: '7px 14px',
            fontFamily: 'var(--f-mono), "DM Mono", monospace',
            fontSize: 11,
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#ffffff',
          }}
        >
          Plan sent to your inbox
        </span>
      </div>

      <h2
        style={{
          textAlign: 'center',
          fontSize: 'clamp(22px, 5vw, 28px)',
          fontWeight: 500,
          lineHeight: 1.28,
          letterSpacing: '-0.01em',
          color: '#ffffff',
          marginBottom: 16,
        }}
        className="[&_em]:font-serif [&_em]:italic [&_em]:font-normal"
        dangerouslySetInnerHTML={{
          __html: result.headline.replace(
            /<em>/g,
            '<em style="color:#F2682F;font-family:var(--f-serif),Georgia,serif;font-style:italic;font-weight:400;">',
          ),
        }}
      />

      <p
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.72)',
          marginBottom: 24,
        }}
        className="[&_strong]:font-medium [&_strong]:text-white"
        dangerouslySetInnerHTML={{ __html: result.body }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 4,
          border: '1px solid rgba(242,104,47,0.28)',
          background: 'rgba(242,104,47,0.12)',
          padding: '14px 16px',
          marginBottom: 22,
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.7)' }}>
          <strong style={{ display: 'block', marginBottom: 2, fontSize: 14, color: '#ffffff', fontWeight: 500 }}>
            {result.pdfTitle}
          </strong>
          Check your inbox. It's on its way. Usually arrives within 2 minutes.
        </div>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'rgba(255,255,255,0.62)',
          marginBottom: 18,
        }}
      >
        Your discount:{' '}
        <strong
          style={{
            fontFamily: 'var(--f-mono), "DM Mono", monospace',
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '0.08em',
            color: '#FFFFFF',
            background: 'rgba(255,255,255,0.08)',
            padding: '2px 8px',
            borderRadius: 6,
          }}
        >
          {DISCOUNT_CODE}
        </strong>{' '}
        for 15% off at checkout
      </div>

      <a
        href="/products/mujo-ritual"
        onClick={onClose}
        className="transition-colors hover:bg-[#D85A22]"
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 999,
          background: '#F2682F',
          padding: '15px 16px',
          fontSize: 15,
          fontWeight: 500,
          color: '#ffffff',
          textDecoration: 'none',
        }}
      >
        Claim my discount, try Mujo Ritual
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}
