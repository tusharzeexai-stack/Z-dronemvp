import React from 'react';

function WeatherWidget() {
  // Static weather data resembling real-time conditions
  const weather = {
    temp: '22°C',
    windSpeed: '12 km/h NW',
    humidity: '45%',
    visibility: '10 km',
    suitabilityScore: 94, // Out of 100
  };

  const isSafe = weather.suitabilityScore >= 75;

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col text-left">
      <header className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sky-500 text-lg">partly_cloudy_day</span>
          <h4 className="font-bold text-slate-800 dark:text-white text-sm">Weather Conditions</h4>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isSafe 
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' 
            : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
        }`}>
          {isSafe ? 'Clear to Fly' : 'Flight Restricted'}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'Temperature', val: weather.temp, icon: 'device_thermostat' },
          { label: 'Wind Speed', val: weather.windSpeed, icon: 'air' },
          { label: 'Humidity', val: weather.humidity, icon: 'humidity_mid' },
          { label: 'Visibility', val: weather.visibility, icon: 'visibility' }
        ].map((item, idx) => (
          <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5">
            <span className="material-symbols-outlined text-slate-400 text-lg">{item.icon}</span>
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{item.label}</p>
              <p className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">{item.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Flight Suitability Score</span>
          <p className="text-sm font-bold text-slate-800 dark:text-white mt-1 flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isSafe ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span>Optimal Conditions ({weather.suitabilityScore}%)</span>
          </p>
        </div>
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="#f1f5f9" strokeWidth="4" fill="transparent" className="dark:stroke-slate-800" />
            <circle 
              cx="24" 
              cy="24" 
              r="20" 
              stroke="#10b981" 
              strokeWidth="4" 
              fill="transparent" 
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - weather.suitabilityScore / 100)}
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute text-[10px] font-bold text-slate-700 dark:text-white">{weather.suitabilityScore}%</span>
        </div>
      </div>
    </div>
  );
}

export default WeatherWidget;
