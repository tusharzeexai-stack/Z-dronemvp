import { state } from './state.js';

let telemetryChartInstance = null;
let batteryHealthChartInstance = null;
let utilizationChartInstance = null;

const chartColors = {
    primary: '#00668a',
    primaryLight: 'rgba(0, 102, 138, 0.2)',
    secondary: '#5d5f5f',
    error: '#ba1a1a',
    emerald: '#10b981',
    emeraldLight: 'rgba(16, 185, 129, 0.2)',
    amber: '#f1a02b',
    gridDark: 'rgba(255, 255, 255, 0.08)',
    gridLight: 'rgba(0, 0, 0, 0.04)',
    textDark: '#bdc8d1',
    textLight: '#454747'
};

function getGridColor() {
    return state.settings.theme === 'dark' ? chartColors.gridDark : chartColors.gridLight;
}

function getTextColor() {
    return state.settings.theme === 'dark' ? chartColors.textDark : chartColors.textLight;
}

// Initialize real-time telemetry charts (scrolling line charts)
export function initTelemetryCharts(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    // Destroy existing instance if any
    if (telemetryChartInstance) {
        telemetryChartInstance.destroy();
    }

    const dataPointsCount = 15;
    const initialLabels = Array(dataPointsCount).fill('');
    const initialAltitudeData = Array(dataPointsCount).fill(45);
    const initialSpeedData = Array(dataPointsCount).fill(12);

    telemetryChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: initialLabels,
            datasets: [
                {
                    label: 'Altitude (m)',
                    data: initialAltitudeData,
                    borderColor: chartColors.primary,
                    backgroundColor: chartColors.primaryLight,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'y'
                },
                {
                    label: 'Speed (m/s)',
                    data: initialSpeedData,
                    borderColor: '#f1a02b',
                    backgroundColor: 'rgba(241, 160, 43, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: getTextColor(),
                        boxWidth: 12,
                        font: { size: 11, family: 'Inter' }
                    }
                },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { display: false }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: getGridColor() },
                    ticks: { color: getTextColor(), font: { size: 10 } },
                    title: { display: true, text: 'Alt (m)', color: getTextColor(), font: { size: 10 } },
                    min: 0,
                    max: 100
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: getTextColor(), font: { size: 10 } },
                    title: { display: true, text: 'Speed (m/s)', color: getTextColor(), font: { size: 10 } },
                    min: 0,
                    max: 30
                }
            }
        }
    });

    return telemetryChartInstance;
}

// Update the real-time telemetry chart with a new frame of data
export function updateTelemetryChart(altitude, speed) {
    if (!telemetryChartInstance) return;

    const datasetAlt = telemetryChartInstance.data.datasets[0].data;
    const datasetSpeed = telemetryChartInstance.data.datasets[1].data;

    datasetAlt.shift();
    datasetAlt.push(altitude);

    datasetSpeed.shift();
    datasetSpeed.push(speed);

    // Update labels to slide
    telemetryChartInstance.data.labels.shift();
    telemetryChartInstance.data.labels.push(new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    // Update colors dynamically in case theme changed
    telemetryChartInstance.options.scales.y.grid.color = getGridColor();
    telemetryChartInstance.options.scales.y.ticks.color = getTextColor();
    telemetryChartInstance.options.scales.y.title.color = getTextColor();
    telemetryChartInstance.options.scales.y1.ticks.color = getTextColor();
    telemetryChartInstance.options.scales.y1.title.color = getTextColor();
    telemetryChartInstance.options.plugins.legend.labels.color = getTextColor();

    telemetryChartInstance.update('none'); // Update without animation for performance
}
window.updateTelemetryChart = updateTelemetryChart;

// Initialize larger Analytics views
export function initAnalyticsCharts(utilizationCanvasId, batteryCanvasId) {
    const utilCtx = document.getElementById(utilizationCanvasId);
    const battCtx = document.getElementById(batteryCanvasId);

    if (utilCtx) {
        // Calculate drone distribution
        const onlineCount = state.drones.filter(d => d.status === 'Online').length;
        const offlineCount = state.drones.filter(d => d.status === 'Offline').length;
        const maintenanceCount = state.drones.filter(d => d.status === 'Maintenance').length;

        if (utilizationChartInstance) utilizationChartInstance.destroy();

        utilizationChartInstance = new Chart(utilCtx, {
            type: 'doughnut',
            data: {
                labels: ['Online / Active', 'Offline', 'In Maintenance'],
                datasets: [{
                    data: [onlineCount, offlineCount, maintenanceCount],
                    backgroundColor: [chartColors.primary, chartColors.secondary, chartColors.amber],
                    borderColor: state.settings.theme === 'dark' ? '#171c20' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getTextColor(),
                            boxWidth: 10,
                            font: { family: 'Inter', size: 12 }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    if (battCtx) {
        if (batteryHealthChartInstance) batteryHealthChartInstance.destroy();

        batteryHealthChartInstance = new Chart(battCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Avg Battery Efficiency (%)',
                    data: [95.1, 94.8, 93.9, 94.5, 95.2, 93.6, 94.2],
                    backgroundColor: chartColors.primary,
                    borderRadius: 6,
                    borderWidth: 0,
                    barThickness: 16
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: getTextColor(), font: { family: 'Inter', size: 12 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: getTextColor() }
                    },
                    y: {
                        grid: { color: getGridColor() },
                        ticks: { color: getTextColor() },
                        min: 80,
                        max: 100
                    }
                }
            }
        });
    }
}

// Watch theme changes to redraw analytical charts with appropriate text colors
state.subscribe(() => {
    if (utilizationChartInstance) {
        utilizationChartInstance.options.plugins.legend.labels.color = getTextColor();
        utilizationChartInstance.data.datasets[0].borderColor = state.settings.theme === 'dark' ? '#171c20' : '#ffffff';
        utilizationChartInstance.update();
    }
    if (batteryHealthChartInstance) {
        batteryHealthChartInstance.options.plugins.legend.labels.color = getTextColor();
        batteryHealthChartInstance.options.scales.x.ticks.color = getTextColor();
        batteryHealthChartInstance.options.scales.y.ticks.color = getTextColor();
        batteryHealthChartInstance.options.scales.y.grid.color = getGridColor();
        batteryHealthChartInstance.update();
    }
});
