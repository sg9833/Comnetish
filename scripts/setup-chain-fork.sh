#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN_DIR="${ROOT_DIR}/chain"
CHAIN_HOME="${CHAIN_DIR}/.comnetish-home"
CHAIN_REPO_URL="https://github.com/akash-network/node"
CHAIN_ID="comnetish-1"
DENOM="ucnt"
MIN_DEPOSIT="10000000ucnt"
MONIKER="validator1"
KEYRING_BACKEND="test"
LOG_FILE="${CHAIN_DIR}/comnetishd.log"
PID_FILE="${CHAIN_DIR}/comnetishd.pid"

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "\n[ERROR] %s\n" "$*" >&2
  exit 1
}

cleanup_on_error() {
  die "Setup failed on line ${BASH_LINENO[0]}. Check logs and re-run: ${LOG_FILE}"
}

trap cleanup_on_error ERR

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

is_process_running() {
  local pid="$1"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

key_exists() {
  local key_name="$1"
  "${BINARY}" keys show "${key_name}" --keyring-backend "${KEYRING_BACKEND}" --home "${CHAIN_HOME}" >/dev/null 2>&1
}

add_key_if_missing() {
  local key_name="$1"
  if key_exists "${key_name}"; then
    log "Wallet '${key_name}' already exists; skipping creation"
  else
    log "Creating wallet '${key_name}'"
    "${BINARY}" keys add "${key_name}" --keyring-backend "${KEYRING_BACKEND}" --home "${CHAIN_HOME}" >/dev/null
  fi
}

add_genesis_account_if_missing() {
  local key_name="$1"
  local amount="$2"
  local address

  address="$("${BINARY}" keys show "${key_name}" -a --keyring-backend "${KEYRING_BACKEND}" --home "${CHAIN_HOME}")"

  if grep -q "${address}" "${CHAIN_HOME}/config/genesis.json"; then
    log "Genesis account for '${key_name}' already exists; skipping"
  else
    log "Adding genesis funds for '${key_name}' (${amount})"
    "${BINARY}" add-genesis-account "${address}" "${amount}" --home "${CHAIN_HOME}"
  fi
}

ensure_repo() {
  if [[ -d "${CHAIN_DIR}/.git" ]]; then
    log "Repository already cloned at ${CHAIN_DIR}"
    git -C "${CHAIN_DIR}" remote set-url origin "${CHAIN_REPO_URL}"
    if [[ -n "$(git -C "${CHAIN_DIR}" status --porcelain)" ]]; then
      log "Repository has local modifications (expected after rebrand); skipping pull for idempotency"
    else
      log "Repository clean; fetching latest changes"
      git -C "${CHAIN_DIR}" fetch --all --tags --prune
      git -C "${CHAIN_DIR}" pull --ff-only origin "$(git -C "${CHAIN_DIR}" rev-parse --abbrev-ref HEAD)"
    fi
  elif [[ -d "${CHAIN_DIR}" ]]; then
    die "${CHAIN_DIR} exists but is not a git repository. Remove it or rename it, then rerun."
  else
    log "Cloning ${CHAIN_REPO_URL} into ${CHAIN_DIR}"
    git clone "${CHAIN_REPO_URL}" "${CHAIN_DIR}"
  fi
}

apply_rebrand() {
  log "Applying global rebrand replacements in .go files"

  local file_count
  file_count="$(find "${CHAIN_DIR}" -type f -name '*.go' | wc -l | tr -d ' ')"
  [[ "${file_count}" -gt 0 ]] || die "No .go files found under ${CHAIN_DIR}"

  find "${CHAIN_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/AKASH/COMNETISH/g'
  find "${CHAIN_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/Akash/Comnetish/g'
  find "${CHAIN_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/AKT/CNT/g'
}

build_binary() {
  log "Building Comnetish chain binary"
  mkdir -p "${CHAIN_DIR}/build"

  (
    cd "${CHAIN_DIR}"
    if make build >/dev/null 2>&1; then
      log "make build succeeded"
    else
      log "make build failed or unsupported; falling back to go build"
    fi

    if [[ -x "${CHAIN_DIR}/build/comnetishd" ]]; then
      :
    elif [[ -x "${CHAIN_DIR}/build/akashd" ]]; then
      cp "${CHAIN_DIR}/build/akashd" "${CHAIN_DIR}/build/comnetishd"
    elif [[ -x "${CHAIN_DIR}/build/akash" ]]; then
      cp "${CHAIN_DIR}/build/akash" "${CHAIN_DIR}/build/comnetishd"
    elif [[ -f "${CHAIN_DIR}/cmd/akash/main.go" ]]; then
      go build -o "${CHAIN_DIR}/build/comnetishd" ./cmd/akash
    elif [[ -f "${CHAIN_DIR}/cmd/akashd/main.go" ]]; then
      go build -o "${CHAIN_DIR}/build/comnetishd" ./cmd/akashd
    else
      die "Unable to find chain main package under ./cmd (checked akash and akashd)"
    fi
  )

  BINARY="${CHAIN_DIR}/build/comnetishd"
  [[ -x "${BINARY}" ]] || die "Failed to produce binary at ${BINARY}"
}

update_genesis() {
  local genesis_file="${CHAIN_HOME}/config/genesis.json"
  [[ -f "${genesis_file}" ]] || die "Genesis file not found at ${genesis_file}"

  log "Updating genesis configuration (chain-id, bond_denom, min_deposit)"

  python3 - <<PY
import json
from pathlib import Path

genesis_path = Path(r"${genesis_file}")
data = json.loads(genesis_path.read_text())

data["chain_id"] = "${CHAIN_ID}"
app_state = data.setdefault("app_state", {})

staking = app_state.setdefault("staking", {}).setdefault("params", {})
staking["bond_denom"] = "${DENOM}"

crisis = app_state.setdefault("crisis", {}).setdefault("constant_fee", {})
crisis["denom"] = "${DENOM}"

mint = app_state.setdefault("mint", {}).setdefault("params", {})
if "mint_denom" in mint:
    mint["mint_denom"] = "${DENOM}"

evm = app_state.get("evm")
if isinstance(evm, dict):
    evm_params = evm.setdefault("params", {})
    if "evm_denom" in evm_params:
        evm_params["evm_denom"] = "${DENOM}"

gov = app_state.setdefault("gov", {})
gov_params = gov.get("params")
if isinstance(gov_params, dict) and "min_deposit" in gov_params:
  gov_params["min_deposit"] = [{"denom": "${DENOM}", "amount": "${MIN_DEPOSIT%${DENOM}}"}]

if "deposit_params" in gov:
  gov["deposit_params"]["min_deposit"] = [{"denom": "${DENOM}", "amount": "${MIN_DEPOSIT%${DENOM}}"}]

genesis_path.write_text(json.dumps(data, indent=2) + "\n")
PY

  if [[ -f "${CHAIN_HOME}/config/client.toml" ]]; then
    sed -i '' -E "s|^chain-id = .*|chain-id = \"${CHAIN_ID}\"|" "${CHAIN_HOME}/config/client.toml" || true
  fi

  if [[ -f "${CHAIN_HOME}/config/app.toml" ]]; then
    sed -i '' -E "s|^minimum-gas-prices = .*|minimum-gas-prices = \"0.025${DENOM}\"|" "${CHAIN_HOME}/config/app.toml" || true
  fi
}

init_testnet() {
  log "Initializing local testnet (1 validator)"

  mkdir -p "${CHAIN_HOME}"

  if [[ ! -f "${CHAIN_HOME}/config/genesis.json" ]]; then
    "${BINARY}" init "${MONIKER}" --chain-id "${CHAIN_ID}" --home "${CHAIN_HOME}"
  else
    log "Existing chain home found; keeping current state"
  fi

  update_genesis

  add_key_if_missing "${MONIKER}"
  add_genesis_account_if_missing "${MONIKER}" "1000000000${DENOM}"

  add_key_if_missing tenant1
  add_key_if_missing provider1
  add_key_if_missing provider2

  add_genesis_account_if_missing tenant1 "500000000${DENOM}"
  add_genesis_account_if_missing provider1 "500000000${DENOM}"
  add_genesis_account_if_missing provider2 "500000000${DENOM}"

  if [[ ! -f "${CHAIN_HOME}/config/gentx/gentx-${MONIKER}.json" ]]; then
    "${BINARY}" gentx "${MONIKER}" "50000000${DENOM}" \
      --chain-id "${CHAIN_ID}" \
      --keyring-backend "${KEYRING_BACKEND}" \
      --home "${CHAIN_HOME}"
  else
    log "Validator gentx already exists; skipping"
  fi

  "${BINARY}" collect-gentxs --home "${CHAIN_HOME}" >/dev/null
  "${BINARY}" validate-genesis --home "${CHAIN_HOME}" >/dev/null
}

start_chain() {
  log "Starting chain in background"

  local running_pid=""
  running_pid="$(pgrep -f "${BINARY} start --home ${CHAIN_HOME}" | head -n 1 || true)"
  if [[ -n "${running_pid}" ]] && is_process_running "${running_pid}"; then
    echo "${running_pid}" >"${PID_FILE}"
    log "Detected existing running chain process (PID ${running_pid}); skipping new start"
    return
  fi

  if [[ -f "${PID_FILE}" ]]; then
    local old_pid
    old_pid="$(cat "${PID_FILE}" || true)"
    if is_process_running "${old_pid}"; then
      log "Chain already running with PID ${old_pid}; leaving it as-is"
      return
    fi
  fi

  nohup "${BINARY}" start --home "${CHAIN_HOME}" >"${LOG_FILE}" 2>&1 &
  local new_pid=$!
  echo "${new_pid}" >"${PID_FILE}"

  sleep 2
  if is_process_running "${new_pid}"; then
    log "Chain started successfully (PID ${new_pid})"
    log "Logs: ${LOG_FILE}"
  else
    die "Chain failed to start. Check ${LOG_FILE}"
  fi
}

main() {
  log "Starting Comnetish chain fork setup"

  require_cmd git
  require_cmd perl
  require_cmd python3
  require_cmd go

  ensure_repo
  apply_rebrand
  build_binary
  init_testnet
  start_chain

  log "Setup completed successfully"
}

main "$@"
