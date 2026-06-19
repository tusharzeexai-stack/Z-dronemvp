import { state } from './state.js';
import { initTheme } from './theme.js';
import { initMap, focusOnDrone, zoomIn, zoomOut } from './map.js';
import { initTelemetryCharts, initAnalyticsCharts } from './charts.js';

window.state = state;

// Redirect to login if user not authenticated
const authUser = localStorage.getItem('z_drone_user');
if (!authUser) {
    window.location.href = '/index.html';
}

const userObj = JSON.parse(authUser || '{}');

// Page state variables
let activeTab = 'dashboard';
let activeDroneSimId = 'ZD-109';
let selectedMaintenanceDroneId = null;

// Initialize components
document.addEventListener('DOMContentLoaded', () => {
    // Sync profile display
    const profileNameEl = document.getElementById('profileName');
    const profileRoleEl = document.getElementById('profileRole');
    if (profileNameEl) profileNameEl.textContent = userObj.name || 'Alex Rivera';
    if (profileRoleEl) profileRoleEl.textContent = userObj.role || 'Fleet Manager';

    // Theme initialization
    initTheme();

    // Map initialization
    initMap('trackingMap');

    // Chart initialization
    initTelemetryCharts('telemetryChart');
    initAnalyticsCharts('dashboardUtilizationChart', 'analyticsUtilizationChart');

    // Setup event handlers
    setupTabNavigation();
    setupDropdowns();
    setupModals();
    setupForms();
    setupSearchFilter();
    setupSettingsPage();

    // Initial render
    renderApp();

    // Subscribe to state updates to update rendering
    state.subscribe(renderApp);
});

// Sidebar Tab Router
function setupTabNavigation() {
    const sidebarButtons = document.querySelectorAll('.sidebar-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    function switchTab(tabId) {

        activeTab = tabId;

        // Update active class on buttons
        sidebarButtons.forEach(btn => {
            const btnTab = btn.getAttribute('data-tab');
            if (btnTab === tabId) {
                btn.className = "sidebar-btn w-full flex items-center gap-md px-md py-sm rounded-lg text-primary dark:text-primary-fixed-dim font-bold border-l-4 border-primary bg-primary-container/5 dark:bg-primary-fixed-dim/5 hover:bg-primary/5 transition-colors duration-200 text-left";
            } else {
                btn.className = "sidebar-btn w-full flex items-center gap-md px-md py-sm rounded-lg text-on-surface-variant dark:text-inverse-on-surface/70 hover:text-primary dark:hover:text-primary-fixed-dim hover:bg-primary/5 transition-colors duration-200 text-left";
            }
        });

        // Toggle active visibility of views
        tabViews.forEach(view => {
            const viewId = view.getAttribute('id');
            if (viewId === `view-${tabId}`) {
                view.classList.remove('hidden');
                // Trigger chart rendering in case views were hidden initially
                if (tabId === 'analytics') {
                    initAnalyticsCharts('analyticsUtilizationChart', 'analyticsBatteryHealthChart');
                } else if (tabId === 'dashboard') {
                    initTelemetryCharts('telemetryChart');
                    initAnalyticsCharts('dashboardUtilizationChart');
                }
            } else {
                view.classList.add('hidden');
            }
        });

        // Manage Leaflet Map Container Reparenting
        // Move Leaflet map DOM node between dashboard page and live tracking page dynamically!
        const mapDomNode = document.getElementById('trackingMap');
        const liveMapParent = document.getElementById('liveTrackingMap');
        const dashboardMapParent = document.getElementById('trackingMap'); // its own container

        if (tabId === 'live') {
            // Append map to the live monitor section
            liveMapParent.appendChild(mapDomNode);
            // Redraw Leaflet size check
            setTimeout(() => {
                if (window.L && mapDomNode._leaflet_id) {
                    const mapInstance = mapDomNode._leaflet_map || window.mapInstance;
                    if (mapInstance) mapInstance.invalidateSize();
                }
            }, 100);
        } else if (tabId === 'dashboard') {
            // Return map to dashboard section
            const originalMapContainer = document.querySelector('.col-span-12[class*="lg:col-span-6"] .overflow-hidden');
            if (originalMapContainer) {
                originalMapContainer.insertBefore(mapDomNode, originalMapContainer.firstChild);
            }
            setTimeout(() => {
                if (window.L && mapDomNode._leaflet_id) {
                    const mapInstance = mapDomNode._leaflet_map || window.mapInstance;
                    if (mapInstance) mapInstance.invalidateSize();
                }
            }, 100);
        }
    }

    sidebarButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });

    // Link redirect actions within views
    document.querySelectorAll('.route-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
        });
    });
}

