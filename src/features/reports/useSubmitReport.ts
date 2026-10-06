'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { VerifiedCaptureResult } from '@/features/capture/CameraCapture';
import type { CivicCategory, ReportSeverity } from '@/lib/domain/status';

export interface DuplicateCandidate {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  distance_m: number;
  score: number;
  media_url?: string;
  location_label?: string;
}

export function useSubmitReport() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attestationSuccess, setAttestationSuccess] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CivicCategory>('pothole');
  const [severity, setSeverity] = useState<ReportSeverity>('moderate');
  const [locationLabel, setLocationLabel] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // Verified Capture State
  const [capture, setCapture] = useState<VerifiedCaptureResult | null>(null);
  const [aiResult, setAiResult] = useState<{
    confidence: number;
    reasoning: string;
    model_used: string;
    source: string;
  } | null>(null);

  // Duplicate Candidates
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

  // Check duplicates via API
  const checkDuplicates = useCallback(async (lat: number, lon: number, currentTitle: string, currentCategory: string, phash?: string) => {
    setCheckingDuplicates(true);
    try {
      const res = await fetch('/api/duplicates/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          title: currentTitle,
          category: currentCategory,
          phash,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.candidates || []);
      }
    } catch {
      // Non-blocking duplicate search
    } finally {
      setCheckingDuplicates(false);
    }
  }, []);

  // Handle camera capture complete
  const handleCaptureComplete = useCallback(async (result: VerifiedCaptureResult) => {
    setCapture(result);
    setError(null);

    // Call AI classification on captured photo
    setClassifying(true);
    try {
      const classifyRes = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: result.mediaId }),
      });

      if (classifyRes.ok) {
        const ai = await classifyRes.json();
        if (ai.category) setCategory(ai.category);
        if (ai.severity) setSeverity(ai.severity);
        if (ai.suggested_title && !title) setTitle(ai.suggested_title);
        if (ai.suggested_description && !description) setDescription(ai.suggested_description);

        setAiResult({
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          model_used: ai.model_used,
          source: ai.source,
        });

        // Search for duplicates with AI-suggested category
        void checkDuplicates(result.lat, result.lon, ai.suggested_title || title, ai.category, result.phash);
      }
    } catch {
      // Fallback: check duplicates without AI
      void checkDuplicates(result.lat, result.lon, title, category, result.phash);
    } finally {
      setClassifying(false);
    }
  }, [title, description, category, checkDuplicates]);

  // Handle "I see this too (+1 Attestation)" button click
  const handleAttestDuplicate = async (parentId: string) => {
    setLoading(true);
    try {
      const { error: voteErr } = await supabase.rpc('vote_report', {
        p_report: parentId,
        p_value: 1,
      });

      if (voteErr) throw voteErr;

      setAttestationSuccess('Thanks! You attested an existing issue instead of creating a duplicate.');
      setTimeout(() => {
        router.push('/feed');
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not submit attestation vote.');
      setLoading(false);
    }
  };

  // Submit report to Postgres RPC
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capture) {
      setError('Please capture a verified photo of the civic issue before submitting.');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a brief issue title.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: reportId, error: rpcErr } = await supabase.rpc('submit_report', {
        p_title: title.trim(),
        p_description: description.trim(),
        p_category: category,
        p_severity: severity,
        p_lat: capture.lat,
        p_lon: capture.lon,
        p_label: locationLabel.trim() || `Near ${capture.lat.toFixed(4)}, ${capture.lon.toFixed(4)}`,
        p_media_id: capture.mediaId,
        p_is_anonymous: isAnonymous,
      });

      if (rpcErr) throw rpcErr;

      router.push('/feed');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return {
    title, setTitle,
    description, setDescription,
    category, setCategory,
    severity, setSeverity,
    locationLabel, setLocationLabel,
    isAnonymous, setIsAnonymous,
    capture, setCapture,
    aiResult,
    duplicates,
    duplicatesDismissed, setDuplicatesDismissed,
    loading,
    classifying,
    checkingDuplicates,
    error,
    attestationSuccess,
    handleCaptureComplete,
    handleAttestDuplicate,
    handleSubmit,
  };
}
