// Chart instances
let cpuChart = null;
let gpuChart = null;
let diskChart = null;
let ramChart = null;
let historicalChart = null;

// Historical data storage
const historicalData = {
    memory: [],
    cpu: [],
    temperature: [],
    network: []
};

// Initialize charts
function initCharts() {
    // CPU Chart
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'CPU Usage %',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4
                },
                {
                    label: 'Temperature °C',
                    data: [],
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: 'CPU Usage %'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Temperature °C'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });

    // GPU Chart
    const gpuCtx = document.getElementById('gpuChart').getContext('2d');
    gpuChart = new Chart(gpuCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature °C',
                data: [],
                backgroundColor: [
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(59, 130, 246, 0.8)'
                ],
                borderColor: [
                    'rgba(139, 92, 246, 1)',
                    'rgba(59, 130, 246, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Temperature °C'
                    }
                }
            }
        }
    });

    // Disk Chart
    const diskCtx = document.getElementById('diskChart').getContext('2d');
    diskChart = new Chart(diskCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(34, 197, 94, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // RAM Chart
    const ramCtx = document.getElementById('ramChart').getContext('2d');
    ramChart = new Chart(ramCtx, {
        type: 'doughnut',
        data: {
            labels: ['Used', 'Available'],
            datasets: [{
                data: [0, 100],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.8)',
                    'rgba(34, 197, 94, 0.8)'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // Historical Chart
    const historicalCtx = document.getElementById('historicalChart').getContext('2d');
    historicalChart = new Chart(historicalCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Memory Usage %',
                data: [],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Value'
                    }
                }
            }
        }
    });
}

// Fetch system metrics
async function fetchMetrics() {
    try {
        const response = await fetch('/api/metrics');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Received data:', data);
        updateDashboard(data);
        updateHistoricalData(data);
    } catch (error) {
        console.error('Error fetching metrics:', error);
        // Show error to user
        const errorMsg = document.createElement('div');
        errorMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; background: red; color: white; padding: 15px; border-radius: 5px; z-index: 10000;';
        errorMsg.textContent = `Error: ${error.message}`;
        document.body.appendChild(errorMsg);
        setTimeout(() => errorMsg.remove(), 5000);
    }
}

