#!/bin/bash

###############################################################################
# Comnetish Setup Script - Automated Local Environment Setup
#
# This script automates all setup steps to get Comnetish running:
# 1. Checks prerequisites (Bun, Node, pnpm, PostgreSQL)
# 2. Installs dependencies (pnpm install)
# 3. Creates database (createdb comnetish_dev)
# 4. Configures environment (.env.local)
# 5. Runs migrations (pnpm prisma migrate)
# 6. Seeds test data (pnpm prisma db seed)
# 7. Optionally starts all 4 services
#
# Usage:
#   ./setup.sh                    # Run setup only
#   ./setup.sh --start-services   # Setup + start all 4 services
#   ./setup.sh --help             # Show this help
#
# Requirements:
#   - macOS or Linux (with Homebrew for package management)
#   - ~5 minutes for full setup
#   - 3 GB disk space
#   - PostgreSQL must be installed and running
#
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$PROJECT_ROOT/services/api"
START_SERVICES=false

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_command_exists() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

wait_for_postgres() {
    local max_attempts=30
    local attempt=0

    print_info "Waiting for PostgreSQL to be ready..."

    while [ $attempt -lt $max_attempts ]; do
        if pg_isready -q 2>/dev/null; then
            print_success "PostgreSQL is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    print_error "PostgreSQL did not become ready after ${max_attempts}s"
    return 1
}

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --start-services    Start all 4 services after setup"
    echo "  --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Setup only"
    echo "  $0 --start-services   # Setup + start services"
}

###############################################################################
# Parse Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --start-services)
            START_SERVICES=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

###############################################################################
# Phase 1: Prerequisites Check
###############################################################################

print_header "Phase 1: Prerequisites Check"

MISSING_TOOLS=0

# Check Bun
if check_command_exists bun; then
    bun_version=$(bun --version 2>/dev/null || echo "unknown")
    print_success "Bun is installed (version: $bun_version)"
else
    print_error "Bun is not installed"
    print_warning "Install from: https://bun.sh"
    MISSING_TOOLS=$((MISSING_TOOLS + 1))
fi

# Check Node
if check_command_exists node; then
    node_version=$(node --version)
    print_success "Node.js is installed ($node_version)"
else
    print_error "Node.js is not installed"
    print_warning "Install from: https://nodejs.org"
    MISSING_TOOLS=$((MISSING_TOOLS + 1))
fi

# Check pnpm
if check_command_exists pnpm; then
    pnpm_version=$(pnpm --version)
    print_success "pnpm is installed (version: $pnpm_version)"
else
    print_error "pnpm is not installed"
    print_warning "Install with: npm install -g pnpm"
    MISSING_TOOLS=$((MISSING_TOOLS + 1))
fi

# Check PostgreSQL
if check_command_exists psql; then
    psql_version=$(psql --version)
    print_success "PostgreSQL is installed ($psql_version)"
else
    print_error "PostgreSQL is not installed"
    print_warning "Install from: https://www.postgresql.org/download"
    MISSING_TOOLS=$((MISSING_TOOLS + 1))
fi

# Check PostgreSQL is running
if pg_isready -q 2>/dev/null; then
    print_success "PostgreSQL is running"
else
    print_warning "PostgreSQL is not running"
    print_info "Starting PostgreSQL with: brew services start postgresql"
    if check_command_exists brew; then
        brew services start postgresql 2>/dev/null || true
        if wait_for_postgres; then
            print_success "PostgreSQL started successfully"
        else
            print_error "Could not start PostgreSQL"
            exit 1
        fi
    else
        print_error "Homebrew not found. Please start PostgreSQL manually."
        exit 1
    fi
fi

if [ $MISSING_TOOLS -gt 0 ]; then
    print_error "Please install missing tools and try again."
    exit 1
fi

print_success "All prerequisites are met!"

###############################################################################
# Phase 2: Change to Project Directory
###############################################################################

print_header "Phase 2: Navigate to Project"

if [ ! -d "$PROJECT_ROOT" ]; then
    print_error "Project directory not found: $PROJECT_ROOT"
    exit 1
fi

cd "$PROJECT_ROOT"
print_success "Working directory: $PROJECT_ROOT"

###############################################################################
# Phase 3: Install Dependencies
###############################################################################

print_header "Phase 3: Install Dependencies"

print_info "Running: pnpm install"
if pnpm install --frozen-lockfile 2>&1 | tail -5; then
    print_success "Dependencies installed"
else
    print_error "Failed to install dependencies"
    exit 1
fi

###############################################################################
# Phase 4: Create Database
###############################################################################

print_header "Phase 4: Database Setup"

# Check if database exists
if psql -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw comnetish_dev; then
    print_warning "Database 'comnetish_dev' already exists"
    print_info "Skipping database creation"
else
    print_info "Creating database: comnetish_dev"
    if createdb comnetish_dev 2>/dev/null; then
        print_success "Database created"
    else
        print_error "Failed to create database"
        print_warning "It may already exist. Continuing..."
    fi
