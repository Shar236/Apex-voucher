'use client';

import { useId, useState, type ComponentType } from 'react';
import {
  BookOpen,
  Headphones,
  Mic,
  PenLine,
  Calculator,
  RotateCcw,
  Trophy,
  GraduationCap,
  Sparkles,
  Info,
  CheckCircle2,
  BarChart3,
  Percent,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  CalcDisclaimer,
  CalcNumberInput,
  CalcSelect,
  CalcSupportingCards,
  CalculateButton,
  CircularScoreGauge,
  ShareResultButton,
  SkillBar,
  SkillInputTile,
  parseScore,
  rangeError,
} from '@/components/calculators/calculator-primitives';
import {
  SAT_ACT_TABLE,
  TOEFL_IELTS_TABLE,
  WES_GRADE_POINTS,
  actToSat,
  calculateAct,
  calculateCgpaToGpa,
  calculateGpa,
  calculateGermanGrade,
  calculateGre,
  calculateIelts,
  calculatePte,
  calculateSat,
  calculateToefl,
  greToGmat,
  satToAct,
  toeflToIelts,
} from '@/lib/calculator-logic';

/* ─────────────────────────────────────────────────────────────────────────────
   1. PTE SCORE CALCULATOR — Reference Mockup Master Standard
   ───────────────────────────────────────────────────────────────────────────── */

function PteTool() {
  const uid = useId();
  const [listening, setListening] = useState('72');
  const [reading, setReading] = useState('68');
  const [writing, setWriting] = useState('69');
  const [speaking, setSpeaking] = useState('75');

  const lErr = rangeError(parseScore(listening), 10, 90);
  const rErr = rangeError(parseScore(reading), 10, 90);
  const wErr = rangeError(parseScore(writing), 10, 90);
  const sErr = rangeError(parseScore(speaking), 10, 90);
  const hasError = Boolean(lErr || rErr || wErr || sErr);

  const result = hasError
    ? null
    : calculatePte({
        listening: parseScore(listening) ?? 10,
        reading: parseScore(reading) ?? 10,
        writing: parseScore(writing) ?? 10,
        speaking: parseScore(speaking) ?? 10,
      });

  const handleClearAll = () => {
    setListening('');
    setReading('');
    setWriting('');
    setSpeaking('');
  };

  const shareSummary = result
    ? `My Estimated PTE Score: ${result.overall}/90 (CEFR ${result.cefr.level} - ${result.cefr.label})\nListening: ${result.listening} | Reading: ${result.reading} | Writing: ${result.writing} | Speaking: ${result.speaking}\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        {/* LEFT COLUMN: Input Card */}
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Enter Your PTE Scores</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  All fields are required. Scores must be between 10 and 90.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-listening`}
                label="Listening (10–90)"
                value={listening}
                onChange={setListening}
                min={10}
                max={90}
                icon={<Headphones className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/40"
                error={lErr}
              />
              <SkillInputTile
                id={`${uid}-reading`}
                label="Reading (10–90)"
                value={reading}
                onChange={setReading}
                min={10}
                max={90}
                icon={<BookOpen className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400 border border-pink-200/50 dark:border-pink-800/40"
                error={rErr}
              />
              <SkillInputTile
                id={`${uid}-writing`}
                label="Writing (10–90)"
                value={writing}
                onChange={setWriting}
                min={10}
                max={90}
                icon={<PenLine className="w-4 h-4" />}
                iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40"
                error={wErr}
              />
              <SkillInputTile
                id={`${uid}-speaking`}
                label="Speaking (10–90)"
                value={speaking}
                onChange={setSpeaking}
                min={10}
                max={90}
                icon={<Mic className="w-4 h-4" />}
                iconBgClass="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/40"
                error={sErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate My PTE Score →"} icon={<Calculator className="w-4 h-4" />} />

            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Dark Navy Result Card */}
        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your PTE Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-6">
                <CircularScoreGauge
                  score={result.overall}
                  maxScore={90}
                  minScore={10}
                  label="Overall Score"
                  sublabel="/ 90"
                  size={160}
                />

                <div className="w-full sm:w-48 space-y-2.5">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Headphones className="w-3.5 h-3.5 text-sky-400" />
                      <span>Listening</span>
                    </span>
                    <span className="font-bold text-white text-sm tabular-nums">{result.listening}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <BookOpen className="w-3.5 h-3.5 text-pink-400" />
                      <span>Reading</span>
                    </span>
                    <span className="font-bold text-white text-sm tabular-nums">{result.reading}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <PenLine className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Writing</span>
                    </span>
                    <span className="font-bold text-white text-sm tabular-nums">{result.writing}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <span className="flex items-center gap-2 text-neutral-300">
                      <Mic className="w-3.5 h-3.5 text-purple-400" />
                      <span>Speaking</span>
                    </span>
                    <span className="font-bold text-white text-sm tabular-nums">{result.speaking}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-neutral-400">Enter your 4 section scores above to view your result.</p>
              </div>
            )}
          </div>

          {result && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300 leading-relaxed">
              <div className="flex items-center gap-2 font-semibold text-white mb-1.5">
                <Info className="w-3.5 h-3.5 text-accent" />
                <span>About PTE Scoring</span>
              </div>
              <p className="text-neutral-400 leading-normal">
                Estimated overall of <strong className="text-white">{result.overall}</strong> aligns with{' '}
                <strong className="text-accent">
                  CEFR {result.cefr.level} ({result.cefr.label})
                </strong>
                . Pearson computes official scores across item types; averaging communicative skills represents an accurate standard estimate. Scores are valid for 2 years.
              </p>
            </div>
          )}
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. IELTS BAND CALCULATOR — Official Rounding Standard
   ───────────────────────────────────────────────────────────────────────────── */