// Dropdowns (Notifications & Profile)
function setupDropdowns() {
    const notifBtn = document.getElementById('notificationBtn');
    const notifTray = document.getElementById('notificationTray');
    const profileTrigger = document.getElementById('profileDropdownTrigger');
    const profileDropdown = document.getElementById('profileDropdown');

    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifTray.classList.toggle('hidden');
        profileDropdown.classList.add('hidden');
    });

    profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('hidden');
        notifTray.classList.add('hidden');
    });

    document.addEventListener('click', () => {
        notifTray.classList.add('hidden');
        profileDropdown.classList.add('hidden');
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('z_drone_user');
        window.location.href = '/index.html';
    });

    // Quick theme toggle icon
    document.getElementById('quickThemeToggleBtn').addEventListener('click', () => {
        state.toggleTheme();
    });

    document.getElementById('clearAllNotificationsBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        state.resolveAllAlerts();
    });
}

// Modals management (Register Asset)
function setupModals() {
    const openBtn = document.getElementById('openAddDroneModalBtn');
    const closeBtn = document.getElementById('closeAddDroneModalBtn');
    const modal = document.getElementById('addDroneModal');

    openBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

// CRUD Forms
function setupForms() {
    // Register Drone form
    const addDroneForm = document.getElementById('addDroneForm');
    const addDroneModal = document.getElementById('addDroneModal');
    addDroneForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newDrone = {
            model: document.getElementById('droneModelInput').value,
            type: document.getElementById('droneTypeSelect').value,
            payload: document.getElementById('dronePayloadInput').value,
            operator: document.getElementById('droneOperatorInput').value,
        };

        state.addDrone(newDrone);
        addDroneForm.reset();
        addDroneModal.classList.add('hidden');
    });

    // Dispatch Flight form
    const newFlightForm = document.getElementById('newFlightForm');
    const flightPlannerSection = document.getElementById('flightPlannerFormSection');
    
    document.getElementById('openFlightPlannerBtn').addEventListener('click', () => {
        // Populate select list with available drones
        const droneSelect = document.getElementById('flightDroneSelect');
        droneSelect.innerHTML = '';
        const availableDrones = state.drones.filter(d => d.status !== 'Maintenance');

        if (availableDrones.length === 0) {
            droneSelect.innerHTML = `<option value="">No drones available (All in maintenance)</option>`;
        } else {
            availableDrones.forEach(d => {
                droneSelect.innerHTML += `<option value="${d.id}">${d.id} (${d.model}) - ${d.battery}% batt</option>`;
            });
        }

        flightPlannerSection.classList.remove('hidden');
    });

    document.getElementById('closeFlightPlannerBtn').addEventListener('click', () => {
        flightPlannerSection.classList.add('hidden');
    });

    newFlightForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedDroneId = document.getElementById('flightDroneSelect').value;
        if (!selectedDroneId) return;

        const flightData = {
            drone: selectedDroneId,
            pilot: document.getElementById('flightPilotInput').value,
            destination: document.getElementById('flightDestSelect').value,
            payload: document.getElementById('flightPayloadInput').value,
            status: "In Progress"
        };

        // Mutate State
        state.addFlight(flightData);

        // Reset and hide form
        newFlightForm.reset();
        flightPlannerSection.classList.add('hidden');

        // Focus simulation on this drone
        activeDroneSimId = selectedDroneId;
    });
}

// Search filtering logic
function setupSearchFilter() {
    const searchInput = document.getElementById('globalSearchInput');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderApp(state, query);
    });

    // Flight search tab input
    const flightSearch = document.getElementById('flightSearchInput');
    if (flightSearch) {
        flightSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            renderFlightsTable('allFlightsBody', query);
        });
    }
}

// Settings control panels
function setupSettingsPage() {
    const themeBtn = document.getElementById('settingsThemeToggle');
    const soundBtn = document.getElementById('settingsSoundToggle');
    const simSelect = document.getElementById('settingsSimSpeedSelect');
    const battInput = document.getElementById('settingsBatteryThreshold');

    // Click triggers
    themeBtn.addEventListener('click', () => {
        state.toggleTheme();
    });

    soundBtn.addEventListener('click', () => {
        state.settings.soundsEnabled = !state.settings.soundsEnabled;
        state.saveState();
    });

    simSelect.addEventListener('change', (e) => {
        state.settings.simulationSpeed = parseFloat(e.target.value);
        state.saveState();
    });

    battInput.addEventListener('change', (e) => {
        state.settings.lowBatteryThreshold = parseInt(e.target.value);
        state.saveState();
    });
}

