#!/bin/bash
# Linux-only script (used by server.js)
if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This script is Linux-only."
    exit 1
fi
#alert
# alert_call(){
#     cpu_temperature=$(get_cpu_test_temperature)
#     ram_percentage=$(get_free_ram_percentage)
#     temp_threshold=60
#     ram_threshold=10
#     if [[ $cpu_temperature =~ ^[0-9]+$ ]] && (( cpu_temperature > temp_threshold )); then
#         notify-send "High CPU Temperature" "Current temperature: $cpu_temperature°C"
#     fi
#     if (( $(echo "$ram_percentage < $ram_threshold" | bc -l) )); then
#         notify-send "Low Free RAM" "Current free RAM: $ram_percentage%"
#     fi
# }
#RAM functions
get_total_ram() {
    free -h | grep Mem | awk '{print $2}'
}
get_free_ram_percentage() {
    total_ram=$(free | grep Mem | awk '{print $2}')
    free_ram=$(free | grep Mem | awk '{print $7}')
    percentage=$(echo "scale=2; $free_ram / $total_ram * 100" |bc)
    echo "$percentage"
}
get_used_ram_percentage(){
    total_ram=$(free | grep Mem | awk '{print $2}')
    used_ram=$(free | grep Mem | awk '{print $3}')
    utilized_percentage=$(echo "scale=2; $used_ram / $total_ram *100" |bc)
    echo "$utilized_percentage"
}

#CPU functions
get_cpu_model_name(){
    # Robust across formats with/without "@ ..."
    lscpu | awk -F: '/Model name/ {sub(/^[ \t]+/, "", $2); print $2; exit}'
}
get_cpu_cores() {
    # Prefer "CPU(s)" which is logical CPU count
    lscpu | awk -F: '/^CPU\(s\)/ {sub(/^[ \t]+/, "", $2); print $2; exit}'
}
get_cpu_speed() {
    # Try current MHz; fall back to max MHz
    local mhz
    mhz=$(lscpu | awk -F: '/CPU MHz/ {sub(/^[ \t]+/, "", $2); print $2; exit}')
    if [[ -z "$mhz" ]]; then
        mhz=$(lscpu | awk -F: '/CPU max MHz/ {sub(/^[ \t]+/, "", $2); print $2; exit}')
    fi
    if [[ -n "$mhz" ]]; then
        awk -v mhz="$mhz" 'BEGIN { printf "%.1f GHz\n", (mhz/1000) }'
    fi
}
get_cpu_utilization() {
    mpstat | grep "all" | awk '{print 100 - $NF}' 
}
get_cpu_temperature() {
    if command -v sensors &> /dev/null; then
        sensors | grep 'Core 0:' | awk '{print $3}'
    else
        echo "sensors command not found, install lm-sensors if needed."
    fi
}
get_cpu_test_temperature() {
    cat /sys/class/thermal/thermal_zone0/temp | awk '{print $1/1000}'  # Get CPU temperature in °C
}
#GPU functions
get_gpu_model_name(){
    lspci | grep -Ei "vga|3d|2d|display" | awk -F ': ' '{print $2}'
}
get_gpu_info() {
    if command -v nvidia-smi &> /dev/null; then
        echo "nvidia"
    elif command -v amdgpu &> /dev/null; then
        echo "amd"
    elif lspci | grep -i "vga\|3d\|display" | grep -i "intel" &> /dev/null; then
        echo "intel"
    else
        echo "unknown"
    fi
}
get_gpu_utilization_nvidia() {
    nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits
}
get_gpu_temperature_nvidia() {
    nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits
}
get_gpu_utilization_amd() {
    if command -v amdgpu &> /dev/null; then
        amdgpu | grep "GPU Core Utilization" | awk '{print $3}'
    elif command -v radeontop &> /dev/null; then
        radeontop -i | grep "GPU" | awk '{print $2}'
    else
        echo "radeontop or amdgpu command not found, install AMD drivers."
    fi
}
get_gpu_temperature_amd() {
    if command -v sensors &> /dev/null; then
        sensors | grep 'temp1:' | awk '{print $2}'
    elif command -v radeontop &> /dev/null; then
        radeontop -i | grep "GPU" | awk '{print $3}'
    else
        echo "sensors or radeontop command not found, install AMD drivers."
    fi
}
get_gpu_utilization_intel() {
    if command -v intel_gpu_top &> /dev/null; then
        sudo timeout 5 intel_gpu_top > gpu_output.txt
        total=$(awk 'NR > 2 {rcs+=$9; bcs+=$12; vcs+=$15} END {print "RCS Sum: " rcs, "\nBCS Sum: " bcs, "\nVCS Sum: " vcs, "\nTotal: " rcs + bcs + vcs}' gpu_output.txt)
        echo "$total"
    else
        echo "intel_gpu_top is not installed."
    fi
}
get_gpu_temperature_intel() {
    if command -v sensors &> /dev/null; then
        sensors | grep 'i915:' | grep 'temp1' | awk '{print $2}'
    else
        echo "sensors command not found, install lm-sensors and Intel GPU drivers."
    fi
}
#Disk Space functions
get_total_disk_space(){
    df -h --total | grep total | awk '{print $2}'
}
get_used_disk_space(){
    df -h --total | grep total | awk '{print $3}'
}
get_available_disk_space(){
    df -h --total | grep total | awk '{print $4}'
}
#SMART status
check_smart_health() {
    if ! command -v smartctl &> /dev/null; then
        echo "SMART Status: UNKNOWN (smartctl not installed)"
        return 0
    fi

    # Server runs non-interactively; avoid sudo prompts.
    # If not root, try passwordless sudo first; otherwise skip.
    local SMARTCTL_PREFIX=()
    if [[ $EUID -ne 0 ]]; then
        if sudo -n true 2>/dev/null; then
            SMARTCTL_PREFIX=(sudo -n)
        else
            echo "SMART Status: SKIPPED (requires root)"
            return 0
        fi
    fi

    all_disks=$("${SMARTCTL_PREFIX[@]}" smartctl --scan 2>/dev/null | awk '{print $1}')
    if [ -z "$all_disks" ]; then
        echo "SMART Status: UNKNOWN (no disks found)"
        return 0
    fi

    for device in $all_disks; do
        health=$("${SMARTCTL_PREFIX[@]}" smartctl -H "$device" 2>/dev/null | awk '/SMART overall-health|SMART Health Status/ {print $NF; exit}')
        if [[ -n "$health" && "$health" != "PASSED" ]]; then
            echo "SMART Status: FAILED"
            return 0
        fi
    done

    echo "SMART Status: PASSED"
    return 0
}
#boot time
get_total_boot_time() {
    systemd-analyze | awk -F ' = ' '{print $2}' | awk '{print $1}'
}
#System load average
get_system_load(){
    # Return 1m load average (stable format)
    uptime | awk -F'load average:' '{if (NF>1) {gsub(/^[ \t]+/, "", $2); split($2,a,","); print a[1];}}'
}
#Network Adapter Name
get_network_adapter_name(){
    lspci | grep -i network
}
#sending and receiving
get_sending_rate() {
    local iface
    iface=$(ip route | awk '/default/ {print $5; exit}')
    if [[ -z "$iface" ]] || ! command -v ifstat &> /dev/null; then
        echo "0.00"
        return 0
    fi
    ifstat -i "$iface" 1 1 | tail -n 1 | awk '{print $1}'
}

