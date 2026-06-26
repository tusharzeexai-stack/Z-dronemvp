// Central application state for Z-DRONE
const DEFAULT_DRONES = [
    {
        id: "ZD-109",
        model: "Falcon Cargo X1",
        type: "Cargo Delivery",
        status: "Online", // Online, Offline, Maintenance
        battery: 88,
        signal: "Excellent",
        altitude: 45,
        speed: 12,
        lat: 28.8308,
        lng: 76.9311,
        health: { propulsion: 98, optical: 92, chassis: 84 },
        payload: "2.5 kg Medical Package",
        destination: "Westside Hospital Pad",
        operator: "C. Nolan"

    },
    {
        id: "ZD-088",
        model: "Horizon Scan 4",
        type: "Surveillance",
        status: "Online",
        battery: 14, // Critical low
        signal: "Poor",
        altitude: 15,
        speed: 5,
        lat: 28.8322,
        lng: 76.9322,
        health: { propulsion: 94, optical: 88, chassis: 78 },
        payload: "FLIR Camera Pod",
        destination: "Automated Return-to-Base",
        operator: "A. Miller"

    },
    {
        id: "ZD-112",
        model: "Inspector Pro V2",
        type: "Infrastructure Inspection",
        status: "Maintenance",
        battery: 95,
        signal: "None",
        altitude: 0,
        speed: 0,
        lat: 28.8288,
        lng: 76.9298,
        health: { propulsion: 90, optical: 85, chassis: 80 },
        payload: "LIDAR System",
        destination: "Hangar Sector 4",
        operator: "S. Jobs"

    },
    {
        id: "ZD-055",
        model: "Scout Nano",
        type: "Mapping",
        status: "Offline",
        battery: 0,
        signal: "None",
        altitude: 0,
        speed: 0,
        lat: 28.8315,
        lng: 76.9345,
        health: { propulsion: 80, optical: 75, chassis: 90 },
        payload: "High-Res Mapping Camera",
        destination: "Storage Rack B",
        operator: "E. Musk"

    }
];

const DEFAULT_FLIGHTS = [
    { id: "F-9021", drone: "ZD-109", date: "2026-06-18", duration: "42m 12s", distance: "12.4 km", pilot: "C. Nolan", status: "Completed" },
    { id: "F-9020", drone: "ZD-088", date: "2026-06-18", duration: "15m 08s", distance: "4.2 km", pilot: "A. Miller", status: "In Progress" },
    { id: "F-9019", drone: "ZD-112", date: "2026-06-17", duration: "08m 45s", distance: "1.1 km", pilot: "S. Jobs", status: "Aborted" },
    { id: "F-9018", drone: "ZD-109", date: "2026-06-17", duration: "--", distance: "--", pilot: "C. Nolan", status: "Scheduled" }
];

const DEFAULT_ALERTS = [
    {
        id: "ALT-001",
        time: "10:42 AM",
        unit: "ZD-088",
        type: "battery_alert", // battery_alert, wind_warning, maintenance
        title: "Critical Low Battery",
        description: "Battery level dropped below 15% during transit. Automated return-to-base initiated.",
        severity: "error", // error, warning, success
        resolved: false
    },
    {
        id: "ALT-002",
        time: "09:15 AM",
        unit: "Sector Alpha",
        type: "air",
        title: "High Wind Warning",
        description: "Wind speeds exceeding 35km/h. All lightweight units grounded until further notice.",
        severity: "warning",
        resolved: false
    },
    {
        id: "ALT-003",
        time: "Yesterday",
        unit: "ZD-109",
        type: "check_circle",
        title: "Maintenance Complete",
        description: "Routine sensor calibration and propeller replacement successful. Unit cleared for service.",
        severity: "success",
        resolved: true
    }
];

const DEFAULT_USERS = [
    { name: "Alex Rivera", role: "Fleet Manager", email: "alex.rivera@z-drone.com", status: "Active", flights: 142 },
    { name: "C. Nolan", role: "Flight Supervisor", email: "c.nolan@z-drone.com", status: "Active", flights: 98 },
    { name: "A. Miller", role: "Drone Operator", email: "a.miller@z-drone.com", status: "Active", flights: 76 },
    { name: "S. Jobs", role: "Hardware Technician", email: "s.jobs@z-drone.com", status: "Away", flights: 33 }
];

