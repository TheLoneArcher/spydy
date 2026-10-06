'use client';

import React from 'react';
import { CameraCapture } from '@/features/capture/CameraCapture';
import { DuplicatePanel } from '@/features/reports/DuplicatePanel';
import { useSubmitReport } from '@/features/reports/useSubmitReport';
import {
  Camera, Sparkles, Send, Loader2, AlertCircle, CheckCircle2, Shield
} from 'lucide-react';
import { CIVIC_CATEGORIES, CIVIC_CATEGORY_LABELS, type CivicCategory, type ReportSeverity } from '@/lib/domain/status';

export default function SubmitReportPage() {
  const {
    title, setTitle,
    description, setDescription,
    category, setCategory,
    severity, setSeverity,
    locationLabel, setLocationLabel,
    isAnonymous, setIsAnonymous,
    capture,
    aiResult,
    duplicates,
    duplicatesDismissed, setDuplicatesDismissed,
    loading, classifying, error, attestationSuccess,
    handleCaptureComplete, handleAttestDuplicate, handleSubmit,
  } = useSubmitReport();

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--fg)] flex items-center gap-2">
          <Camera className="w-5 h-5 text-[var(--brand)]" />
          Report a Civic Issue
        </h1>
        <p className="text-xs text-[var(--fg-muted)] mt-1">
          Capture authentic live camera evidence with GPS coordinates for verified municipal remediation.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {attestationSuccess && (
        <div className="p-3.5 rounded bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{attestationSuccess}</span>
        </div>
      )}

      {/* Step 1: Camera Capture */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--fg)] flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--brand)]" />
          Step 1: Live Photo &amp; Location Lock
        </h2>
        <CameraCapture onCaptureComplete={handleCaptureComplete} />
      </section>

      {/* Step 2: Review AI Triage & Duplicates */}
      {capture && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
          {classifying && (
            <div className="p-3 rounded bg-[var(--brand-soft)] border border-[var(--brand)]/30 text-xs text-[var(--brand)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing photo with AI classifier and checking for nearby duplicates...</span>
            </div>
          )}

          {aiResult && (
            <div className="p-3.5 rounded bg-[var(--surface)] border border-[var(--brand)]/30 text-xs text-[var(--fg)] flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--brand)]">AI Suggested Category: </span>
                <span className="capitalize">{category.replace('_', ' ')}</span>
                <span className="text-[var(--fg-muted)]"> ({Math.round(aiResult.confidence * 100)}% confidence)</span>
                <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">{aiResult.reasoning}</p>
              </div>
            </div>
          )}

          {!duplicatesDismissed && duplicates.length > 0 && (
            <DuplicatePanel
              candidates={duplicates}
              onAttest={handleAttestDuplicate}
              onDismiss={() => setDuplicatesDismissed(true)}
              loading={loading}
            />
          )}

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--fg)]">Step 2: Incident Details</h2>

            <div>
              <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Issue Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as CivicCategory)}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)]"
              >
                {CIVIC_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{CIVIC_CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Title</label>
              <input
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Broken asphalt and deep crater at crossing"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe landmark or specific hazards..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded p-2.5 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--brand)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={e => setSeverity(e.target.value as ReportSeverity)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)]"
                >
                  <option value="low">Low - Minor nuisance</option>
                  <option value="moderate">Moderate - Impeding traffic</option>
                  <option value="critical">Critical - Immediate hazard</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">Location Label</label>
                <input
                  type="text"
                  value={locationLabel}
                  onChange={e => setLocationLabel(e.target.value)}
                  placeholder="e.g. Outside Tirupati Bus Stand Gate"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--fg)]"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-xs text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={e => setIsAnonymous(e.target.checked)}
                className="rounded border-[var(--border)] bg-[var(--surface-2)] text-[var(--brand)]"
              />
              <span>Submit report anonymously (your name will not appear publicly on the feed)</span>
            </label>
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brand)] hover:opacity-90 disabled:opacity-50 text-[var(--brand-fg)] font-semibold py-3 rounded-lg text-xs transition-opacity flex items-center justify-center gap-2 shadow"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Submitting Verified Report...' : 'Publish Verified Report to Feed'}
          </button>
        </form>
      )}
    </div>
  );
}
