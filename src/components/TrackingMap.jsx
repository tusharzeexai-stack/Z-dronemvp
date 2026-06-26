import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function TrackingMap({ detailedPath }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const polylineRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Create Leaflet instance
    const map = L.map(mapRef.current, {
      center: [28.8308, 76.9311],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    // Set tile layer
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    
    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    // Custom SVG Drone Icon
    const droneIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center w-12 h-12">
            <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
            <div class="w-8 h-8 bg-primary border-2 border-white rounded-full flex items-center justify-center shadow-lg text-slate-800 z-10">
                <span class="material-symbols-outlined text-[18px]">flight_takeoff</span>
            </div>
        </div>
      `,
      className: 'custom-drone-icon',
      iconSize: [48, 48],
      iconAnchor: [24, 24]
    });

    const flightPathCoords = [
      [28.8308, 76.9311],
      [28.8325, 76.9335],
      [28.8340, 76.9358],
      [28.8355, 76.9380],
      [28.8375, 76.9395],
      [28.8390, 76.9375],
      [28.8405, 76.9350],
      [28.8395, 76.9325],
      [28.8375, 76.9300],
      [28.8350, 76.9280],
      [28.8325, 76.9275],
      [28.8300, 76.9285],
      [28.8285, 76.9305],
      [28.8295, 76.9325],
      [28.8308, 76.9311]
    ];

    // Plot path
    polylineRef.current = L.polyline(flightPathCoords, {
      color: '#38bdf8',
      weight: 3,
      dashArray: '8, 8',
      opacity: 0.8
    }).addTo(map);

    // Place marker
    markerRef.current = L.marker(detailedPath[0] || [28.8308, 76.9311], { icon: droneIcon }).addTo(map);


    // Expose global markers for update from parent/SSE
    window.droneMarker = markerRef.current;
    window.mapInstance = map;

    return () => {
      map.remove();
      window.droneMarker = null;
      window.mapInstance = null;
    };
  }, []);

  // Expose controls on window
  useEffect(() => {
    window.focusOnDrone = () => {
      if (mapInstanceRef.current && markerRef.current) {
        mapInstanceRef.current.panTo(markerRef.current.getLatLng(), { animate: true });
      }
    };
    window.zoomIn = () => {
      if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
    };
    window.zoomOut = () => {
      if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
    };

    return () => {
      window.focusOnDrone = null;
      window.zoomIn = null;
      window.zoomOut = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-inner border border-outline-variant/10 dark:border-outline/10">
      <div ref={mapRef} className="w-full h-full min-h-[400px] z-10" />
      {/* Zoom / Focus controls overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
        <button onClick={() => window.zoomIn?.()} className="p-2 bg-white dark:bg-inverse-surface border border-outline-variant/30 rounded-lg shadow-md hover:bg-slate-50 active:scale-95 transition-all text-on-surface dark:text-inverse-on-surface flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">add</span>
        </button>
        <button onClick={() => window.zoomOut?.()} className="p-2 bg-white dark:bg-inverse-surface border border-outline-variant/30 rounded-lg shadow-md hover:bg-slate-50 active:scale-95 transition-all text-on-surface dark:text-inverse-on-surface flex items-center justify-center">
          <span className="material-symbols-outlined text-sm">remove</span>
        </button>
        <button onClick={() => window.focusOnDrone?.()} className="p-2 bg-white dark:bg-inverse-surface border border-outline-variant/30 rounded-lg shadow-md hover:bg-slate-50 active:scale-95 transition-all text-on-surface dark:text-inverse-on-surface flex items-center justify-center gap-1">
          <span className="material-symbols-outlined text-sm">gps_fixed</span>
        </button>
      </div>
    </div>
  );
}

export default TrackingMap;




