import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export function TelemetryChart({ dataPoints = 15 }) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const lastExternalUpdateTime = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
    const textColor = isDark ? '#bdc8d1' : '#454747';

    // Initialize with nice looking randomized flight paths instead of straight flat lines
    const initialLabels = Array.from({ length: dataPoints }, (_, i) => {
      const d = new Date(Date.now() - (dataPoints - i) * 2000);
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    let lastAlt = 45;
    let lastSpeed = 12;
    const initialAltitudeData = Array.from({ length: dataPoints }, (_, i) => {
      lastAlt = Math.max(30, Math.min(80, lastAlt + Math.sin(i / 1.5) * 4 + (Math.random() - 0.5) * 2));
      return parseFloat(lastAlt.toFixed(1));
    });
    const initialSpeedData = Array.from({ length: dataPoints }, (_, i) => {
      lastSpeed = Math.max(5, Math.min(25, lastSpeed + Math.cos(i / 1.5) * 1.5 + (Math.random() - 0.5) * 1));
      return parseFloat(lastSpeed.toFixed(1));
    });

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: initialLabels,
        datasets: [
          {
            label: 'Altitude (m)',
            data: initialAltitudeData,
            borderColor: '#00668a',
            backgroundColor: 'rgba(0, 102, 138, 0.2)',
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
              color: textColor,
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
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } },
            title: { display: true, text: 'Alt (m)', color: textColor, font: { size: 10 } },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: textColor, font: { size: 10 } },
            title: { display: true, text: 'Speed (m/s)', color: textColor, font: { size: 10 } },
            min: 0,
            max: 30
          }
        }
      }
    });

    // Update handler for live stream inputs
    window.updateTelemetryChart = (altitude, speed) => {
      lastExternalUpdateTime.current = Date.now();
      lastAlt = altitude;
      lastSpeed = speed;

      const chart = chartInstanceRef.current;
      if (!chart) return;

      const datasetAlt = chart.data.datasets[0].data;
      const datasetSpeed = chart.data.datasets[1].data;

      datasetAlt.shift();
      datasetAlt.push(altitude);

      datasetSpeed.shift();
      datasetSpeed.push(speed);

      chart.data.labels.shift();
      chart.data.labels.push(new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Update theme variables dynamically
      const isDarkNow = document.documentElement.classList.contains('dark');
      const gridColorNow = isDarkNow ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
      const textColorNow = isDarkNow ? '#bdc8d1' : '#454747';

      chart.options.scales.y.grid.color = gridColorNow;
      chart.options.scales.y.ticks.color = textColorNow;
      chart.options.scales.y.title.color = textColorNow;
      chart.options.scales.y1.ticks.color = textColorNow;
      chart.options.scales.y1.title.color = textColorNow;
      chart.options.plugins.legend.labels.color = textColorNow;

      chart.update('none');
    };

    // Live dummy simulator fallback if no server stream updates are active
    const localSimulationInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastExternalUpdateTime.current > 3000) {
        lastAlt = Math.max(30, Math.min(80, lastAlt + (Math.random() - 0.5) * 5));
        lastSpeed = Math.max(5, Math.min(25, lastSpeed + (Math.random() - 0.5) * 2.5));

        const chart = chartInstanceRef.current;
        if (!chart) return;

        const datasetAlt = chart.data.datasets[0].data;
        const datasetSpeed = chart.data.datasets[1].data;

        datasetAlt.shift();
        datasetAlt.push(parseFloat(lastAlt.toFixed(1)));

        datasetSpeed.shift();
        datasetSpeed.push(parseFloat(lastSpeed.toFixed(1)));

        chart.data.labels.shift();
        chart.data.labels.push(new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        chart.update('none');
      }
    }, 2000);

    return () => {
      clearInterval(localSimulationInterval);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      window.updateTelemetryChart = null;
    };
  }, [dataPoints]);

  return (
    <div className="w-full h-full min-h-[220px]">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default TelemetryChart;




