import React from 'react';

function UpcomingMissionsWidget({ missions = [] }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'In Progress':
        return 'bg-sky-500 text-slate-800 border-sky-400';
      case 'Pending Approval':
        return 'bg-amber-500 text-slate-800 border-amber-400';
      case 'Scheduled':
      default:
        return 'bg-emerald-500 text-slate-800 border-emerald-400';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xl flex flex-col text-slate-800">
      <header className="flex items-center justify-between mb-4 border-b border-sky-400/40 pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-600 text-lg">calendar_month</span>
          <h4 className="font-bold text-slate-800 text-sm">Upcoming Missions</h4>
        </div>
      </header>
      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
        {missions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No upcoming missions scheduled.
          </div>
        ) : (
          missions.map((mission, idx) => (
            <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg border border-sky-400/40 bg-white/40 hover:shadow-xs transition-all">
              <div className="text-left space-y-1">
                <p className="text-xs font-bold text-slate-800">{mission.name}</p>
                <div className="flex gap-2 text-[10px] text-slate-500 font-medium">
                  <span className="flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">flight_takeoff</span>
                    {mission.drone}
                  </span>
                  <span>•</span>
                  <span>{mission.time}</span>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getStatusBadge(mission.status)}`}>
                {mission.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default UpcomingMissionsWidget;