// Map Action Overlays
document.getElementById('mapZoomIn').addEventListener('click', zoomIn);
document.getElementById('mapZoomOut').addEventListener('click', zoomOut);
document.getElementById('mapFocusBtn').addEventListener('click', focusOnDrone);

// ================= RENDER SYSTEM =================
function renderApp(currentState = state, searchQuery = '') {
    // 1. Sync Notification tray & active alerts counts
    const activeAlerts = currentState.alerts.filter(a => !a.resolved);
    
    // KPIs Alerts count
    const alertsKpiCount = document.getElementById('kpi-alerts-count');
    if (alertsKpiCount) alertsKpiCount.textContent = activeAlerts.length;

    // Sidebar warning badges
    const alertsBadge = document.getElementById('alerts-badge-count');
    if (alertsBadge) {
        if (activeAlerts.length > 0) {
            alertsBadge.textContent = activeAlerts.length;
            alertsBadge.classList.remove('hidden');
        } else {
            alertsBadge.classList.add('hidden');
        }
    }

    // Top navbar notification dot
    const notifDot = document.getElementById('notification-dot');
    if (notifDot) {
        if (activeAlerts.length > 0) notifDot.classList.remove('hidden');
        else notifDot.classList.add('hidden');
    }

    // Notification tray list
    const notificationList = document.getElementById('notificationList');
    if (notificationList) {
        notificationList.innerHTML = '';
        if (activeAlerts.length === 0) {
            notificationList.innerHTML = `<div class="p-md text-center text-xs text-on-surface-variant dark:text-inverse-on-surface/60">No active alerts</div>`;
        } else {
            activeAlerts.forEach(alert => {
                notificationList.innerHTML += `
                    <div class="p-md hover:bg-surface-container flex justify-between items-start gap-sm">
                        <div>
                            <p class="text-xs font-bold text-on-surface dark:text-inverse-on-surface">${alert.title}</p>
                            <p class="text-[10px] text-on-surface-variant dark:text-inverse-on-surface/70 mt-0.5">${alert.description}</p>
                        </div>
                        <button onclick="window.resolveNotificationAlert('${alert.id}')" class="text-[10px] text-primary dark:text-primary-fixed-dim hover:underline flex-shrink-0">Resolve</button>
                    </div>
                `;
            });
        }
    }

    // 2. Active Drone HUD Telemetry panel
    const activeDrone = currentState.drones.find(d => d.id === activeDroneSimId) || currentState.drones[0];
    if (activeDrone) {
        document.getElementById('activeDroneStatus').textContent = activeDrone.status;
        document.getElementById('activeDroneBattery').textContent = `${Math.round(activeDrone.battery)}%`;
        document.getElementById('activeDroneBatteryBar').style.width = `${activeDrone.battery}%`;
        
        // Signal/Speed metrics
        document.getElementById('activeDroneSignal').textContent = activeDrone.signal;
        document.getElementById('activeDroneAltitude').textContent = `${activeDrone.altitude}m`;
        document.getElementById('activeDroneSpeed').textContent = `${activeDrone.speed}m/s`;
        document.getElementById('activeDroneCoords').textContent = `${activeDrone.lat.toFixed(4)}, ${activeDrone.lng.toFixed(4)}`;
        
        // HUD Overlay label
        const missionLabel = document.getElementById('activeDroneMission');
        if (missionLabel) {
            missionLabel.textContent = activeDrone.status === 'Online' ? `Sector Cargo: ${activeDrone.payload}` : 'Idle (Charging Hangar)';
        }

        // Live monitor View overlayHUD
        const hudSpeed = document.getElementById('liveSpeedHUD');
        if (hudSpeed) hudSpeed.textContent = `${activeDrone.speed} m/s`;
    }

    // 3. Render Views
    renderFlightsTable('dashboardFlightsBody');
    renderFlightsTable('allFlightsBody');
    renderAlertsTimeline();
    renderAlertsManageList();
    renderDronesGrid(searchQuery);
    renderMaintenanceView();
    renderUsersGrid();
    syncSettingsControls();
    
    // Sync counts in KPI
    const flightsCountEl = document.getElementById('kpi-flights-count');
    if (flightsCountEl) flightsCountEl.textContent = currentState.flights.length;
}

// Global scope attachment for notification trigger
window.resolveNotificationAlert = (alertId) => {
    state.resolveAlert(alertId);
};

