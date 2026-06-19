import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export function UtilizationChart({ drones, theme }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const onlineCount = drones.filter(d => d.status === 'Online').length;
    const offlineCount = drones.filter(d => d.status === 'Offline').length;
    const maintenanceCount = drones.filter(d => d.status === 'Maintenance').length;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = theme === 'dark';
    const textColor = isDark ? '#bdc8d1' : '#454747';

    chartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Online / Active', 'Offline', 'In Maintenance'],
        datasets: [{
          data: [onlineCount, offlineCount, maintenanceCount],
          backgroundColor: ['#00668a', '#5d5f5f', '#f1a02b'],
          borderColor: isDark ? '#171c20' : '#ffffff',
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
              color: textColor,
              boxWidth: 10,
              font: { family: 'Inter', size: 12 }
            }
          }
        },
        cutout: '65%'
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [drones, theme]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

export function BatteryHealthChart({ theme }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const isDark = theme === 'dark';
    const textColor = isDark ? '#bdc8d1' : '#454747';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
          label: 'Avg Battery Efficiency (%)',
          data: [95.1, 94.8, 93.9, 94.5, 95.2, 93.6, 94.2],
          backgroundColor: '#00668a',
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
            labels: { color: textColor, font: { family: 'Inter', size: 12 } }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor },
            min: 80,
            max: 100
          }
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [theme]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}
