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
 *         display: ['var(--font-general-sans)', 'sans-serif'],
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
  emoji: string;
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
      { emoji: '📉', primary: "I hit a wall at 2pm and can't think past it", secondary: 'Reliable. Predictable. Frustrating.', value: 'crash' },
      { emoji: '⚡', primary: 'Wired and exhausted at the same time', secondary: "Can't focus. Can't switch off.", value: 'wired' },
      { emoji: '🌫️', primary: 'Functional but foggy, like 70% showed up', secondary: 'Words take longer. Recall is slower.', value: 'fog' },
      { emoji: '😤', primary: 'Anxious underneath everything', secondary: 'Even when things are going well.', value: 'anxious' },
    ],
  },
  {
    id: 'q2',
    step: 2,
    question: 'How long have you been relying on caffeine to manage this?',
    hint: 'This tells us how deep the pattern runs.',
    tiles: [
      { emoji: '📅', primary: 'Less than a year. Gotten worse lately.', value: 'new' },
      { emoji: '🗓️', primary: "1 to 3 years. It's become my normal.", value: 'mid' },
      { emoji: '⏳', primary: "3+ years. I can't remember without it.", value: 'long' },
      { emoji: '🌱', primary: "I've already quit. Looking for what fills the gap.", value: 'free' },
    ],
  },
  {
    id: 'q3',
    step: 3,
    question: 'What does your morning look like before 9am?',
    hint: 'No judgement. This shapes which steps matter most.',
    tiles: [
      { emoji: '📊', primary: 'Coffee first, then I check my metrics', secondary: 'HRV, sleep score, readiness', value: 'performer' },
      { emoji: '💻', primary: 'Coffee and straight into work', secondary: 'No warm-up. Just output.', value: 'burnout' },
      { emoji: '👶', primary: 'The morning belongs to everyone else first', secondary: 'Kids, logistics, then maybe me', value: 'mama' },
      { emoji: '🧘', primary: 'I try to start slow. It rarely works.', secondary: 'The day hijacks the intention', value: 'calm' },
    ],
  },
  {
    id: 'q4',
    step: 4,
    question: 'If you could change one thing about how you feel by 10am, what would it be?',
    hint: 'This becomes the goal of your personalized plan.',
    tiles: [
      { emoji: '🎯', primary: "Calm, clear focus that doesn't need a spike", value: 'focus' },
      { emoji: '😌', primary: 'No anxiety underneath the productivity', value: 'calm' },
      { emoji: '⚡', primary: 'Enough in the tank to still be present at 7pm', value: 'energy' },
      { emoji: '🌙', primary: 'Sleep that actually means something', value: 'sleep' },
    ],
  },
  {
    id: 'q5',
    step: 5,
    question: 'How is your sleep, honestly?',
    hint: 'This is the first place adaptogens usually move the needle.',
    tiles: [
      { emoji: '🥱', primary: "I wake up feeling like I didn't sleep", secondary: '7+ hours and still depleted', value: 'broken' },
      { emoji: '😴', primary: 'I fall asleep fine but wake up at 3am', secondary: 'Cortisol hijacks the second half of the night', value: 'fragmented' },
      { emoji: '🧠', primary: "My mind won't switch off when I get into bed", secondary: 'Wired tired, even at midnight', value: 'sleep_anx' },
      { emoji: '🌟', primary: 'Sleep is alright. Energy is the real issue.', value: 'okay' },
    ],
  },
  {
    id: 'q6',
    step: 6,
    question: 'How many caffeinated drinks does a typical day include?',
    hint: 'No judgement. This sets the right pace for the transition.',
    tiles: [
      { emoji: '☕', primary: 'One in the morning', secondary: 'Just the ritual, never more', value: 'light' },
      { emoji: '☕☕', primary: 'Two or three across the day', secondary: 'Morning + a 3pm pickup', value: 'mid' },
      { emoji: '☕☕☕', primary: "Four or more, and I'm still tired", secondary: "Cortisol's already running the show", value: 'heavy' },
      { emoji: '🌱', primary: 'Caffeine-free already', secondary: 'Looking for what fills the gap', value: 'free' },
    ],
  },
];

