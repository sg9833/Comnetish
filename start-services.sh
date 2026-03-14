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
#   - macOS (uses osascript to open Terminal windows)
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

print_header "Starting Comnetish Services"

# Terminal 1: API Service
print_info "Terminal 1: Starting API Service..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/api' && echo '🚀 Starting API Service on http://localhost:3000' && pnpm build && pnpm start\"" &
sleep 1

# Terminal 2: AI Agent Service
print_info "Terminal 2: Starting AI Agent Service..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/ai-agent' && echo '🚀 Starting AI Agent on http://localhost:3010' && pnpm start\"" &
sleep 1

# Terminal 3: Main Console
print_info "Terminal 3: Starting Main Console..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/console' && echo '🚀 Starting Main Console on http://localhost:3000 (or 3002)' && pnpm dev\"" &
sleep 1

# Terminal 4: Provider Console
print_info "Terminal 4: Starting Provider Console..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/provider-console' && echo '🚀 Starting Provider Console on http://localhost:3001' && pnpm dev\"" &
sleep 1

print_header "Services Starting"

echo ""
print_success "All 4 services are starting in new terminal windows!"
echo ""
print_info "Wait for all services to show 'Ready' or 'listening' messages, then:"
echo ""
echo "  Main Console:       http://localhost:3000"
echo "  Provider Console:   http://localhost:3001"
echo "  API Service:        http://localhost:3000/api/providers"
echo "  AI Agent:           http://localhost:3010/health"
echo ""
print_info "Arrange the 4 terminal windows side-by-side to monitor all services."
echo ""
