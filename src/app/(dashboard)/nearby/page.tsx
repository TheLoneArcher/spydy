'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { parsePoint } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { Loader2, MapPin, ChevronRight, AlertTriangle, CheckCircle2, Clock, Navigation, Star } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const MapClient = dynamic(() => import('@/components/MapClient'), { ssr: false, loading: () => <div className="w-full h-full bg-[#0D1117] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div> });

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  moderate: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low:      'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

export default function NearbyPage() {
  const [reports, setReports]       = useState<any[]>([]);
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [mySkills, setMySkills]     = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<any>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tab, setTab]               = useState<'map' | 'list'>('list');
  const [gpsError, setGpsError]     = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: vol } = await supabase
        .from('volunteer_profiles')
        .select('user_id, skills, location, on_duty')
        .eq('user_id', user.id)
        .maybeSingle();

      if (vol) {
        setVolunteerId(vol.user_id);
        setMySkills(vol.skills ?? []);
        // Parse stored location
        if (vol.location) {
          const coords = parsePoint(vol.location);
          if (coords) setMyLocation({ lat: coords[0], lng: coords[1] });
        }
      }

      const { data: all } = await supabase.rpc('nearby_open_reports');
      setReports((all ?? []).map((report: any) => ({
        ...report,
        location: { type: 'Point', coordinates: [report.lon, report.lat] },
      })));
      setLoading(false);

      // Try GPS
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setMyLocation(loc);
          },
          () => setGpsError('Enable location for distance calculation.')
        );
      }
    };
    init();
  }, []);

  const getDistance = (loc: any): string | null => {
    if (!loc || !myLocation) return null;
    const coords = parsePoint(loc);
    if (!coords) return null;
    const rLat = coords[0];
    const rLng = coords[1];
    const R = 6371;
    const dLat = (rLat - myLocation.lat) * Math.PI / 180;
    const dLng = (rLng - myLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(myLocation.lat*Math.PI/180)*Math.cos(rLat*Math.PI/180)*Math.sin(dLng/2)**2;
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
  };

  // Sort by skill match + distance
  const sorted = [...reports].sort((a, b) => {
    const aMatch = mySkills.includes(a.required_skill) ? 1 : 0;
    const bMatch = mySkills.includes(b.required_skill) ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;
    const aDist = getDistance(a.location);
    const bDist = getDistance(b.location);
    if (!aDist && !bDist) return 0;
    if (!aDist) return 1;
    if (!bDist) return -1;
    return parseFloat(aDist) - parseFloat(bDist);
  });

  if (loading) return <div className="flex h-full items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white">Nearby Issues</h1>
            <p className="text-[13px] text-[#94A3B8] mt-0.5">Active incidents sorted by your skill match and proximity</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('list')} className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${tab === 'list' ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white border border-[#1F2937] bg-[#111827]'}`}>List</button>
            <button onClick={() => setTab('map')} className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${tab === 'map' ? 'bg-blue-600 text-white' : 'text-[#94A3B8] hover:text-white border border-[#1F2937] bg-[#111827]'}`}>Map</button>
          </div>
        </div>

        {gpsError && (
          <div className="mb-4 text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {gpsError}
          </div>
        )}

        {mySkills.length > 0 && (
          <div className="mb-5 flex gap-2 flex-wrap">
            <span className="text-[11px] text-[#64748B] uppercase tracking-widest font-semibold pr-1">Your skills:</span>
            {mySkills.map(s => (
              <span key={s} className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium capitalize">
                {s.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}

        {tab === 'map' ? (
          <div className="h-[500px] rounded-lg overflow-hidden border border-[#1F2937]">
            <MapClient
              reports={reports}
              onSelectReport={setSelected}
              center={myLocation ? [myLocation.lat, myLocation.lng] : undefined}
              zoom={myLocation ? 11 : 5}
            />
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.length === 0 && (
              <div className="text-center py-16 text-[#64748B]">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No open incidents near you right now.</p>
              </div>
            )}
            {sorted.map((r) => {
              const dist = getDistance(r.location);
              const skillMatch = r.required_skill && mySkills.includes(r.required_skill);
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="bg-[#111827] border border-[#1F2937] hover:border-[#374151] rounded-lg px-4 py-3.5 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {skillMatch && (
                          <span title="Matches your skills">
                            <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEVERITY_COLOR[r.severity] || ''}`}>
                          {r.severity}
                        </span>
                        {r.required_skill && (
                          <span className="text-[10px] text-[#94A3B8] bg-[#1F2937] px-2 py-0.5 rounded border border-[#374151] capitalize font-medium">
                            {r.required_skill.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] font-medium text-white group-hover:text-blue-300 transition-colors leading-snug">{r.title}</p>
                      <div className="flex items-center gap-4 mt-1.5 text-[12px] text-[#64748B]">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{r.location_label || '—'}
                        </span>
                        {dist && (
                          <span className="flex items-center gap-1">
                            <Navigation className="w-3 h-3 text-blue-400" /><span className="text-blue-400 font-medium">{dist}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#374151] group-hover:text-[#64748B] mt-1 flex-shrink-0 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Side panel / modal for selected */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0D1117] border border-[#1F2937] rounded-xl w-full max-w-md p-6 animate-fade-in">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${SEVERITY_COLOR[selected.severity] || ''}`}>{selected.severity}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{selected.title}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="text-[#64748B] hover:text-white transition-colors ml-4 text-xl leading-none">&times;</button>
              </div>

              {selected.description && (
                <p className="text-[13px] text-[#94A3B8] mb-4 leading-relaxed">{selected.description}</p>
              )}

              <div className="space-y-2 text-[13px] mb-5">
                <div className="flex items-center gap-2 text-[#94A3B8]"><MapPin className="w-4 h-4 text-[#6B7280]" /> {selected.location_label || '—'}</div>
                {getDistance(selected.location) && (
                  <div className="flex items-center gap-2 text-blue-400 font-medium"><Navigation className="w-4 h-4" /> {getDistance(selected.location)} away</div>
                )}
              </div>

              <div className="text-center text-[13px] text-[#64748B] py-2">
                Dispatchers assign volunteers to reports. Ask a dispatcher to assign you to this incident.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
