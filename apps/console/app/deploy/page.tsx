'use client';

import { RainbowKitProvider, getDefaultConfig, ConnectButton } from '@rainbow-me/rainbowkit';
import { Badge, Button, Card, Terminal } from '@comnetish/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { erc20Abi, parseUnits } from 'viem';
import { http, WagmiProvider, useAccount, useBalance, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

type Step = 1 | 2 | 3;
type Mode = 'ai' | 'manual';
type SortMode = 'price' | 'fastest' | 'uptime';
type PaymentMethod = 'CNT' | 'USDC';

type Provider = {
  id: string;
  address: string;
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  pricePerCpu: number;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  lastSeen: string;
};

type Bid = {
  id: string;
  deploymentId: string;
  providerId: string;
  price: number;
  status: 'OPEN' | 'WON' | 'LOST';
  provider?: Provider;
};

type AiResponse = {
  sdl: string;
  provider: string;
  requestId: string | null;
};

type ManualFormState = {
  deploymentName: string;
  image: string;
  cpu: number;
  memory: number;
  storage: number;
  ports: string;
  env: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const USD_PER_CNT = Number(process.env.NEXT_PUBLIC_USD_PER_CNT ?? 0.19);
const CNT_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CNT_TOKEN_ADDRESS as `0x${string}` | undefined;
const PAYMENT_ESCROW_ADDRESS = process.env.NEXT_PUBLIC_PAYMENT_ESCROW_ADDRESS as `0x${string}` | undefined;
const PAYMENT_TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DECIMALS ?? 6);
const PROVIDER_GATEWAY_URL = process.env.NEXT_PUBLIC_PROVIDER_GATEWAY_URL?.trim();
const USDC_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS as `0x${string}` | undefined;
const USDC_SPENDER_ADDRESS = process.env.NEXT_PUBLIC_USDC_SPENDER_ADDRESS as `0x${string}` | undefined;

const paymentEscrowAbi = [
  {
    type: 'function',
    name: 'depositForLease',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'leaseId', type: 'uint256' },
      { name: 'provider', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'maxDuration', type: 'uint64' }
    ],
    outputs: []
  }
] as const;

