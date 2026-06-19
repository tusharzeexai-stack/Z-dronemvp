import { state } from './state.js';
import { updateTelemetryChart } from './charts.js';

let mapInstance = null;
let tileLayerInstance = null;
let droneMarker = null;
let pathPolyline = null;
let animationFrameId = null;
let currentPathIndex = 0;

// Coordinate path simulating a flight loop in Downtown Los Angeles
const FLIGHT_PATH = [
    [34.0522, -118.2437],
    [34.0535, -118.2415],
    [34.0550, -118.2400],
    [34.0572, -118.2388],
    [34.0595, -118.2395],
    [34.0610, -118.2415],
    [34.0620, -118.2440],
    [34.0618, -118.2470],
    [34.0605, -118.2495],
    [34.0585, -118.2510],
    [34.0560, -118.2515],
    [34.0535, -118.2505],
    [34.0515, -118.2485],
    [34.0510, -118.2460],
    [34.0522, -118.2437] // complete loop
];

// Generate intermediate steps between coordinates for smooth movement
function interpolatePoints(path, stepsPerSegment = 30) {
    const points = [];
    for (let i = 0; i < path.length - 1; i++) {
        const start = path[i];
        const end = path[i + 1];
        for (let step = 0; step < stepsPerSegment; step++) {
            const ratio = step / stepsPerSegment;
            const lat = start[0] + (end[0] - start[0]) * ratio;
            const lng = start[1] + (end[1] - start[1]) * ratio;
            points.push([lat, lng]);
        }
    }
    points.push(path[path.length - 1]);
    return points;
}

const detailedPath = interpolatePoints(FLIGHT_PATH, 50);

let isSimulationPaused = false;

export function setSimulationPaused(val) {
    isSimulationPaused = val;
}
window.setSimulationPaused = setSimulationPaused;
window.detailedPath = detailedPath;

export function initMap(containerId) {
    const mapContainer = document.getElementById(containerId);
    if (!mapContainer) return;

    // Remove placeholder background image or styles if present
    mapContainer.style.backgroundImage = 'none';
    mapContainer.innerHTML = '';

    // Create Leaflet instance
    mapInstance = L.map(containerId, {
        center: [34.056, -118.245],
        zoom: 15,
        zoomControl: false,
        attributionControl: false
    });

    updateMapTileLayer();

    // Custom SVG Drone Icon
    const droneIcon = L.divIcon({
        html: `
            <div class="relative flex items-center justify-center w-12 h-12">
                <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                <div class="w-8 h-8 bg-primary border-2 border-white rounded-full flex items-center justify-center shadow-lg text-white z-10">
                    <span class="material-symbols-outlined text-[18px]">flight_takeoff</span>
                </div>
            </div>
        `,
        className: 'custom-drone-icon',
        iconSize: [48, 48],
        iconAnchor: [24, 24]
    });

    // Plot simulated flight path
    pathPolyline = L.polyline(FLIGHT_PATH, {
        color: '#38bdf8',
        weight: 3,
        dashArray: '8, 8',
        opacity: 0.8
    }).addTo(mapInstance);

    // Place drone marker
    droneMarker = L.marker(detailedPath[0], { icon: droneIcon }).addTo(mapInstance);
    window.droneMarker = droneMarker; // Expose marker for direct updates

    // Start flight simulation loop
    startFlightSimulation();
}

function updateMapTileLayer() {
    if (!mapInstance) return;

    if (tileLayerInstance) {
        mapInstance.removeLayer(tileLayerInstance);
    }

    const isDark = state.settings.theme === 'dark';
    const tileUrl = isDark 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    tileLayerInstance = L.tileLayer(tileUrl, {
        maxZoom: 19
    }).addTo(mapInstance);
}

function startFlightSimulation() {
    if (animationFrameId) clearInterval(animationFrameId);

    const activeDroneId = "ZD-109";
    const updateRate = 800; // updates every 800ms

    animationFrameId = setInterval(() => {
        if (isSimulationPaused) return; // skip if driven by video stream
        if (!droneMarker || !mapInstance) return;

        // Advance path index
        currentPathIndex = (currentPathIndex + 1) % detailedPath.length;
        const currentCoord = detailedPath[currentPathIndex];

        // Move marker
        droneMarker.setLatLng(currentCoord);

        // Calculate a simulated heading/speed/altitude fluctuation
        const baseDrone = state.drones.find(d => d.id === activeDroneId);
        if (baseDrone) {
            // Slight telemetry changes
            const speedFluctuation = (Math.random() - 0.5) * 1.5;
            const altFluctuation = (Math.random() - 0.5) * 2;
            const batteryDrain = 0.05;

            const nextSpeed = Math.max(8, Math.min(20, parseFloat((baseDrone.speed + speedFluctuation).toFixed(1))));
            const nextAlt = Math.max(35, Math.min(65, parseFloat((baseDrone.altitude + altFluctuation).toFixed(1))));
            const nextBattery = Math.max(0, parseFloat((baseDrone.battery - batteryDrain).toFixed(2)));

            // Update state (triggers rendering/chart sync)
            state.updateDroneTelemetry(activeDroneId, {
                lat: parseFloat(currentCoord[0].toFixed(5)),
                lng: parseFloat(currentCoord[1].toFixed(5)),
                speed: nextSpeed,
                altitude: nextAlt,
                battery: nextBattery
            });

            // Update real-time charts directly
            updateTelemetryChart(nextAlt, nextSpeed);
        }
    }, updateRate);
}

// Focus map on the active drone marker
export function focusOnDrone() {
    if (mapInstance && droneMarker) {
        mapInstance.panTo(droneMarker.getLatLng(), { animate: true });
    }
}

// Zoom control functions
export function zoomIn() {
    if (mapInstance) mapInstance.zoomIn();
}

export function zoomOut() {
    if (mapInstance) mapInstance.zoomOut();
}

// Watch theme changes to switch map style
state.subscribe(() => {
    updateMapTileLayer();
});
