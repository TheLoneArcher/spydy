'use client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import { parsePoint } from '@/lib/geo';

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && typeof map.setView === 'function') {
      try {
        map.setView(center, zoom);
      } catch (e) {
        // Ignore errors during tear-down
      }
    }
  }, [center, zoom, map]);
  return null;
}

const severityConfig: Record<string, { color: string; pulse: boolean }> = {
  critical: { color: '#EF4444', pulse: true },
  moderate: { color: '#F59E0B', pulse: false },
  low:      { color: '#3B82F6', pulse: false },
};

const statusConfig: Record<string, string> = {
  verified:    '#10B981',
  in_progress: '#8B5CF6',
  dispatched:  '#A855F7',
};

function makeIcon(severity: string, status: string) {
  const col = status === 'verified'
    ? statusConfig.verified
    : status === 'in_progress' || status === 'dispatched'
    ? statusConfig[status]
    : (severityConfig[severity]?.color ?? '#3B82F6');

  const pulse = severityConfig[severity]?.pulse && status === 'pending';

  return L.divIcon({
    className: 'custom-map-marker',
    iconSize:   [36, 36],
    iconAnchor: [18, 36],
    popupAnchor:[0, -36],
    html: `
      <div class="relative w-9 h-9 flex items-center justify-center group" style="transform: translateY(-2px);">
        ${pulse ? `<div class="absolute bottom-1 w-5 h-2 rounded-[100%] animate-pulse" style="background:${col}; box-shadow:0 0 12px 4px ${col}; opacity:0.6;"></div>` : ''}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="${col}" stroke="#1e293b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="relative z-10 transition-transform duration-300 group-hover:-translate-y-1 drop-shadow-[0_6px_6px_rgba(0,0,0,0.6)]">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
          <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"></circle>
        </svg>
      </div>
    `,
  });
}

function MapClickHandler({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({ click: e => onClick(e.latlng) });
  return null;
}

interface Props {
  reports: any[];
  onSelectReport?: (r: any) => void;
  allowClick?: boolean;
  onMapClick?: (latlng: L.LatLng) => void;
  center?: [number, number];
  zoom?: number;
  volunteerLocations?: { id: string; name: string; lat: number; lng: number }[];
}

const volunteerIcon = L.divIcon({
  className: 'custom-volunteer-marker',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
  html: `
    <div class="relative w-9 h-9 flex items-center justify-center group" style="transform: translateY(-2px);">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#2563EB" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="relative z-10 transition-transform duration-300 group-hover:-translate-y-1 drop-shadow-[0_4px_5px_rgba(0,0,0,0.5)]">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
      </svg>
      <div class="absolute top-1 z-20 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
        <svg fill="#2563EB" viewBox="0 0 24 24" width="10" height="10"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>
    </div>
  `,
});

export default function MapClient({ reports, onSelectReport, allowClick, onMapClick, center, zoom, volunteerLocations }: Props) {
  const [mounted, setMounted] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const defaultCenter: [number, number] = center ?? [20.5937, 78.9629]; // India default

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);



  return (
    <div className="w-full h-full relative bg-[#0A0E17]">
      {mounted && (
        <MapContainer
          center={defaultCenter}
          zoom={zoom ?? 5}
          className="w-full h-full"
          zoomControl={true}
          ref={(map) => { if (map) mapRef.current = map; }}
        >
          <ChangeView center={defaultCenter} zoom={zoom ?? 5} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {allowClick && onMapClick && <MapClickHandler onClick={onMapClick} />}

          {reports.map((r) => {
            const pos = (r.latitude && r.longitude) 
              ? [parseFloat(r.latitude), parseFloat(r.longitude)] as [number, number] 
              : parsePoint(r.location);
            if (!pos) return null;
            return (
              <Marker
                key={r.id}
                position={pos}
                icon={makeIcon(r.severity, r.status)}
                eventHandlers={{ click: () => onSelectReport?.(r) }}
              >
                <Popup>
                  <div className="min-w-[180px]">
                    <p className="font-semibold text-[14px] mb-1">{r.title}</p>
                    <p className="text-[12px] text-gray-500 mb-2">{r.location_label}</p>
                    <div className="flex gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium
                        ${r.severity === 'critical' ? 'bg-red-100 text-red-700' : r.severity === 'moderate' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {r.severity}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                        {r.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {volunteerLocations?.map((v) => (
            <Marker key={v.id} position={[v.lat, v.lng]} icon={volunteerIcon}>
              <Popup>
                <div>
                  <p className="font-semibold text-[14px]">{v.name}</p>
                  <p className="text-[12px] text-gray-500">Volunteer</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