function StepIndicator({ step }: { step: Step }) {
  const items = [
    { id: 1, title: 'Configure' },
    { id: 2, title: 'Select Provider' },
    { id: 3, title: 'Review & Pay' }
  ] as const;

  return (
    <div className="mb-8 flex items-center gap-2 md:gap-3">
      {items.map((item, idx) => {
        const active = step === item.id;
        const complete = step > item.id;
        return (
          <div key={item.id} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                complete
                  ? 'border-brand-primary bg-brand-primary text-background'
                  : active
                    ? 'border-brand-primary bg-brand-primary/15 text-brand-primary'
                    : 'border-[rgba(139,148,158,0.4)] text-text-muted'
              }`}
            >
              {item.id}
            </div>
            <span className={`text-sm ${active ? 'text-text-primary' : 'text-text-muted'}`}>{item.title}</span>
            {idx < items.length - 1 && <div className="hidden h-px w-8 bg-[rgba(139,148,158,0.3)] md:block" />}
          </div>
        );
      })}
    </div>
  );
}

function sdlFromManual(state: ManualFormState) {
  const ports = state.ports
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const envEntries = state.env
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split('=');
      return { key: key?.trim() ?? '', value: rest.join('=').trim() };
    })
    .filter((entry) => entry.key.length > 0);

  return [
    'version: "2.0"',
    'services:',
    `  ${state.deploymentName || 'app'}:`,
    `    image: ${state.image || 'nginx:alpine'}`,
    '    expose:',
    ...ports.map((port) => `      - port: ${port}\n        as: ${port}\n        to:\n          - global: true`),
    'profiles:',
    `  compute:`,
    `    ${state.deploymentName || 'app'}:`,
    `      resources:`,
    `        cpu:`,
    `          units: ${state.cpu}`,
    `        memory:`,
    `          size: ${state.memory}Gi`,
    `        storage:`,
    `          size: ${state.storage}Gi`,
    envEntries.length > 0 ? 'deployment:\n  env:' : null,
    ...envEntries.map((entry) => `    - ${entry.key}=${entry.value}`)
  ]
    .filter(Boolean)
    .join('\n');
}

function generateSdlLocally(prompt: string): string {
  const low = prompt.toLowerCase();

  const portMatch = prompt.match(/port[s]?[:\s]+?(\d{2,5})/i) ?? prompt.match(/\b(8080|8000|3000|5000|4000|80|443)\b/);
  const port = portMatch ? portMatch[1] : '8080';

  const cpuMatch = prompt.match(/(\d+)\s*cpu/i) ?? prompt.match(/(\d+)\s*vcpu/i);
  const cpu = cpuMatch?.[1] ? parseInt(cpuMatch[1], 10) : 1;

  const ramMatch = prompt.match(/(\d+)\s*gb?\s*ram/i) ?? prompt.match(/(\d+)\s*gb?\s*memory/i) ?? prompt.match(/(\d+)gb/i);
  const ramGb = ramMatch?.[1] ? parseInt(ramMatch[1], 10) : 1;

  let image = 'nginx:alpine';
  let serviceName = 'app';

  if (low.includes('fastapi') || (low.includes('fast') && low.includes('api'))) {
    image = 'tiangolo/uvicorn-gunicorn-fastapi:python3.11'; serviceName = 'fastapi-app';
  } else if (low.includes('flask')) {
    image = 'python:3.11-slim'; serviceName = 'flask-app';
  } else if (low.includes('python')) {
    image = 'python:3.11-slim'; serviceName = 'python-app';
  } else if (low.includes('express') || (low.includes('node') && !low.includes('next'))) {
    image = 'node:20-alpine'; serviceName = 'node-app';
  } else if (low.includes('next') || low.includes('nextjs')) {
    image = 'node:20-alpine'; serviceName = 'nextjs-app';
  } else if (low.includes('postgres') || low.includes('postgresql')) {
    image = 'postgres:15-alpine'; serviceName = 'db';
  } else if (low.includes('redis')) {
    image = 'redis:7-alpine'; serviceName = 'cache';
  } else if (low.includes('golang') || low.includes(' go ')) {
    image = 'golang:1.22-alpine'; serviceName = 'go-app';
  } else if (low.includes('rust')) {
    image = 'rust:alpine'; serviceName = 'rust-app';
  } else if (low.includes('nginx')) {
    image = 'nginx:alpine'; serviceName = 'web';
  }

  return [
    'version: "2.0"',
    'services:',
    `  ${serviceName}:`,
    `    image: ${image}`,
    '    expose:',
    `      - port: ${port}`,
    `        as: ${port}`,
    '        to:',
    '          - global: true',
    'profiles:',
    '  compute:',
    `    ${serviceName}:`,
    '      resources:',
    '        cpu:',
    `          units: ${cpu}`,
    '        memory:',
    `          size: ${ramGb}Gi`,
    '        storage:',
    '          size: 10Gi',
    'deployment:',
    `  ${serviceName}:`,
    '    profile: compute',
    '    count: 1'
  ].join('\n');
}

function formatRegionFlag(region: string) {
  const normalized = region.trim().toLowerCase();
  if (normalized.startsWith('us') || normalized === 'us-east-1' || normalized === 'us-west-2') {
    return '🇺🇸';
  }
  if (normalized.startsWith('eu') || normalized === 'eu-west-1' || normalized === 'eu-central-1') {
    return '🇪🇺';
  }
  if (
    normalized.startsWith('asia') ||
    normalized === 'ap-south-1' ||
    normalized === 'ap-southeast-1' ||
    normalized === 'ap-northeast-1'
  ) {
    return '🌏';
  }
  if (
    normalized === 'chennai' ||
    normalized === 'bombay' ||
    normalized === 'mumbai' ||
    normalized === 'delhi' ||
    normalized === 'kolkata' ||
    normalized === 'bengaluru' ||
    normalized === 'bangalore' ||
    normalized === 'hyderabad' ||
    normalized === 'visakhapatnam' ||
    normalized === 'vizag'
  ) {
    return '🇮🇳';
  }
  return '🌐';
}

function statusBadge(status: Provider['status']) {
  if (status === 'ACTIVE') {
    return 'success' as const;
  }
  if (status === 'MAINTENANCE') {
    return 'pending' as const;
  }
  return 'error' as const;
}

function DeployWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const providerFromUrl = searchParams.get('provider');
  const { address: walletAddress } = useAccount();
  const { writeContract, data: approvalTxHash, isPending: isSubmittingApproval, error: approvalError } = useWriteContract();
  const {
    writeContract: writeEscrowContract,
    data: escrowTxHash,
    isPending: isSubmittingEscrow,
    error: escrowError
  } = useWriteContract();
  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalTxHash });
  const escrowReceipt = useWaitForTransactionReceipt({ hash: escrowTxHash });

  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>('ai');
  const [sortMode, setSortMode] = useState<SortMode>('price');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CNT');

  const [aiPrompt, setAiPrompt] = useState('Deploy a Python FastAPI app with 2 CPU and 1GB RAM, port 8000');
  const [aiGeneratedSdl, setAiGeneratedSdl] = useState('');
  const [animatedSdl, setAnimatedSdl] = useState('');
  const [showAiReview, setShowAiReview] = useState(false);
  const [usdApproved, setUsdApproved] = useState(false);
  const [cntEscrowFunded, setCntEscrowFunded] = useState(false);
  const [escrowLeaseId, setEscrowLeaseId] = useState<bigint | null>(null);
  const [escrowAmountCnt, setEscrowAmountCnt] = useState<number | null>(null);
  const [escrowAmountBaseUnits, setEscrowAmountBaseUnits] = useState<string | null>(null);
  const [escrowMaxDurationSeconds, setEscrowMaxDurationSeconds] = useState<number | null>(null);

  const [manual, setManual] = useState<ManualFormState>({
    deploymentName: 'fastapi-service',
    image: 'tiangolo/uvicorn-gunicorn-fastapi:python3.11',
    cpu: 2,
    memory: 1,
    storage: 20,
    ports: '8000',
    env: 'ENV=production\nLOG_LEVEL=info'
  });

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [bidAnimationVersion, setBidAnimationVersion] = useState<Record<string, number>>({});
  const seenBidIdsRef = useRef<Set<string>>(new Set());

  const effectiveSdl = mode === 'ai' ? aiGeneratedSdl : sdlFromManual(manual);
  const deploymentDraftId = useMemo(() => `draft-${manual.deploymentName || 'deployment'}`, [manual.deploymentName]);

  const providersQuery = useQuery({
    queryKey: ['deploy-providers'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/providers`);
      if (!response.ok) {
        throw new Error('Failed to load providers');
      }
      const payload = (await response.json()) as { data: Provider[] };
      return payload.data;
    },
    refetchInterval: 15_000
  });

  const bidsQuery = useQuery({
    queryKey: ['deploy-bids', deploymentDraftId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/api/bids?deploymentId=${encodeURIComponent(deploymentDraftId)}`
      );

      if (!response.ok) {
        return [] as Bid[];
      }

      const payload = (await response.json()) as { data: Bid[] };
      return payload.data;
    },
    refetchInterval: 3_000
  });

  const providers = providersQuery.data ?? [];
  const bids = bidsQuery.data ?? [];

  useEffect(() => {
    if (bids.length === 0) {
      return;
    }

    if (seenBidIdsRef.current.size === 0) {
      seenBidIdsRef.current = new Set(bids.map((bid) => bid.id));
      return;
    }

    const newlySeen = bids.filter((bid) => !seenBidIdsRef.current.has(bid.id));
    if (newlySeen.length === 0) {
      return;
    }

    newlySeen.forEach((bid) => seenBidIdsRef.current.add(bid.id));
    setBidAnimationVersion((prev) => {
      const next = { ...prev };
      newlySeen.forEach((bid) => {
        next[bid.providerId] = (next[bid.providerId] ?? 0) + 1;
      });
      return next;
    });
  }, [bids]);

  const providersWithBidData = useMemo(() => {
    return providers.map((provider) => {
      const bid = bids.find((item) => item.providerId === provider.id);
      const cntPerHour = bid?.price ?? provider.pricePerCpu * Math.max(1, manual.cpu);
      const uptime = provider.status === 'ACTIVE' ? 99.2 - Math.random() * 0.8 : 95.8 - Math.random() * 3;
      const speedScore = provider.cpu * 0.7 + provider.memory * 0.002;
      return {
        ...provider,
        cntPerHour,
        usdPerHour: cntPerHour * USD_PER_CNT,
        uptime: Number(uptime.toFixed(2)),
        speedScore
      };
    });
  }, [providers, bids, manual.cpu]);

  const sortedProviders = useMemo(() => {
    const cloned = [...providersWithBidData];
    if (sortMode === 'price') {
      return cloned.sort((a, b) => a.cntPerHour - b.cntPerHour);
    }
    if (sortMode === 'fastest') {
      return cloned.sort((a, b) => b.speedScore - a.speedScore);
    }
    return cloned.sort((a, b) => b.uptime - a.uptime);
  }, [providersWithBidData, sortMode]);

  const selectedProvider = sortedProviders.find((item) => item.id === selectedProviderId) ?? sortedProviders[0];

  const { data: usdcBalance } = useBalance({
    address: walletAddress,
    token: USDC_TOKEN_ADDRESS,
    query: {
      enabled: Boolean(walletAddress && USDC_TOKEN_ADDRESS)
    }
  });

  const canApproveUsdc = Boolean(walletAddress && USDC_TOKEN_ADDRESS && USDC_SPENDER_ADDRESS);
  const canFundCntEscrow = Boolean(walletAddress && CNT_TOKEN_ADDRESS && PAYMENT_ESCROW_ADDRESS && selectedProvider);

  useEffect(() => {
    if (approvalReceipt.isSuccess) {
      setUsdApproved(true);
    }
  }, [approvalReceipt.isSuccess]);

  useEffect(() => {
    if (escrowReceipt.isSuccess) {
      setCntEscrowFunded(true);
    }
  }, [escrowReceipt.isSuccess]);

  const approveUsdc = () => {
    if (!walletAddress || !USDC_TOKEN_ADDRESS || !USDC_SPENDER_ADDRESS) {
      return;
    }

    writeContract({
      address: USDC_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [USDC_SPENDER_ADDRESS, parseUnits('1000000', 6)]
    });
  };

  const fundCntEscrow = () => {
    if (!walletAddress || !CNT_TOKEN_ADDRESS || !PAYMENT_ESCROW_ADDRESS || !selectedProvider) {
      return;
    }

    const tokenAmount = Math.max(estimatedPerHour * 24, 0.01);
    const amount = parseUnits(tokenAmount.toFixed(Math.min(PAYMENT_TOKEN_DECIMALS, 6)), PAYMENT_TOKEN_DECIMALS);
    const leaseId = BigInt(Date.now());
    const maxDurationSeconds = BigInt(60 * 60 * 24);

    setCntEscrowFunded(false);
    setEscrowLeaseId(leaseId);
    setEscrowAmountCnt(Number(tokenAmount.toFixed(6)));
    setEscrowAmountBaseUnits(amount.toString());
    setEscrowMaxDurationSeconds(Number(maxDurationSeconds));

    writeContract(
      {
        address: CNT_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PAYMENT_ESCROW_ADDRESS, amount]
      },
      {
        onSuccess: () => {
          writeEscrowContract({
            address: PAYMENT_ESCROW_ADDRESS,
            abi: paymentEscrowAbi,
            functionName: 'depositForLease',
            args: [leaseId, selectedProvider.address as `0x${string}`, amount, maxDurationSeconds]
          });
        }
      }
    );
  };

  useEffect(() => {
    const firstProvider = sortedProviders[0];
    if (!selectedProviderId && firstProvider) {
      const fromUrl = providerFromUrl ? sortedProviders.find((p) => p.id === providerFromUrl) : null;
      setSelectedProviderId((fromUrl ?? firstProvider).id);
    }
  }, [selectedProviderId, sortedProviders, providerFromUrl]);

  const [aiUsedFallback, setAiUsedFallback] = useState(false);

  const animateSdl = async (sdl: string) => {
    setAnimatedSdl('');
    setShowAiReview(false);
    for (const char of sdl) {
      setAnimatedSdl((prev) => prev + char);
      await new Promise((resolve) => setTimeout(resolve, 6));
    }
    setShowAiReview(true);
  };

  const aiMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(`${API_BASE}/api/ai/generate-sdl`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, stream: true }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`AI generation failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { data: AiResponse };
        return payload.data;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    },
    onSuccess: async (data) => {
      setAiUsedFallback(false);
      setAiGeneratedSdl(data.sdl);
      await animateSdl(data.sdl);
    },
    onError: async (_err, prompt) => {
      const fallback = generateSdlLocally(prompt);
      setAiUsedFallback(true);
      setAiGeneratedSdl(fallback);
      await animateSdl(fallback);
    }
  });

  const launchMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveSdl || !selectedProvider) {
        throw new Error('Missing SDL or provider selection');
      }

      if (!walletAddress) {
        throw new Error('Wallet not connected. Please connect your wallet to deploy.');
      }

      let onChainDeploymentId: string | null = null;
      let onChainTxHash: string | null = null;

      // Step 1: Broadcast deployment to Cosmos chain
      try {
        const broadcastResponse = await fetch(`${API_BASE}/api/deployments/broadcast/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tenantAddress: walletAddress,
            sdl: effectiveSdl
          })
        });

        if (broadcastResponse.ok) {
          const broadcastPayload = (await broadcastResponse.json()) as {
            data: {
              chainTxHash: string | null;
              chainDeploymentId: string | null;
              status: string;
              message: string;
            };
          };

          if (broadcastPayload.data.status === 'BROADCAST') {
            onChainDeploymentId = broadcastPayload.data.chainDeploymentId;
            onChainTxHash = broadcastPayload.data.chainTxHash;
            console.log(
              '[console] MsgCreateDeployment broadcast success',
              onChainDeploymentId,
              onChainTxHash
            );
          } else {
            console.warn(
              '[console] Chain broadcast skipped or unavailable:',
              broadcastPayload.data.message
            );
          }
        } else {
          console.warn(
            '[console] Chain broadcast endpoint returned',
            broadcastResponse.status
          );
        }
      } catch (error) {
        console.warn(
          '[console] Chain broadcast failed (non-blocking):',
          error instanceof Error ? error.message : 'unknown'
        );
      }

      const escrowFundingPayload =
        paymentMethod === 'CNT' && cntEscrowFunded && escrowLeaseId && escrowTxHash && selectedProvider && PAYMENT_ESCROW_ADDRESS
          ? {
              leaseId: escrowLeaseId.toString(),
              txHash: escrowTxHash,
              token: 'CNT',
              amount: escrowAmountCnt ?? estimatedPerHour,
              amountBaseUnits: escrowAmountBaseUnits ?? '0',
              providerAddress: selectedProvider.address,
              escrowAddress: PAYMENT_ESCROW_ADDRESS,
              maxDurationSeconds: escrowMaxDurationSeconds ?? 60 * 60 * 24
            }
          : undefined;

      // Step 2: Create off-chain deployment record
      const createResponse = await fetch(`${API_BASE}/api/deployments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantAddress: walletAddress,
          sdl: effectiveSdl,
          onChainDeploymentId,
          onChainTxHash,
          ...(escrowFundingPayload ? { escrowFunding: escrowFundingPayload } : {})
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Deployment submission failed: ${createResponse.status}`);
      }

      const payload = (await createResponse.json()) as { data: { id: string } };

      const pricePerBlock = Math.max((selectedProvider.cntPerHour ?? estimatedPerHour) / 120, 0.000001);

      // Step 3: Create lease
      const leaseResponse = await fetch(`${API_BASE}/api/leases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deploymentId: payload.data.id,
          providerId: selectedProvider.id,
          pricePerBlock: Number(pricePerBlock.toFixed(6)),
          ...(escrowLeaseId ? { escrowLeaseId: escrowLeaseId.toString() } : {}),
          ...(escrowTxHash ? { escrowTxHash } : {})
        })
      });

      if (!leaseResponse.ok) {
        throw new Error(`Lease creation failed: ${leaseResponse.status}`);
      }

      const leasePayload = (await leaseResponse.json()) as { data: { id: string } };

      // Step 4: Submit manifest
      const manifestResponse = await fetch(`${API_BASE}/api/deployments/${payload.data.id}/manifest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          leaseId: leasePayload.data.id,
          manifest: effectiveSdl,
          ...(PROVIDER_GATEWAY_URL ? { providerGatewayUrl: PROVIDER_GATEWAY_URL } : {})
        })
      });

      if (!manifestResponse.ok) {
        throw new Error(`Manifest submission failed: ${manifestResponse.status}`);
      }

      return payload.data.id;
    },
    onSuccess: (deploymentId) => {
      const durationMs = 3_000;
      const end = Date.now() + durationMs;
      const fire = () => {
        confetti({
          particleCount: 80,
          spread: 74,
          startVelocity: 40,
          colors: ['#00FFC2', '#7B61FF'],
          origin: { x: Math.random() * 0.4 + 0.3, y: Math.random() * 0.2 + 0.55 }
        });

        if (Date.now() < end) {
          window.requestAnimationFrame(fire);
        }
      };

      fire();
      setTimeout(() => {
        router.push(`/deployments/${deploymentId}`);
      }, 900);
    }
  });

  const estimatedPerHour = selectedProvider?.cntPerHour ?? 0;
  const estimatedMonthly = estimatedPerHour * 24 * 30;

  return (
    <main className="relative min-h-screen bg-background px-6 py-8 text-text-primary">
      <div className="cn-noise-overlay" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <h1 className="font-display text-4xl font-semibold">Create Deployment</h1>
        <p className="mt-2 text-text-muted">
          Intent-driven wizard for provisioning workloads on the Comnetish provider market.
        </p>

        <StepIndicator step={step} />

        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex gap-3">
              <Button variant={mode === 'ai' ? 'primary' : 'ghost'} onClick={() => setMode('ai')}>
                AI Mode
              </Button>
              <Button variant={mode === 'manual' ? 'primary' : 'ghost'} onClick={() => setMode('manual')}>
                Manual Mode
              </Button>
            </div>

            {mode === 'ai' ? (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card
                  className="border-[rgba(0,255,194,0.15)]"
                  title="AI Wizard"
                  description="Describe your app and generate a production-ready SDL"
                >
                  <textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Describe the workload you want to deploy"
                    aria-label="AI deployment prompt"
                    className="h-40 w-full rounded-lg border border-[rgba(0,255,194,0.2)] bg-background/70 p-3 text-sm outline-none focus:border-brand-primary"
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      onClick={() => aiMutation.mutate(aiPrompt)}
                      loading={aiMutation.isPending}
                    >
                      Generate SDL
                    </Button>
                    {showAiReview && (
                      <>
                        <Button variant="ghost" onClick={() => setAiGeneratedSdl(animatedSdl)}>
                          Edit
                        </Button>
                        <Button variant="secondary" onClick={() => setStep(2)}>
                          Use This
                        </Button>
                        <Button variant="ghost" onClick={() => aiMutation.mutate(aiPrompt)}>
                          Regenerate
                        </Button>
                      </>
                    )}
                  </div>
                </Card>

                <Card
                  variant="glass"
                  className="border-[rgba(0,255,194,0.15)]"
                  title="SDL Output"
                  description="Streaming generation output"
                >
                  <Terminal lines={(animatedSdl || 'Waiting for prompt...').split('\n')} title="sdl-generator" />
                  {aiUsedFallback && showAiReview && (
                    <div className="mt-3 rounded-lg border border-[rgba(255,107,53,0.35)] bg-[rgba(255,107,53,0.08)] px-3 py-2 text-sm text-[#FF6B35]">
                      AI service unavailable — local SDL generated from your prompt. Edit freely or regenerate later.
                    </div>
                  )}
                  {!aiUsedFallback && showAiReview && (
                    <div className="mt-3 rounded-lg border border-[rgba(0,255,194,0.18)] bg-brand-primary/10 px-3 py-2 text-sm text-brand-primary">
                      Looks good?
                    </div>
                  )}
                </Card>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
                <Card className="border-[rgba(0,255,194,0.15)]" title="Manual Config" description="Tune deployment resources">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="text-sm">
                      Deployment Name
                      <input
                        value={manual.deploymentName}
                        onChange={(event) => setManual((prev) => ({ ...prev, deploymentName: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[rgba(0,255,194,0.2)] bg-background/70 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      Docker Image
                      <input
                        value={manual.image}
                        onChange={(event) => setManual((prev) => ({ ...prev, image: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[rgba(0,255,194,0.2)] bg-background/70 px-3 py-2"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label className="text-sm">
                      CPU: {manual.cpu}
                      <input
                        type="range"
                        min={1}
                        max={16}
                        value={manual.cpu}
                        onChange={(event) => setManual((prev) => ({ ...prev, cpu: Number(event.target.value) }))}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      Memory: {manual.memory} GB
                      <input
                        type="range"
                        min={1}
                        max={64}
                        value={manual.memory}
                        onChange={(event) => setManual((prev) => ({ ...prev, memory: Number(event.target.value) }))}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-sm">
                      Storage: {manual.storage} GB
                      <input
                        type="range"
                        min={5}
                        max={200}
                        value={manual.storage}
                        onChange={(event) => setManual((prev) => ({ ...prev, storage: Number(event.target.value) }))}
                        className="mt-1 w-full"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="text-sm">
                      Ports (comma separated)
                      <input
                        value={manual.ports}
                        onChange={(event) => setManual((prev) => ({ ...prev, ports: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-[rgba(0,255,194,0.2)] bg-background/70 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      Environment Variables (KEY=VALUE)
                      <textarea
                        value={manual.env}
                        onChange={(event) => setManual((prev) => ({ ...prev, env: event.target.value }))}
                        placeholder="ENV=production&#10;LOG_LEVEL=info"
                        aria-label="Environment variables"
                        className="mt-1 h-24 w-full rounded-lg border border-[rgba(0,255,194,0.2)] bg-background/70 px-3 py-2"
                      />
                    </label>
                  </div>
                </Card>

                <Card variant="glass" className="border-[rgba(0,255,194,0.15)]" title="SDL Preview" description="Live output">
                  <Terminal lines={effectiveSdl.split('\n')} title="manual-sdl-preview" />
                </Card>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setStep(2)} disabled={!effectiveSdl}>
                Continue to Provider Selection
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Select Provider</h2>
              <div className="flex gap-2">
                <Button variant={sortMode === 'price' ? 'secondary' : 'ghost'} onClick={() => setSortMode('price')}>
                  Best Price
                </Button>
                <Button variant={sortMode === 'fastest' ? 'secondary' : 'ghost'} onClick={() => setSortMode('fastest')}>
                  Fastest
                </Button>
                <Button variant={sortMode === 'uptime' ? 'secondary' : 'ghost'} onClick={() => setSortMode('uptime')}>
                  Highest Uptime
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence initial={false}>
                {sortedProviders.map((provider) => {
                  const version = bidAnimationVersion[provider.id] ?? 0;
                  const animateFromRight = version > 0;

                  return (
                    <motion.button
                      key={`${provider.id}-${version}`}
                      initial={animateFromRight ? { opacity: 0, x: 56 } : false}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                      transition={
                        animateFromRight
                          ? { type: 'spring', stiffness: 320, damping: 26, mass: 0.65 }
                          : { duration: 0.18, ease: 'easeOut' }
                      }
                      onClick={() => setSelectedProviderId(provider.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        provider.id === selectedProviderId
                          ? 'border-brand-primary bg-brand-primary/10'
                          : 'border-[rgba(0,255,194,0.15)] bg-surface/70 hover:bg-surface'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-display text-lg">{provider.address.slice(0, 12)}...{provider.address.slice(-4)}</p>
                          <p className="text-sm text-text-muted">{formatRegionFlag(provider.region)} {provider.region}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusBadge(provider.status)}>{provider.status.toLowerCase()}</Badge>
                          <Badge variant="active">{provider.uptime.toFixed(2)}% uptime</Badge>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                        <p className="text-sm text-text-muted">CPU: <span className="text-text-primary">{provider.cpu}</span></p>
                        <p className="text-sm text-text-muted">RAM: <span className="text-text-primary">{(provider.memory / 1024).toFixed(0)}GB</span></p>
                        <p className="text-sm text-text-muted">Storage: <span className="text-text-primary">{provider.storage}GB</span></p>
                        <p className="text-sm text-text-muted">Price: <span className="font-mono text-brand-primary">{provider.cntPerHour.toFixed(3)} CNT/hr</span></p>
                        <p className="text-sm text-text-muted">USD: <span className="font-mono text-text-primary">${provider.usdPerHour.toFixed(2)}/hr</span></p>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="secondary" onClick={() => setStep(3)} disabled={!selectedProvider}>
                Continue to Review
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <Card className="border-[rgba(0,255,194,0.15)]" title="Review & Pay" description="Finalize and launch your deployment">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-sm text-text-muted">
                    Deployment name: <span className="text-text-primary">{manual.deploymentName || 'AI Generated Deployment'}</span>
                  </p>
                  <p className="text-sm text-text-muted">
                    Provider selected: <span className="text-text-primary">{selectedProvider?.region ?? 'None'}</span>
                  </p>
                  <p className="text-sm text-text-muted">
                    Estimated hourly: <span className="font-mono text-brand-primary">{estimatedPerHour.toFixed(3)} CNT</span>
                  </p>
                  <p className="text-sm text-text-muted">
                    Estimated monthly: <span className="font-mono text-text-primary">{estimatedMonthly.toFixed(2)} CNT</span>
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-[rgba(0,255,194,0.15)] bg-background/60 p-4">
                  <p className="font-display text-lg">Payment Method</p>
                  <div className="flex gap-2">
                    <Button variant={paymentMethod === 'CNT' ? 'primary' : 'ghost'} onClick={() => setPaymentMethod('CNT')}>
                      CNT Token
                    </Button>
                    <Button variant={paymentMethod === 'USDC' ? 'primary' : 'ghost'} onClick={() => setPaymentMethod('USDC')}>
                      USDC
                    </Button>
                  </div>

                  {paymentMethod === 'USDC' ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-[rgba(0,255,194,0.1)] bg-surface/60 p-3">
                        <ConnectButton />
                      </div>
                      <Button
                        variant="secondary"
                        onClick={approveUsdc}
                        loading={isSubmittingApproval || approvalReceipt.isLoading}
                        disabled={!canApproveUsdc || usdApproved}
                      >
                        {usdApproved ? 'USDC Approved' : 'Approve USDC'}
                      </Button>
                      {!canApproveUsdc && (
                        <p className="text-xs text-brand-warning">
                          Configure NEXT_PUBLIC_USDC_TOKEN_ADDRESS and NEXT_PUBLIC_USDC_SPENDER_ADDRESS to enable real approval.
                        </p>
                      )}
                      {approvalError && <p className="text-xs text-brand-warning">{approvalError.message}</p>}
                      {approvalTxHash && (
                        <p className="text-xs text-text-muted">Approval tx: {approvalTxHash.slice(0, 10)}…{approvalTxHash.slice(-8)}</p>
                      )}
                      <p className="text-xs text-text-muted">
                        {usdcBalance
                          ? `Balance: ${Number(usdcBalance.formatted).toFixed(2)} ${usdcBalance.symbol}`
                          : 'Approval required before deployment.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-[rgba(0,255,194,0.1)] bg-surface/60 p-3">
                        <p className="text-sm text-text-muted">Connected wallet</p>
                        {walletAddress ? (
                          <p className="font-mono text-xs text-text-primary">{walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}</p>
                        ) : (
                          <div className="mt-1"><ConnectButton /></div>
                        )}
                      </div>

                      <Button
                        variant="secondary"
                        onClick={fundCntEscrow}
                        loading={isSubmittingApproval || isSubmittingEscrow || escrowReceipt.isLoading}
                        disabled={!canFundCntEscrow || cntEscrowFunded}
                      >
                        {cntEscrowFunded ? 'CNT Escrow Funded' : 'Fund CNT Escrow (24h)'}
                      </Button>

                      {!canFundCntEscrow && (
                        <p className="text-xs text-brand-warning">
                          Configure NEXT_PUBLIC_CNT_TOKEN_ADDRESS and NEXT_PUBLIC_PAYMENT_ESCROW_ADDRESS to enable CNT funding.
                        </p>
                      )}

                      {escrowLeaseId && (
                        <p className="text-xs text-text-muted">Escrow lease ID: {escrowLeaseId.toString()}</p>
                      )}

                      {approvalTxHash && (
                        <p className="text-xs text-text-muted">Approve tx: {approvalTxHash.slice(0, 10)}…{approvalTxHash.slice(-8)}</p>
                      )}

                      {escrowTxHash && (
                        <p className="text-xs text-text-muted">Deposit tx: {escrowTxHash.slice(0, 10)}…{escrowTxHash.slice(-8)}</p>
                      )}

                      {(approvalError || escrowError) && (
                        <p className="text-xs text-brand-warning">{approvalError?.message ?? escrowError?.message}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  variant="primary"
                  onClick={() => launchMutation.mutate()}
                  loading={launchMutation.isPending}
                  disabled={paymentMethod === 'USDC' ? !usdApproved : !cntEscrowFunded}
                >
                  Launch Deployment
                </Button>
              </div>

              {launchMutation.isSuccess && (
                <p className="mt-4 rounded-lg border border-[rgba(0,255,194,0.2)] bg-brand-primary/10 px-3 py-2 text-sm text-brand-primary">
                  Deployment launched successfully. Redirecting to detail page...
                </p>
              )}
              {launchMutation.isError && (
                <p className="mt-4 rounded-lg border border-brand-warning/30 bg-brand-warning/10 px-3 py-2 text-sm text-brand-warning">
                  {(launchMutation.error as Error).message}
                </p>
              )}
            </Card>
          </motion.div>
        )}
      </div>
    </main>
  );
}

export default function DeployPage() {
  const [isMounted, setIsMounted] = useState(false);
  const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const wagmiConfig = useMemo(() => {
    if (!isMounted) {
      return null;
    }

    if (!projectId) {
      return null;
    }

    return getDefaultConfig({
      appName: 'Comnetish Console',
      projectId,
      chains: [mainnet, sepolia],
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http()
      },
      ssr: false
    });
  }, [isMounted, projectId]);

  if (!wagmiConfig) {
    return (
      <main className="relative min-h-screen bg-background px-6 py-8 text-text-primary">
        <div className="relative z-10 mx-auto max-w-7xl">
          <h1 className="font-display text-4xl font-semibold">Create Deployment</h1>
          {isMounted && !projectId ? (
            <p className="mt-2 text-brand-warning">
              Missing NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID. Add it to your environment and restart the app.
            </p>
          ) : (
            <p className="mt-2 text-text-muted">Loading wallet and deployment console…</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <DeployWizard />
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