const RESULTS: Record<Persona, ResultCopy> = {
  performer: {
    headline: 'Your pattern is <em>The Optimized but Overcaffeinated.</em>',
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
};

async function submitToKlaviyo({ email, answers, persona }: KlaviyoPayload): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY;
  const listId = process.env.NEXT_PUBLIC_KLAVIYO_QUIZ_LIST_ID;

  const profileProperties = {
    source: 'homepage',
    source_page: 'homepage_quiz',
    quiz_completed: true,
    quiz_completed_at: new Date().toISOString(),
    quiz_profile: persona,
    quiz_q1_energy_pattern: answers.q1 ?? null,
    quiz_q2_caffeine_history: answers.q2 ?? null,
    quiz_q3_morning_pattern: answers.q3 ?? null,
    quiz_q4_goal: answers.q4 ?? null,
    quiz_q5_sleep: answers.q5 ?? null,
    quiz_q6_caffeine_load: answers.q6 ?? null,
    discount_code_issued: DISCOUNT_CODE,
    page_url: typeof window !== 'undefined' ? window.location.href : '',
  };

  if (!publicKey || !listId) {
    // Dev mode: log payload so you can verify before going live.
    console.log('[Klaviyo DEV] payload:', { email, properties: profileProperties });
    console.log('[Klaviyo DEV] Set NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY and NEXT_PUBLIC_KLAVIYO_QUIZ_LIST_ID to enable.');
    return;
  }

  const response = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${publicKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      revision: '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'subscription',
        attributes: {
          profile: {
            data: {
              type: 'profile',
              attributes: {
                email,
                properties: profileProperties,
              },
            },
          },
          custom_source: 'Homepage Quiz',
        },
        relationships: {
          list: { data: { type: 'list', id: listId } },
        },
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
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const QuizContext = createContext<QuizContextValue | null>(null);

export function QuizProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
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

  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

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
        onClick={open}
        className={`mujo-pill-pulse fixed z-[270] flex items-center gap-2 rounded-full border-0 bg-[#F2682F] px-5 py-3 pl-3.5 text-[13px] font-medium text-white shadow-[0_4px_20px_rgba(242,104,47,0.45)] transition-[opacity,background] duration-300 hover:bg-[#D85A22] sm:bottom-[18px] sm:right-[18px] ${
          shown ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          bottom: 'max(14px, env(safe-area-inset-bottom))',
          right: '12px',
        }}
        aria-label="Get your free Reset Plan"
      >
        <span className="text-base leading-none" aria-hidden="true">
          🍄
        </span>
        Get your free Reset Plan
      </button>
    </>
  );
}

// ─── QuizSheet ──────────────────────────────────────────────────────────────
// Bottom-up modal with the 6-question flow + email gate + result panel.

export function QuizSheet() {
  const { isOpen, close } = useQuizSheet();
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
      await submitToKlaviyo({ email: trimmed, answers, persona });
      setResultPersona(persona);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [email, answers]);

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
    ? 'Plan ready ✓'
    : currentStep <= TOTAL_STEPS
    ? `Step ${currentStep} of ${TOTAL_STEPS}`
    : 'Almost there';

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

      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className={`fixed inset-0 z-[500] bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Sheet */}
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Free Reset Plan quiz"
          className={`fixed inset-x-0 bottom-0 z-[510] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-[#2F3D33] px-6 pb-10 pt-2.5 transition-transform duration-[400ms] ease-[cubic-bezier(0.34,1.06,0.64,1)] sm:bottom-6 sm:left-1/2 sm:right-auto sm:max-w-[540px] sm:rounded-3xl sm:px-8 sm:pb-9 ${
            isOpen
              ? 'translate-y-0 sm:-translate-x-1/2 sm:translate-y-0'
              : 'translate-y-full sm:-translate-x-1/2 sm:translate-y-full'
          }`}
        >
          {/* Drag handle */}
          <div className="mx-auto mb-6 mt-3.5 h-1 w-9 rounded-sm bg-white/[0.18]" aria-hidden="true" />

          {/* Progress */}
          <div className="mb-2">
            <div className="font-mono text-[11px] tracking-[0.07em] text-white/30">{progressLabel}</div>
          </div>
          <div className="mb-6 h-0.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#F2682F] transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: `${progressPct}%` }}
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
      <h2 className="mb-1.5 text-[clamp(18px,4.5vw,22px)] font-medium leading-[1.35] tracking-[-0.01em] text-white">
        {question.question}
      </h2>
      <p className="mb-[22px] text-[13px] leading-[1.5] text-white/40">{question.hint}</p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {question.tiles.map((tile) => (
          <button
            key={tile.value}
            type="button"
            onClick={() => onAnswer(question.id, tile.value)}
            className="flex items-start gap-2.5 rounded-2xl border-[1.5px] border-white/10 bg-white/[0.05] p-[13px] py-3.5 text-left transition-all duration-[180ms] hover:border-[#8FA396] hover:bg-[rgba(143,163,150,0.08)]"
          >
            <span className="mt-px shrink-0 text-lg leading-tight" aria-hidden="true">
              {tile.emoji}
            </span>
            <span>
              <span className="block text-[13px] font-medium leading-[1.38] text-white/85">{tile.primary}</span>
              {tile.secondary && (
                <span className="mt-[3px] block text-[11px] leading-[1.3] text-white/[0.36]">{tile.secondary}</span>
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
      <h2 className="mb-1.5 text-[clamp(18px,4.5vw,22px)] font-medium leading-[1.35] tracking-[-0.01em] text-white">
        We've built your plan.
      </h2>
      <p className="mb-[22px] text-[13px] leading-[1.5] text-white/40">
        Based on your answers, here's what we're sending you:
      </p>

      <div className="mb-[18px] rounded-2xl border border-[rgba(242,104,47,0.25)] bg-[rgba(242,104,47,0.1)] px-[18px] py-4">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-white">
          <span aria-hidden="true">📋</span>
          Your 5-Step Nervous System Reset Plan
        </div>
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {[
            'The root cause driving your specific pattern',
            'Your personalized morning sequence with timing',
            'The 2 to 3 ingredients most critical for you',
            'One thing to stop doing immediately',
            '15% off your first Mujo Ritual order',
          ].map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-[13px] leading-[1.45] text-white/65">
              <span className="mt-px shrink-0 text-[#8FA396]" aria-hidden="true">
                ✓
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
        className={`mb-2.5 w-full rounded-2xl border-[1.5px] bg-white/[0.07] px-[18px] py-3.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/[0.28] focus:border-[#F2682F] disabled:opacity-60 ${
          error ? 'border-[#F2682F]' : 'border-white/[0.14]'
        }`}
      />

      {submitError && <p className="mb-2 text-[12px] text-[#F2682F]">{submitError}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-full border-0 bg-[#F2682F] px-4 py-[15px] text-[15px] font-medium text-white transition-[background,transform] hover:-translate-y-px hover:bg-[#D85A22] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {submitting ? 'Sending…' : 'Send me my plan'}
        {!submitting && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="mt-2 text-center font-mono text-[11px] tracking-[0.04em] text-white/25">
        No spam. Unsubscribe any time.
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex items-center gap-1.5 border-0 bg-transparent p-1 text-[13px] text-white/35 transition-colors hover:text-white/70 disabled:opacity-40"
        >
          ← Back
        </button>
        <div className="font-mono text-[11px] tracking-[0.08em] text-white/25">Almost there</div>
      </div>
    </div>
  );
}

function ResultPanel({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const result = RESULTS[persona];

  return (
    <div className="mujo-result-enter">
      <span className="mb-3 block text-center text-[38px]" aria-hidden="true">
        ✅
      </span>
      <div className="text-center">
        <span className="mb-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#F2682F] px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-white">
          ✓ Plan sent to your inbox
        </span>
      </div>

      <h2
        className="mb-2.5 text-center text-[clamp(20px,5vw,26px)] font-medium leading-[1.3] tracking-[-0.01em] text-white [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-[#8FA396]"
        dangerouslySetInnerHTML={{ __html: result.headline }}
      />

      <p
        className="mb-[18px] text-sm leading-[1.7] text-white/65 [&_strong]:font-medium [&_strong]:text-white"
        dangerouslySetInnerHTML={{ __html: result.body }}
      />

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[rgba(242,104,47,0.28)] bg-[rgba(242,104,47,0.12)] px-4 py-3.5">
        <span className="shrink-0 text-[26px] text-[#F2682F]" aria-hidden="true">
          📋
        </span>
        <div className="text-[13px] leading-[1.5] text-white/65">
          <strong className="mb-0.5 block text-sm text-white">{result.pdfTitle}</strong>
          Check your inbox. It's on its way. Usually arrives within 2 minutes.
        </div>
      </div>

      <div className="mb-3.5 text-center text-[13px] text-white/55">
        Your discount:{' '}
        <strong className="font-mono text-base font-medium tracking-[0.08em] text-[#F2682F]">{DISCOUNT_CODE}</strong>{' '}
        for 15% off at checkout
      </div>

      <a
        href="/products/mujo-ritual"
        onClick={onClose}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#F2682F] px-4 py-[15px] text-[15px] font-medium text-white no-underline transition-colors hover:bg-[#D85A22]"
      >
        Claim my discount, try Mujo Ritual
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}
