'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, RefreshCw, Check, AlertTriangle, ShieldCheck,
  Compass, Loader2, VideoOff, Lock
} from 'lucide-react';

export interface VerifiedCaptureResult {
  mediaId: string;
  path: string;
  phash: string;
  lat: number;
  lon: number;
  accuracy: number;
  verified: boolean;
  capturedAt: string;
}

interface CameraCaptureProps {
  onCaptureComplete: (result: VerifiedCaptureResult) => void;
  onTextOnlySelected?: () => void;
}

export function CameraCapture({
  onCaptureComplete,
  onTextOnlySelected,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // GPS state
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsData, setGpsData] = useState<{
    lat: number;
    lon: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Captured snapshot state
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  }, []);

  // 1. Acquire GPS position in parallel
  const acquireGps = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsLoading(false);
      return;
    }

    setGpsLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (accuracy > 10000) {
          setGpsError(
            `GPS accuracy is ±${Math.round(accuracy)}m. For verified reporting, please move outdoors with a clear sky view.`
          );
        } else {
          // Still warn if > 100m but allow capture
          if (accuracy > 100) {
            setGpsError(`GPS accuracy is low (±${Math.round(accuracy)}m). Verification score may be reduced.`);
          }
          setGpsData({
            lat: latitude,
            lon: longitude,
            accuracy,
            timestamp: pos.timestamp,
          });
        }
        setGpsLoading(false);
      },
      err => {
        setGpsLoading(false);
        if (err.code === 1) {
          setGpsError('Location permission denied. GPS is required for verified civic reports.');
        } else {
          setGpsError('Could not acquire GPS fix. Please ensure location services are enabled.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  }, []);

  // 2. Start camera stream
  const startCamera = useCallback(async () => {
    setPermissionDenied(false);
    setCameraError(null);

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported on this browser or requires a secure HTTPS connection.');
      return;
    }

    // Verify secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      setCameraError('Camera capture requires a secure context (HTTPS or localhost).');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStreamActive(true);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      } else {
        setCameraError('Unable to access device camera. Please check camera hardware or permissions.');
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
    acquireGps();

    return () => {
      stopTracks();
    };
  }, [startCamera, acquireGps, stopTracks]);

  useEffect(() => {
    if (streamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [streamActive]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // 3. Capture frame to canvas
  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;

    // Scale so max long edge is 1600 px
    const maxEdge = 1600;
    if (width > maxEdge || height > maxEdge) {
      if (width > height) {
        height = Math.round((height * maxEdge) / width);
        width = maxEdge;
      } else {
        width = Math.round((width * maxEdge) / height);
        height = maxEdge;
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame cleanly (do NOT burn GPS or text onto pixel data)
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      blob => {
        if (!blob) return;
        setPreviewBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopTracks();
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetake = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewBlob(null);
    setPreviewUrl(null);
    setVerificationError(null);
    startCamera();
    acquireGps();
  };

  // 4. Submit to server-verified endpoint
  const handleUsePhoto = async () => {
    if (!previewBlob || !gpsData) return;

    setVerifying(true);
    setVerificationError(null);

    try {
      // Step A: Request challenge nonce
      const chalRes = await fetch('/api/capture/challenge', { method: 'POST' });
      if (!chalRes.ok) {
        const err = await chalRes.json().catch(() => ({}));
        throw new Error(err.error || 'Could not initiate secure capture verification.');
      }
      const { nonce } = await chalRes.json();

      // Step B: Submit multipart form data
      const formData = new FormData();
      formData.append('photo', previewBlob, 'capture.jpg');
      formData.append('nonce', nonce);
      formData.append('lat', gpsData.lat.toString());
      formData.append('lon', gpsData.lon.toString());
      formData.append('accuracy', gpsData.accuracy.toString());
      formData.append('client_ts', Date.now().toString());

      const submitRes = await fetch('/api/capture/submit', {
        method: 'POST',
        body: formData,
      });

      const result = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(result.error || 'Server verification rejected the capture.');
      }

      onCaptureComplete({
        mediaId: result.media_id,
        path: result.path,
        phash: result.phash,
        lat: gpsData.lat,
        lon: gpsData.lon,
        accuracy: gpsData.accuracy,
        verified: true,
        capturedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setVerificationError(err instanceof Error ? err.message : 'Capture verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Viewport Frame */}
      <div className="relative aspect-[4/3] w-full max-w-xl mx-auto rounded-lg overflow-hidden bg-black border border-[var(--border)] shadow-md flex items-center justify-center">
        {previewUrl ? (
          // Captured Preview
          <img
            src={previewUrl}
            alt="Captured civic issue"
            className="w-full h-full object-cover"
          />
        ) : streamActive ? (
          // Active Video Stream
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        ) : permissionDenied ? (
          // Permission Denied State
          <div className="p-6 text-center text-xs space-y-3 max-w-sm text-gray-300">
            <VideoOff className="w-10 h-10 text-amber-500 mx-auto" />
            <h4 className="font-semibold text-sm text-white">Camera Access Denied</h4>
            <p className="text-gray-400">
              To guarantee authentic reporting, photos must be taken live with your device camera. Please allow camera
              permissions in your browser settings.
            </p>
            {onTextOnlySelected && (
              <button
                type="button"
                onClick={onTextOnlySelected}
                className="mt-2 inline-block px-3 py-1.5 rounded bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--border)] hover:text-white"
              >
                Submit Text-Only Report (Unverified)
              </button>
            )}
          </div>
        ) : cameraError ? (
          // Generic Camera Error
          <div className="p-6 text-center text-xs space-y-3 max-w-sm text-gray-300">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-red-400">{cameraError}</p>
            {onTextOnlySelected && (
              <button
                type="button"
                onClick={onTextOnlySelected}
                className="mt-2 inline-block px-3 py-1.5 rounded bg-[var(--surface-2)] text-[var(--fg-muted)] border border-[var(--border)]"
              >
                Submit Without Photo
              </button>
            )}
          </div>
        ) : (
          // Initializing Camera
          <div className="flex flex-col items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--brand)]" />
            <span>Initializing camera lens...</span>
          </div>
        )}

        {/* Live Non-Burned GPS Overlay Badge */}
        {gpsData && (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            <span>
              GPS: {gpsData.lat.toFixed(4)}°, {gpsData.lon.toFixed(4)}° (±{Math.round(gpsData.accuracy)}m)
            </span>
          </div>
        )}

        {/* Secure Provenance Badge */}
        <div className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-gray-300 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-[var(--brand)]" />
          <span>Camera Verified</span>
        </div>
      </div>

      {/* GPS Warnings & Feedback */}
      {gpsError && (
        <div className="p-3 rounded bg-amber-950/20 border border-amber-900/40 text-amber-400 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{gpsError}</span>
        </div>
      )}

      {verificationError && (
        <div className="p-3 rounded bg-red-950/20 border border-red-900/40 text-red-400 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{verificationError}</span>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex items-center justify-center gap-3">
        {!previewBlob ? (
          <button
            type="button"
            onClick={handleSnap}
            disabled={!streamActive || !gpsData || gpsData.accuracy > 10000}
            className="flex items-center gap-2 bg-[var(--brand)] text-[var(--brand-fg)] px-6 py-2.5 rounded-full text-xs font-semibold shadow-lg hover:opacity-90 disabled:opacity-40 transition-all"
          >
            <Camera className="w-4 h-4" />
            Capture Photo
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRetake}
              disabled={verifying}
              className="flex items-center gap-1.5 bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] px-4 py-2 rounded text-xs font-medium hover:bg-[var(--surface)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retake
            </button>
            <button
              type="button"
              onClick={handleUsePhoto}
              disabled={verifying}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded text-xs font-semibold shadow transition-colors"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying Proof...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Use Verified Photo
                </>
              )}
            </button>
          </>
        )}
      </div>

      <div className="text-center">
        <p className="text-[11px] text-[var(--fg-muted)]">
          No file uploads accepted. Photos must be taken in-browser with live GPS to prevent fraud.
        </p>
      </div>
    </div>
  );
}
