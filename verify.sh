#!/bin/bash

###############################################################################
# Comnetish Verification & Testing Script
#
# This script tests all API endpoints and services to verify everything works.
# Run this AFTER all services are started.
#
# Usage:
#   ./verify.sh              # Run all tests
#   ./verify.sh --quick      # Run basic connectivity tests only
#   ./verify.sh --api        # Test API endpoints only
#   ./verify.sh --workflow   # Run end-to-end workflow test
#
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="http://localhost:3001"
AI_URL="http://localhost:3010"
TEST_RESULTS_PASS=0
TEST_RESULTS_FAIL=0
VERBOSE=true

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_test() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_pass() {
    echo -e "${GREEN}  ✅ PASS: $1${NC}"
    TEST_RESULTS_PASS=$((TEST_RESULTS_PASS + 1))
}

print_fail() {
    echo -e "${RED}  ❌ FAIL: $1${NC}"
    TEST_RESULTS_FAIL=$((TEST_RESULTS_FAIL + 1))
}

print_warning() {
    echo -e "${YELLOW}  ⚠️  WARNING: $1${NC}"
}

print_info() {
    echo -e "${BLUE}  ℹ️  $1${NC}"
}

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local expected_code=$4

    print_test "Testing $name"

    local response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" 2>/dev/null || echo -e "\n000")
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [ "$http_code" -eq "$expected_code" ]; then
        print_pass "$method $endpoint (HTTP $http_code)"
        if [ $VERBOSE = true ]; then
            print_info "Response (first 200 chars): $(echo "$body" | head -c 200)..."
        fi
        return 0
    else
        print_fail "$method $endpoint (expected $expected_code, got $http_code)"
        print_info "Response: $body"
        return 1
    fi
}

###############################################################################
# Parse Arguments
###############################################################################

TEST_MODE="all"
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            TEST_MODE="quick"
            shift
            ;;
        --api)
            TEST_MODE="api"
            shift
            ;;
        --workflow)
            TEST_MODE="workflow"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

###############################################################################
# Phase 1: Connectivity Tests
###############################################################################

print_header "Phase 1: Service Connectivity"

print_test "Checking API connectivity"
if curl -s "$API_URL/api/providers" > /dev/null 2>&1; then
    print_pass "API is accessible at $API_URL"
else
    print_fail "Cannot reach API at $API_URL"
    print_warning "Make sure the API service is running in Terminal 1"
    exit 1
fi

print_test "Checking AI Agent connectivity"
if curl -s "$AI_URL/health" > /dev/null 2>&1; then
    print_pass "AI Agent is accessible at $AI_URL"
else
    print_fail "Cannot reach AI Agent at $AI_URL"
    print_warning "Make sure the AI Agent service is running in Terminal 2"
    exit 1
fi

if [ "$TEST_MODE" = "quick" ]; then
    echo ""
    print_pass "All services are reachable!"
    exit 0
fi

###############################################################################
# Phase 2: API Endpoint Tests
###############################################################################

print_header "Phase 2: API Endpoint Tests"

# GET /api/providers
print_test "Fetching providers list"
providers_response=$(curl -s "$API_URL/api/providers")
provider_count=$(echo "$providers_response" | grep -o '"id"' | wc -l)
if [ "$provider_count" -gt 0 ]; then
    print_pass "GET /api/providers returned $provider_count providers"
    FIRST_PROVIDER_ID=$(echo "$providers_response" | grep -oP '"id":"?\K[^,"]*' | head -1)
    print_info "First provider ID: $FIRST_PROVIDER_ID"
else
    print_fail "GET /api/providers returned no providers"
    print_warning "Database may not be seeded. Run: cd services/api && pnpm prisma db seed"
fi

# GET /api/deployments
print_test "Fetching deployments list"
deployments_response=$(curl -s "$API_URL/api/deployments")
deployment_count=$(echo "$deployments_response" | grep -o '"id"' | wc -l)
if [ "$deployment_count" -gt 0 ]; then
    print_pass "GET /api/deployments returned $deployment_count deployments"
    FIRST_DEPLOYMENT_ID=$(echo "$deployments_response" | grep -oP '"id":"?\K[^,"]*' | head -1)
    print_info "First deployment ID: $FIRST_DEPLOYMENT_ID"
else
    print_fail "GET /api/deployments returned no deployments"
fi

# GET /api/leases
print_test "Fetching leases list"
leases_response=$(curl -s "$API_URL/api/leases")
lease_count=$(echo "$leases_response" | grep -o '"id"' | wc -l)
if [ "$lease_count" -gt 0 ]; then
    print_pass "GET /api/leases returned $lease_count leases"
else
    print_fail "GET /api/leases returned no leases"
fi

# GET /api/bids
print_test "Fetching bids list"
bids_response=$(curl -s "$API_URL/api/bids")
bid_count=$(echo "$bids_response" | grep -o '"id"' | wc -l)
if [ "$bid_count" -gt 0 ]; then
    print_pass "GET /api/bids returned $bid_count bids"
else
    print_fail "GET /api/bids returned no bids"
fi

# GET /api/providers/me/stats
print_test "Fetching provider stats"
stats_response=$(curl -s "$API_URL/api/providers/me/stats")
if echo "$stats_response" | grep -q "activeLeases"; then
    print_pass "GET /api/providers/me/stats returned provider stats"
