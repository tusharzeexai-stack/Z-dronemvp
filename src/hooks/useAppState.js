import { useState, useEffect } from 'react';
import { state } from '../js/state';

export function useAppState() {
  const [currentState, setCurrentState] = useState({
    drones: [...state.drones],
    flights: [...state.flights],
    alerts: [...state.alerts],
    users: [...state.users],
    settings: { ...state.settings }
  });

  useEffect(() => {
    const listener = (s) => {
      setCurrentState({
        drones: [...s.drones],
        flights: [...s.flights],
        alerts: [...s.alerts],
        users: [...s.users],
        settings: { ...s.settings }
      });
    };
    state.subscribe(listener);
    return () => {
      state.listeners = state.listeners.filter(l => l !== listener);
    };
  }, []);

  return {
    state: currentState,
    actions: {
      addDrone: (d) => state.addDrone(d),
      updateDroneTelemetry: (id, t) => state.updateDroneTelemetry(id, t),
      addFlight: (f) => state.addFlight(f),
      resolveAlert: (id) => state.resolveAlert(id),
      resolveAllAlerts: () => state.resolveAllAlerts(),
      performCalibration: (id, s) => state.performCalibration(id, s),
      toggleTheme: () => state.toggleTheme(),
      setSoundEnabled: (val) => {
        state.settings.soundsEnabled = val;
        state.saveState();
      },
      setSimulationSpeed: (val) => {
        state.settings.simulationSpeed = val;
        state.saveState();
      },
      setLowBatteryThreshold: (val) => {
        state.settings.lowBatteryThreshold = val;
        state.saveState();
      }
    }
  };
}