function IeltsTool() {
  const uid = useId();
  const [listening, setListening] = useState('7.0');
  const [reading, setReading] = useState('6.5');
  const [writing, setWriting] = useState('6.0');
  const [speaking, setSpeaking] = useState('7.0');

  const lErr = rangeError(parseScore(listening), 0, 9);
  const rErr = rangeError(parseScore(reading), 0, 9);
  const wErr = rangeError(parseScore(writing), 0, 9);
  const sErr = rangeError(parseScore(speaking), 0, 9);
  const hasError = Boolean(lErr || rErr || wErr || sErr);

  const result = hasError
    ? null
    : calculateIelts({
        listening: parseScore(listening) ?? 0,
        reading: parseScore(reading) ?? 0,
        writing: parseScore(writing) ?? 0,
        speaking: parseScore(speaking) ?? 0,
      });

  const handleClearAll = () => {
    setListening('');
    setReading('');
    setWriting('');
    setSpeaking('');
  };

  const shareSummary = result
    ? `My IELTS Overall Band Score: ${result.overall.toFixed(1)}/9.0 (Listening: ${result.listening.toFixed(1)}, Reading: ${result.reading.toFixed(1)}, Writing: ${result.writing.toFixed(1)}, Speaking: ${result.speaking.toFixed(1)})\nCalculated via Apex Vouchers`
    : '';

  const rawMean =
    result !== null ? (result.listening + result.reading + result.writing + result.speaking) / 4 : 0;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <GraduationCap className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Enter Your IELTS Skill Bands</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter each skill band (0.0 to 9.0 in half-band steps of 0.5).
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-l`}
                label="Listening (0–9)"
                value={listening}
                onChange={setListening}
                min={0}
                max={9}
                step={0.5}
                icon={<Headphones className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50"
                error={lErr}
              />
              <SkillInputTile
                id={`${uid}-r`}
                label="Reading (0–9)"
                value={reading}
                onChange={setReading}
                min={0}
                max={9}
                step={0.5}
                icon={<BookOpen className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-400 border border-pink-200/50"
                error={rErr}
              />
              <SkillInputTile
                id={`${uid}-w`}
                label="Writing (0–9)"
                value={writing}
                onChange={setWriting}
                min={0}
                max={9}
                step={0.5}
                icon={<PenLine className="w-4 h-4" />}
                iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50"
                error={wErr}
              />
              <SkillInputTile
                id={`${uid}-s`}
                label="Speaking (0–9)"
                value={speaking}
                onChange={setSpeaking}
                min={0}
                max={9}
                step={0.5}
                icon={<Mic className="w-4 h-4" />}
                iconBgClass="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400 border border-purple-200/50"
                error={sErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate Overall IELTS Band →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your IELTS Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <CircularScoreGauge
                    score={result.overall}
                    maxScore={9}
                    minScore={0}
                    label="Overall Band"
                    sublabel="/ 9.0"
                    size={160}
                  />

                  <div className="w-full sm:w-48 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                      <p className="text-[10px] uppercase text-neutral-400">Listening</p>
                      <p className="text-base font-bold text-white mt-0.5">{result.listening.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                      <p className="text-[10px] uppercase text-neutral-400">Reading</p>
                      <p className="text-base font-bold text-white mt-0.5">{result.reading.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                      <p className="text-[10px] uppercase text-neutral-400">Writing</p>
                      <p className="text-base font-bold text-white mt-0.5">{result.writing.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                      <p className="text-[10px] uppercase text-neutral-400">Speaking</p>
                      <p className="text-base font-bold text-white mt-0.5">{result.speaking.toFixed(1)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300 space-y-1.5">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Official Rounding Methodology
                  </p>
                  <p className="text-neutral-400">
                    Arithmetic mean: <strong className="text-white">{rawMean.toFixed(3)}</strong> → Rounds to{' '}
                    <strong className="text-white font-bold">{result.overall.toFixed(1)}</strong>. Means ending in .25
                    round up to .5; means ending in .75 round up to the next whole band.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid IELTS bands to see result.</div>
            )}
          </div>

          <CalcDisclaimer title="About IELTS Band Scoring">
            Test Report Form (TRF) scores are valid for 2 years. IELTS does not superscore across attempts.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. TOEFL SCORE CALCULATOR — iBT 0–120 Scale
   ───────────────────────────────────────────────────────────────────────────── */

function ToeflTool() {
  const uid = useId();
  const [reading, setReading] = useState('27');
  const [listening, setListening] = useState('26');
  const [speaking, setSpeaking] = useState('24');
  const [writing, setWriting] = useState('25');

  const fields = [
    { id: `${uid}-reading`, label: 'Reading (0–30)', value: reading, onChange: setReading, icon: <BookOpen className="w-4 h-4" /> },
    { id: `${uid}-listening`, label: 'Listening (0–30)', value: listening, onChange: setListening, icon: <Headphones className="w-4 h-4" /> },
    { id: `${uid}-speaking`, label: 'Speaking (0–30)', value: speaking, onChange: setSpeaking, icon: <Mic className="w-4 h-4" /> },
    { id: `${uid}-writing`, label: 'Writing (0–30)', value: writing, onChange: setWriting, icon: <PenLine className="w-4 h-4" /> },
  ];

  const errors = fields.map((f) => rangeError(parseScore(f.value), 0, 30));
  const firstError = errors.find(Boolean) || null;
  const result = firstError
    ? null
    : calculateToefl({
        reading: parseScore(reading) ?? 0,
        listening: parseScore(listening) ?? 0,
        speaking: parseScore(speaking) ?? 0,
        writing: parseScore(writing) ?? 0,
      });

  const band = result ? toeflToIelts(result.total) : null;

  const handleClearAll = () => {
    setReading('');
    setListening('');
    setSpeaking('');
    setWriting('');
  };

  const shareSummary = result
    ? `My TOEFL iBT Total Score: ${result.total}/120 (R: ${result.reading}, L: ${result.listening}, S: ${result.speaking}, W: ${result.writing})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">TOEFL iBT Section Scores</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter each section score (0 to 30) for your total out of 120.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {fields.map((f, i) => (
                <SkillInputTile
                  key={f.id}
                  id={f.id}
                  label={f.label}
                  value={f.value}
                  onChange={f.onChange}
                  min={0}
                  max={30}
                  icon={f.icon}
                  iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                  error={errors[i]}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate TOEFL iBT Total →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your TOEFL Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <CircularScoreGauge
                    score={result.total}
                    maxScore={120}
                    minScore={0}
                    label="Total Score"
                    sublabel="/ 120"
                    size={160}
                  />

                  <div className="w-full sm:w-48 space-y-2">
                    <SkillBar label="Reading" value={result.reading} min={0} max={30} />
                    <SkillBar label="Listening" value={result.listening} min={0} max={30} />
                    <SkillBar label="Speaking" value={result.speaking} min={0} max={30} />
                    <SkillBar label="Writing" value={result.writing} min={0} max={30} />
                  </div>
                </div>

                {band !== null && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
                    <p className="font-semibold text-white">
                      IELTS Equivalent: <span className="text-accent font-bold">Band {band.toFixed(1)}</span>
                    </p>
                    <p className="text-neutral-400 mt-1">
                      Based on ETS concordance research. Scores are valid for 2 years.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter your section scores to calculate total.</div>
            )}
          </div>

          <CalcDisclaimer title="About TOEFL iBT Scoring">
            Each section carries 30 points. ETS reports MyBest Scores across all attempts within two years.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. GRE SCORE CALCULATOR — Total (260–340) & AWA
   ───────────────────────────────────────────────────────────────────────────── */

