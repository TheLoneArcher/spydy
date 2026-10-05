'use client';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, MapPin, CheckCircle2, AlertTriangle, Send, Upload, Sparkles } from 'lucide-react';

const CATEGORIES = ['pothole', 'streetlight', 'garbage', 'water_leakage', 'road_damage', 'drainage', 'other'];

export default function SubmitReportPage() {
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');
  const [gpsLabel, setGpsLabel] = useState('');
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const getGps = () => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setForm(prev => ({ ...prev, lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) }));
        setGpsLabel('GPS acquired');
      },
      () => setError('Could not acquire GPS. Enter coordinates manually.'),
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    
    // Upload immediately
    setUploadingImage(true);
    try {
      const { data, error } = await supabase.storage.from('report-images').upload(`${Date.now()}-${file.name}`, file);
      if (error) throw error;
      
      const url = supabase.storage.from('report-images').getPublicUrl(data.path).data.publicUrl;
      setImageUrl(url);
    } catch (err: any) {
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const categorizeWithAI = async () => {
    if (!form.title && !form.description && !imageUrl) {
      setError('Please provide a title, description, or image for AI to analyze.');
      return;
    }
    
    setAiLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          imageUrl: imageUrl
        })
      });
      
      if (!res.ok) throw new Error('AI categorization failed');
      
      const data = await res.json();
      
      setForm(prev => ({
        ...prev,
        category: data.category || prev.category,
        severity: data.severity || prev.severity,
        title: data.suggested_title || prev.title,
      }));
      setAiConfidence(data.confidence);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
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

    const { data: { user } } = await supabase.auth.getUser();

    const { error: dbErr } = await supabase.from('need_reports').insert({
      title:          form.title,
      description:    form.description,
      category:       form.category,
      severity:       form.severity,
      location:       `POINT(${lon} ${lat})`,
      latitude:       lat,
      longitude:      lon,
      location_label: form.location_label,
      image_url:      imageUrl,
      submitted_by:   user?.id,
      status:         'pending',
    });

    setLoading(false);
    if (dbErr) { setError(dbErr.message); return; }

    setSuccess(true);
    setForm({ title: '', description: '', category: 'other', severity: 'moderate', location_label: '', lat: '', lon: '' });
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setAiConfidence(null);
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
          <button 
            type="button" 
            onClick={categorizeWithAI} 
            disabled={aiLoading || uploadingImage}
            className="flex items-center gap-1.5 text-[12px] text-purple-400 hover:text-purple-300 border border-purple-500/20 bg-purple-600/10 px-3 py-1.5 rounded-md transition-colors"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Auto-fill with AI
          </button>
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
            <label className="block text-[12px] font-medium text-[#94A3B8]">Photo Evidence</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#1F2937] hover:border-blue-500/50 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors relative overflow-hidden group"
            >
              {imagePreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                  <div className="relative z-10 flex flex-col items-center">
                    {uploadingImage ? (
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-2" />
                    ) : (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 mb-2" />
                    )}
                    <span className="text-sm font-medium text-white shadow-sm">
                      {uploadingImage ? 'Uploading...' : 'Image uploaded. Click to change.'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-[#64748B] mb-2" />
                  <span className="text-sm text-[#94A3B8]">Click to upload a photo</span>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageChange}
              />
            </div>
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
                  {aiConfidence && <span className="text-purple-400 text-[10px]">AI {Math.round(aiConfidence * 100)}%</span>}
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
            type="submit" disabled={loading || uploadingImage}
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
