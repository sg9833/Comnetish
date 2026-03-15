#!/usr/bin/env bash
set -u

API="http://localhost:3001/api"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

T1_COOKIE="$TMP_DIR/t1.cookie"
T2_COOKIE="$TMP_DIR/t2.cookie"
P_COOKIE="$TMP_DIR/p.cookie"

FAIL_COUNT=0

json_field() {
  node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const p=process.argv[1].split('.'); let v=d; for (const k of p) v=v?.[k]; process.stdout.write(v==null?'':String(v));" "$1"
}

status_of() {
  curl -sS -o /dev/null -w '%{http_code}' "$@"
}

assert_code() {
  local name="$1"
  local expected="$2"
  shift 2
  local actual
  actual=$(status_of "$@")
  if [[ "$actual" == "$expected" ]]; then
    printf 'PASS %-52s expected=%s got=%s\n' "$name" "$expected" "$actual"
  else
    printf 'FAIL %-52s expected=%s got=%s\n' "$name" "$expected" "$actual"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

RUN_ID="$(date +%s%N).$RANDOM"
EMAIL1="tenant1.$RUN_ID@example.com"
EMAIL2="tenant2.$RUN_ID@example.com"
PASSWORD='Phase4Pass!123'

assert_code 'unauth deployment create blocked' 401 \
  -X POST "$API/deployments" -H 'Content-Type: application/json' \
  --data '{"tenantAddress":"tenant-unauth-001","sdl":"version: \"3.0\"\nservices:\n  web:\n    image: nginx:stable\n    expose:\n      - port: 80\n        as: 80\n        to:\n          - global: true"}'

assert_code 'tenant1 signup succeeds' 201 \
  -c "$T1_COOKIE" -b "$T1_COOKIE" -X POST "$API/auth/signup" -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL1\",\"password\":\"$PASSWORD\",\"displayName\":\"Tenant One\",\"role\":\"TENANT\"}"

assert_code 'tenant2 signup succeeds' 201 \
  -c "$T2_COOKIE" -b "$T2_COOKIE" -X POST "$API/auth/signup" -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL2\",\"password\":\"$PASSWORD\",\"displayName\":\"Tenant Two\",\"role\":\"TENANT\"}"

SDL='version: 3.0\nservices:\n  web:\n    image: nginx:stable\n    expose:\n      - port: 80\n        as: 80\n        to:\n          - global: true'

DEPLOY_CLOSE_JSON=$(curl -sS -c "$T1_COOKIE" -b "$T1_COOKIE" -X POST "$API/deployments" -H 'Content-Type: application/json' \
  --data "{\"tenantAddress\":\"tenant-close-$(date +%s)\",\"sdl\":\"$SDL\"}")
DEPLOY_CLOSE_ID=$(printf '%s' "$DEPLOY_CLOSE_JSON" | json_field 'data.id')

if [[ -z "$DEPLOY_CLOSE_ID" ]]; then
  echo 'FAIL could not create close-test deployment'
  exit 1
fi

assert_code 'tenant2 cannot close tenant1 deployment' 403 \
  -c "$T2_COOKIE" -b "$T2_COOKIE" -X POST "$API/deployments/$DEPLOY_CLOSE_ID/close"

assert_code 'tenant1 can close own deployment' 200 \
  -c "$T1_COOKIE" -b "$T1_COOKIE" -X POST "$API/deployments/$DEPLOY_CLOSE_ID/close"

DEPLOY_WORK_JSON=$(curl -sS -c "$T1_COOKIE" -b "$T1_COOKIE" -X POST "$API/deployments" -H 'Content-Type: application/json' \
  --data "{\"tenantAddress\":\"tenant-work-$(date +%s)\",\"sdl\":\"$SDL\"}")
DEPLOY_WORK_ID=$(printf '%s' "$DEPLOY_WORK_JSON" | json_field 'data.id')

if [[ -z "$DEPLOY_WORK_ID" ]]; then
  echo 'FAIL could not create work deployment'
  exit 1
fi

assert_code 'unauth bid create blocked' 401 \
  -X POST "$API/bids" -H 'Content-Type: application/json' \
  --data "{\"deploymentId\":\"$DEPLOY_WORK_ID\",\"price\":1.25}"

PK='0x59c6995e998f97a5a0044966f0945385d7f6df3f3ed56c4b6b4f8b95d6f6f9a1'
PROVIDER_ADDRESS=$(pnpm -C services/api exec node -e "import('viem/accounts').then(({privateKeyToAccount})=>{process.stdout.write(privateKeyToAccount(process.argv[1]).address.toLowerCase())})" "$PK")

CHALLENGE_JSON=$(curl -sS -c "$P_COOKIE" -b "$P_COOKIE" -X POST "$API/auth/wallet/challenge" -H 'Content-Type: application/json' \
  --data "{\"address\":\"$PROVIDER_ADDRESS\",\"intent\":\"login\"}")
CHALLENGE_MSG=$(printf '%s' "$CHALLENGE_JSON" | json_field 'data.message')

if [[ -z "$CHALLENGE_MSG" ]]; then
  echo 'FAIL wallet challenge message missing'
  exit 1
fi

SIGNATURE=$(MSG="$CHALLENGE_MSG" pnpm -C services/api exec node -e "import('viem/accounts').then(async ({privateKeyToAccount})=>{const acc=privateKeyToAccount(process.argv[1]); const sig=await acc.signMessage({message:process.env.MSG}); process.stdout.write(sig);})" "$PK")

assert_code 'provider wallet verify succeeds' 200 \
  -c "$P_COOKIE" -b "$P_COOKIE" -X POST "$API/auth/wallet/verify" -H 'Content-Type: application/json' \
  --data "{\"address\":\"$PROVIDER_ADDRESS\",\"signature\":\"$SIGNATURE\",\"role\":\"PROVIDER\"}"

assert_code 'provider upsert succeeds' 201 \
  -X POST "$API/providers" -H 'Content-Type: application/json' \
  --data "{\"address\":\"$PROVIDER_ADDRESS\",\"region\":\"local-smoke\",\"cpu\":8,\"memory\":16384,\"storage\":200,\"pricePerCpu\":1.5}"

PROVIDER_ID=$(curl -sS "$API/providers?status=ACTIVE" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); const p=(d.data||[]).find(x=>(x.address||'').toLowerCase()===process.argv[1]); process.stdout.write(p?.id||'');" "$PROVIDER_ADDRESS")

if [[ -z "$PROVIDER_ID" ]]; then
  echo 'FAIL provider id lookup failed'
  exit 1
fi

assert_code 'provider cannot spoof providerId' 403 \
  -c "$P_COOKIE" -b "$P_COOKIE" -X POST "$API/bids" -H 'Content-Type: application/json' \
  --data "{\"deploymentId\":\"$DEPLOY_WORK_ID\",\"providerId\":\"spoof-provider-id\",\"price\":2.25}"

BID_JSON=$(curl -sS -c "$P_COOKIE" -b "$P_COOKIE" -X POST "$API/bids" -H 'Content-Type: application/json' \
  --data "{\"deploymentId\":\"$DEPLOY_WORK_ID\",\"price\":2.25}")
BID_ID=$(printf '%s' "$BID_JSON" | json_field 'data.id')
if [[ -n "$BID_ID" ]]; then
  printf 'PASS %-52s id=%s\n' 'provider creates bid' "$BID_ID"
else
  printf 'FAIL %-52s response=%s\n' 'provider creates bid' "$BID_JSON"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

assert_code 'tenant owner can list bids by deployment' 200 \
  -c "$T1_COOKIE" -b "$T1_COOKIE" "$API/bids?deploymentId=$DEPLOY_WORK_ID"

assert_code 'other tenant cannot list bids for deployment' 403 \
  -c "$T2_COOKIE" -b "$T2_COOKIE" "$API/bids?deploymentId=$DEPLOY_WORK_ID"

assert_code 'other tenant cannot create lease' 403 \
  -c "$T2_COOKIE" -b "$T2_COOKIE" -X POST "$API/leases" -H 'Content-Type: application/json' \
  --data "{\"deploymentId\":\"$DEPLOY_WORK_ID\",\"providerId\":\"$PROVIDER_ID\",\"pricePerBlock\":2.25}"

LEASE_JSON=$(curl -sS -c "$T1_COOKIE" -b "$T1_COOKIE" -X POST "$API/leases" -H 'Content-Type: application/json' \
  --data "{\"deploymentId\":\"$DEPLOY_WORK_ID\",\"providerId\":\"$PROVIDER_ID\",\"pricePerBlock\":2.25}")
LEASE_ID=$(printf '%s' "$LEASE_JSON" | json_field 'data.id')
if [[ -n "$LEASE_ID" ]]; then
  printf 'PASS %-52s id=%s\n' 'owner tenant creates lease' "$LEASE_ID"
else
  printf 'FAIL %-52s response=%s\n' 'owner tenant creates lease' "$LEASE_JSON"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [[ -n "$LEASE_ID" ]]; then
  assert_code 'provider can stream own lease logs' 200 \
    --max-time 2 -c "$P_COOKIE" -b "$P_COOKIE" "$API/leases/$LEASE_ID/logs"

  assert_code 'other tenant blocked from lease logs' 403 \
    -c "$T2_COOKIE" -b "$T2_COOKIE" "$API/leases/$LEASE_ID/logs"
fi

echo "FAIL_COUNT=$FAIL_COUNT"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  echo 'ALL_SMOKE_TESTS_PASSED'
  exit 0
fi

exit 1
