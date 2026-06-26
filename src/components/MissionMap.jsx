import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function MissionMap({ 
  waypoints = [], 
  onAddWaypoint, 
  onUpdateWaypoint, 
  onDeleteWaypoint,
  onClearRoute,
  geofence = [],
  noFlyZones = [],
  satelliteMode = false,
  setSatelliteMode
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const polylineRef = useRef(null);
  const geofenceLayerRef = useRef(null);
  const noFlyZonesGroupRef = useRef(null);
  const tileLayerRef = useRef(null);

  const [addMode, setAddMode] = useState(true);
  const [showGeofence, setShowGeofence] = useState(true);
  const [showNoFly, setShowNoFly] = useState(true);

  // Keep a ref of the addMode to read in leaflet events without re-binding
  const addModeRef = useRef(addMode);
  useEffect(() => {
    addModeRef.current = addMode;
  }, [addMode]);

  // Calculate route metrics
  const calculateDistance = () => {
    if (waypoints.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = L.latLng(waypoints[i].lat, waypoints[i].lng);
      const p2 = L.latLng(waypoints[i + 1].lat, waypoints[i + 1].lng);
      dist += p1.distanceTo(p2); // in meters
    }
    return (dist / 1000).toFixed(2); // in km
  };

  const routeDistance = calculateDistance();
  const estimatedFlightTime = (routeDistance * 1.5).toFixed(1); // 1.5 min per km approx

  // Handle map click
  const handleMapClick = (e) => {
    if (addModeRef.current) {
      const { lat, lng } = e.latlng;
      onAddWaypoint(lat, lng);
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create Map
    const map = L.map(mapContainerRef.current, {
      center: [34.056, -118.245],
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });
    mapInstanceRef.current = map;

    // Layer groups
    markersGroupRef.current = L.layerGroup().addTo(map);
    noFlyZonesGroupRef.current = L.layerGroup().addTo(map);

    // Event listener for adding waypoints
    map.on('click', handleMapClick);

    // Initial Zoom Controls (bottom right overlay)
    window.zoomInMission = () => map.zoomIn();
    window.zoomOutMission = () => map.zoomOut();

    return () => {
      map.off('click', handleMapClick);
      map.remove();
      mapInstanceRef.current = null;
      window.zoomInMission = null;
      window.zoomOutMission = null;
    };
  }, []);

  // Update Base Tile Layer when satelliteMode or theme changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let tileUrl;
    if (satelliteMode) {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else {
      const isDark = document.documentElement.classList.contains('dark');
      tileUrl = isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    }

    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
  }, [satelliteMode]);

  // Sync Geofence Polygon
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geofenceLayerRef.current) {
      map.removeLayer(geofenceLayerRef.current);
      geofenceLayerRef.current = null;
    }

    if (showGeofence && geofence.length > 0) {
      geofenceLayerRef.current = L.polygon(geofence, {
        color: '#0284c7',
        fillColor: '#0ea5e9',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 5'
      }).addTo(map);
    }
  }, [geofence, showGeofence]);

  // Sync No-Fly Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = noFlyZonesGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showNoFly) {
      noFlyZones.forEach(zone => {
        L.circle(zone.center, {
          radius: zone.radius,
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.25,
          weight: 2
        })
        .bindPopup(`<strong class="text-red-500 font-bold">${zone.name}</strong><br/>No-Fly Airspace Zone`)
        .addTo(group);
      });
    }
  }, [noFlyZones, showNoFly]);

  // Sync Waypoints & Path Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    // Clear old layers
    group.clearLayers();
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const points = [];

    // Draw markers
    waypoints.forEach((wp, idx) => {
      points.push([wp.lat, wp.lng]);

      // Define marker icons depending on role
      const isStart = idx === 0;
      const isEnd = idx === waypoints.length - 1 && waypoints.length > 1;

      let markerColor = 'bg-sky-500';
      let iconSymbol = `${idx + 1}`;
      if (isStart) {
        markerColor = 'bg-emerald-500';
        iconSymbol = 'play_arrow';
      } else if (isEnd) {
        markerColor = 'bg-red-500';
        iconSymbol = 'outlined_flag';
      }

      const customIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center w-8 h-8">
            <div class="absolute inset-0 ${markerColor}/20 rounded-full animate-ping opacity-75"></div>
            <div class="w-6 h-6 ${markerColor} border-2 border-white rounded-full flex items-center justify-center shadow-lg text-white text-[11px] font-extrabold z-10">
              ${isStart || isEnd 
                ? `<span class="material-symbols-outlined text-[12px]">${iconSymbol}</span>` 
                : iconSymbol
              }
            </div>
          </div>
        `,
        className: 'custom-waypoint-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([wp.lat, wp.lng], { 
        icon: customIcon, 
        draggable: true 
      });

      // Handle drag end to update state coordinates
      marker.on('dragend', (event) => {
        const m = event.target;
        const pos = m.getLatLng();
        onUpdateWaypoint(idx, { lat: pos.lat, lng: pos.lng });
      });

      // Add popup with options
      const popupContent = L.DomUtil.create('div', 'p-2 space-y-2 text-left');
      popupContent.innerHTML = `
        <div class="text-xs font-bold text-slate-800 dark:text-white mb-1">
          ${isStart ? 'Launch Point (Start)' : isEnd ? 'Final Return Point' : `Waypoint #${idx + 1}`}
        </div>
        <div class="text-[10px] text-slate-500 space-y-0.5 font-mono">
          <div>Lat: ${wp.lat.toFixed(5)}</div>
          <div>Lng: ${wp.lng.toFixed(5)}</div>
          <div>Alt: ${wp.altitude}m</div>
          <div>Action: ${wp.action}</div>
        </div>
      `;

      // Add delete button inside popup
      const deleteBtn = L.DomUtil.create('button', 'w-full text-center py-1 mt-2 text-[10px] font-bold text-red-500 border border-red-200 rounded hover:bg-red-50 transition-colors cursor-pointer', popupContent);
      deleteBtn.innerHTML = 'Remove Waypoint';
      L.DomEvent.on(deleteBtn, 'click', () => {
        onDeleteWaypoint(idx);
        map.closePopup();
      });

      marker.bindPopup(popupContent);
      marker.addTo(group);
    });

    // Draw connecting dashed line
    if (points.length >= 2) {
      polylineRef.current = L.polyline(points, {
        color: '#0ea5e9',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.8
      }).addTo(map);
    }
  }, [waypoints, onUpdateWaypoint, onDeleteWaypoint]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      {/* Map Target */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[480px] z-10" />

      {/* Floating Readouts (Top Left Overlay) */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-lg flex items-center gap-4 text-left pointer-events-auto">
          <div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Path Distance</span>
            <span className="text-base font-extrabold text-slate-800 dark:text-white">{routeDistance} km</span>
          </div>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
          <div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Est. Duration</span>
            <span className="text-base font-extrabold text-slate-800 dark:text-white">{estimatedFlightTime} min</span>
          </div>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
          <div>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Waypoints</span>
            <span className="text-base font-extrabold text-slate-800 dark:text-white">{waypoints.length}</span>
          </div>
        </div>
      </div>

      {/* Floating Map Controls (Top Right Overlay) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        {/* Toggle click-to-add mode */}
        <button 
          onClick={() => setAddMode(!addMode)}
          className={`p-2.5 rounded-xl border shadow-md flex items-center justify-center gap-1.5 transition-all text-xs font-bold ${
            addMode 
              ? 'bg-sky-500 text-white border-sky-600' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
          }`}
          title={addMode ? "Clicking map places waypoints (Active)" : "Enable waypoint placement mode"}
        >
          <span className="material-symbols-outlined text-sm">add_location_alt</span>
          <span>Add Waypoint</span>
        </button>

        {/* Clear route */}
        <button 
          onClick={onClearRoute}
          className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md hover:bg-slate-50 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 text-xs font-bold transition-all"
        >
          <span className="material-symbols-outlined text-sm">delete_sweep</span>
          <span>Clear Route</span>
        </button>

        {/* Return home point checkbox/action */}
        {waypoints.length > 0 && (
          <button 
            onClick={() => {
              // Add a waypoint matching waypoint 0's coords
              onAddWaypoint(waypoints[0].lat, waypoints[0].lng);
            }}
            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-md hover:bg-slate-50 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 text-xs font-bold transition-all"
          >
            <span className="material-symbols-outlined text-sm">home_pin</span>
            <span>Return Home</span>
          </button>
        )}

        {/* Toggle boundaries overlay */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 rounded-xl shadow-md flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showGeofence} 
              onChange={(e) => setShowGeofence(e.target.checked)}
              className="rounded text-sky-500 focus:ring-sky-400 w-3.5 h-3.5"
            />
            <span>GeoFence Boundary</span>
          </label>
          <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showNoFly} 
              onChange={(e) => setShowNoFly(e.target.checked)}
              className="rounded text-sky-500 focus:ring-sky-400 w-3.5 h-3.5"
            />
            <span>No-Fly Zones</span>
          </label>
        </div>
      </div>

      {/* Satellite / Terrain & Zoom controls (Bottom Right Overlay) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
        {/* Satellite Toggle */}
        <button 
          onClick={() => setSatelliteMode(!satelliteMode)}
          className={`p-2.5 rounded-xl border shadow-md flex items-center justify-center gap-1.5 transition-all text-xs font-bold ${
            satelliteMode 
              ? 'bg-sky-500 text-white border-sky-600 shadow-sky-200' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
          }`}
        >
          <span className="material-symbols-outlined text-sm">satellite_alt</span>
          <span>Satellite View</span>
        </button>

        {/* Standard zoom controls */}
        <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded-xl shadow-md">
          <button 
            onClick={() => window.zoomInMission?.()}
            className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-200 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-sm font-bold">add</span>
          </button>
          <button 
            onClick={() => window.zoomOutMission?.()}
            className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-slate-700 dark:text-slate-200 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-sm font-bold">remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MissionMap;

