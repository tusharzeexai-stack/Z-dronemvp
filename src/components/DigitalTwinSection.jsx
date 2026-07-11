import React, { useState } from 'react';
import DigitalTwinSectionTest1 from './DigitalTwinSectionTest1';
import DigitalTwinSectionV3 from './DigitalTwinSectionV3';

export default function DigitalTwinSection() {
  const [active, setActive] = useState('test1');
  const [lightMode, setLightMode] = useState(false);

  return (
    <div 
      className="relative transition-all duration-700"
      style={{
        filter: lightMode ? 'invert(1) hue-rotate(180deg) contrast(0.95)' : 'none',
        backgroundColor: lightMode ? '#fff' : 'transparent'
      }}
    >
      {/* Absolute Header with Dropdown */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-5 py-2.5 border-b border-[#003344] bg-[#010d1a]/95 backdrop-blur shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[1, 0.6, 0.3].map((o, i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-[#00e5ff]" style={{ opacity: o, boxShadow: i === 0 ? '0 0 6px #00e5ff' : 'none' }} />
            ))}
          </div>
          <span className="text-[#00e5ff] font-bold text-xs tracking-[0.18em] uppercase">Z-DRONE :: Digital Twin Engine</span>
        </div>
        
        <div className="flex items-center gap-6">
            <button 
                onClick={() => setLightMode(!lightMode)}
                className="flex items-center gap-2 px-3 py-1 rounded border border-[#00e5ff] text-[#00e5ff] text-[10px] font-bold tracking-widest hover:bg-[#00e5ff]/10 transition-colors"
                style={{ boxShadow: '0 0 8px rgba(0,229,255,0.3)' }}
            >
                {lightMode ? '☾ DARK' : '☀ LIGHT'}
            </button>

            <div className="flex items-center gap-3 border-l border-[#003344] pl-6">
                <span className="text-[10px] text-[#00e5ff] opacity-60 tracking-widest font-bold">DATA SOURCE:</span>
                <select 
                    className="bg-[#001520] text-[#00e5ff] border border-[#004466] rounded px-3 py-1 outline-none text-[10px] tracking-wider font-bold cursor-pointer hover:border-[#00e5ff] transition-colors appearance-none"
                    value={active} 
                    onChange={(e) => setActive(e.target.value)}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2300e5ff'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.5rem center',
                      backgroundSize: '1em',
                      paddingRight: '2rem'
                    }}
                >
                    <option value="test1">test1.mp4 (Construction Zone)</option>
                    <option value="v3">v3_AvatarG0008_test.mp4 (Circular Tank Base)</option>
                </select>
            </div>
        </div>
      </div>

      {/* Render selected Digital Twin */}
      <div className="pt-[44px]"> 
          {active === 'test1' ? <DigitalTwinSectionTest1 key="test1" /> : <DigitalTwinSectionV3 key="v3" />}
      </div>
    </div>
  );
}
