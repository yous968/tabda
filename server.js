const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('.'));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Parse bash script output
async function parseBashOutput(output) {
    const lines = output.split('\n');
    const data = {
        cpu: {},
        gpu: [],
        ram: {},
        disk: { partitions: [] },
        network: {},
        system: {},
        smart: { status: 'unknown' }
    };

    lines.forEach(line => {
        const trimmedLine = line.trim();
        
        // CPU Model
        if (trimmedLine.includes('CPU Model:')) {
            data.cpu.model = trimmedLine.split('CPU Model:')[1]?.trim() || '-';
        }
        // CPU Cores
        if (trimmedLine.includes('CPU Cores:')) {
            data.cpu.cores = trimmedLine.split('CPU Cores:')[1]?.trim() || '-';
        }
        // CPU Speed
        if (trimmedLine.includes('CPU Speed:')) {
            data.cpu.speed = trimmedLine.split('CPU Speed:')[1]?.trim() || '-';
        }
        // CPU Utilization
        if (trimmedLine.includes('CPU Utilization:')) {
            const match = trimmedLine.match(/CPU Utilization:\s*([\d.]+)/);
            if (match) data.cpu.utilization = parseFloat(match[1]).toFixed(2);
        }
        // CPU Temperature
        if (trimmedLine.includes('CPU Temperature:')) {
            const temp = trimmedLine.split('CPU Temperature:')[1]?.trim();
            if (temp && temp !== 'sensors command not found' && !temp.includes('install') && temp !== 'N/A') {
                // Extract just the number, handling formats like "+53.0°C" or "53.0°C" or "53"
                const tempMatch = temp.match(/([\d.]+)/);
                if (tempMatch) {
                    data.cpu.temperature = parseFloat(tempMatch[1]).toFixed(1);
                }
            } else if (temp === 'N/A') {
                data.cpu.temperature = 'N/A';
            }
        }
        // RAM
        if (trimmedLine.includes('Total RAM:')) {
            data.ram.total = trimmedLine.split('Total RAM:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Free RAM:')) {
            const match = trimmedLine.match(/Free RAM:\s*([\d.]+)/);
            if (match) data.ram.freePercent = parseFloat(match[1]).toFixed(2);
        }
        if (trimmedLine.includes('Utilized RAM:')) {
            const match = trimmedLine.match(/Utilized RAM:\s*([\d.]+)/);
            if (match) data.ram.usedPercent = parseFloat(match[1]).toFixed(2);
        }
        // GPU
        if (trimmedLine.includes('GPU:') && !trimmedLine.includes('GPU Type:') && !trimmedLine.includes('GPU Utilization:') && !trimmedLine.includes('GPU Temperature:')) {
            const gpuName = trimmedLine.split('GPU:')[1]?.trim();
            if (gpuName && gpuName.length > 0 && !data.gpu.find(g => g.name === gpuName)) {
                data.gpu.push({
                    name: gpuName,
                    vram: '-',
                    temperature: 'N/A'
                });
            }
        }
        if (trimmedLine.includes('GPU Utilization:')) {
            const match = trimmedLine.match(/GPU Utilization:\s*([\d.]+)/);
            if (match && data.gpu.length > 0) {
                data.gpu[data.gpu.length - 1].utilization = parseFloat(match[1]).toFixed(2);
            }
        }
        if (trimmedLine.includes('GPU Temperature:')) {
            const temp = trimmedLine.split('GPU Temperature:')[1]?.trim();
            if (temp && temp !== 'N/A' && !temp.includes('not found') && data.gpu.length > 0) {
                const tempMatch = temp.match(/([\d.]+)/);
                if (tempMatch) {
                    data.gpu[data.gpu.length - 1].temperature = parseFloat(tempMatch[1]).toFixed(1);
                } else {
                    data.gpu[data.gpu.length - 1].temperature = 'N/A';
                }
            }
        }
        // Disk
        if (trimmedLine.includes('Total Disk Space:')) {
            data.disk.total = trimmedLine.split('Total Disk Space:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Used Disk Space:')) {
            data.disk.used = trimmedLine.split('Used Disk Space:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Available Disk Space:')) {
            data.disk.available = trimmedLine.split('Available Disk Space:')[1]?.trim() || '-';
        }
        // Network
        if (trimmedLine.includes('Network Adapter Model:')) {
            data.network.adapter = trimmedLine.split('Network Adapter Model:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Sent:')) {
            const sent = trimmedLine.split('Sent:')[1]?.trim();
            if (sent) {
                const num = parseFloat(sent);
                if (!isNaN(num)) {
                    data.network.tx = num >= 1024 ? `${(num / 1024).toFixed(2)} GB` : `${num.toFixed(2)} MB`;
                }
            }
        }
        if (trimmedLine.includes('Received:')) {
            const recv = trimmedLine.split('Received:')[1]?.trim();
            if (recv) {
                const num = parseFloat(recv);
                if (!isNaN(num)) {
                    data.network.rx = num >= 1024 ? `${(num / 1024).toFixed(2)} GB` : `${num.toFixed(2)} MB`;
                }
            }
        }
        if (trimmedLine.includes('IPV4 Address:')) {
            data.network.ipv4 = trimmedLine.split('IPV4 Address:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('IPV6 Address:')) {
            data.network.ipv6 = trimmedLine.split('IPV6 Address:')[1]?.trim() || '-';
        }
        // System
        if (trimmedLine.includes('Uptime:')) {
            data.system.uptime = trimmedLine.split('Uptime:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Startup time:')) {
            data.system.bootTime = trimmedLine.split('Startup time:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Average process waiting time:')) {
            data.system.loadAverage = trimmedLine.split('Average process waiting time:')[1]?.trim() || '-';
        }
        if (trimmedLine.includes('Processes:')) {
            data.system.processes = trimmedLine.split('Processes:')[1]?.trim() || '-';
        }
        // SMART
        if (trimmedLine.includes('All disks passed S.M.A.R.T. tests')) {
            data.smart.status = 'PASSED';
        }
        if (trimmedLine.includes('S.M.A.R.T. test FAILED')) {
            data.smart.status = 'FAILED';
        }
        if (trimmedLine.startsWith('SMART Status:')) {
            data.smart.status = trimmedLine.split('SMART Status:')[1]?.trim() || 'unknown';
        }
    });

    // Get additional system info
    data.system.platform = process.platform === 'linux' ? 'linux' : process.platform;
    
    // Get disk partitions (Linux/Mac)
    try {
        const { stdout } = await execAsync('df -h');
        const lines = stdout.split('\n').slice(1);
        data.disk.partitions = lines
            .filter(line => line.trim() && !line.includes('tmpfs') && !line.includes('devtmpfs'))
            .map(line => {
                const parts = line.split(/\s+/);
                if (parts.length >= 5) {
                    const total = parts[1];
                    const used = parts[2];
                    const available = parts[3];
                    const mount = parts[5];
                    const usedPercent = parts[4].replace('%', '');
                    return { mount, total, used, available, usedPercent };
                }
                return null;
            })
            .filter(p => p !== null);
    } catch (error) {
        console.error('Error getting disk partitions:', error);
    }

    // Get CPU cores and speed (Linux/Mac)
    try {
        const { stdout } = await execAsync('lscpu');
        const coresMatch = stdout.match(/Core\(s\) per socket:\s*(\d+)/);
        const threadsMatch = stdout.match(/Thread\(s\) per core:\s*(\d+)/);
        const socketsMatch = stdout.match(/Socket\(s\):\s*(\d+)/);
        const speedMatch = stdout.match(/CPU MHz:\s*([\d.]+)/);
        
        if (coresMatch && socketsMatch) {
            const cores = parseInt(coresMatch[1]);
            const sockets = parseInt(socketsMatch[1]);
            const threads = threadsMatch ? parseInt(threadsMatch[1]) : 1;
            data.cpu.cores = `${cores * sockets} physical / ${cores * sockets * threads} logical`;
        }
        if (speedMatch) {
            data.cpu.speed = `${(parseFloat(speedMatch[1]) / 1000).toFixed(1)} GHz`;
        }
    } catch (error) {
        console.error('Error getting CPU info:', error);
    }

    // Get RAM available (Linux/Mac)
    try {
        const { stdout } = await execAsync('free -h');
        const match = stdout.match(/Mem:\s+\S+\s+\S+\s+\S+\s+\S+\s+(\S+)/);
        if (match) {
            data.ram.available = match[1];
        }
    } catch (error) {
        console.error('Error getting RAM info:', error);
    }

    // Get uptime and processes (Linux/Mac)
    try {
        const { stdout } = await execAsync('uptime');
        const uptimeMatch = stdout.match(/up\s+([^,]+)/);
        if (uptimeMatch) {
            data.system.uptime = uptimeMatch[1].trim();
        }
        
        const { stdout: psOut } = await execAsync('ps aux | wc -l');
        const count = parseInt(psOut.trim());
        data.system.processes = `${count} total`;
    } catch (error) {
        console.error('Error getting system info:', error);
    }

    return data;
}

// API endpoint to get metrics
app.get('/api/metrics', async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, 'Tasks.sh');
        
        // Check if script exists
        try {
            await fs.access(scriptPath);
        } catch {
            return res.status(404).json({ error: 'Tasks.sh not found' });
        }

        // Execute the script (Linux/Mac via bash, with sh fallback)
        let stdout = '';
        let stderr = '';

        // Use bash first (Tasks.sh uses bash-isms), then sh as a last resort
        try {
            const result = await execAsync(`bash "${scriptPath}"`, {
                maxBuffer: 1024 * 1024 * 10,
                timeout: 30000
            });
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (error) {
            try {
                const result = await execAsync(`sh "${scriptPath}"`, {
                    maxBuffer: 1024 * 1024 * 10,
                    timeout: 30000
                });
                stdout = result.stdout;
                stderr = result.stderr;
            } catch (error2) {
                console.error('Failed to execute script:', error, error2);
                return res.status(500).json({
                    error: 'Failed to execute script',
                    details: error2.message,
                    platform: process.platform
                });
            }
        }
        
        // Log the raw output for debugging
        console.log('=== Script Output ===');
        console.log(stdout);
        if (stderr) {
            console.log('=== Script Errors ===');
            console.log(stderr);
        }

        // Parse the output
        const data = await parseBashOutput(stdout);
        
        // Log parsed data for debugging
        console.log('=== Parsed Data ===');
        console.log(JSON.stringify(data, null, 2));
        
        res.json(data);
    } catch (error) {
        console.error('Error in /api/metrics:', error);
        console.error('Error stack:', error.stack);
        
        // Return detailed error information
        res.status(500).json({ 
            error: 'Failed to fetch metrics', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// API endpoint to generate report
app.get('/api/report', async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, 'Tasks.sh');
        const { stdout } = await execAsync(`bash "${scriptPath}"`);
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename=system-report.txt');
        res.send(stdout);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).send('Error generating report');
    }
});

app.listen(PORT, () => {
    console.log(`Health Metric System server running on http://localhost:${PORT}`);
});

