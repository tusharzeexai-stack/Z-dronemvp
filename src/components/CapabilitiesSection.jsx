import React, { useState } from 'react';

function CapabilitiesSection() {
  const [activeSystem, setActiveSystem] = useState('ai'); // ai, spatial, fleet

  const systemCapabilities = {
    ai: {
      title: "AI-Enabled Detection & Data Processing",
      status: "Operational",
      latency: "42ms",
      throughput: "1.2 GB/s",
      summary: "High-performance computer vision engine running real-time YOLO object detection and automatic reporting.",
      features: [
        { label: "Target Classification", desc: "Real-time identification of vehicles, personnel, thermal hotspots, and structural fractures.", ok: true },
        { label: "Data Pipeline", desc: "Automated telemetry ingestion, video slicing, and sensor data interpolation.", ok: true },
        { label: "Automated Reporting", desc: "Generates instant inspection PDF reports with image crops, geolocation pins, and severity ratings.", ok: true },
        { label: "Anomaly Triggers", desc: "Immediate visual highlighting and notification dispatch on hazard threshold crossings.", ok: true }
      ],
      metrics: [
        { name: "Precision Accuracy", val: "98.4%" },
        { name: "Frame Slicing Time", val: "18 ms" },
        { name: "Model Size", val: "104 MB" }
      ]
    },
    spatial: {
      title: "Geospatial Intelligence & 3D Twins",
      status: "Operational",
      latency: "68ms",
      throughput: "4.5 GB/s",
      summary: "GIS-enabled map pipeline converting raw photographs into orthomosaics, digital surface models, and 3D wireframe twins.",
      features: [
        { label: "Multi-Source Mapping", desc: "Seamless blending of Satellite, DSM, and thermal heatmaps with zero coordinate drift.", ok: true },
        { label: "3D Mesh Reconstruction", desc: "Voxel and point cloud terrain modeling based on flight camera path images.", ok: true },
        { label: "Digital Twin Syncing", desc: "Dynamic mirroring of physical yaw, pitch, roll, and battery voltage levels in real-time.", ok: true },
        { label: "Geofencing Control", desc: "Polygonal boundaries defining safe flight fields and strict active geofence constraints.", ok: true }
      ],
      metrics: [
        { name: "Mesh Resolution", val: "2.1 cm/px" },
        { name: "UTM Transform GSD", val: "< 0.05m" },
        { name: "WebGL Frame Draw", val: "60 FPS" }
      ]
    },
    fleet: {
      title: "Fleet Operations & Telemetry Deck",
      status: "Operational",
      latency: "12ms",
      throughput: "180 Kbps/u",
      summary: "Centralized command station monitoring real-time flight paths, attitude telemetry, and tethered operations.",
      features: [
        { label: "Fleet Command & Control", desc: "Autonomous waypoint planning, instant hover commands, and auto return-to-home overrides.", ok: true },
        { label: "Individual ESC Diagnostics", desc: "Sub-millisecond tracking of motor RPMs, temperatures, and ESC voltage load lines.", ok: true },
        { label: "Tethered Surveillance", desc: "Configurable power supply control for indefinite, high-voltage tethered stationary missions.", ok: true },
        { label: "Emergency Autoland", desc: "Fail-safe logic to auto land or return to takeoff pad during GPS jamming or motor degradation.", ok: true }
      ],
      metrics: [
        { name: "Max Telemetry Distance", val: "15.0 km" },
        { name: "Command Latency", val: "8.5 ms" },
        { name: "Signal Quality SLA", val: "99.99%" }
      ]
    }
  };

  const activeData = systemCapabilities[activeSystem];

  return (
    <div className="space-y-6 text-left">
      {/* HEADER CARD */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-850 dark:text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-sky-500 text-2xl">verified</span>
            <span>Platform Core Capabilities</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Operational verification, telemetry bandwidths, and module capabilities matrix.</p>
        </div>
        <div className="flex gap-1.5 bg-slate-50 dark:bg-slate-850 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
          {Object.keys(systemCapabilities).map(sysKey => (
            <button
              key={sysKey}
              onClick={() => setActiveSystem(sysKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                activeSystem === sysKey
                  ? 'bg-sky-500 text-slate-850 shadow-md'
                  : 'text-slate-500 hover:text-slate-850 dark:hover:text-white'
              }`}
            >
              {sysKey === 'ai' ? 'Intelligence' : sysKey === 'spatial' ? 'Geospatial' : 'Operations'}
            </button>
          ))}
        </div>
      </div>

      {/* CORE INFO AREA */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Detail Panel */}
        <div className="xl:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <header className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[10px] text-sky-500 font-bold uppercase tracking-wider">SYSTEM MODULE</span>
              <h3 className="text-lg font-bold text-slate-850 dark:text-slate-100 mt-0.5">{activeData.title}</h3>
            </div>
            <div className="text-right">
              <span className="bg-emerald-500/10 border border-emerald-400/20 text-emerald-500 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                {activeData.status}
              </span>
            </div>
          </header>

          <p className="text-xs text-slate-450 dark:text-slate-400 leading-relaxed font-medium">
            {activeData.summary}
          </p>

          {/* Features Checklist */}
          <div className="space-y-3">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Verified System Features</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeData.features.map((feat, idx) => (
                <div key={idx} className="flex gap-3 bg-slate-50 dark:bg-slate-850/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                  <span className="text-emerald-500 text-sm">✅</span>
                  <div>
                    <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">{feat.label}</h5>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Telemetry/Bandwidth Side-Card */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Subsystem Performance Metrics</h4>
            
            <div className="space-y-4">
              {activeData.metrics.map((met, idx) => (
                <div key={idx} className="border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0 flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold">{met.name}</span>
                  <span className="font-bold text-slate-850 dark:text-slate-100 text-sm bg-slate-50 dark:bg-slate-850 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800">
                    {met.val}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 dark:bg-slate-850/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 space-y-3.5">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                <span>Module Comm Latency</span>
                <span className="text-sky-500">{activeData.latency}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                <span>Telemetry Bandwidth</span>
                <span className="text-sky-500">{activeData.throughput}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CapabilitiesSection;
