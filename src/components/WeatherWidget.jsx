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
    <div className="bg-gradient-to-br from-sky-600 to-sky-850 border border-sky-550 rounded-2xl p-4 shadow-xl flex flex-col text-left text-white">
      <header className="flex items-center justify-between mb-4 border-b border-sky-400/40 pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-white text-lg">partly_cloudy_day</span>
          <h4 className="font-bold text-white text-sm">Weather Conditions</h4>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
          isSafe 
            ? 'bg-emerald-500 text-white border-emerald-400' 
            : 'bg-red-500 text-white border-red-400'
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
          <div key={idx} className="bg-sky-900/40 p-2.5 rounded-xl border border-sky-400/40 flex items-center gap-2.5">
            <span className="material-symbols-outlined text-sky-200 text-lg">{item.icon}</span>
            <div>
              <p className="text-[10px] text-sky-200 font-bold uppercase tracking-wider">{item.label}</p>
              <p className="text-xs font-bold text-white mt-0.5">{item.val}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-sky-900/40 p-3 rounded-xl border border-sky-400/40 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-sky-200 font-semibold uppercase tracking-wider">Flight Suitability Score</span>
          <p className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${isSafe ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span>Optimal Conditions ({weather.suitabilityScore}%)</span>
          </p>
        </div>
        <div className="relative w-12 h-12 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="#0f172a" strokeWidth="4" fill="transparent" />
            <circle 
              cx="24" 
              cy="24" 
              r="20" 
              stroke="#34d399" 
              strokeWidth="4" 
              fill="transparent" 
              strokeDasharray={2 * Math.PI * 20}
              strokeDashoffset={2 * Math.PI * 20 * (1 - weather.suitabilityScore / 100)}
              className="transition-all duration-500"
            />
          </svg>
          <span className="absolute text-[10px] font-bold text-white">{weather.suitabilityScore}%</span>
        </div>
      </div>
    </div>
  );
}

export default WeatherWidget;
