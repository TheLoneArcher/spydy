'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, MapPin, CheckCircle2, AlertTriangle, Send, Camera, X } from 'lucide-react';

const CATEGORIES = ['pothole', 'streetlight', 'garbage', 'water_leakage', 'road_damage', 'drainage', 'other'];

export default function SubmitReportPage() {
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');
  const [gpsLabel, setGpsLabel] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);

  const [form, setForm] = useState({
    title:          '',
    description:    '',
    category:       'other',
    severity:       'moderate',
    location_label: '',
    lat:            '',
    lon:            '',
  });

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const getGps = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setForm(prev => ({ ...prev, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) }));
        setGpsAccuracy(pos.coords.accuracy);
        setGpsLabel(`GPS acquired (${Math.round(pos.coords.accuracy)} m accuracy)`);
      },
      () => setError('Could not acquire GPS. Enter coordinates manually.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const openCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera capture requires a secure HTTPS connection.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraOpen(true);
      getGps();
    } catch {
      setError('Camera access was denied or is unavailable on this device.');
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      setError('Camera is still starting. Try again in a moment.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImagePreview(canvas.toDataURL('image/jpeg', 0.86));
    setCapturedAt(new Date().toISOString());
    closeCamera();
  };

  const handleSubmit = async (e: React.FormEvent, bypassDuplicateCheck = false) => {
    e.preventDefault();
    setLoading(true); setError('');

    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);

    if (isNaN(lat) || isNaN(lon)) {
      setError('Valid GPS coordinates are required.'); setLoading(false); return;
    }

    if (!bypassDuplicateCheck) {
      try {
        const res = await fetch('/api/detect-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            lat,
            lon,
            category: form.category
          })
        });
        
        if (res.ok) {
          const dupData = await res.json();
          if (dupData.isDuplicate && dupData.duplicateOf) {
            setDuplicateWarning(dupData);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('Duplicate detection error', err);
      }
    }

    const { error: dbErr } = await supabase.rpc('submit_report', {
      p_title: form.title,
      p_description: form.description,
      p_category: form.category,
      p_severity: form.severity,
      p_lat: lat,
      p_lon: lon,
      p_label: form.location_label,
      p_image_path: null,
    });

    setLoading(false);
    if (dbErr) { setError(dbErr.message); return; }

    setSuccess(true);
    setForm({ title: '', description: '', category: 'other', severity: 'moderate', location_label: '', lat: '', lon: '' });
    setImagePreview(null);
    setGpsLabel('');
    setGpsAccuracy(null);
    setCapturedAt(null);
    setDuplicateWarning(null);
    setTimeout(() => setSuccess(false), 5000);
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="max-w-xl mx-auto">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-semibold text-white">Submit a Report</h1>
            <p className="text-[13px] text-[#94A3B8] mt-0.5">Report an issue with AI assistance</p>
          </div>
        </div>

        {success && (
          <div className="mb-5 animate-fade-in bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium text-[14px]">Report submitted</p>
              <p className="text-[12px] text-emerald-400/70 mt-0.5">Thank you for your report.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 animate-fade-in bg-red-500/10 border border-red-500/20 rounded-md px-4 py-3 text-red-400 text-[13px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        
        {duplicateWarning && (
          <div className="mb-5 animate-fade-in bg-yellow-500/10 border border-yellow-500/20 rounded-md px-4 py-3 text-yellow-400 text-[13px]">
            <div className="flex items-center gap-2 font-medium mb-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Potential Duplicate Detected
            </div>
            <p className="mb-3 text-yellow-400/80">
              This looks very similar to an existing report ({(duplicateWarning.similarity * 100).toFixed(0)}% match).
            </p>
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={(e) => handleSubmit(e, true)}
                className="bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 px-3 py-1.5 rounded text-yellow-300 transition-colors"
              >
                Submit anyway
              </button>
              <button 
                type="button" 
                onClick={() => setDuplicateWarning(null)}
                className="text-yellow-400/70 hover:text-yellow-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-[12px] font-medium text-[#94A3B8]">Camera evidence</label>
              {imagePreview && (
                <button type="button" onClick={() => setImagePreview(null)} className="text-[11px] text-red-400 hover:text-red-300">
                  Retake photo
                </button>
              )}
            </div>
            <div className="border-2 border-dashed border-[#1F2937] rounded-lg min-h-[180px] flex flex-col items-center justify-center text-center relative overflow-hidden">
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                  <div className="relative z-10 flex flex-col items-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-2" />
                    <span className="text-sm font-medium text-white shadow-sm">Camera photo captured</span>
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-6 h-6 text-[#64748B] mb-2" />
                  <button type="button" onClick={openCamera} className="text-sm text-blue-400 hover:text-blue-300">Open camera</button>
                  <span className="text-[11px] text-[#64748B] mt-1">Gallery uploads are disabled</span>
                </>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {cameraOpen && (
              <div className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-4">
                <div className="w-full max-w-lg space-y-3">
                  <div className="flex justify-between items-center text-white">
                    <span className="text-sm font-medium">Capture issue photo</span>
                    <button type="button" onClick={closeCamera} aria-label="Close camera"><X className="w-5 h-5" /></button>
                  </div>
                  <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-lg bg-black aspect-video object-cover" />
                  <button type="button" onClick={capturePhoto} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium">Capture photo</button>
                </div>
              </div>
            )}
            {(form.lat && form.lon) && (
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
                <div className="font-medium">Geotag recorded</div>
                <div className="mt-1 font-mono text-emerald-300/80">
                  {form.lat}, {form.lon}{gpsAccuracy !== null ? ` • ±${Math.round(gpsAccuracy)} m` : ''}{capturedAt ? ` • ${new Date(capturedAt).toLocaleTimeString()}` : ''}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5">Title <span className="text-red-400">*</span></label>
              <input
                required
                value={form.title} onChange={f('title')}
                className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Brief description of the issue"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5">Details</label>
              <textarea
                rows={3}
                value={form.description} onChange={f('description')}
                className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
                placeholder="Describe the issue in detail..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5 flex justify-between">
                  <span>Category <span className="text-red-400">*</span></span>
                </label>
                <select
                  value={form.category} onChange={f('category')}
                  className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors capitalize"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#94A3B8] mb-1.5 flex justify-between">
                  <span>Severity <span className="text-red-400">*</span></span>
                </label>
                <select
                  value={form.severity} onChange={f('severity')}
                  className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="critical">Critical</option>
                  <option value="moderate">Moderate</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[13px] font-semibold text-white">Location <span className="text-red-400">*</span></h3>
              <button type="button" onClick={getGps} className="flex items-center gap-1.5 text-[12px] text-blue-400 hover:text-blue-300 border border-blue-500/20 bg-blue-600/10 px-3 py-1.5 rounded-md transition-colors">
                <MapPin className="w-3.5 h-3.5" /> {gpsLabel || 'Use GPS'}
              </button>
            </div>
            <input
              required
              value={form.location_label} onChange={f('location_label')}
              className="w-full bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Street address or landmark"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.lat} onChange={f('lat')}
                className="bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] font-mono focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Latitude"
              />
              <input
                value={form.lon} onChange={f('lon')}
                className="bg-[#0A0E17] border border-[#1F2937] rounded-md px-3 py-2 text-sm text-white placeholder-[#64748B] font-mono focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Longitude"
              />
            </div>
          </div>

          <button
            type="submit" disabled={loading || cameraOpen}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-md text-[13px] transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Submitting...' : 'Submit report'}
          </button>
        </form>
      </div>
    </div>
  );
}