get_receiving_rate() {
    local iface
    iface=$(ip route | awk '/default/ {print $5; exit}')
    if [[ -z "$iface" ]] || ! command -v ifstat &> /dev/null; then
        echo "0.00"
        return 0
    fi
    ifstat -i "$iface" 1 1 | tail -n 1 | awk '{print $2}'
}

# IP addresses
get_ipv4_address() {
    local iface
    iface=$(ip route | awk '/default/ {print $5; exit}')
    [[ -z "$iface" ]] && return 0
    ip -4 addr show "$iface" | awk '/inet / {print $2}' | cut -d/ -f1 | head -n 1
}

get_ipv6_address() {
    local iface
    iface=$(ip route | awk '/default/ {print $5; exit}')
    [[ -z "$iface" ]] && return 0
    ip -6 addr show "$iface" | awk '/inet6 / {print $2}' | cut -d/ -f1 | head -n 1
}
# Report
# alert_call
ipv4=$(get_ipv4_address)
ipv6=$(get_ipv6_address)
echo "IPV4 Address: $ipv4"
echo "IPV6 Address: $ipv6"
    ram_total=$(get_total_ram)
    ram_percentage=$(get_free_ram_percentage)
    utilized_ram=$(get_used_ram_percentage)
    cpu_model_name=$(get_cpu_model_name)
    cpu_cores=$(get_cpu_cores)
    cpu_speed=$(get_cpu_speed)
    cpu_utilization=$(get_cpu_utilization)
    cpu_temperature=$(get_cpu_temperature)
    total_disk_space=$(get_total_disk_space)
    available_disk_space=$(get_available_disk_space)
    used_disk_space=$(get_used_disk_space)
    echo "Total RAM: $ram_total"
    echo "Free RAM: $ram_percentage%"
    echo "Utilized RAM: $utilized_ram%"
    echo "CPU Model: $cpu_model_name"
    echo "CPU Cores: $cpu_cores"
    echo "CPU Speed: $cpu_speed"
    echo "CPU Utilization: $cpu_utilization%"
    echo "CPU Temperature: $cpu_temperature"
    # Emit one "GPU:" line per device so server.js can parse multiple GPUs
    while IFS= read -r gpu; do
        [[ -n "$gpu" ]] && echo "GPU: $gpu"
    done < <(get_gpu_model_name)
    echo "Total Disk Space: $total_disk_space"
    echo "Used Disk Space: $used_disk_space"
    echo "Available Disk Space: $available_disk_space"
    gpu_type=$(get_gpu_info)
    case "$gpu_type" in
        "nvidia")
            echo "GPU Type: NVIDIA"
            gpu_utilization=$(get_gpu_utilization_nvidia)
            gpu_temperature=$(get_gpu_temperature_nvidia)
            ;;
        "amd")
            echo "GPU Type: AMD"
            gpu_utilization=$(get_gpu_utilization_amd)
            gpu_temperature=$(get_gpu_temperature_amd)
            ;;
        "intel")
            echo "GPU Type: Intel"
            gpu_utilization=$(get_gpu_utilization_intel)
            gpu_temperature=$cpu_temperature
            ;;
        "unknown")
            echo "GPU Type: Unknown"
            exit 1
            ;;
    esac
    echo "GPU Utilization: $gpu_utilization"
    echo "GPU Temperature: $gpu_temperature"
    sleep 1
