'use client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents, useMap } from 'react-leaflet';
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

const severityConfig: Record<string, { color: string; radius: number }> = {
  critical: { color: 'var(--map-critical)', radius: 9 },
  moderate: { color: 'var(--map-moderate)', radius: 7 },
  low:      { color: 'var(--map-low)', radius: 7 },
};

function getMarkerStyle(severity: string, status: string) {
  const resolved = ['resolved', 'resolved_pending_confirmation', 'closed'].includes(status);
  const config = severityConfig[severity] ?? severityConfig.low;
  return {
    color: resolved ? 'var(--map-resolved)' : config.color,
    fillColor: resolved ? 'transparent' : config.color,
    fillOpacity: resolved ? 0 : 0.15,
    radius: resolved ? 5 : config.radius,
    weight: 2,
  };
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

export default function MapClient({ reports, onSelectReport, allowClick, onMapClick, center, zoom, volunteerLocations }: Props) {
  const [mounted, setMounted] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const defaultCenter: [number, number] = center ?? [13.6288, 79.4192];

  useEffect(() => {
    setMounted(true);
    const updateTheme = () => setResolvedTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      setMounted(false);
    };
  }, []);

  return (
    <div className="map-shell w-full h-full relative">
      {mounted && (
        <MapContainer
          center={defaultCenter}
          zoom={zoom ?? 13}
          className="map-container w-full h-full"
          zoomControl={true}
          maxBounds={[[13.55, 79.33], [13.72, 79.58]]}
          maxBoundsViscosity={1}
          minZoom={11}
        >
          <ChangeView center={defaultCenter} zoom={zoom ?? 13} />
          <TileLayer
            key={resolvedTheme}
            attribution="© OpenStreetMap contributors © CARTO"
            subdomains="abcd"
            maxZoom={19}
            url={resolvedTheme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'}
          />
          <TileLayer
            key={`${resolvedTheme}-labels`}
            attribution=""
            subdomains="abcd"
            maxZoom={19}
            opacity={0.5}
            url={resolvedTheme === 'dark'
              ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
              : 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'}
          />
          
          {allowClick && onMapClick && <MapClickHandler onClick={onMapClick} />}

          {reports.map((r) => {
            const pos = (r.latitude && r.longitude) 
              ? [parseFloat(r.latitude), parseFloat(r.longitude)] as [number, number] 
              : parsePoint(r.location);
            if (!pos) return null;
            const markerStyle = getMarkerStyle(r.severity, r.status);
            const urgent = r.urgent_votes ?? r.up_votes ?? r.votes_urgent ?? 0;
            const notUrgent = r.not_urgent_votes ?? r.down_votes ?? r.votes_not_urgent ?? 0;
            return (
              <CircleMarker
                key={r.id}
                center={pos}
                pathOptions={markerStyle}
                radius={markerStyle.radius}
                eventHandlers={{ click: () => onSelectReport?.(r) }}
              >
                <Popup>
                  <div className="map-popup min-w-[190px]">
                    <p className="map-popup-title">{r.title}</p>
                    <p className="map-popup-meta">{r.category || r.location_label || 'Civic report'}</p>
                    <p className="map-popup-meta capitalize">{String(r.status).replaceAll('_', ' ')}</p>
                    <p className="map-popup-votes">Urgent {urgent} · Not urgent {notUrgent}</p>
                    <a className="map-popup-link" href={`/reports/${r.id}`}>View report</a>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {volunteerLocations?.map((v) => (
            <CircleMarker key={v.id} center={[v.lat, v.lng]} radius={4} pathOptions={{ color: 'var(--map-volunteer)', fillColor: 'var(--map-volunteer)', fillOpacity: 0.7, weight: 1 }}>
              <Popup>
                <div className="map-popup">
                  <p className="map-popup-title">{v.name}</p>
                  <p className="map-popup-meta">Available volunteer</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
          <div className="map-legend" aria-label="Report priority legend">
            <span><i className="map-legend-dot critical" />Critical</span>
            <span><i className="map-legend-dot moderate" />Moderate</span>
            <span><i className="map-legend-dot low" />Low</span>
            <span><i className="map-legend-dot resolved" />Resolved</span>
          </div>
        </MapContainer>
      )}
    </div>
  );
}
