#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROVIDER_DIR="${ROOT_DIR}/provider"
PROVIDER_REPO_URL="https://github.com/akash-network/provider"
PROVIDER_CONFIG_FILE="${PROVIDER_DIR}/config.yaml"
COMPOSE_FILE="${PROVIDER_DIR}/docker-compose.yml"
K3S_MAC_SCRIPT="${PROVIDER_DIR}/scripts/setup-k3s-macos.sh"
K3S_WSL_DOC="${PROVIDER_DIR}/scripts/WSL2-K3S-INSTRUCTIONS.md"

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  printf "\n[ERROR] %s\n" "$*" >&2
  exit 1
}

on_error() {
  die "Provider fork setup failed on line ${BASH_LINENO[0]}"
}

trap on_error ERR

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_provider_repo() {
  if [[ -d "${PROVIDER_DIR}/.git" ]]; then
    log "Provider repository already exists at ${PROVIDER_DIR}"
    git -C "${PROVIDER_DIR}" remote set-url origin "${PROVIDER_REPO_URL}"
    if [[ -n "$(git -C "${PROVIDER_DIR}" status --porcelain)" ]]; then
      log "Local provider repo has changes; skipping pull to keep setup idempotent"
    else
      log "Provider repo clean; fetching latest changes"
      git -C "${PROVIDER_DIR}" fetch --all --tags --prune
      git -C "${PROVIDER_DIR}" pull --ff-only origin "$(git -C "${PROVIDER_DIR}" rev-parse --abbrev-ref HEAD)"
    fi
  elif [[ -d "${PROVIDER_DIR}" ]]; then
    die "${PROVIDER_DIR} exists but is not a git repository. Remove/rename it and rerun."
  else
    log "Cloning ${PROVIDER_REPO_URL} into ${PROVIDER_DIR}"
    git clone "${PROVIDER_REPO_URL}" "${PROVIDER_DIR}"
  fi
}

apply_branding_replacements() {
  log "Applying branding replacements across provider .go files"

  local go_file_count
  go_file_count="$(find "${PROVIDER_DIR}" -type f -name '*.go' | wc -l | tr -d ' ')"
  [[ "${go_file_count}" -gt 0 ]] || die "No .go files found in ${PROVIDER_DIR}"

  find "${PROVIDER_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/AKASH/COMNETISH/g'
  find "${PROVIDER_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/Akash/Comnetish/g'
  find "${PROVIDER_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/AKT/CNT/g'
  find "${PROVIDER_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/akashd/comnetishd/g'
  find "${PROVIDER_DIR}" -type f -name '*.go' -print0 | xargs -0 perl -pi -e 's/akash/comnetish/g'
}

write_provider_config() {
  log "Writing provider configuration to ${PROVIDER_CONFIG_FILE}"

  cat >"${PROVIDER_CONFIG_FILE}" <<'YAML'
chain:
  id: comnetish-1
  node: http://localhost:26657

wallet:
  keyName: provider1

offerings:
  cpu: "2"
  memory: "4Gi"
  storage: "20Gi"

server:
  host: 0.0.0.0
  port: 8443

health:
  enabled: true
  bind: 0.0.0.0:8080
  path: /health
YAML
}

write_k3s_assets() {
  log "Creating k3s setup assets for macOS and Windows (WSL2)"
  mkdir -p "${PROVIDER_DIR}/scripts"

  cat >"${K3S_MAC_SCRIPT}" <<'BASH'
#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script is for macOS only."
  echo "For Windows, use WSL2 and see ./WSL2-K3S-INSTRUCTIONS.md"
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required: https://brew.sh"
  exit 1
fi

echo "Installing k3s and Kubernetes tooling via Homebrew..."
brew install rancher/k3s/k3s kubectl helm

echo "Starting k3s service..."
brew services start k3s

echo "Verifying cluster nodes..."
k3s kubectl get nodes

echo "k3s setup complete on macOS."
BASH

  chmod +x "${K3S_MAC_SCRIPT}"

  cat >"${K3S_WSL_DOC}" <<'MD'
# k3s setup on Windows (WSL2)

Use Ubuntu on WSL2 and run:

```bash
curl -sfL https://get.k3s.io | sh -
sudo kubectl get nodes
```

If Docker Desktop is installed, enable WSL2 integration for your distro.

Recommended extras:

```bash
sudo apt update
sudo apt install -y jq curl
```

To stop/start k3s:

```bash
sudo systemctl stop k3s
sudo systemctl start k3s
```
MD
}

write_compose_file() {
  log "Creating Docker Compose file for local provider daemon testing"

  cat >"${COMPOSE_FILE}" <<'YAML'
version: "3.9"

services:
  provider-daemon:
    image: golang:1.22
    container_name: comnetish-provider-daemon
    working_dir: /workspace
    volumes:
      - ./:/workspace
      - ./config.yaml:/workspace/config.yaml:ro
    command: >
      sh -c "go run ./cmd/provider-services run --config /workspace/config.yaml"
    ports:
      - "8443:8443"
    restart: unless-stopped

  provider-health:
    image: mendhak/http-https-echo:35
    container_name: comnetish-provider-health
    environment:
      HTTP_PORT: 8080
      LOG_WITHOUT_NEWLINE: "true"
    ports:
      - "8080:8080"
    restart: unless-stopped
YAML
}

print_port_summary() {
  log "Port summary"
  echo "- Chain RPC (expected):         http://localhost:26657"
  echo "- Provider daemon:              http://localhost:8443"
  echo "- Provider health endpoint:     http://localhost:8080/health"
}

main() {
  log "Starting provider fork setup"

  require_cmd git
  require_cmd perl
  require_cmd find
  require_cmd xargs

  ensure_provider_repo
  apply_branding_replacements
  write_provider_config
  write_k3s_assets
  write_compose_file
  print_port_summary

  log "Provider fork setup completed successfully"
  log "Next step: cd provider && docker compose up -d"
}

main "$@"