// Update dashboard with new data
function updateDashboard(data) {
    console.log('Updating dashboard with:', data);

    function parseSizeToGB(value) {
        if (!value) return 0;
        const s = String(value).trim();
        const m = s.match(/([\d.]+)\s*([KMGT]i?|B)?/i);
        if (!m) return 0;
        const num = parseFloat(m[1]);
        if (Number.isNaN(num)) return 0;
        const unit = (m[2] || '').toUpperCase();
        // Treat decimal units (K/M/G/T) as powers of 1024 for simplicity in a dashboard
        switch (unit) {
            case 'T':
            case 'TI':
                return num * 1024;
            case 'G':
            case 'GI':
            case '':
                return num;
            case 'M':
            case 'MI':
                return num / 1024;
            case 'K':
            case 'KI':
                return num / (1024 * 1024);
            case 'B':
                return num / (1024 * 1024 * 1024);
            default:
                return num;
        }
    }
    
    // CPU Info
    if (data.cpu) {
        document.getElementById('cpuBrand').textContent = data.cpu.model || '-';
        document.getElementById('cpuCores').textContent = data.cpu.cores || '-';
        document.getElementById('cpuSpeed').textContent = data.cpu.speed || '-';
        document.getElementById('cpuTemp').textContent = data.cpu.temperature || '-';
        document.getElementById('cpuUsage').textContent = data.cpu.utilization || '-';
    }

    // Update CPU Chart
    const now = new Date().toLocaleTimeString();
    if (cpuChart) {
        cpuChart.data.labels.push(now);
        cpuChart.data.datasets[0].data.push(parseFloat(data.cpu?.utilization) || 0);
        cpuChart.data.datasets[1].data.push(parseFloat(data.cpu?.temperature) || 0);
        
        // Keep only last 20 data points
        if (cpuChart.data.labels.length > 20) {
            cpuChart.data.labels.shift();
            cpuChart.data.datasets[0].data.shift();
            cpuChart.data.datasets[1].data.shift();
        }
        cpuChart.update('none');
    }

    // GPU Info
    if (data.gpu && data.gpu.length > 0) {
        document.getElementById('gpu1Name').textContent = data.gpu[0].name || '-';
        document.getElementById('gpu1VRAM').textContent = data.gpu[0].vram || '-';
        document.getElementById('gpu1Temp').textContent = data.gpu[0].temperature || 'N/A';
        
        if (data.gpu.length > 1) {
            document.getElementById('gpu2Section').style.display = 'block';
            document.getElementById('gpu2Details').style.display = 'block';
            document.getElementById('gpu2Name').textContent = data.gpu[1].name || '-';
            document.getElementById('gpu2VRAM').textContent = data.gpu[1].vram || '-';
            document.getElementById('gpu2Temp').textContent = data.gpu[1].temperature || 'N/A';
        }
        
        // Update GPU Chart
        if (gpuChart) {
            gpuChart.data.labels = data.gpu.map((g, i) => `GPU ${i + 1}`);
            gpuChart.data.datasets[0].data = data.gpu.map(g => parseFloat(g.temperature) || 0);
            gpuChart.update('none');
        }
    }

    // Disk Info
    if (data.disk) {
        const diskTotalEl = document.getElementById('diskTotal');
        if (diskTotalEl) diskTotalEl.textContent = data.disk.total || '-';
        const diskUsedEl = document.getElementById('diskUsed');
        if (diskUsedEl) diskUsedEl.textContent = data.disk.used || '-';
        const diskFreeEl = document.getElementById('diskFree');
        if (diskFreeEl) diskFreeEl.textContent = data.disk.available || '-';

        // Update Disk Chart (total used vs free)
        if (diskChart) {
            const usedGB = parseSizeToGB(data.disk.used);
            const freeGB = parseSizeToGB(data.disk.available);
            diskChart.data.labels = ['Used', 'Free'];
            diskChart.data.datasets[0].data = [usedGB, freeGB];
            diskChart.update('none');
        }
    }

    // Network Info (IP only)
    if (data.network) {
        const ipv4 = data.network.ipv4 || '-';
        const ipv6 = data.network.ipv6 || '-';
        const ipv4HeaderEl = document.getElementById('ipv4Header');
        if (ipv4HeaderEl) ipv4HeaderEl.textContent = ipv4;
        const ipv6HeaderEl = document.getElementById('ipv6Header');
        if (ipv6HeaderEl) ipv6HeaderEl.textContent = ipv6;
    }

    // RAM Info
    if (data.ram) {
        document.getElementById('ramTotal').textContent = data.ram.total || '-';
        document.getElementById('ramAvailable').textContent = data.ram.available || '-';
        document.getElementById('ramUsed').textContent = data.ram.usedPercent || '-';
        document.getElementById('ramFree').textContent = data.ram.freePercent || '-';

        // Update RAM Chart
        if (ramChart) {
            const used = parseFloat(data.ram.usedPercent) || 0;
            const free = parseFloat(data.ram.freePercent) || 0;
            ramChart.data.datasets[0].data = [used, free];
            ramChart.update('none');
        }
    }

    // Platform (header)
    if (data.system) {
        const platform = data.system.platform || '-';
        const platformHeaderEl = document.getElementById('platformHeader');
        if (platformHeaderEl) platformHeaderEl.textContent = platform;
    }
}

// Update historical data
function updateHistoricalData(data) {
    const now = new Date();
    
    // Add to historical arrays
    historicalData.memory.push({
        time: now,
        value: parseFloat(data.ram?.usedPercent) || 0
    });
    historicalData.cpu.push({
        time: now,
        value: parseFloat(data.cpu?.utilization) || 0
    });
    historicalData.temperature.push({
        time: now,
        value: parseFloat(data.cpu?.temperature) || 0
    });
    
    // Keep only last 100 data points
    Object.keys(historicalData).forEach(key => {
        if (historicalData[key].length > 100) {
            historicalData[key].shift();
        }
    });
    
    updateHistoricalChart();
}

// Update historical chart based on selected metric
function updateHistoricalChart() {
    const metric = document.getElementById('historicalMetric').value;
    const data = historicalData[metric] || [];
    
    if (historicalChart && data.length > 0) {
        historicalChart.data.labels = data.map(d => d.time.toLocaleTimeString());
        historicalChart.data.datasets[0].data = data.map(d => d.value);
        historicalChart.data.datasets[0].label = getMetricLabel(metric);
        historicalChart.update('none');
    }
}

function getMetricLabel(metric) {
    const labels = {
        memory: 'Memory Usage %',
        cpu: 'CPU Usage %',
        temperature: 'Temperature °C',
        network: 'Network Throughput MB/s'
    };
    return labels[metric] || 'Value';
}

// Event listeners
const reportBtn = document.getElementById('reportBtn');
if (reportBtn) reportBtn.addEventListener('click', () => {
    generateReport();
});

document.getElementById('historicalMetric').addEventListener('change', () => {
    updateHistoricalChart();
});

// Generate report
function generateReport() {
    fetch('/api/report')
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `system-report-${new Date().toISOString()}.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(error => {
            console.error('Error generating report:', error);
            alert('Error generating report. Please try again.');
        });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchMetrics();
    
    // Auto-refresh every 5 seconds
    setInterval(fetchMetrics, 5000);
});