else
    print_fail "GET /api/providers/me/stats failed"
fi

if [ "$TEST_MODE" = "api" ]; then
    echo ""
    print_header "Test Summary"
    echo "Passed: $TEST_RESULTS_PASS"
    echo "Failed: $TEST_RESULTS_FAIL"
    exit 0
fi

###############################################################################
# Phase 3: Workflow Test (End-to-End)
###############################################################################

if [ "$TEST_MODE" = "workflow" ] || [ "$TEST_MODE" = "all" ]; then
    print_header "Phase 3: End-to-End Workflow Test"

    if [ -z "$FIRST_DEPLOYMENT_ID" ] || [ -z "$FIRST_PROVIDER_ID" ]; then
        print_warning "Skipping workflow test - need seeded data"
        print_info "Run: cd services/api && pnpm prisma db seed"
    else
        print_info "Using Deployment: $FIRST_DEPLOYMENT_ID"
        print_info "Using Provider: $FIRST_PROVIDER_ID"

        # Test POST /api/bids
        print_test "Creating a bid (POST /api/bids)"
        bid_payload="{\"deploymentId\":\"$FIRST_DEPLOYMENT_ID\",\"providerId\":\"$FIRST_PROVIDER_ID\",\"price\":5.5}"
        bid_response=$(curl -s -X POST "$API_URL/api/bids" \
            -H "Content-Type: application/json" \
            -d "$bid_payload" 2>/dev/null)

        if echo "$bid_response" | grep -q '"id"'; then
            bid_id=$(echo "$bid_response" | grep -oP '"id":"?\K[^,"]*' | head -1)
            print_pass "POST /api/bids created bid: $bid_id"
        else
            print_fail "POST /api/bids failed"
            print_info "Response: $bid_response"
        fi

        # Test POST /api/leases
        print_test "Creating a lease (POST /api/leases)"
        lease_payload="{\"deploymentId\":\"$FIRST_DEPLOYMENT_ID\",\"providerId\":\"$FIRST_PROVIDER_ID\",\"pricePerBlock\":0.25}"
        lease_response=$(curl -s -X POST "$API_URL/api/leases" \
            -H "Content-Type: application/json" \
            -d "$lease_payload" 2>/dev/null)

        if echo "$lease_response" | grep -q '"id"'; then
            lease_id=$(echo "$lease_response" | grep -oP '"id":"?\K[^,"]*' | head -1)
            print_pass "POST /api/leases created lease: $lease_id"
        else
            print_fail "POST /api/leases failed"
            print_info "Response: $lease_response"
        fi

        # Verify deployment status changed
        print_test "Verifying deployment status changed to ACTIVE"
        deployment_detail=$(curl -s "$API_URL/api/deployments/$FIRST_DEPLOYMENT_ID")
        if echo "$deployment_detail" | grep -q '"status":"ACTIVE"'; then
            print_pass "Deployment status is ACTIVE"
        else
            deployment_status=$(echo "$deployment_detail" | grep -oP '"status":"?\K[^,"]*' | head -1)
            print_warning "Deployment status is: $deployment_status (expected ACTIVE)"
        fi
    fi
fi

###############################################################################
# Phase 4: AI Service Tests
###############################################################################

print_header "Phase 4: AI Service Tests"

print_test "Testing AI Agent /health endpoint"
health_response=$(curl -s "$AI_URL/health")
if echo "$health_response" | grep -q "service"; then
    print_pass "AI Agent /health endpoint working"
    print_info "Response: $(echo "$health_response" | head -c 100)..."
else
    print_fail "AI Agent /health endpoint failed"
fi

print_test "Testing AI Agent /models endpoint"
models_response=$(curl -s "$AI_URL/models")
if echo "$models_response" | grep -q "model"; then
    print_pass "AI Agent /models endpoint working"
else
    print_warning "AI Agent /models endpoint may not have model data"
fi

###############################################################################
# Summary
###############################################################################

print_header "Test Summary"

total_tests=$((TEST_RESULTS_PASS + TEST_RESULTS_FAIL))

echo "Total Tests Run: $total_tests"
echo -e "${GREEN}Passed: $TEST_RESULTS_PASS${NC}"
if [ $TEST_RESULTS_FAIL -gt 0 ]; then
    echo -e "${RED}Failed: $TEST_RESULTS_FAIL${NC}"
else
    echo -e "${GREEN}Failed: $TEST_RESULTS_FAIL${NC}"
fi

echo ""

if [ $TEST_RESULTS_FAIL -eq 0 ]; then
    print_pass "All tests passed! ✨"
    echo ""
    print_info "Now you can:"
    echo "  1. Open Main Console:       http://localhost:3000"
    echo "  2. Open Provider Console:   http://localhost:3002"
    echo "  3. Check browser DevTools for network requests"
    echo "  4. Run end-to-end workflow: create deployment → submit bid → accept bid"
else
    print_warning "Some tests failed. Check the output above for details."
    echo ""
    print_info "Troubleshooting:"
    echo "  - Make sure all 4 services are running (Terminal 1-4)"
    echo "  - Check Terminal output for error messages"
    echo "  - Verify database is seeded: cd services/api && pnpm prisma db seed"
    echo "  - Check PostgreSQL is running: pg_isready"
fi

echo ""
