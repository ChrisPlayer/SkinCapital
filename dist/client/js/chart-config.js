/**
 * Chart.js Global Configuration
 * Additional chart utilities and styles
 */

// Set default Chart.js options
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Custom gradient for area charts
    Chart.register({
        id: 'customGradient',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;

            if (!chartArea) return;

            // Create gradient for each dataset
            chart.data.datasets.forEach((dataset, i) => {
                if (dataset.fill && !dataset._gradient) {
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, 'rgba(222, 155, 53, 0.3)');
                    gradient.addColorStop(1, 'rgba(222, 155, 53, 0)');
                    dataset.backgroundColor = gradient;
                    dataset._gradient = true;
                }
            });
        }
    });
}

/**
 * Create a comparison chart for item prices
 * @param {string} canvasId - Canvas element ID
 * @param {Object} data - Price data { labels, steam, csfloat, skinport }
 */
function createPriceComparisonChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Steam',
                    data: data.steam,
                    backgroundColor: 'rgba(94, 152, 217, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'CSFloat',
                    data: data.csfloat,
                    backgroundColor: 'rgba(222, 155, 53, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Skinport',
                    data: data.skinport,
                    backgroundColor: 'rgba(136, 71, 255, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '€' + v }
                }
            }
        }
    });
}

/**
 * Create a mini sparkline chart
 * @param {string} canvasId - Canvas element ID
 * @param {Array} data - Array of values
 * @param {string} color - Line color
 */
function createSparkline(canvasId, data, color = '#DE9B35') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data: data,
                borderColor: color,
                borderWidth: 2,
                tension: 0.3,
                pointRadius: 0,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createPriceComparisonChart, createSparkline };
}
