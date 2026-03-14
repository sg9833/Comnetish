'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Badge, Button, Card, Spinner } from '@comnetish/ui';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { Hex } from 'viem';
import { useAccount, useSendTransaction, useSignMessage } from 'wagmi';

type Step = 1 | 2 | 3 | 4;
type OsType = 'mac' | 'windows' | 'linux';
type CheckStatus = 'idle' | 'checking' | 'ok' | 'missing';

type MachineProfile = {
  os: OsType;
  cpuTotal: number;
  ramTotalMb: number;
  diskTotalGb: number;
};

type Allocation = {
  cpu: number;
  ramMb: number;
  storageGb: number;
};

type CheckItem = {
  id: string;
  label: string;
  status: CheckStatus;
  installCommand?: string;
  helperText?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const REGISTRATION_MODE = process.env.NEXT_PUBLIC_PROVIDER_REGISTRATION_MODE ?? 'blockchain';

function detectOs(): OsType {
  if (typeof navigator === 'undefined') {
    return 'linux';
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) {
    return 'mac';
  }
  if (ua.includes('win')) {
    return 'windows';
  }
  return 'linux';
}

async function canReach(urls: string[]): Promise<boolean> {
  for (const url of urls) {
    try {
      const response = await fetch(url, { mode: 'no-cors' });
      if (response.type === 'opaque' || response.ok) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

function baseChecksForOs(os: OsType): CheckItem[] {
  if (os === 'mac') {
    return [
      {
        id: 'brew',
        label: 'Homebrew',
        status: 'idle',
        installCommand: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      },
      {
        id: 'k3s',
        label: 'k3s cluster',
        status: 'idle',
        installCommand: 'brew install k3d && k3d cluster create comnetish'
      },
      {
        id: 'docker',
        label: 'Docker Engine',
        status: 'idle',
        installCommand: 'brew install --cask docker'
      }
    ];
  }

  if (os === 'windows') {
    return [
      {
        id: 'wsl2',
        label: 'WSL2',
        status: 'idle',
        installCommand: 'wsl --install',
        helperText: 'Install WSL2, then run provider daemon inside Ubuntu.'
      },
      {
        id: 'docker-desktop',
        label: 'Docker Desktop',
        status: 'idle',
        installCommand: 'https://www.docker.com/products/docker-desktop/'
      },
      {
        id: 'k3s',
        label: 'k3s (inside WSL2)',
        status: 'idle',
        installCommand: 'curl -sfL https://get.k3s.io | sh -'
      }
    ];
  }

  return [
    {
      id: 'docker',
      label: 'Docker Engine',
      status: 'idle',
      installCommand: 'curl -fsSL https://get.docker.com | sh'
    },
    {
      id: 'k3s',
      label: 'k3s cluster',
      status: 'idle',
      installCommand: 'curl -sfL https://get.k3s.io | sh -'
    }
  ];
}

function StepHeader({ current }: { current: Step }) {
  const steps: { label: string; sub: string }[] = [
    { label: 'Detect', sub: 'Machine specs' },
    { label: 'Dependencies', sub: 'Docker + k3s' },
    { label: 'Register', sub: 'Connect wallet' },
    { label: 'Launch', sub: 'Go live' }
  ];

  return (
    <div className="stepper">
      {steps.map(({ label, sub }, idx) => {
        const step = (idx + 1) as Step;
        const done = current > step;
        const active = current === step;
        return (
          <div key={label} className={`stepItem ${active ? 'stepActive' : done ? 'stepDone' : ''}`}>
            <div className={`stepCircle ${active ? 'circleActive' : done ? 'circleDone' : ''}`}>
              {done ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span>{idx + 1}</span>
              )}
            </div>
            <div className="stepLabels">
              <span className="stepTitle">{label}</span>
              <span className="stepSub">{sub}</span>
            </div>
            {idx < steps.length - 1 && <div className={`stepLine ${done ? 'lineDone' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

function OnboardFlow() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();

  const [step, setStep] = useState<Step>(1);
  const [machine, setMachine] = useState<MachineProfile | null>(null);
  const [allocation, setAllocation] = useState<Allocation>({ cpu: 1, ramMb: 1024, storageGb: 20 });
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [checksRunning, setChecksRunning] = useState(false);
  const [k3sReachable, setK3sReachable] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registrationHash, setRegistrationHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [daemonLive, setDaemonLive] = useState(false);

  useEffect(() => {
    async function detectMachine() {
      const os = detectOs();
      const cpuTotal = Math.max(2, navigator.hardwareConcurrency || 4);
      const ramTotalMb = Math.max(2048, Math.round(((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) * 1024));

      let diskTotalGb = 256;
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          diskTotalGb = Math.max(20, Math.floor(estimate.quota / 1024 / 1024 / 1024));
        }
      }

      setMachine({ os, cpuTotal, ramTotalMb, diskTotalGb });

      const maxCpuOffer = Math.max(1, cpuTotal - 1);
      const maxRamOffer = Math.max(512, ramTotalMb - 2048);

      setAllocation({
        cpu: Math.min(4, maxCpuOffer),
        ramMb: Math.min(8192, maxRamOffer),
        storageGb: Math.min(100, diskTotalGb)
      });

      setChecks(baseChecksForOs(os));
    }

    void detectMachine();
  }, []);

  const maxCpu = useMemo(() => Math.max(1, (machine?.cpuTotal ?? 2) - 1), [machine]);
  const maxRam = useMemo(() => Math.max(512, (machine?.ramTotalMb ?? 4096) - 2048), [machine]);
  const maxStorage = useMemo(() => Math.max(1, machine?.diskTotalGb ?? 64), [machine]);

  const estimatedCntPerDay = useMemo(() => {
    const cpuRate = 10;
    const ramRate = 2.5;
    const storageRate = 0.12;
    const ramGb = allocation.ramMb / 1024;
    return (allocation.cpu * cpuRate + ramGb * ramRate + allocation.storageGb * storageRate).toFixed(1);
  }, [allocation.cpu, allocation.ramMb, allocation.storageGb]);

  async function runChecks() {
    if (!checks.length || checksRunning) {
      return;
    }

    setChecksRunning(true);
    setK3sReachable(false);

    for (const item of checks) {
      setChecks((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, status: 'checking' } : entry)));

      await new Promise((resolve) => setTimeout(resolve, 650));

      let installed = false;
      if (item.id === 'k3s') {
        installed = await canReach(['https://127.0.0.1:6443/version', 'http://127.0.0.1:6443/version']);
        setK3sReachable(installed);
      } else if (item.id.includes('docker')) {
        installed = await canReach([
          'http://localhost:2375/_ping',
          'http://localhost:2376/_ping',
          'http://localhost:8080/health'
        ]);
      } else {
        installed = false;
      }

      setChecks((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, status: installed ? 'ok' : 'missing' } : entry)));
    }

    setChecksRunning(false);
  }

  async function registerProvider() {
    if (!address || registering) {
      return;
    }

    setRegistering(true);
    try {
      const region = machine?.os === 'windows' ? 'local-windows' : machine?.os === 'mac' ? 'local-mac' : 'local-linux';
      const payload = JSON.stringify({
        action: 'comnetish_provider_register',
        stakeCnt: 1000,
        address,
        offered: allocation,
        ts: new Date().toISOString()
      });

      const signature = await signMessageAsync({
        message: payload
      });

      if (REGISTRATION_MODE === 'live') {
        const encoded = new TextEncoder().encode(`comnetish-register:${Date.now()}`);
        const txData = `0x${Array.from(encoded)
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')}` as Hex;

        const txHash = await sendTransactionAsync({
          to: address,
          value: 0n,
          data: txData
        });

        setRegistrationHash(txHash);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setRegistrationHash(`0x${signature.slice(2, 18)}${Date.now().toString(16)}`);
      }

      const response = await fetch(`${API_BASE}/api/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          region,
          cpu: allocation.cpu,
          memory: allocation.ramMb,
          storage: allocation.storageGb,
          pricePerCpu: 1,
          signature
        })
      });

      if (!response.ok) {
        throw new Error('Provider registration request failed');
      }

      // Persist registered flag so dashboard doesn't redirect back to onboarding on reload
      try {
        localStorage.setItem(`comnetish_registered_${address.toLowerCase()}`, '1');
      } catch {
        // storage unavailable — ignore
      }

      setRegistered(true);
      setStep(4);
    } finally {
      setRegistering(false);
    }
  }

  const providerConfigPreview = useMemo(
    () => `chain:
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
  path: /health`,
    []
  );

  const launchCommand = useMemo(() => {
    if (machine?.os === 'windows') {
      return 'wsl bash -lc "cd /path/to/comnetish && chmod +x scripts/setup-provider-fork.sh && ./scripts/setup-provider-fork.sh && cd provider && docker compose up -d"';
    }

    return 'chmod +x scripts/setup-provider-fork.sh && ./scripts/setup-provider-fork.sh && cd provider && docker compose up -d';
  }, [machine?.os]);

  useEffect(() => {
    if (step !== 4 || !registered || daemonLive) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const reachable = await canReach(['http://localhost:8080/health', 'http://127.0.0.1:8080/health']);
      if (reachable) {
        setDaemonLive(true);
        confetti({
          particleCount: 120,
          spread: 85,
          origin: { y: 0.6 }
        });
        window.setTimeout(() => router.push('/'), 2200);
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, [step, registered, daemonLive, router]);

  return (
    <main className="onboardRoot">
      <div className="glow glowA" />
      <div className="glow glowB" />

      <div className="contentWrap">
        {/* Header */}
        <motion.div className="pageHeader" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="headerBadge">Provider Setup</div>
          <h1 className="title">Join the Comnetish Network</h1>
          <p className="subtitle">Contribute compute, earn CNT tokens. Takes about 5 minutes.</p>
        </motion.div>

        <StepHeader current={step} />

        <AnimatePresence mode="wait">
          {/* ── STEP 1 ─────────────────────────────────────────── */}
          {step === 1 && (
            <motion.section key="step1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="sectionCard">
                <div className="cardHeader">
                  <div className="cardIcon">🖥️</div>
                  <div>
                    <h2 className="cardTitle">Machine detected</h2>
                    <p className="cardDesc">Set how much of your hardware to offer to tenants.</p>
                  </div>
                </div>

                {/* Spec row */}
                <div className="specRow">
                  {[
                    { icon: '🖥️', label: 'OS', value: machine?.os.toUpperCase() ?? '…' },
                    { icon: '⚙️', label: 'CPU cores', value: machine?.cpuTotal ?? '…' },
                    { icon: '🧠', label: 'RAM', value: machine ? `${(machine.ramTotalMb / 1024).toFixed(1)} GB` : '…' },
                    { icon: '💾', label: 'Disk', value: machine ? `${machine.diskTotalGb} GB` : '…' }
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="specCard">
                      <span className="specIcon">{icon}</span>
                      <span className="specLabel">{label}</span>
                      <strong className="specValue">{value}</strong>
                    </div>
                  ))}
                </div>

                {/* Allocation sliders */}
                <div className="allocSection">
                  <h3 className="allocTitle">Allocation to offer</h3>
                  <div className="sliderGrid">
                    <div className="sliderRow">
                      <div className="sliderMeta">
                        <span className="sliderLabel">CPU</span>
                        <span className="sliderVal">{allocation.cpu} / {maxCpu} cores</span>
                      </div>
                      <input type="range" min={1} max={maxCpu} value={allocation.cpu}
                        aria-label="CPU cores to offer"
                        onChange={(e) => setAllocation((p) => ({ ...p, cpu: Number(e.target.value) }))} className="slider" />
                    </div>
                    <div className="sliderRow">
                      <div className="sliderMeta">
                        <span className="sliderLabel">RAM</span>
                        <span className="sliderVal">{(allocation.ramMb / 1024).toFixed(1)} / {(maxRam / 1024).toFixed(1)} GB</span>
                      </div>
                      <input type="range" min={512} max={maxRam} step={256} value={allocation.ramMb}
                        aria-label="RAM to offer in MB"
                        onChange={(e) => setAllocation((p) => ({ ...p, ramMb: Number(e.target.value) }))} className="slider" />
                    </div>
                    <div className="sliderRow">
                      <div className="sliderMeta">
                        <span className="sliderLabel">Storage</span>
                        <span className="sliderVal">{allocation.storageGb} / {maxStorage} GB</span>
                      </div>
                      <input type="range" min={1} max={maxStorage} value={allocation.storageGb}
                        aria-label="Storage to offer in GB"
                        onChange={(e) => setAllocation((p) => ({ ...p, storageGb: Number(e.target.value) }))} className="slider" />
                    </div>
                  </div>
                </div>

                {/* Earnings estimate */}
                <div className="earningsBox">
                  <div className="earningsLeft">
                    <span className="earningsLabel">Estimated earnings</span>
                    <span className="earningsAmount">{estimatedCntPerDay} CNT<span className="earningsPer"> /day</span></span>
                  </div>
                  <div className="earningsRight">
                    <span className="earningsHint">Based on {allocation.cpu} CPU · {(allocation.ramMb / 1024).toFixed(1)} GB RAM · {allocation.storageGb} GB storage</span>
                  </div>
                </div>

                <div className="cardFooter">
                  <Button onClick={() => setStep(2)}>Continue →</Button>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── STEP 2 ─────────────────────────────────────────── */}
          {step === 2 && (
            <motion.section key="step2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="sectionCard">
                <div className="cardHeader">
                  <div className="cardIcon">📦</div>
                  <div>
                    <h2 className="cardTitle">Install dependencies</h2>
                    <p className="cardDesc">Docker and k3s are required to run workloads. Copy the command and run it in your terminal.</p>
                  </div>
                </div>

                <div className="depList">
                  {checks.map((item) => (
                    <div key={item.id} className={`depRow ${item.status === 'ok' ? 'depOk' : item.status === 'missing' ? 'depMissing' : ''}`}>
                      <div className="depTop">
                        <div className="depInfo">
                          <span className="depStatusDot" />
                          <span className="depName">{item.label}</span>
                        </div>
                        <div className="depBadge">
                          {item.status === 'idle' && <span className="badge badgeIdle">Not checked</span>}
                          {item.status === 'checking' && <span className="badge badgeChecking"><Spinner size="sm" /> Checking…</span>}
                          {item.status === 'ok' && <span className="badge badgeOk">✓ Installed</span>}
                          {item.status === 'missing' && <span className="badge badgeMissing">Missing</span>}
                        </div>
                      </div>
                      {(item.status === 'missing' || item.status === 'idle') && item.installCommand && (
                        <div className="depCmd">
                          <code className="depCode">{item.installCommand}</code>
                          <button className="copyBtn" onClick={() => { navigator.clipboard.writeText(item.installCommand!); }}>Copy</button>
                        </div>
                      )}
                      {item.helperText && <p className="depHelper">{item.helperText}</p>}
                    </div>
                  ))}
                </div>

                <div className={`k3sStatus ${k3sReachable ? 'k3sOk' : ''}`}>
                  <span className={`k3sDot ${k3sReachable ? 'k3sDotOk' : ''}`} />
                  <span>k3s API{k3sReachable ? ' — reachable ✓' : checksRunning ? ' — testing…' : ' — not detected'}</span>
                </div>

                <div className="cardFooter split">
                  <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
                  <div className="footerRight">
                    <Button variant="secondary" onClick={() => void runChecks()} loading={checksRunning}>Run checks</Button>
                    <Button onClick={() => setStep(3)}>Continue →</Button>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── STEP 3 ─────────────────────────────────────────── */}
          {step === 3 && (
            <motion.section key="step3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="sectionCard">
                <div className="cardHeader">
                  <div className="cardIcon">🔑</div>
                  <div>
                    <h2 className="cardTitle">Connect wallet &amp; register</h2>
                    <p className="cardDesc">Sign your provider registration. A stake of 1 000 CNT will be reserved.</p>
                  </div>
                </div>

                <div className="walletSection">
                  <div className="walletConnect">
                    <ConnectButton />
                  </div>
                  {isConnected && address && (
                    <div className="walletAddress">
                      <span className="walletAddressLabel">Connected</span>
                      <code className="walletAddressCode">{address.slice(0, 8)}…{address.slice(-6)}</code>
                    </div>
                  )}
                </div>

                {isConnected ? (
                  <div className="regBox">
                    <div className="regSummary">
                      <div className="regRow"><span>CPU offered</span><strong>{allocation.cpu} cores</strong></div>
                      <div className="regRow"><span>RAM offered</span><strong>{(allocation.ramMb / 1024).toFixed(1)} GB</strong></div>
                      <div className="regRow"><span>Storage offered</span><strong>{allocation.storageGb} GB</strong></div>
                      <div className="regRow"><span>Stake required</span><strong className="stakeAmt">1 000 CNT</strong></div>
                    </div>
                    {!registered ? (
                      <Button onClick={() => void registerProvider()} loading={registering} className="regBtn">
                        {registering ? 'Registering…' : 'Stake & Register Provider'}
                      </Button>
                    ) : (
                      <div className="regSuccess">
                        <span className="regSuccessIcon">✓</span>
                        <div>
                          <p className="regSuccessTitle">Registration confirmed</p>
                          <code className="regHash">{registrationHash}</code>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="connectPrompt">Connect a wallet above to continue.</div>
                )}

                <div className="cardFooter split">
                  <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
                </div>
              </div>
            </motion.section>
          )}

          {/* ── STEP 4 ─────────────────────────────────────────── */}
          {step === 4 && (
            <motion.section key="step4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
              <div className="sectionCard">
                <div className="cardHeader">
                  <div className="cardIcon">🚀</div>
                  <div>
                    <h2 className="cardTitle">Launch local provider stack</h2>
                    <p className="cardDesc">Run this from the repository root. It sets up the provider fork and starts the local provider services with Docker Compose.</p>
                  </div>
                </div>

                {/* Launch command */}
                <div className="terminalBox">
                  <div className="terminalBar">
                    <span className="termDot r" /><span className="termDot y" /><span className="termDot g" />
                    <span className="termTitle">Terminal</span>
                  </div>
                  <div className="terminalBody">
                    <span className="termPrompt">$</span>
                    <code className="termCmd">{launchCommand}</code>
                    <button className="termCopy" onClick={async () => { await navigator.clipboard.writeText(launchCommand); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }}>
                      {copied ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Config */}
                <details className="configDetails">
                  <summary className="configSummary">View generated config <span className="configPath">provider/config.yaml</span></summary>
                  <pre className="configPre">{providerConfigPreview}</pre>
                </details>

                {/* Daemon status */}
                <div className={`daemonStatus ${daemonLive ? 'daemonLive' : ''}`}>
                  {daemonLive ? (
                    <>
                      <span className="livePulse" />
                      <div>
                        <p className="daemonTitle">You're live on the network!</p>
                        <p className="daemonSub">Redirecting to dashboard…</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Spinner size="sm" />
                      <div>
                        <p className="daemonTitle">Waiting for daemon…</p>
                        <p className="daemonSub">Run the command above from the repo root, then this page updates automatically when `http://localhost:8080/health` responds.</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="cardFooter split">
                  <Button variant="ghost" onClick={() => setStep(3)}>← Back</Button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <style jsx>{`
        /* ── Root ─────────────────────────────────────────── */
        .onboardRoot {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: radial-gradient(ellipse at 15% 0%, rgba(0,255,194,0.07) 0%, transparent 50%),
                      radial-gradient(ellipse at 85% 5%, rgba(111,124,255,0.07) 0%, transparent 50%),
                      #07090f;
          color: #e7eef8;
          font-family: inherit;
        }

        .glow {
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 9999px;
          filter: blur(110px);
          opacity: 0.16;
          pointer-events: none;
        }
        .glowA { top: -160px; right: -80px; background: #00ffc2; }
        .glowB { bottom: -180px; left: -120px; background: #6f7cff; }

        .contentWrap {
          max-width: 860px;
          margin: 0 auto;
          padding: 44px 24px 72px;
          position: relative;
          z-index: 2;
        }

        /* ── Page header ───────────────────────────────────── */
        .pageHeader { margin-bottom: 32px; }

        .headerBadge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 9999px;
          border: 1px solid rgba(0,255,194,0.35);
          background: rgba(0,255,194,0.08);
          color: #00ffc2;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .title {
          margin: 0 0 10px;
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #f0f7ff 0%, rgba(0,255,194,0.85) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subtitle {
          margin: 0;
          color: rgba(231,238,248,0.6);
          font-size: 1.05rem;
          max-width: 52ch;
        }

        /* ── Step indicator ────────────────────────────────── */
        .stepper {
          display: flex;
          align-items: flex-start;
          gap: 0;
          margin-bottom: 28px;
        }

        .stepItem {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          flex: 1;
          position: relative;
        }

        .stepCircle {
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          border: 1.5px solid rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(231,238,248,0.45);
          flex-shrink: 0;
          background: rgba(255,255,255,0.04);
          transition: all 0.2s;
        }
        .circleActive {
          border-color: #00ffc2;
          color: #00ffc2;
          background: rgba(0,255,194,0.1);
          box-shadow: 0 0 0 4px rgba(0,255,194,0.12);
        }
        .circleDone {
          border-color: #00ffc2;
          color: #00ffc2;
          background: rgba(0,255,194,0.15);
        }

        .stepLabels { display: flex; flex-direction: column; gap: 2px; padding-top: 5px; }
        .stepTitle {
          font-size: 0.82rem;
          font-weight: 600;
          color: rgba(231,238,248,0.45);
        }
        .stepActive .stepTitle { color: #f0f7ff; }
        .stepDone .stepTitle { color: rgba(0,255,194,0.8); }

        .stepSub {
          font-size: 0.72rem;
          color: rgba(231,238,248,0.3);
        }
        .stepActive .stepSub { color: rgba(231,238,248,0.55); }

        .stepLine {
          position: absolute;
          top: 15px;
          left: calc(100% - 8px);
          width: calc(100% - 52px);
          height: 1px;
          background: rgba(255,255,255,0.1);
          pointer-events: none;
        }
        .lineDone { background: rgba(0,255,194,0.4); }

        /* ── Section card ──────────────────────────────────── */
        .sectionCard {
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          background: rgba(12,16,28,0.72);
          backdrop-filter: blur(16px);
          padding: 28px;
          box-shadow: 0 4px 40px rgba(0,0,0,0.35);
        }

        .cardHeader {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 24px;
        }

        .cardIcon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(0,255,194,0.08);
          border: 1px solid rgba(0,255,194,0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .cardTitle {
          margin: 0 0 4px;
          font-size: 1.2rem;
          font-weight: 700;
          color: #f0f7ff;
        }
        .cardDesc {
          margin: 0;
          color: rgba(231,238,248,0.58);
          font-size: 0.9rem;
        }

        /* ── Spec row ──────────────────────────────────────── */
        .specRow {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .specCard {
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          transition: border-color 0.15s;
        }
        .specCard:hover { border-color: rgba(0,255,194,0.25); }

        .specIcon { font-size: 1.1rem; }
        .specLabel { font-size: 0.72rem; color: rgba(231,238,248,0.5); }
        .specValue { font-size: 1rem; font-weight: 700; color: #f0f7ff; }

        /* ── Sliders ───────────────────────────────────────── */
        .allocSection { margin-bottom: 20px; }
        .allocTitle {
          font-size: 0.82rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: rgba(231,238,248,0.45);
          margin: 0 0 14px;
        }

        .sliderGrid { display: grid; gap: 14px; }

        .sliderRow { display: grid; gap: 8px; }

        .sliderMeta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sliderLabel { font-size: 0.88rem; color: rgba(231,238,248,0.8); font-weight: 500; }
        .sliderVal { font-size: 0.82rem; font-variant-numeric: tabular-nums; color: #00ffc2; font-weight: 600; }

        .slider {
          width: 100%;
          accent-color: #00ffc2;
          height: 4px;
          cursor: pointer;
        }

        /* ── Earnings ──────────────────────────────────────── */
        .earningsBox {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          border: 1px solid rgba(0,255,194,0.2);
          border-radius: 12px;
          background: rgba(0,255,194,0.05);
          padding: 14px 18px;
          margin-bottom: 22px;
        }

        .earningsLeft { display: flex; flex-direction: column; gap: 2px; }
        .earningsLabel { font-size: 0.78rem; color: rgba(231,238,248,0.55); }
        .earningsAmount { font-size: 1.45rem; font-weight: 800; color: #00ffc2; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .earningsPer { font-size: 0.9rem; font-weight: 400; color: rgba(0,255,194,0.7); }

        .earningsRight { }
        .earningsHint { font-size: 0.78rem; color: rgba(231,238,248,0.45); }

        /* ── Dep list (step 2) ─────────────────────────────── */
        .depList { display: grid; gap: 10px; margin-bottom: 16px; }

        .depRow {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 14px;
          background: rgba(255,255,255,0.02);
          transition: border-color 0.15s;
        }
        .depOk { border-color: rgba(0,255,194,0.25); background: rgba(0,255,194,0.04); }
        .depMissing { border-color: rgba(255,61,113,0.3); background: rgba(255,61,113,0.04); }

        .depTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .depInfo { display: flex; align-items: center; gap: 10px; }

        .depStatusDot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.2);
          flex-shrink: 0;
        }
        .depOk .depStatusDot { background: #00ffc2; box-shadow: 0 0 6px rgba(0,255,194,0.5); }
        .depMissing .depStatusDot { background: #ff3d71; }

        .depName { font-size: 0.9rem; font-weight: 600; }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-weight: 600;
        }
        .badgeIdle { border: 1px solid rgba(255,255,255,0.12); color: rgba(231,238,248,0.5); }
        .badgeChecking { border: 1px solid rgba(111,124,255,0.35); color: #9fa8ff; }
        .badgeOk { border: 1px solid rgba(0,255,194,0.35); color: #00ffc2; background: rgba(0,255,194,0.08); }
        .badgeMissing { border: 1px solid rgba(255,61,113,0.35); color: #ff6b8a; background: rgba(255,61,113,0.08); }

        .depCmd {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .depCode {
          flex: 1;
          font-family: ui-monospace, SFMono-Regular, Menlo, monaco, Consolas, 'Liberation Mono', monospace;
          font-size: 0.8rem;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 8px 12px;
          overflow-wrap: anywhere;
          color: #e7eef8;
        }

        .copyBtn {
          flex-shrink: 0;
          padding: 6px 14px;
          border-radius: 8px;
          border: 1px solid rgba(0,255,194,0.3);
          background: rgba(0,255,194,0.08);
          color: #00ffc2;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .copyBtn:hover { background: rgba(0,255,194,0.16); }

        .depHelper { margin: 8px 0 0; font-size: 0.78rem; color: rgba(231,238,248,0.5); }

        .k3sStatus {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          border-radius: 9999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          font-size: 0.82rem;
          margin-bottom: 20px;
        }
        .k3sOk { border-color: rgba(0,255,194,0.3); background: rgba(0,255,194,0.06); color: #00ffc2; }

        .k3sDot {
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.25);
          flex-shrink: 0;
        }
        .k3sDotOk { background: #00ffc2; box-shadow: 0 0 6px rgba(0,255,194,0.6); }

        /* ── Wallet section (step 3) ───────────────────────── */
        .walletSection {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          margin-bottom: 16px;
        }

        .walletAddress { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .walletAddressLabel { font-size: 0.72rem; color: rgba(0,255,194,0.7); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
        .walletAddressCode {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.82rem;
          color: rgba(231,238,248,0.8);
        }

        .regBox {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .regSummary { }
        .regRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 0.9rem;
        }
        .regRow:last-child { border-bottom: none; }
        .regRow span { color: rgba(231,238,248,0.55); }
        .regRow strong { color: #f0f7ff; }
        .stakeAmt { color: #00ffc2; }

        .regBtn { width: 100%; border-radius: 0; border-top: 1px solid rgba(255,255,255,0.08); }

        .regSuccess {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: rgba(0,255,194,0.06);
          border-top: 1px solid rgba(0,255,194,0.2);
        }
        .regSuccessIcon {
          width: 28px;
          height: 28px;
          border-radius: 9999px;
          background: rgba(0,255,194,0.2);
          color: #00ffc2;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }
        .regSuccessTitle { margin: 0 0 4px; font-weight: 600; color: #00ffc2; font-size: 0.9rem; }
        .regHash {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.75rem;
          color: rgba(231,238,248,0.55);
          word-break: break-all;
        }

        .connectPrompt {
          padding: 20px;
          text-align: center;
          color: rgba(231,238,248,0.45);
          font-size: 0.9rem;
          border: 1px dashed rgba(255,255,255,0.1);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        /* ── Terminal box (step 4) ─────────────────────────── */
        .terminalBox {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 14px;
        }

        .terminalBar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .termDot {
          width: 11px;
          height: 11px;
          border-radius: 9999px;
        }
        .termDot.r { background: #ff5f57; }
        .termDot.y { background: #febc2e; }
        .termDot.g { background: #28c840; }
        .termTitle { margin-left: 8px; font-size: 0.75rem; color: rgba(231,238,248,0.35); }

        .terminalBody {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: rgba(4,8,16,0.7);
          flex-wrap: wrap;
        }

        .termPrompt {
          color: #00ffc2;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9rem;
          flex-shrink: 0;
        }

        .termCmd {
          flex: 1;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.88rem;
          color: #e7eef8;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .termCopy {
          padding: 5px 12px;
          border-radius: 7px;
          border: 1px solid rgba(0,255,194,0.3);
          background: rgba(0,255,194,0.08);
          color: #00ffc2;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s;
        }
        .termCopy:hover { background: rgba(0,255,194,0.16); }

        .configDetails { margin-bottom: 18px; }
        .configSummary {
          font-size: 0.85rem;
          color: rgba(231,238,248,0.55);
          cursor: pointer;
          user-select: none;
          padding: 8px 0;
        }
        .configSummary:hover { color: rgba(231,238,248,0.8); }
        .configPath { color: #00ffc2; margin-left: 4px; }
        .configPre {
          margin: 10px 0 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.8rem;
          background: rgba(4,8,16,0.7);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 14px;
          overflow-x: auto;
          white-space: pre;
          color: rgba(231,238,248,0.8);
        }

        .daemonStatus {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 18px;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          margin-bottom: 16px;
        }
        .daemonLive { border-color: rgba(0,255,194,0.3); background: rgba(0,255,194,0.05); }

        .livePulse {
          width: 11px;
          height: 11px;
          border-radius: 9999px;
          background: #00ffc2;
          flex-shrink: 0;
          margin-top: 5px;
          box-shadow: 0 0 0 0 rgba(0,255,194,0.7);
          animation: pulse 1.6s infinite;
        }

        .daemonTitle { margin: 0 0 3px; font-size: 0.9rem; font-weight: 700; }
        .daemonLive .daemonTitle { color: #00ffc2; }
        .daemonSub { margin: 0; font-size: 0.8rem; color: rgba(231,238,248,0.5); }

        /* ── Footer row ────────────────────────────────────── */
        .cardFooter {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.07);
        }
        .cardFooter.split { justify-content: space-between; }
        .footerRight { display: flex; gap: 10px; }

        /* ── Animations ────────────────────────────────────── */
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0,255,194,0.7); }
          70%  { box-shadow: 0 0 0 9px rgba(0,255,194,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,255,194,0); }
        }

        /* ── Responsive ────────────────────────────────────── */
        @media (max-width: 780px) {
          .specRow { grid-template-columns: 1fr 1fr; }
          .stepTitle { display: none; }
          .stepSub { display: none; }
          .stepLine { display: none; }
          .stepItem { flex: unset; }
        }

        @media (max-width: 560px) {
          .contentWrap { padding: 24px 16px 56px; }
          .specRow { grid-template-columns: 1fr 1fr; }
          .sectionCard { padding: 20px 16px; }
          .earningsBox { flex-direction: column; }
          .walletSection { flex-direction: column; align-items: flex-start; }
          .walletAddress { text-align: left; }
        }
      `}</style>
    </main>
  );

}

export default function ProviderOnboardPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <Spinner />
      </div>
    );
  }

  return <OnboardFlow />;
}