function GreTool() {
  const uid = useId();
  const [verbal, setVerbal] = useState('158');
  const [quant, setQuant] = useState('162');
  const [awa, setAwa] = useState('4.5');

  const vErr = rangeError(parseScore(verbal), 130, 170);
  const qErr = rangeError(parseScore(quant), 130, 170);
  const aErr = rangeError(parseScore(awa), 0, 6);
  const hasError = Boolean(vErr || qErr || aErr);
  const result = hasError
    ? null
    : calculateGre({
        verbal: parseScore(verbal) ?? 130,
        quant: parseScore(quant) ?? 130,
        awa: parseScore(awa) ?? 0,
      });

  const handleClearAll = () => {
    setVerbal('');
    setQuant('');
    setAwa('');
  };

  const shareSummary = result
    ? `My GRE Score: ${result.total}/340 (Verbal: ${result.verbal}, Quant: ${result.quant}, AWA: ${result.awa.toFixed(1)}/6.0)\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">GRE General Test Sections</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Verbal & Quantitative are scored 130–170; Analytical Writing is 0.0–6.0.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-verbal`}
                label="Verbal Reasoning (130–170)"
                value={verbal}
                onChange={setVerbal}
                min={130}
                max={170}
                icon={<BookOpen className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                error={vErr}
              />
              <SkillInputTile
                id={`${uid}-quant`}
                label="Quantitative (130–170)"
                value={quant}
                onChange={setQuant}
                min={130}
                max={170}
                icon={<BarChart3 className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50"
                error={qErr}
              />
            </div>

            <div className="mt-4">
              <SkillInputTile
                id={`${uid}-awa`}
                label="Analytical Writing / AWA (0.0–6.0, optional)"
                value={awa}
                onChange={setAwa}
                min={0}
                max={6}
                step={0.5}
                icon={<PenLine className="w-4 h-4" />}
                iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50"
                error={aErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate My GRE Total →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your GRE Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Total GRE Score</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.total} <span className="text-lg font-medium text-neutral-400">/ 340</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Verbal</p>
                    <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">{result.verbal}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Quantitative</p>
                    <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">{result.quant}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center">
                  <p className="text-xs text-neutral-300">
                    Analytical Writing: <strong className="text-accent font-bold">{result.awa.toFixed(1)}</strong> / 6.0
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Scored separately from the 340 total</p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid scores between 130 and 170.</div>
            )}
          </div>

          <CalcDisclaimer title="About GRE Scoring">
            Official GRE scores are valid for 5 years. Total is the exact sum of Verbal and Quantitative sections.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. SAT SCORE CALCULATOR — Digital SAT Total (400–1600)
   ───────────────────────────────────────────────────────────────────────────── */

