import React from 'react';

function UpcomingMissionsWidget({ missions = [] }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'In Progress':
        return 'bg-sky-500/10 text-sky-500 border-sky-500/20 dark:bg-sky-500/20';
      case 'Pending Approval':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/20';
      case 'Scheduled':
      default:
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/20';
    }
  };

  return (
    <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col">
      <header className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sky-500 text-lg">calendar_month</span>
          <h4 className="font-bold text-slate-800 dark:text-white text-sm">Upcoming Missions</h4>
        </div>
      </header>
      <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
        {missions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No upcoming missions scheduled.
          </div>
        ) : (
          missions.map((mission, idx) => (
            <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:shadow-xs transition-all">
              <div className="text-left space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-white">{mission.name}</p>
                <div className="flex gap-2 text-[10px] text-slate-400 font-medium">
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