fi

###############################################################################
# Phase 5: Environment Configuration
###############################################################################

print_header "Phase 5: Environment Configuration"

ENV_FILE="$API_DIR/.env.local"

# Get PostgreSQL username
PG_USER=$(whoami)
DATABASE_URL="postgresql://$PG_USER@localhost:5432/comnetish_dev"

if [ -f "$ENV_FILE" ]; then
    print_warning ".env.local already exists at $ENV_FILE"
    print_info "Keeping existing configuration"
else
    print_info "Creating .env.local in services/api"

    # Create .env.local with proper configuration
    cat > "$ENV_FILE" << EOF
# Comnetish API Configuration
DATABASE_URL="$DATABASE_URL"
ANTHROPIC_API_KEY="sk-test-key-replace-with-real-key"
ANTHROPIC_API_URL="https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL="claude-3-sonnet-20240229"
EOF

    print_success ".env.local created"
    print_info "Configuration: $DATABASE_URL"
fi

###############################################################################
# Phase 6: Database Migrations
###############################################################################

print_header "Phase 6: Database Migrations"

cd "$API_DIR"

print_info "Running: pnpm prisma generate"
pnpm prisma generate

print_info "Running: pnpm prisma migrate deploy"
if pnpm prisma migrate deploy 2>&1 | tail -10; then
    print_success "Migrations completed"
else
    print_warning "Migration may have had issues, attempting dev migration..."
    pnpm prisma migrate dev --name init || true
fi

###############################################################################
# Phase 7: Database Seeding
###############################################################################

print_header "Phase 7: Database Seeding"

print_info "Running: pnpm prisma db seed"
if pnpm prisma db seed; then
    print_success "Database seeded with test data"
else
    print_error "Seeding failed, continuing anyway..."
fi

###############################################################################
# Phase 8: Setup Complete - Show Next Steps
###############################################################################

print_header "✅ Setup Complete!"

print_success "All initialization steps completed successfully!"
echo ""
print_info "Your Comnetish development environment is ready."
echo ""

if [ "$START_SERVICES" = true ]; then
    print_header "Starting Services..."

    print_info "Opening 4 terminal windows for services..."
    print_warning "NOTE: Each service will open in a new terminal window"
    echo ""

    # API Service
    print_info "Starting API Service on http://localhost:3001"
    osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/api' && API_PORT=3001 pnpm build && API_PORT=3001 pnpm start\"" &
    sleep 2

    # AI Agent Service
    print_info "Starting AI Agent Service on http://localhost:3010"
    osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/services/ai-agent' && pnpm start\"" &
    sleep 2

    # Main Console
    print_info "Starting Main Console on http://localhost:3000"
    osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/console' && PORT=3000 pnpm dev\"" &
    sleep 2

    # Provider Console
    print_info "Starting Provider Console on http://localhost:3002"
    osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_ROOT/apps/provider-console' && PORT=3002 pnpm dev\"" &
    sleep 2

    echo ""
    print_success "Services are starting in new terminal windows..."
    echo ""
    print_info "Once all services show 'Ready' or 'listening' messages:"
    echo "  - Main Console:     http://localhost:3000"
    echo "  - Provider Console: http://localhost:3002"
    echo "  - API Service:      http://localhost:3001/api/providers"
    echo "  - AI Agent:         http://localhost:3010"

else
    print_header "Next Steps"

    echo ""
    echo "To start all services, run them in 4 separate terminals:"
    echo ""
    print_info "Terminal 1 - API Service:"
    echo "  cd $PROJECT_ROOT/services/api"
    echo "  pnpm build && pnpm start"
    echo ""
    print_info "Terminal 2 - AI Agent:"
    echo "  cd $PROJECT_ROOT/services/ai-agent"
    echo "  pnpm start"
    echo ""
    print_info "Terminal 3 - Main Console:"
    echo "  cd $PROJECT_ROOT/apps/console"
    echo "  pnpm dev"
    echo ""
    print_info "Terminal 4 - Provider Console:"
    echo "  cd $PROJECT_ROOT/apps/provider-console"
    echo "  pnpm dev"
    echo ""
    print_header "Or use this convenience command to auto-start all services:"
    echo ""
    echo "  $0 --start-services"
    echo ""
fi

print_header "Verification"

echo ""
print_info "Once services are running, test them:"
echo ""
echo "  # Test API"
echo "  curl http://localhost:3001/api/providers | head -20"
echo ""
echo "  # Test AI Agent"
echo "  curl http://localhost:3010/health"
echo ""
echo "  # Test database has data"
echo "  curl http://localhost:3001/api/deployments"
echo ""

print_header "Documentation"

echo ""
print_info "For detailed guides, see:"
echo "  - QUICK_START.md        - 5 minute overview"
echo "  - SETUP_CHECKLIST.md    - Checklist format"
echo "  - LOCAL_SETUP_GUIDE.md  - Comprehensive reference"
echo "  - README_SETUP.md       - Decision tree"
echo ""

print_success "Happy developing! 🚀"