function SatTool() {
  const uid = useId();
  const [rw, setRw] = useState('640');
  const [math, setMath] = useState('680');

  const rwErr = rangeError(parseScore(rw), 200, 800);
  const mErr = rangeError(parseScore(math), 200, 800);
  const hasError = Boolean(rwErr || mErr);
  const result = hasError
    ? null
    : calculateSat({ rw: parseScore(rw) ?? 200, math: parseScore(math) ?? 200 });

  const handleClearAll = () => {
    setRw('');
    setMath('');
  };

  const shareSummary = result
    ? `My SAT Total Score: ${result.total}/1600 (Reading & Writing: ${result.rw}, Math: ${result.math})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Digital SAT Section Scores</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Reading & Writing and Math are each scored 200–800 in 10-point increments.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-rw`}
                label="Reading & Writing (200–800)"
                value={rw}
                onChange={setRw}
                min={200}
                max={800}
                step={10}
                icon={<BookOpen className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                error={rwErr}
              />
              <SkillInputTile
                id={`${uid}-math`}
                label="Math (200–800)"
                value={math}
                onChange={setMath}
                min={200}
                max={800}
                step={10}
                icon={<BarChart3 className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50"
                error={mErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate My SAT Total →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your SAT Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Total Score</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.total} <span className="text-lg font-medium text-neutral-400">/ 1600</span>
                  </p>
                  <p className="text-xs text-neutral-400 mt-2">
                    Concordant ACT Composite ≈ <strong className="text-accent">{satToAct(result.total)}</strong>
                  </p>
                </div>

                <div className="space-y-3">
                  <SkillBar label="Reading & Writing" value={result.rw} min={200} max={800} />
                  <SkillBar label="Math" value={result.math} min={200} max={800} />
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid section scores (200–800).</div>
            )}
          </div>

          <CalcDisclaimer title="About SAT Scoring">
            Scores arrive within days and superscoring across test dates is supported by most colleges.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. ACT SCORE CALCULATOR — Composite & Rounding
   ───────────────────────────────────────────────────────────────────────────── */

