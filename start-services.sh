#!/bin/bash

###############################################################################
# Comnetish Services Startup Script
#
# This script starts all 4 services in separate terminal windows.
# Use this after initial setup to restart services.
#
# Usage:
#   ./start-services.sh        # Start all 4 services in new terminals
#
# Requirements:
#   - macOS + osascript for multi-terminal window mode
#   - On non-macOS, falls back to background processes with log files
#   - All services must already be set up with pnpm install
#
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_ROOT/.logs"

API_PORT=3001
AI_AGENT_PORT=3010
CONSOLE_PORT=3000
PROVIDER_CONSOLE_PORT=3002

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

start_background() {
    local name="$1"
    local workdir="$2"
    local cmd="$3"
    local logfile="$LOG_DIR/$name.log"

    mkdir -p "$LOG_DIR"
    (
        cd "$workdir"
        nohup sh -c "$cmd" >"$logfile" 2>&1 &
        echo $! > "$LOG_DIR/$name.pid"
    )
    print_info "Started $name in background (log: $logfile)"
}

is_port_in_use() {
    lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

check_required_ports() {
    local blocked=0
    local ports=("$API_PORT" "$AI_AGENT_PORT" "$CONSOLE_PORT" "$PROVIDER_CONSOLE_PORT")

    for port in "${ports[@]}"; do
        if is_port_in_use "$port"; then
            print_warning "Port $port is already in use."
            blocked=1
        fi
    done

    if [[ "$blocked" -eq 1 ]]; then
        echo ""
        print_warning "Free the ports and run this script again."
        echo ""
        echo "  lsof -ti:$API_PORT | xargs kill -9"
        echo "  lsof -ti:$AI_AGENT_PORT | xargs kill -9"
        echo "  lsof -ti:$CONSOLE_PORT | xargs kill -9"
        echo "  lsof -ti:$PROVIDER_CONSOLE_PORT | xargs kill -9"
        echo ""
        exit 1
    fi
}

print_header "Starting Comnetish Services"
check_required_ports

USE_MAC_TERMINAL=false
if [[ "$(uname -s)" == "Darwin" ]] && command -v osascript >/dev/null 2>&1; then
    USE_MAC_TERMINAL=true
fi

if [[ "$USE_MAC_TERMINAL" != true ]]; then
    print_warning "macOS Terminal automation unavailable. Using cross-platform background mode."

    start_background "api" "$PROJECT_ROOT/services/api" "API_PORT=$API_PORT pnpm build && API_PORT=$API_PORT pnpm start"
    start_background "ai-agent" "$PROJECT_ROOT/services/ai-agent" "AI_AGENT_PORT=$AI_AGENT_PORT pnpm start"
    start_background "console" "$PROJECT_ROOT/apps/console" "PORT=$CONSOLE_PORT pnpm dev"
    start_background "provider-console" "$PROJECT_ROOT/apps/provider-console" "PORT=$PROVIDER_CONSOLE_PORT pnpm dev"

    print_header "Services Starting"
    echo ""
    print_success "All 4 services started in background mode"
    echo ""
    echo "  Main Console:       http://localhost:$CONSOLE_PORT"
    echo "  Provider Console:   http://localhost:$PROVIDER_CONSOLE_PORT"
    echo "  API Service:        http://localhost:$API_PORT/api/providers"
    echo "  AI Agent:           http://localhost:$AI_AGENT_PORT/health"
    echo ""
    print_info "Tail logs with: tail -f $LOG_DIR/api.log"
    exit 0
fi

# Terminal 1: API Service
print_info "Terminal 1: Starting API Service..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/api' && echo '🚀 Starting API Service on http://localhost:$API_PORT' && API_PORT=$API_PORT pnpm build && API_PORT=$API_PORT pnpm start\"" &
sleep 1

# Terminal 2: AI Agent Service
print_info "Terminal 2: Starting AI Agent Service..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/ai-agent' && echo '🚀 Starting AI Agent on http://localhost:$AI_AGENT_PORT' && AI_AGENT_PORT=$AI_AGENT_PORT pnpm start\"" &
sleep 1

# Terminal 3: Main Console
print_info "Terminal 3: Starting Main Console..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/console' && echo '🚀 Starting Main Console on http://localhost:$CONSOLE_PORT' && PORT=$CONSOLE_PORT pnpm dev\"" &
sleep 1

# Terminal 4: Provider Console
print_info "Terminal 4: Starting Provider Console..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/provider-console' && echo '🚀 Starting Provider Console on http://localhost:$PROVIDER_CONSOLE_PORT' && PORT=$PROVIDER_CONSOLE_PORT pnpm dev\"" &
sleep 1

print_header "Services Starting"

echo ""
print_success "All 4 services are starting in new terminal windows!"
echo ""
print_info "Wait for all services to show 'Ready' or 'listening' messages, then:"
echo ""
echo "  Main Console:       http://localhost:$CONSOLE_PORT"
echo "  Provider Console:   http://localhost:$PROVIDER_CONSOLE_PORT"
echo "  API Service:        http://localhost:$API_PORT/api/providers"
echo "  AI Agent:           http://localhost:$AI_AGENT_PORT/health"
echo ""
print_info "Arrange the 4 terminal windows side-by-side to monitor all services."
echo ""
