import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export function TelemetryChart({ dataPoints = 15 }) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
    const textColor = isDark ? '#bdc8d1' : '#454747';

    const initialLabels = Array(dataPoints).fill('');
    const initialAltitudeData = Array(dataPoints).fill(45);
    const initialSpeedData = Array(dataPoints).fill(12);

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

    window.updateTelemetryChart = (altitude, speed) => {
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

    return () => {
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