function ActTool() {
  const uid = useId();
  const [english, setEnglish] = useState('28');
  const [math, setMath] = useState('27');
  const [reading, setReading] = useState('29');
  const [science, setScience] = useState('26');

  const subjects = [
    { id: `${uid}-e`, label: 'English (1–36)', value: english, onChange: setEnglish, icon: <PenLine className="w-4 h-4" /> },
    { id: `${uid}-m`, label: 'Math (1–36)', value: math, onChange: setMath, icon: <BarChart3 className="w-4 h-4" /> },
    { id: `${uid}-r`, label: 'Reading (1–36)', value: reading, onChange: setReading, icon: <BookOpen className="w-4 h-4" /> },
    { id: `${uid}-s`, label: 'Science (1–36)', value: science, onChange: setScience, icon: <Sparkles className="w-4 h-4" /> },
  ];

  const errors = subjects.map((s) => rangeError(parseScore(s.value), 1, 36));
  const firstError = errors.find(Boolean) || null;
  const result = firstError
    ? null
    : calculateAct({
        english: parseScore(english) ?? 1,
        math: parseScore(math) ?? 1,
        reading: parseScore(reading) ?? 1,
        science: parseScore(science) ?? 1,
      });

  const handleClearAll = () => {
    setEnglish('');
    setMath('');
    setReading('');
    setScience('');
  };

  const shareSummary = result
    ? `My ACT Composite Score: ${result.composite}/36 (English: ${result.english}, Math: ${result.math}, Reading: ${result.reading}, Science: ${result.science})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">ACT Subject Scores</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter your 4 section scores (1 to 36) to calculate your composite.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {subjects.map((s, i) => (
                <SkillInputTile
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  value={s.value}
                  onChange={s.onChange}
                  min={1}
                  max={36}
                  icon={s.icon}
                  iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                  error={errors[i]}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate My ACT Composite →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your ACT Result</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Composite Score</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.composite} <span className="text-lg font-medium text-neutral-400">/ 36</span>
                  </p>
                  <p className="text-xs text-neutral-400 mt-2">
                    Concordant SAT Total ≈ <strong className="text-accent">{actToSat(result.composite)}</strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">English</p>
                    <p className="text-base font-bold text-white mt-0.5">{result.english}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Math</p>
                    <p className="text-base font-bold text-white mt-0.5">{result.math}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Reading</p>
                    <p className="text-base font-bold text-white mt-0.5">{result.reading}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Science</p>
                    <p className="text-base font-bold text-white mt-0.5">{result.science}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid subject scores (1–36).</div>
            )}
          </div>

          <CalcDisclaimer title="About ACT Scoring">
            Composite is the arithmetic mean of the four subjects rounded to the nearest whole number (.5 rounds up).
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. WES GPA CALCULATOR — Interactive Course Transcript
   ───────────────────────────────────────────────────────────────────────────── */

interface CourseRow {
  id: number;
  name: string;
  credits: string;
  grade: string;
}

function WesGpaTool() {
  const uid = useId();
  const [rows, setRows] = useState<CourseRow[]>([
    { id: 1, name: 'Calculus II', credits: '4', grade: 'A-' },
    { id: 2, name: 'Physics I', credits: '3', grade: 'B+' },
    { id: 3, name: 'English Composition', credits: '3', grade: 'A' },
    { id: 4, name: 'Computer Science', credits: '4', grade: 'A' },
  ]);

  const update = (id: number, patch: Partial<CourseRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { id: Date.now(), name: '', credits: '3', grade: 'A' }]);
  const removeRow = (id: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const handleReset = () => {
    setRows([
      { id: 1, name: 'Course 1', credits: '3', grade: 'A' },
      { id: 2, name: 'Course 2', credits: '3', grade: 'B+' },
    ]);
  };

  const result = calculateGpa(rows.map((r) => ({ credits: parseScore(r.credits) ?? 0, grade: r.grade })));

  const shareSummary = result.gpa !== null
    ? `My WES-style GPA: ${result.gpa.toFixed(2)}/4.00 (Total Credits: ${result.totalCredits}, Courses: ${result.courseCount})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <GraduationCap className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Your Academic Courses</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Add your courses with credit hours and letter grades on the 4.0 scale.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_75px_110px_36px] sm:grid-cols-[1fr_90px_130px_40px] gap-2 px-1 text-[11px] font-semibold text-ink-muted uppercase">
                <span>Course Name</span>
                <span>Credits</span>
                <span>Grade</span>
                <span />
              </div>

              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[1fr_75px_110px_36px] sm:grid-cols-[1fr_90px_130px_40px] gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Course name"
                    value={row.name}
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-raised border border-line text-ink text-sm font-normal focus:outline-none focus:border-accent"
                  />
                  <CalcNumberInput
                    id={`${uid}-c-${row.id}`}
                    value={row.credits}
                    onChange={(v) => update(row.id, { credits: v })}
                    min={0}
                    max={24}
                    step={0.5}
                    className="px-2 py-2 text-center"
                  />
                  <CalcSelect
                    id={`${uid}-g-${row.id}`}
                    value={row.grade}
                    onChange={(v) => update(row.id, { grade: v })}
                    options={WES_GRADE_POINTS.map((g) => ({
                      value: g.grade,
                      label: `${g.grade} (${g.points.toFixed(2)})`,
                    }))}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 1}
                    className="h-10 w-full rounded-xl border border-line text-ink-muted hover:text-red-500 hover:border-red-300 disabled:opacity-30 cursor-pointer flex items-center justify-center transition"
                    title="Remove course"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent/10 hover:bg-accent/15 text-accent text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Course</span>
              </button>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate My WES GPA →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Transcript</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your Cumulative GPA</span>
              </div>
              {result.gpa !== null && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result.gpa !== null ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Cumulative GPA (4.0 Scale)</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.gpa.toFixed(2)} <span className="text-lg font-medium text-neutral-400">/ 4.00</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Total Credits</p>
                    <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">{result.totalCredits}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-center">
                    <p className="text-[10px] uppercase text-neutral-400">Quality Points</p>
                    <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">{result.totalPoints.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Add course credits to calculate your GPA.</div>
            )}
          </div>

          <CalcDisclaimer title="About WES GPA Calculation">
            Weighted calculation: GPA = Σ (Grade Points × Credits) ÷ Σ Credits. WES uses country-specific evaluation tables.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   8. CGPA TO GPA CALCULATOR — Indian & Global Scales
   ───────────────────────────────────────────────────────────────────────────── */

