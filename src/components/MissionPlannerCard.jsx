import React, { useState, useEffect } from 'react';

function MissionPlannerCard({ 
  drones = [], 
  waypoints = [], 
  onUpdateWaypoint, 
  onDeleteWaypoint,
  onClearRoute,
  onSubmitMission
}) {
  const [activeSubTab, setActiveSubTab] = useState('route_builder'); // 'route_builder' or 'waypoint_list'

  // Form Fields
  const [missionName, setMissionName] = useState('DTLA Surveillance Alpha');
  const [missionType, setMissionType] = useState('Surveillance');
  const [selectedDroneId, setSelectedDroneId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dateTime, setDateTime] = useState('2026-06-23T16:00');
  const [notes, setNotes] = useState('Standard perimeter scan of Sector Delta.');

  // Route builder fields
  const [payloadType, setPayloadType] = useState('Optical Sensor Pod');
  const [payloadWeight, setPayloadWeight] = useState(2.2); // kg
  const [cameraMode, setCameraMode] = useState('4K / 30FPS / Wide-Angle');
  const [sensorSelection, setSensorSelection] = useState('Optical + Thermal');

  // Flight Rules Checkboxes
  const [rules, setRules] = useState({
    autoReturnHome: true,
    obstacleAvoidance: true,
    terrainFollowing: false,
    nightFlight: false,
    liveStreaming: true,
    emergencyLanding: true
  });

  // Default select first available drone if none selected
  useEffect(() => {
    if (drones.length > 0 && !selectedDroneId) {
      const active = drones.find(d => d.status !== 'Maintenance') || drones[0];
      setSelectedDroneId(active.id);
    }
  }, [drones, selectedDroneId]);

  const selectedDrone = drones.find(d => d.id === selectedDroneId) || {};

  // Calculations
  const calculateDistance = () => {
    if (waypoints.length < 2) return 0;
    let dist = 0;
    // Simple mock distance sum
    waypoints.forEach((wp, idx) => {
      if (idx === 0) return;
      const prev = waypoints[idx - 1];
      const d = Math.sqrt(Math.pow(wp.lat - prev.lat, 2) + Math.pow(wp.lng - prev.lng, 2)) * 111.32; // rough lat/lng degrees to km
      dist += d;
    });
    return dist;
  };

  const routeDistance = calculateDistance();
  const estimatedDurationMinutes = routeDistance * 1.5; // ~1.5 min per km
  const estimatedBatteryConsumption = Math.min(100, Math.round(routeDistance * 4.5 + (payloadWeight * 2.5) + (rules.liveStreaming ? 5 : 0)));

  // AI recommendations
  const getAiRecommendations = () => {
    const recs = [];
    if (waypoints.length === 0) {
      recs.push({
        type: 'info',
        title: 'Route Construction Required',
        desc: 'Place waypoints on the left map workspace to begin generating optimized AI flight paths.'
      });
      return recs;
    }

    // Battery warnings
    if (selectedDrone && selectedDrone.battery < estimatedBatteryConsumption) {
      recs.push({
        type: 'danger',
        title: 'Critical Battery Deficit',
        desc: `Mission requires ${estimatedBatteryConsumption}% power, but ${selectedDrone.id} has only ${Math.round(selectedDrone.battery)}%. Charge drone or plan a shorter route.`
      });
    } else if (estimatedBatteryConsumption > 45) {
      recs.push({
        type: 'warning',
        title: 'Battery Safety Margin Warning',
        desc: 'Estimated battery consumption is high. Disable Live Streaming or Terrain Following to save 6-8% power.'
      });
    }

    // Payload constraints
    if (payloadWeight > 3.0) {
      recs.push({
        type: 'warning',
        title: 'High Payload Weight',
        desc: 'Payload exceeds 3.0 kg, reducing speed and maneuverability. Obstacle Avoidance remains active.'
      });
    }

    // Location specific check
    const nearNoFly = waypoints.some(wp => {
      // Check if near mock coordinate center of Downtown LA no-fly
      const distanceToNoFly1 = Math.sqrt(Math.pow(wp.lat - 34.052, 2) + Math.pow(wp.lng - (-118.243), 2)) * 111;
      const distanceToNoFly2 = Math.sqrt(Math.pow(wp.lat - 34.059, 2) + Math.pow(wp.lng - (-118.248), 2)) * 111;
      return distanceToNoFly1 < 0.25 || distanceToNoFly2 < 0.25;
    });

    if (nearNoFly) {
      recs.push({
        type: 'danger',
        title: 'Restricted Airspace Alert',
        desc: 'A waypoint lies within 250m of a Helipad Airspace or High-Rise Sector. Re-route flight path.'
      });
    }

    if (recs.length === 0) {
      recs.push({
        type: 'success',
        title: 'Route Optimization Clear',
        desc: 'AI checks complete. Altitude parameters and battery budgets align within standard operating compliance margins.'
      });
    }

    return recs;
  };

  const aiRecs = getAiRecommendations();

  // Handle forms submits
  const handleLaunch = () => {
    if (waypoints.length === 0) {
      alert("Please draw or add waypoints before launching.");
      return;
    }
    const mission = {
      name: missionName,
      type: missionType,
      drone: selectedDroneId,
      priority,
      time: 'In Progress (Active)',
      status: 'In Progress',
      notes
    };
    onSubmitMission(mission);
  };

  const handleSchedule = () => {
    const formattedTime = new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(dateTime).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const mission = {
      name: missionName,
      type: missionType,
      drone: selectedDroneId,
      priority,
      time: formattedTime,
      status: 'Scheduled',
      notes
    };
    onSubmitMission(mission);
  };

  // Reset form
  const handleNewMission = () => {
    setMissionName('DTLA Mission #' + Math.floor(100 + Math.random() * 900));
    onClearRoute();
  };

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-full text-left">
      {/* Header */}
      <header className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/30">
        <div>
          <h3 className="font-extrabold text-slate-800 dark:text-slate-800 text-sm uppercase tracking-wide">Mission Planner Workspace</h3>
          <p className="text-[10px] text-slate-400 font-medium">Create and validate flight routing profiles</p>
        </div>
        <button 
          onClick={handleNewMission}
          className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          <span>New Mission</span>
        </button>
      </header>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
        
        {/* Section 1: Mission Identity */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Mission Name</label>
              <input 
                type="text" 
                value={missionName} 
                onChange={(e) => setMissionName(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1.5 px-2 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Mission Type</label>
              <select 
                value={missionType} 
                onChange={(e) => setMissionType(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1.5 px-2 text-slate-800 dark:text-slate-200"
              >
                {['Surveillance', 'Mapping', 'Delivery', 'Agriculture', 'Inspection', 'Emergency Response'].map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Drone</label>
              <select 
                value={selectedDroneId} 
                onChange={(e) => setSelectedDroneId(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1.5 px-2 text-slate-800 dark:text-slate-200"
              >
                {drones.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.id} ({d.model}) - {Math.round(d.battery)}%
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Priority</label>
              <select 
                value={priority} 
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1.5 px-2 text-slate-800 dark:text-slate-200"
              >
                {['Low', 'Medium', 'High', 'Critical'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Schedule Launch Date & Time</label>
              <input 
                type="datetime-local" 
                value={dateTime} 
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1.5 px-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Mission Guidelines & Notes</label>
            <textarea 
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-sky-500 py-1 px-2 text-slate-800 dark:text-slate-200"
              placeholder="Operational details..."
            />
          </div>
        </div>

        {/* Section 2: Tabs for Route Builder Details or Waypoint List */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="flex bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button 
              onClick={() => setActiveSubTab('route_builder')}
              className={`flex-1 text-center py-2.5 transition-all ${
                activeSubTab === 'route_builder' 
                  ? 'bg-white dark:bg-[#1E293B] border-b-2 border-b-sky-500 text-sky-500' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Route Configuration
            </button>
            <button 
              onClick={() => setActiveSubTab('waypoint_list')}
              className={`flex-1 text-center py-2.5 transition-all ${
                activeSubTab === 'waypoint_list' 
                  ? 'bg-white dark:bg-[#1E293B] border-b-2 border-b-sky-500 text-sky-500' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Waypoint List ({waypoints.length})
            </button>
          </div>

          <div className="p-3 bg-white dark:bg-[#1E293B]">
            {activeSubTab === 'route_builder' ? (
              <div className="space-y-4 text-xs">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                  <div>
                    <span className="text-[9px] text-slate-400 font-semibold block uppercase">Flight Rules</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">Default FAA Part 107</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-semibold block uppercase">Est. Battery Cost</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{estimatedBatteryConsumption}%</span>
                  </div>
                </div>

                {/* Payload settings */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Payload Parameters</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 block">Payload Type</span>
                      <input 
                        type="text" 
                        value={payloadType} 
                        onChange={(e) => setPayloadType(e.target.value)}
                        className="w-full text-xs rounded border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 block">Payload Weight (kg)</span>
                      <input 
                        type="number" 
                        step="0.1"
                        value={payloadWeight} 
                        onChange={(e) => setPayloadWeight(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs rounded border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 block">Camera Mode</span>
                      <input 
                        type="text" 
                        value={cameraMode} 
                        onChange={(e) => setCameraMode(e.target.value)}
                        className="w-full text-xs rounded border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 block">Sensor Array</span>
                      <input 
                        type="text" 
                        value={sensorSelection} 
                        onChange={(e) => setSensorSelection(e.target.value)}
                        className="w-full text-xs rounded border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Flight Rules Checkboxes */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Flight Rules Autonomy</span>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {[
                      { id: 'autoReturnHome', label: 'Auto Return Home' },
                      { id: 'obstacleAvoidance', label: 'Obstacle Avoidance' },
                      { id: 'terrainFollowing', label: 'Terrain Following' },
                      { id: 'nightFlight', label: 'Night Flight Mode' },
                      { id: 'liveStreaming', label: 'Live Streaming Feed' },
                      { id: 'emergencyLanding', label: 'Emergency Landing Protocol' }
                    ].map(item => (
                      <label key={item.id} className="flex items-center gap-1.5 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={rules[item.id]}
                          onChange={(e) => setRules({ ...rules, [item.id]: e.target.checked })}
                          className="rounded text-sky-500 focus:ring-sky-400 w-3.5 h-3.5"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Waypoint timeline list */}
                {waypoints.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No waypoints plotted. Click the map workspace on the left to start placing points.
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-slate-100 dark:border-slate-800 space-y-4 max-h-[300px] overflow-y-auto pr-1 text-xs text-left scrollbar-thin">
                    {waypoints.map((wp, idx) => {
                      const isLaunch = idx === 0;
                      const isReturn = idx === waypoints.length - 1 && waypoints.length > 1;

                      let nodeColor = 'bg-sky-500';
                      let stepName = `Waypoint ${idx + 1}`;
                      if (isLaunch) {
                        nodeColor = 'bg-emerald-500';
                        stepName = 'Launch Point (Start)';
                      } else if (isReturn) {
                        nodeColor = 'bg-red-500';
                        stepName = 'Return Point (End)';
                      }

                      return (
                        <div key={idx} className="relative space-y-1">
                          {/* Dot marker placement overlay */}
                          <div className={`absolute -left-[30px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1E293B] ${nodeColor}`} />
                          
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-800 block">{stepName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Lat: {wp.lat.toFixed(5)} · Lng: {wp.lng.toFixed(5)}
                              </span>
                            </div>
                            <button 
                              onClick={() => onDeleteWaypoint(idx)}
                              className="text-[10px] text-red-500 hover:underline font-semibold"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            {/* Altitude Editor */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 shrink-0">Alt:</span>
                              <input 
                                type="number" 
                                min="5"
                                max="120"
                                value={wp.altitude}
                                onChange={(e) => onUpdateWaypoint(idx, { altitude: parseInt(e.target.value) || 0 })}
                                className="w-16 text-center text-[11px] border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 py-0.5"
                              />
                              <span className="text-[10px] text-slate-400">m</span>
                            </div>

                            {/* Action selector */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 shrink-0">Action:</span>
                              <select
                                value={wp.action}
                                onChange={(e) => onUpdateWaypoint(idx, { action: e.target.value })}
                                className="text-[11px] border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-900 py-0.5 pr-1 w-full"
                              >
                                {['Hover', 'Capture Image', 'Start Recording', 'Deliver Payload', 'Return Home'].map(act => (
                                  <option key={act} value={act}>{act}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 3: AI Mission Assistant Insights Panel */}
        <div className="bg-sky-500/5 dark:bg-sky-950/15 border border-sky-100 dark:border-sky-950/50 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
            <span className="material-symbols-outlined text-base">smart_toy</span>
            <span className="font-extrabold text-[11px] uppercase tracking-wider">AI Mission Assistant</span>
          </div>
          <div className="space-y-2 text-xs">
            {aiRecs.map((rec, idx) => {
              let textClass = 'text-sky-700 dark:text-sky-300';
              let borderClass = 'border-sky-100/50 dark:border-sky-950/20';
              let icon = 'info';

              if (rec.type === 'danger') {
                textClass = 'text-red-700 dark:text-red-400';
                borderClass = 'border-red-200 dark:border-red-950/50 bg-red-500/5';
                icon = 'gpp_maybe';
              } else if (rec.type === 'warning') {
                textClass = 'text-amber-700 dark:text-amber-400';
                borderClass = 'border-amber-200 dark:border-amber-950/50 bg-amber-500/5';
                icon = 'warning';
              } else if (rec.type === 'success') {
                textClass = 'text-emerald-700 dark:text-emerald-400';
                borderClass = 'border-emerald-200 dark:border-emerald-950/50 bg-emerald-500/5';
                icon = 'verified';
              }

              return (
                <div key={idx} className={`p-2.5 rounded-lg border flex gap-2.5 items-start ${borderClass} ${textClass}`}>
                  <span className="material-symbols-outlined text-base mt-0.5 shrink-0">{icon}</span>
                  <div>
                    <h5 className="font-bold text-[11px] leading-tight">{rec.title}</h5>
                    <p className="text-[10px] opacity-90 mt-0.5 leading-normal">{rec.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: KPI Analytics cards */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Estimated Mission Telemetry KPI</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Est. Duration', val: `${estimatedDurationMinutes.toFixed(1)} min` },
              { label: 'Total Distance', val: `${routeDistance.toFixed(2)} km` },
              { label: 'Battery Usage', val: `${estimatedBatteryConsumption}%` },
              { label: 'Payload Weight', val: `${payloadWeight} kg` },
              { label: 'Risk Score', val: estimatedBatteryConsumption > 60 || aiRecs.some(r => r.type === 'danger') ? 'Critical' : estimatedBatteryConsumption > 40 ? 'Medium' : 'Low', color: estimatedBatteryConsumption > 60 || aiRecs.some(r => r.type === 'danger') ? 'text-red-500' : 'text-emerald-500' }
            ].slice(0, 5).map((kpi, idx) => (
              <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 p-2 rounded-lg text-center">
                <span className="text-[9px] text-slate-400 font-semibold block">{kpi.label}</span>
                <span className={`text-[11px] font-extrabold mt-0.5 block ${kpi.color || 'text-slate-800 dark:text-slate-800'}`}>{kpi.val}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Sticky Bottom Actions Bar */}
      <footer className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex justify-between gap-2">
        <button 
          onClick={handleNewMission}
          className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold shadow-xs cursor-pointer"
        >
          Save Draft
        </button>
        <div className="flex gap-2">
          <button 
            onClick={handleSchedule}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold shadow-xs cursor-pointer"
          >
            Schedule
          </button>
          <button 
            onClick={handleLaunch}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-100 dark:shadow-none cursor-pointer"
          >
            Launch Mission
          </button>
        </div>
      </footer>
    </div>
  );
}

export default MissionPlannerCard;