// Render Flights logs tables
function renderFlightsTable(containerId, filterQuery = '') {
    const tableBody = document.getElementById(containerId);
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const list = containerId === 'dashboardFlightsBody' ? state.flights.slice(0, 4) : state.flights;
    const filteredList = list.filter(f => {
        return f.id.toLowerCase().includes(filterQuery) || 
               f.drone.toLowerCase().includes(filterQuery) || 
               f.pilot.toLowerCase().includes(filterQuery);
    });

    if (filteredList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-lg py-md text-center text-xs text-on-surface-variant dark:text-inverse-on-surface/60">No flight records found</td>
            </tr>
        `;
        return;
    }

    filteredList.forEach(flight => {
        let statusBadge = '';
        if (flight.status === 'Completed') {
            statusBadge = '<span class="px-sm py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 rounded-lg text-label-sm border border-emerald-200/50">Completed</span>';
        } else if (flight.status === 'In Progress') {
            statusBadge = '<span class="px-sm py-1 bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-400 rounded-lg text-label-sm border border-sky-200/50 animate-pulse">In Progress</span>';
        } else if (flight.status === 'Aborted') {
            statusBadge = '<span class="px-sm py-1 bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-400 rounded-lg text-label-sm border border-red-200/50">Aborted</span>';
        } else {
            statusBadge = '<span class="px-sm py-1 bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-400 rounded-lg text-label-sm border border-slate-200/50">Scheduled</span>';
        }

        tableBody.innerHTML += `
            <tr class="hover:bg-surface-container-low dark:hover:bg-on-surface-variant/10 transition-colors cursor-pointer group" onclick="window.selectActiveDroneSim('${flight.drone}')">
                <td class="px-lg py-md font-bold text-on-surface dark:text-inverse-on-surface">${flight.id}</td>
                <td class="px-lg py-md">${flight.drone}</td>
                <td class="px-lg py-md text-on-surface-variant dark:text-inverse-on-surface/70">${flight.date}</td>
                <td class="px-lg py-md text-on-surface-variant dark:text-inverse-on-surface/70">${flight.duration}</td>
                <td class="px-lg py-md text-on-surface-variant dark:text-inverse-on-surface/70">${flight.distance}</td>
                <td class="px-lg py-md text-on-surface-variant dark:text-inverse-on-surface/70">${flight.pilot}</td>
                <td class="px-lg py-md">${statusBadge}</td>
            </tr>
        `;
    });
}

// Global shortcut to trigger active drone focus
window.selectActiveDroneSim = (droneId) => {
    activeDroneSimId = droneId;
    state.triggerUpdate();
    focusOnDrone();
};

// Render alerts in Dashboard Overview
function renderAlertsTimeline() {
    const alertsTimeline = document.getElementById('dashboardAlertsTimeline');
    if (!alertsTimeline) return;

    alertsTimeline.innerHTML = '';
    const activeAlerts = state.alerts.filter(a => !a.resolved);

    if (activeAlerts.length === 0) {
        alertsTimeline.innerHTML = `
            <div class="py-xl text-center text-xs text-on-surface-variant dark:text-inverse-on-surface/60">
                <span class="material-symbols-outlined text-4xl text-emerald-500 mb-xs">check_circle</span>
                <p>System clean. All drone networks operating within parameters.</p>
            </div>
        `;
        return;
    }

    activeAlerts.forEach((alert, index) => {
        let severityColor = 'bg-slate-100 text-slate-700';
        let iconName = 'notifications';

        if (alert.severity === 'error') {
            severityColor = 'bg-error-container text-error';
            iconName = 'battery_alert';
        } else if (alert.severity === 'warning') {
            severityColor = 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
            iconName = 'air';
        } else if (alert.severity === 'success') {
            severityColor = 'bg-emerald-100 text-emerald-600';
            iconName = 'check_circle';
        }

        alertsTimeline.innerHTML += `
            <div class="flex gap-md group">
                <div class="flex flex-col items-center">
                    <div class="w-10 h-10 rounded-full ${severityColor} flex items-center justify-center flex-shrink-0">
                        <span class="material-symbols-outlined text-md">${iconName}</span>
                    </div>
                    ${index < activeAlerts.length - 1 ? '<div class="w-[1px] h-full bg-outline-variant/30 dark:bg-outline/20 mt-xs"></div>' : ''}
                </div>
                <div class="pb-lg flex-1">
                    <p class="text-label-sm text-outline dark:text-inverse-on-surface/65">${alert.time} • ${alert.unit}</p>
                    <div class="flex justify-between items-start">
                        <p class="font-bold text-on-surface dark:text-inverse-on-surface">${alert.title}</p>
                        <button onclick="window.resolveNotificationAlert('${alert.id}')" class="text-xs text-primary dark:text-primary-fixed-dim hover:underline">Acknowledge</button>
                    </div>
                    <p class="text-body-sm text-on-surface-variant dark:text-inverse-on-surface/60 mt-1">${alert.description}</p>
                </div>
            </div>
        `;
    });
}

// Render alerts checklist view inside ALERTS tab
function renderAlertsManageList() {
    const listContainer = document.getElementById('allAlertsListContainer');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const activeAlerts = state.alerts.filter(a => !a.resolved);

    if (activeAlerts.length === 0) {
        listContainer.innerHTML = `
            <div class="text-center py-xl text-on-surface-variant dark:text-inverse-on-surface/60">
                <span class="material-symbols-outlined text-5xl text-emerald-500 mb-sm">task_alt</span>
                <p class="font-bold text-on-surface dark:text-inverse-on-surface">No Warnings Logged</p>
                <p class="text-xs mt-1">Excellent! All nodes and sensor meshes are clear.</p>
            </div>
        `;
        return;
    }

    activeAlerts.forEach(alert => {
        let borderClass = 'border-l-4 border-l-slate-400';
        let alertBadge = '<span class="px-sm py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">Info</span>';

        if (alert.severity === 'error') {
            borderClass = 'border-l-4 border-l-error bg-error-container/10';
            alertBadge = '<span class="px-sm py-0.5 rounded bg-error-container text-error text-[10px] font-bold">Critical</span>';
        } else if (alert.severity === 'warning') {
            borderClass = 'border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20';
            alertBadge = '<span class="px-sm py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold">Warning</span>';
        }

        listContainer.innerHTML += `
            <div class="p-md rounded-xl border border-outline-variant/20 dark:border-outline/10 flex justify-between items-center ${borderClass} shadow-xs">
                <div class="space-y-xs">
                    <div class="flex items-center gap-sm">
                        ${alertBadge}
                        <span class="text-xs text-outline dark:text-inverse-on-surface/60">${alert.time} • Unit: ${alert.unit}</span>
                    </div>
                    <p class="font-bold text-on-surface dark:text-inverse-on-surface text-sm">${alert.title}</p>
                    <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/60">${alert.description}</p>
                </div>
                <button onclick="window.resolveNotificationAlert('${alert.id}')" class="bg-white dark:bg-inverse-surface border border-outline-variant/30 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs py-sm px-md rounded-lg font-bold">Acknowledge</button>
            </div>
        `;
    });
}

// Bind Global click handler for clearing alerts page
document.getElementById('resolveAllAlertsBtn').addEventListener('click', () => {
    state.resolveAllAlerts();
});

// Render Drones Fleet Grid view
function renderDronesGrid(searchQuery = '') {
    const gridContainer = document.getElementById('dronesGridContainer');
    if (!gridContainer) return;

    gridContainer.innerHTML = '';

    const filteredDrones = state.drones.filter(d => {
        return d.id.toLowerCase().includes(searchQuery) ||
               d.model.toLowerCase().includes(searchQuery) ||
               d.type.toLowerCase().includes(searchQuery);
    });

    if (filteredDrones.length === 0) {
        gridContainer.innerHTML = `
            <div class="col-span-full py-xl text-center text-on-surface-variant dark:text-inverse-on-surface/60">
                <p>No drones matching "${searchQuery}" in registered fleet.</p>
            </div>
        `;
        return;
    }

    filteredDrones.forEach(drone => {
        let statusBadge = '';
        if (drone.status === 'Online') {
            statusBadge = '<span class="px-sm py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 text-xs rounded-full font-bold flex items-center gap-xs"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Online</span>';
        } else if (drone.status === 'Offline') {
            statusBadge = '<span class="px-sm py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 text-xs rounded-full font-bold flex items-center gap-xs"><span class="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>Offline</span>';
        } else {
            statusBadge = '<span class="px-sm py-1 bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 text-xs rounded-full font-bold flex items-center gap-xs"><span class="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>Maintenance</span>';
        }

        // Image selection
        let droneImg = 'drone1.jpg';
        
        gridContainer.innerHTML += `
            <div class="bg-white dark:bg-inverse-surface border border-outline-variant/20 dark:border-outline/10 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 drone-card flex flex-col justify-between">
                <div>
                    <div class="relative h-40">
                        <img src="${droneImg}" class="w-full h-full object-cover" alt="Drone Asset"/>
                        <div class="absolute top-2 right-2">${statusBadge}</div>
                    </div>
                    
                    <div class="p-lg space-y-md">
                        <div>
                            <div class="flex justify-between items-start">
                                <h3 class="font-bold font-headline-md text-base text-on-surface dark:text-inverse-on-surface">${drone.id}</h3>
                                <span class="text-[10px] px-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-mono">${drone.type}</span>
                            </div>
                            <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/60">${drone.model}</p>
                        </div>
                        
                        <div class="space-y-sm text-xs">
                            <div class="flex justify-between">
                                <span class="text-on-surface-variant dark:text-inverse-on-surface/75">Battery:</span>
                                <span class="font-bold ${drone.battery < 20 ? 'text-error animate-pulse' : 'text-on-surface dark:text-inverse-on-surface'}">${Math.round(drone.battery)}%</span>
                            </div>
                            <div class="w-full bg-surface-container dark:bg-slate-800 rounded-full h-1">
                                <div class="h-1 rounded-full ${drone.battery < 20 ? 'bg-error' : 'bg-emerald-500'}" style="width: ${drone.battery}%"></div>
                            </div>
                            <div class="flex justify-between pt-1">
                                <span class="text-on-surface-variant dark:text-inverse-on-surface/75">Payload Capability:</span>
                                <span class="font-bold">${drone.payload}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-on-surface-variant dark:text-inverse-on-surface/75">Main Operator:</span>
                                <span class="font-bold">${drone.operator}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="p-lg border-t border-outline-variant/10 dark:border-outline/10 flex gap-sm bg-slate-50 dark:bg-on-surface-variant/5">
                    <button onclick="window.selectActiveDroneSim('${drone.id}')" class="flex-1 bg-primary text-white text-xs font-bold py-sm rounded-lg hover:bg-primary/95 shadow-xs transition-colors">Track Telemetry</button>
                    ${drone.status === 'Maintenance' ? `<button onclick="window.routeToDiagnostics('${drone.id}')" class="flex-1 border border-outline-variant bg-white dark:bg-inverse-surface dark:text-inverse-on-surface text-xs py-sm rounded-lg hover:bg-slate-100">Repair Task</button>` : `<button onclick="window.groundAsset('${drone.id}')" class="flex-1 border border-error/30 text-error hover:bg-error/5 text-xs py-sm rounded-lg transition-colors">Ground Drone</button>`}
                </div>
            </div>
        `;
    });
}

// Ground drone asset
window.groundAsset = (droneId) => {
    const drone = state.drones.find(d => d.id === droneId);
    if (drone) {
        drone.status = 'Maintenance';
        drone.altitude = 0;
        drone.speed = 0;
        drone.signal = 'None';
        state.saveState();
    }
};

// Route to diagnostics screen from Drones list
window.routeToDiagnostics = (droneId) => {
    selectedMaintenanceDroneId = droneId;
    // Switch view
    document.querySelector('[data-tab="maintenance"]').click();
};

// Render Maintenance checklist panel
function renderMaintenanceView() {
    const groundedList = document.getElementById('maintenanceGroundedDronesList');
    const checklistContainer = document.getElementById('maintenanceChecklistContent');
    if (!groundedList || !checklistContainer) return;

    groundedList.innerHTML = '';
    const maintenanceDrones = state.drones.filter(d => d.status === 'Maintenance');

    if (maintenanceDrones.length === 0) {
        groundedList.innerHTML = `<div class="p-lg text-center text-xs text-on-surface-variant dark:text-inverse-on-surface/60">No drones currently grounded in maintenance Hangar.</div>`;
        checklistContainer.innerHTML = `
            <div class="text-center py-xl text-on-surface-variant dark:text-inverse-on-surface/60">
                <span class="material-symbols-outlined text-5xl text-emerald-500 mb-sm">task_alt</span>
                <p class="font-bold text-on-surface dark:text-inverse-on-surface">Fleet Operating at Peak Health</p>
                <p class="text-xs mt-1">Excellent! All registered hardware clusters are cleared for duty cycles.</p>
            </div>
        `;
        return;
    }

    // List all grounded units
    maintenanceDrones.forEach(d => {
        const isActive = selectedMaintenanceDroneId === d.id;
        groundedList.innerHTML += `
            <div onclick="window.selectMaintenanceDrone('${d.id}')" class="p-md border rounded-xl cursor-pointer hover:bg-surface-container-low transition-all ${isActive ? 'border-primary bg-primary-container/10 dark:bg-primary-fixed-dim/5' : 'border-outline-variant/30'} flex justify-between items-center">
                <div>
                    <p class="font-bold text-sm text-on-surface dark:text-inverse-on-surface">${d.id}</p>
                    <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/65">${d.model}</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 rounded-full px-sm py-0.5 font-bold">Grounded</span>
                </div>
            </div>
        `;
    });

    // Populate checklist for active maintenance drone
    if (!selectedMaintenanceDroneId && maintenanceDrones.length > 0) {
        selectedMaintenanceDroneId = maintenanceDrones[0].id;
    }

    const mDrone = state.drones.find(d => d.id === selectedMaintenanceDroneId);
    if (mDrone && mDrone.status === 'Maintenance') {
        const isPropCalib = mDrone.health.propulsion === 100;
        const isOptCalib = mDrone.health.optical === 100;
        const isChassisCalib = mDrone.health.chassis === 100;

        checklistContainer.innerHTML = `
            <div class="space-y-md">
                <div class="border-b border-outline-variant/10 dark:border-outline/10 pb-sm">
                    <h4 class="font-bold font-headline-md text-base text-on-surface dark:text-inverse-on-surface">Calibrate Unit: ${mDrone.id}</h4>
                    <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/65">Subsystem health levels: Propulsion: ${mDrone.health.propulsion}%, Optical: ${mDrone.health.optical}%, Chassis: ${mDrone.health.chassis}%</p>
                </div>
                
                <div class="space-y-md">
                    <!-- Task 1: Propulsion -->
                    <div class="p-md bg-slate-50 dark:bg-on-surface-variant/5 rounded-xl border border-outline-variant/20 dark:border-outline/10 flex justify-between items-center">
                        <div class="flex gap-md items-center">
                            <span class="material-symbols-outlined text-2xl ${isPropCalib ? 'text-emerald-500' : 'text-slate-400'}">propeller</span>
                            <div>
                                <p class="font-bold text-sm text-on-surface dark:text-inverse-on-surface">Replace Rotor Pin & Calibrate Propellers</p>
                                <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/60">Reset thrust parameters on carbon fiber blades</p>
                            </div>
                        </div>
                        ${isPropCalib ? `<span class="material-symbols-outlined text-emerald-500 font-bold">check_circle</span>` : `<button onclick="window.runHangarCheck('${mDrone.id}', 'propulsion')" class="bg-primary text-white text-xs font-bold py-sm px-md rounded-lg hover:bg-primary/95 transition-colors">Run Calibration</button>`}
                    </div>

                    <!-- Task 2: Optical -->
                    <div class="p-md bg-slate-50 dark:bg-on-surface-variant/5 rounded-xl border border-outline-variant/20 dark:border-outline/10 flex justify-between items-center">
                        <div class="flex gap-md items-center">
                            <span class="material-symbols-outlined text-2xl ${isOptCalib ? 'text-emerald-500' : 'text-slate-400'}">photo_camera</span>
                            <div>
                                <p class="font-bold text-sm text-on-surface dark:text-inverse-on-surface">Lenses Polishing & Sensor Recalibration</p>
                                <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/60">Audit stereoscopic camera arrays and IR lenses</p>
                            </div>
                        </div>
                        ${isOptCalib ? `<span class="material-symbols-outlined text-emerald-500 font-bold">check_circle</span>` : `<button onclick="window.runHangarCheck('${mDrone.id}', 'optical')" class="bg-primary text-white text-xs font-bold py-sm px-md rounded-lg hover:bg-primary/95 transition-colors">Run Calibration</button>`}
                    </div>

                    <!-- Task 3: Chassis -->
                    <div class="p-md bg-slate-50 dark:bg-on-surface-variant/5 rounded-xl border border-outline-variant/20 dark:border-outline/10 flex justify-between items-center">
                        <div class="flex gap-md items-center">
                            <span class="material-symbols-outlined text-2xl ${isChassisCalib ? 'text-emerald-500' : 'text-slate-400'}">hardware</span>
                            <div>
                                <p class="font-bold text-sm text-on-surface dark:text-inverse-on-surface">Structural Weld Check & Battery Latches</p>
                                <p class="text-xs text-on-surface-variant dark:text-inverse-on-surface/60">Check carbon composite arms and battery seating locks</p>
                            </div>
                        </div>
                        ${isChassisCalib ? `<span class="material-symbols-outlined text-emerald-500 font-bold">check_circle</span>` : `<button onclick="window.runHangarCheck('${mDrone.id}', 'chassis')" class="bg-primary text-white text-xs font-bold py-sm px-md rounded-lg hover:bg-primary/95 transition-colors">Run Calibration</button>`}
                    </div>
                </div>
            </div>
        `;
    } else {
        selectedMaintenanceDroneId = null;
        renderMaintenanceView();
    }
}

// Select maintenance drone callback
window.selectMaintenanceDrone = (droneId) => {
    selectedMaintenanceDroneId = droneId;
    renderMaintenanceView();
};

// Calibrate maintenance checks
window.runHangarCheck = (droneId, system) => {
    // Calibrate system
    state.performCalibration(droneId, system);
    
    // Play sound on success (if enabled)
    if (state.settings.soundsEnabled) {
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.connect(gain);
            gain.connect(context.destination);
            
            osc.frequency.setValueAtTime(880, context.currentTime); // A5 tone
            gain.gain.setValueAtTime(0.05, context.currentTime);
            
            osc.start();
            osc.stop(context.currentTime + 0.1);
        } catch(e) {}
    }
};

// Render Users Grid list
function renderUsersGrid() {
    const grid = document.getElementById('usersListGrid');
    if (!grid) return;

    grid.innerHTML = '';

    state.users.forEach(user => {
        let avatarImg = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBijJZddpbaAwXrMcKxkk4y5a8XK3TNesNW3AycY6mN2XMSPWhi-KOtgNnDLiV7jx7kJRTX8NreKaVxQeo6CFq-GUV4ewnI2U6Vb1rZ90U3HS2UdQ6RwMHkl8qlfM-aPxnBmFCzL8Jb2Coc0PUZEMekUHPT5KHuRTpRndBVSNGdP9wR1kvr-E2RJst4YVbbbMsSyh05z_ZwxxiBlxAZOdc_RkAy5OP3aU9gZF1k_fjuiztN5z-x2YDpQGWd0_coz4R7mUbce-uDKmA';
        
        let statusDotColor = 'bg-emerald-500';
        if (user.status === 'Away') statusDotColor = 'bg-amber-500';
        else if (user.status === 'Offline') statusDotColor = 'bg-slate-400';

        grid.innerHTML += `
            <div class="bg-white dark:bg-inverse-surface border border-outline-variant/20 dark:border-outline/10 p-lg rounded-2xl flex flex-col items-center text-center shadow-xs">
                <div class="relative mb-md">
                    <img src="${avatarImg}" class="w-16 h-16 rounded-full border-2 border-primary-container object-cover" alt="Operator avatar"/>
                    <span class="w-3.5 h-3.5 rounded-full absolute bottom-0 right-0 border-2 border-white dark:border-inverse-surface ${statusDotColor}"></span>
                </div>
                <h4 class="font-bold text-on-surface dark:text-inverse-on-surface">${user.name}</h4>
                <p class="text-xs text-outline dark:text-inverse-on-surface/60 mt-xs">${user.role}</p>
                
                <div class="mt-lg pt-md border-t border-outline-variant/10 dark:border-outline/10 w-full flex justify-between items-center text-xs">
                    <span class="text-on-surface-variant dark:text-inverse-on-surface/75">Flights overseen:</span>
                    <span class="font-bold">${user.flights}</span>
                </div>
            </div>
        `;
    });
}

// Sync controls on settings panel
function syncSettingsControls() {
    const themeBtn = document.getElementById('settingsThemeToggle');
    const soundBtn = document.getElementById('settingsSoundToggle');
    const simSelect = document.getElementById('settingsSimSpeedSelect');
    const battInput = document.getElementById('settingsBatteryThreshold');
    
    // Quick toggle icon inside nav
    const quickThemeIcon = document.getElementById('quickThemeToggleIcon');

    if (themeBtn) {
        const isDark = state.settings.theme === 'dark';
        themeBtn.className = `w-12 h-6 rounded-full relative transition-all duration-300 ${isDark ? 'bg-primary' : 'bg-slate-300'}`;
        themeBtn.querySelector('span').className = `w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow-md ${isDark ? 'left-6' : 'left-0.5'}`;
        
        if (quickThemeIcon) {
            quickThemeIcon.textContent = isDark ? 'light_mode' : 'dark_mode';
        }
    }

    if (soundBtn) {
        const soundOn = state.settings.soundsEnabled;
        soundBtn.className = `w-12 h-6 rounded-full relative transition-all ${soundOn ? 'bg-primary' : 'bg-slate-300'}`;
        soundBtn.querySelector('span').className = `w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow-md ${soundOn ? 'left-6' : 'left-0.5'}`;
    }

    if (simSelect) {
        simSelect.value = state.settings.simulationSpeed;
    }

    if (battInput) {
        battInput.value = state.settings.lowBatteryThreshold;
    }

    // Sync counts in analytics donuts
    const activeCount = state.drones.filter(d => d.status === 'Online').length;
    const offlineCount = state.drones.filter(d => d.status === 'Offline').length;
    const maintCount = state.drones.filter(d => d.status === 'Maintenance').length;

    const actEl = document.getElementById('utilizationActiveCount');
    const offEl = document.getElementById('utilizationOfflineCount');
    const mntEl = document.getElementById('utilizationMaintCount');

    if (actEl) actEl.textContent = activeCount;
    if (offEl) offEl.textContent = offlineCount;
    if (mntEl) mntEl.textContent = maintCount;
}