function CgpaTool() {
  const uid = useId();
  const [cgpa, setCgpa] = useState('8.6');
  const [maxCgpa, setMaxCgpa] = useState('10');

  const parsedMaxCgpa = parseFloat(maxCgpa) || 10;
  const cgpaErr = rangeError(parseScore(cgpa), 0, parsedMaxCgpa);
  const maxErr = rangeError(parseScore(maxCgpa), 4, 10);
  const hasError = Boolean(cgpaErr || maxErr);
  const result = hasError
    ? null
    : calculateCgpaToGpa({ cgpa: parseScore(cgpa) ?? 0, maxCgpa: parseScore(maxCgpa) ?? 10 });

  const handleClearAll = () => {
    setCgpa('');
    setMaxCgpa('10');
  };

  const shareSummary = result && result.gpa !== null
    ? `My Converted GPA: ${result.gpa.toFixed(2)}/4.00 (from ${cgpa}/${maxCgpa} CGPA)\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <GraduationCap className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Enter Your CGPA & Scale</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Select your university grading scale (10-point, 5-point, etc.) and enter your score.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-cgpa`}
                label="Your CGPA"
                value={cgpa}
                onChange={setCgpa}
                min={0}
                max={parsedMaxCgpa}
                step={0.01}
                icon={<BarChart3 className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                error={cgpaErr}
              />
              <div className="rounded-2xl border border-line p-3.5 sm:p-4 bg-surface-raised/40">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50">
                    <Percent className="w-4 h-4" />
                  </span>
                  <label htmlFor={`${uid}-max`} className="text-[13px] sm:text-sm font-semibold text-ink">
                    Grading Scale
                  </label>
                </div>
                <CalcSelect
                  id={`${uid}-max`}
                  value={maxCgpa}
                  onChange={setMaxCgpa}
                  options={[
                    { value: '10', label: '10-Point Scale (India standard)' },
                    { value: '8', label: '8-Point Scale' },
                    { value: '7', label: '7-Point Scale' },
                    { value: '5', label: '5-Point Scale' },
                    { value: '4', label: '4-Point Scale' },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Convert CGPA to 4.0 GPA →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your Converted GPA</span>
              </div>
              {result && result.gpa !== null && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result && result.gpa !== null ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Estimated 4.0 GPA</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.gpa.toFixed(2)} <span className="text-lg font-medium text-neutral-400">/ 4.00</span>
                  </p>
                </div>

                {result.percentage !== null && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                    <p className="text-xs text-neutral-300">
                      CBSE Percentage Equivalent: <strong className="text-accent font-bold text-base">{result.percentage.toFixed(1)}%</strong>
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">Formula: CGPA × 9.5 (official CBSE / AICTE standard)</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter a valid CGPA to calculate conversion.</div>
            )}
          </div>

          <CalcDisclaimer title="About CGPA Conversion">
            Linear formula: GPA = (CGPA ÷ Max CGPA) × 4. US universities and credential evaluators like WES may apply customized tables.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   9. GERMAN GRADE CALCULATOR — Modified Bavarian Formula
   ───────────────────────────────────────────────────────────────────────────── */

function GermanGradeTool() {
  const uid = useId();
  const [obtained, setObtained] = useState('78');
  const [max, setMax] = useState('100');
  const [min, setMin] = useState('35');

  const oErr = rangeError(parseScore(obtained), 0, 1000);
  const mErr = rangeError(parseScore(max), 1, 1000);
  const nErr = rangeError(parseScore(min), 0, 1000);
  const hasError = Boolean(oErr || mErr || nErr);

  const result = hasError
    ? null
    : calculateGermanGrade({
        obtained: parseScore(obtained) ?? 0,
        max: parseScore(max) ?? 100,
        min: parseScore(min) ?? 35,
      });

  const handlePreset = (pMax: string, pMin: string) => {
    setMax(pMax);
    setMin(pMin);
  };

  const handleClearAll = () => {
    setObtained('');
    setMax('100');
    setMin('35');
  };

  const shareSummary = result
    ? `My German Grade: ${result.grade.toFixed(2)} (${result.label}) from ${obtained}/${max} (pass mark: ${min})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Modified Bavarian Formula</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter your marks, maximum score, and minimum passing score.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <span className="text-xs font-semibold text-ink-muted self-center mr-1">Presets:</span>
              <button
                type="button"
                onClick={() => handlePreset('100', '35')}
                className="px-2.5 py-1 rounded-lg bg-surface-raised border border-line text-xs font-medium hover:border-accent hover:text-accent transition cursor-pointer"
              >
                100% (Pass 35)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('100', '40')}
                className="px-2.5 py-1 rounded-lg bg-surface-raised border border-line text-xs font-medium hover:border-accent hover:text-accent transition cursor-pointer"
              >
                100% (Pass 40)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('10', '4.0')}
                className="px-2.5 py-1 rounded-lg bg-surface-raised border border-line text-xs font-medium hover:border-accent hover:text-accent transition cursor-pointer"
              >
                10 CGPA (Pass 4.0)
              </button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <SkillInputTile
                id={`${uid}-o`}
                label="Your Score (Nd)"
                value={obtained}
                onChange={setObtained}
                min={0}
                max={parseFloat(max) || 100}
                step={0.1}
                icon={<BarChart3 className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                error={oErr}
              />
              <SkillInputTile
                id={`${uid}-max`}
                label="Max Score (Nmax)"
                value={max}
                onChange={setMax}
                min={1}
                max={1000}
                step={0.1}
                icon={<Trophy className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50"
                error={mErr}
              />
              <SkillInputTile
                id={`${uid}-min`}
                label="Min Pass (Nmin)"
                value={min}
                onChange={setMin}
                min={0}
                max={parseFloat(max) || 100}
                step={0.1}
                icon={<CheckCircle2 className="w-4 h-4" />}
                iconBgClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200/50"
                error={nErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Calculate German Grade →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Your German Grade</span>
              </div>
              {result && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {result ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">German Scale (1.0–5.0)</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {result.grade.toFixed(2)}
                  </p>
                  <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-accent/20 border border-accent/40 text-accent text-xs font-bold">
                    {result.label}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
                  <p className="font-semibold text-white mb-1">German Grade Scale Overview:</p>
                  <ul className="space-y-1 text-neutral-400 text-[11px]">
                    <li>• 1.0 – 1.5: Sehr gut (Very Good / Excellent)</li>
                    <li>• 1.6 – 2.5: Gut (Good)</li>
                    <li>• 2.6 – 3.5: Befriedigend (Satisfactory)</li>
                    <li>• 3.6 – 4.0: Ausreichend (Sufficient / Pass)</li>
                    <li>• 4.1 – 5.0: Nicht bestanden (Fail)</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid marks (Nmax &gt; Nmin).</div>
            )}
          </div>

          <CalcDisclaimer title="About Bavarian Formula">
            Formula: 1 + 3 × (Nmax − Nd) ÷ (Nmax − Nmin). Official standard used by uni-assist and German universities.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   10. GRE TO GMAT CONVERSION — Concordance Estimator
   ───────────────────────────────────────────────────────────────────────────── */

function GreToGmatTool() {
  const uid = useId();
  const [verbal, setVerbal] = useState('158');
  const [quant, setQuant] = useState('160');

  const vErr = rangeError(parseScore(verbal), 130, 170);
  const qErr = rangeError(parseScore(quant), 130, 170);
  const hasError = Boolean(vErr || qErr);

  const gmat = hasError ? null : greToGmat(parseScore(verbal) ?? 130, parseScore(quant) ?? 130);

  const handleClearAll = () => {
    setVerbal('');
    setQuant('');
  };

  const shareSummary = gmat !== null
    ? `My Estimated GMAT Equivalent: ≈ ${gmat}/800 (from GRE V: ${verbal}, Q: ${quant})\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">Enter Your GRE Scores</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter Verbal and Quantitative scores (130–170 each).
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <SkillInputTile
                id={`${uid}-v`}
                label="GRE Verbal (130–170)"
                value={verbal}
                onChange={setVerbal}
                min={130}
                max={170}
                icon={<BookOpen className="w-4 h-4" />}
                iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
                error={vErr}
              />
              <SkillInputTile
                id={`${uid}-q`}
                label="GRE Quantitative (130–170)"
                value={quant}
                onChange={setQuant}
                min={130}
                max={170}
                icon={<BarChart3 className="w-4 h-4" />}
                iconBgClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 border border-sky-200/50"
                error={qErr}
              />
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Estimate GMAT Total Score →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Estimated GMAT Total</span>
              </div>
              {gmat !== null && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {gmat !== null ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Classic GMAT Scale</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    ≈ {gmat} <span className="text-lg font-medium text-neutral-400">/ 800</span>
                  </p>
                  <p className="text-xs text-neutral-400 mt-2">
                    Combined GRE Total: <strong className="text-accent font-bold">{(parseFloat(verbal) || 0) + (parseFloat(quant) || 0)} / 340</strong>
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
                  <p className="font-semibold text-white mb-1">Score Comparison:</p>
                  <p className="text-neutral-400 leading-normal">
                    This estimate corresponds to the 200–800 classic GMAT scale. Business schools evaluate whichever official score you submit.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter valid GRE section scores.</div>
            )}
          </div>

          <CalcDisclaimer title="Concordance notice">
            Concordance is a statistical comparison of test taker distributions, not an official test equivalency.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   11. TOEFL TO IELTS CONVERSION — ETS Comparison Table
   ───────────────────────────────────────────────────────────────────────────── */

function ToeflToIeltsTool() {
  const uid = useId();
  const [toefl, setToefl] = useState('96');

  const err = rangeError(parseScore(toefl), 0, 120);
  const band = err ? null : toeflToIelts(parseScore(toefl) ?? 0);
  const row = TOEFL_IELTS_TABLE.find((entry) => entry.band === band);

  const handleClearAll = () => {
    setToefl('');
  };

  const shareSummary = band !== null
    ? `My TOEFL to IELTS Conversion: TOEFL ${toefl}/120 ≈ IELTS Band ${band.toFixed(1)}\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">TOEFL iBT Total Score</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter your total TOEFL score (0 to 120) to find the concordant IELTS band.
                </p>
              </div>
            </div>

            <SkillInputTile
              id={`${uid}-t`}
              label="TOEFL iBT Total Score (0–120)"
              value={toefl}
              onChange={setToefl}
              min={0}
              max={120}
              icon={<BookOpen className="w-4 h-4" />}
              iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
              error={err}
            />

            <div className="mt-6 rounded-2xl border border-line p-4 bg-surface-raised/40 text-xs text-ink-muted leading-relaxed">
              <p className="font-semibold text-ink mb-1">Common Admission Benchmarks:</p>
              <ul className="space-y-1 text-ink-muted">
                <li>• TOEFL 94–101 ≈ IELTS 7.0 (Meets most top tier grad programs)</li>
                <li>• TOEFL 79–93 ≈ IELTS 6.5 (Standard university admission cut-off)</li>
                <li>• TOEFL 60–78 ≈ IELTS 6.0 (Undergraduate standard entry)</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Convert to IELTS Band →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Concordant IELTS Band</span>
              </div>
              {band !== null && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {band !== null ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">IELTS Scale</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {band.toFixed(1)} <span className="text-lg font-medium text-neutral-400">/ 9.0</span>
                  </p>
                  {row && (
                    <p className="text-xs text-neutral-400 mt-2">
                      Matching TOEFL Range: <strong className="text-white font-bold">{row.min}–{row.max}</strong>
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
                  <p className="font-semibold text-white mb-1">Official Reference:</p>
                  <p className="text-neutral-400 leading-normal">
                    Based on ETS research comparing score distributions of test takers who took both exams.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter a valid TOEFL score (0–120).</div>
            )}
          </div>

          <CalcDisclaimer title="ETS Research Table">
            Scores are comparative estimates. Individual institutions set specific score requirements for each test.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   12. SAT TO ACT CONVERSION — College Board & ACT Concordance
   ───────────────────────────────────────────────────────────────────────────── */

function SatToActTool() {
  const uid = useId();
  const [sat, setSat] = useState('1310');

  const err = rangeError(parseScore(sat), 400, 1600);
  const act = err ? null : satToAct(parseScore(sat) ?? 400);
  const row = SAT_ACT_TABLE.find((entry) => entry.act === act);

  const handleClearAll = () => {
    setSat('');
  };

  const shareSummary = act !== null
    ? `My SAT to ACT Conversion: SAT ${sat}/1600 ≈ ACT Composite ${act}/36\nCalculated via Apex Vouchers`
    : '';

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-stretch pt-2">
        <div className="lg:col-span-7 bg-surface border border-line rounded-3xl p-6 sm:p-8 shadow-[0_4px_24px_-6px_rgba(15,23,42,0.06)] flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3.5 mb-6">
              <span className="w-11 h-11 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0 border border-accent/20">
                <Calculator className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">SAT Total Score</h2>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">
                  Enter your total SAT score (400–1600) to find the concordant ACT composite.
                </p>
              </div>
            </div>

            <SkillInputTile
              id={`${uid}-s`}
              label="SAT Total Score (400–1600)"
              value={sat}
              onChange={setSat}
              min={400}
              max={1600}
              step={10}
              icon={<BookOpen className="w-4 h-4" />}
              iconBgClass="bg-pink-50 text-accent dark:bg-pink-950/50 dark:text-pink-400 border border-accent/20"
              error={err}
            />

            <div className="mt-6 rounded-2xl border border-line p-4 bg-surface-raised/40 text-xs text-ink-muted leading-relaxed">
              <p className="font-semibold text-ink mb-1">Key Concordance Milestones:</p>
              <ul className="space-y-1 text-ink-muted">
                <li>• SAT 1530–1560 ≈ ACT 35 (Top 1% nationally)</li>
                <li>• SAT 1390–1410 ≈ ACT 31 (Top tier universities)</li>
                <li>• SAT 1200–1220 ≈ ACT 25 (National competitive benchmark)</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <CalculateButton label={"Convert SAT to ACT Composite →"} icon={<Calculator className="w-4 h-4" />} />
            <div className="text-center">
              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent transition cursor-pointer py-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        <div data-calc-result tabIndex={-1} className="lg:col-span-5 bg-[#0D1527] border border-white/10 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col justify-between outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <div>
            <div className="flex items-center justify-between gap-3 pb-5 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-400/15 text-amber-400 flex items-center justify-center">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="font-bold text-base text-white tracking-tight">Concordant ACT Composite</span>
              </div>
              {act !== null && <ShareResultButton textToCopy={shareSummary} />}
            </div>

            {act !== null ? (
              <div className="mt-6 space-y-6">
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">ACT Scale</p>
                  <p className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight tabular-nums mt-1">
                    {act} <span className="text-lg font-medium text-neutral-400">/ 36</span>
                  </p>
                  {row && (
                    <p className="text-xs text-neutral-400 mt-2">
                      Concordant SAT Range: <strong className="text-white font-bold">{row.satLow}–{row.satHigh}</strong>
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-neutral-300">
                  <p className="font-semibold text-white mb-1">Official Concordance:</p>
                  <p className="text-neutral-400 leading-normal">
                    Jointly established by College Board and ACT Inc. US colleges treat concordant scores as equivalent.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-neutral-400">Enter a valid SAT score (400–1600).</div>
            )}
          </div>

          <CalcDisclaimer title="College Board & ACT">
            Official joint concordance between the College Board and ACT Inc.
          </CalcDisclaimer>
        </div>
      </div>

      <CalcSupportingCards />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROUTER / EXPORT
   ───────────────────────────────────────────────────────────────────────────── */

const TOOLS: Record<string, ComponentType> = {
  'pte-score-calculator': PteTool,
  'ielts-band-calculator': IeltsTool,
  'toefl-score-calculator': ToeflTool,
  'gre-score-calculator': GreTool,
  'sat-score-calculator': SatTool,
  'act-score-calculator': ActTool,
  'wes-gpa-calculator': WesGpaTool,
  'cgpa-to-gpa-calculator': CgpaTool,
  'german-grade-calculator': GermanGradeTool,
  'gre-to-gmat-conversion': GreToGmatTool,
  'gre-to-gmat': GreToGmatTool,
  'toefl-to-ielts-conversion': ToeflToIeltsTool,
  'toefl-to-ielts': ToeflToIeltsTool,
  'sat-to-act-conversion': SatToActTool,
  'sat-to-act': SatToActTool,
};

export function CalculatorTool({ slug }: { slug: string }) {
  const Tool = TOOLS[slug];
  if (!Tool) return null;
  return <Tool />;
}