const DEFAULT_SETTINGS = {
    theme: "light", // light, dark
    simulationSpeed: 1, // 1x, 2x, 5x
    soundsEnabled: true,
    telemetryLogRate: "1s",
    maxAltitudeLimit: 120, // meters
    lowBatteryThreshold: 20 // percent
};

export class AppState {
    constructor() {
        this.loadState();
        this.listeners = [];
    }

    loadState() {
        this.drones = JSON.parse(localStorage.getItem('z_drone_fleet')) || DEFAULT_DRONES;
        this.flights = JSON.parse(localStorage.getItem('z_drone_flights')) || DEFAULT_FLIGHTS;
        this.alerts = JSON.parse(localStorage.getItem('z_drone_alerts')) || DEFAULT_ALERTS;
        this.users = JSON.parse(localStorage.getItem('z_drone_users')) || DEFAULT_USERS;
        this.settings = JSON.parse(localStorage.getItem('z_drone_settings')) || DEFAULT_SETTINGS;
    }

    saveState() {
        localStorage.setItem('z_drone_fleet', JSON.stringify(this.drones));
        localStorage.setItem('z_drone_flights', JSON.stringify(this.flights));
        localStorage.setItem('z_drone_alerts', JSON.stringify(this.alerts));
        localStorage.setItem('z_drone_users', JSON.stringify(this.users));
        localStorage.setItem('z_drone_settings', JSON.stringify(this.settings));
        this.triggerUpdate();
    }

    // Subscribe to state updates
    subscribe(callback) {
        this.listeners.push(callback);
    }

    triggerUpdate() {
        this.listeners.forEach(cb => cb(this));
    }

    setDrones(dronesList) {
        this.drones = dronesList;
        this.saveState();
    }

    // Drone Operations
    addDrone(drone) {
        this.drones.push({
            id: `ZD-${Math.floor(100 + Math.random() * 900)}`,
            status: "Offline",
            battery: 100,
            signal: "Excellent",
            altitude: 0,
            speed: 0,
            lat: 28.8308 + (Math.random() - 0.5) * 0.02,
            lng: 76.9311 + (Math.random() - 0.5) * 0.02,

            health: { propulsion: 100, optical: 100, chassis: 100 },
            destination: "Charging Pad Alpha",
            ...drone
        });
        this.saveState();
    }

    updateDroneTelemetry(id, telemetry) {
        const drone = this.drones.find(d => d.id === id);
        if (drone) {
            Object.assign(drone, telemetry);
            // Auto trigger low battery warning if needed
            if (drone.battery < this.settings.lowBatteryThreshold && drone.status === "Online") {
                this.triggerLowBatteryAlert(drone.id, drone.battery);
            }
            this.saveState();
        }
    }

    triggerLowBatteryAlert(droneId, batteryLevel) {
        const hasAlert = this.alerts.some(a => a.unit === droneId && a.type === "battery_alert" && !a.resolved);
        if (!hasAlert) {
            this.alerts.unshift({
                id: `ALT-${Math.floor(100 + Math.random() * 900)}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unit: droneId,
                type: "battery_alert",
                title: "Low Battery Alert",
                description: `Drone ${droneId} battery dropped to ${batteryLevel}%. Returning to charge immediately.`,
                severity: "error",
                resolved: false
            });
            this.saveState();
        }
    }

    // Flight Operations
    addFlight(flight) {
        this.flights.unshift({
            id: `F-${Math.floor(9000 + Math.random() * 1000)}`,
            date: new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
            duration: "--",
            distance: "--",
            status: "Scheduled",
            ...flight
        });
        
        // Mark drone status as Online/Busy
        const drone = this.drones.find(d => d.id === flight.drone);
        if (drone) {
            drone.status = "Online";
        }
        
        this.saveState();
    }

    // Alerts Operations
    resolveAlert(id) {
        const alert = this.alerts.find(a => a.id === id);
        if (alert) {
            alert.resolved = true;
            this.saveState();
        }
    }

    resolveAllAlerts() {
        this.alerts.forEach(a => a.resolved = true);
        this.saveState();
    }

    // Maintenance Operations
    performCalibration(droneId, system) {
        const drone = this.drones.find(d => d.id === droneId);
        if (drone && drone.health) {
            drone.health[system] = 100;
            if (drone.health.propulsion === 100 && drone.health.optical === 100 && drone.health.chassis === 100) {
                drone.status = "Online";
            }
            this.saveState();
        }
    }

    toggleTheme() {
        this.settings.theme = this.settings.theme === "light" ? "dark" : "light";
        this.saveState();
    }
}

export const state = new AppState();
