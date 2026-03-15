'use client';

import { useEffect, useRef } from 'react';

interface Region {
  id: string;
  label: string;
  x: number; // 0–100 percent of canvas width
  y: number; // 0–100 percent of canvas height
}

const REGIONS: Region[] = [
  { id: 'us-east-1', label: 'US East', x: 22, y: 42 },
  { id: 'us-west-2', label: 'US West', x: 11, y: 37 },
  { id: 'eu-west-1', label: 'EU West', x: 47, y: 30 },
  { id: 'eu-central-1', label: 'EU Central', x: 53, y: 27 },
  { id: 'ap-southeast-1', label: 'AP SE', x: 79, y: 54 },
  { id: 'ap-northeast-1', label: 'AP NE', x: 84, y: 35 },
  { id: 'ap-south-1', label: 'AP South', x: 68, y: 48 },
  { id: 'sa-east-1', label: 'SA East', x: 28, y: 67 },
];

const CONNECTIONS: [string, string][] = [
  ['us-east-1', 'eu-west-1'],
  ['us-east-1', 'us-west-2'],
  ['eu-west-1', 'eu-central-1'],
  ['eu-central-1', 'ap-south-1'],
  ['ap-south-1', 'ap-southeast-1'],
  ['ap-southeast-1', 'ap-northeast-1'],
  ['us-west-2', 'ap-northeast-1'],
  ['sa-east-1', 'us-east-1'],
  ['eu-west-1', 'ap-south-1'],
];

function quadBezierPoint(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

interface NetworkMapProps {
  activeRegion?: string;
  className?: string;
}

export function NetworkMap({ activeRegion, className = '' }: NetworkMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Use a ref so the animation loop always reads the latest value without restarting
  const activeRegionRef = useRef<string | undefined>(activeRegion);

  useEffect(() => {
    activeRegionRef.current = activeRegion;
  }, [activeRegion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf: number;
    let tick = 0;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas || !ctx) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener('resize', resize);

    // Pre-build per-connection packet state (stable, not recreated on each frame)
    const packetState = CONNECTIONS.map((_, i) => [
      { t: (i * 0.37) % 1, speed: 0.0007 + i * 0.00008 },
      { t: ((i * 0.37) + 0.5) % 1, speed: 0.0007 + i * 0.00008 },
    ]);

    const regionMap = new Map<string, Region>(REGIONS.map(r => [r.id, r]));

    function draw() {
      if (!canvas || !ctx) return;
      tick++;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      ctx.clearRect(0, 0, W, H);

      // — Subtle dot grid background —
      ctx.fillStyle = 'rgba(59,130,246,0.07)';
      for (let gx = 10; gx < W; gx += 22) {
        for (let gy = 10; gy < H; gy += 22) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // — Subtle equator / tropics lines —
      const lines = [H * 0.45, H * 0.32, H * 0.58]; // equator, tropic of cancer, capricorn
      lines.forEach((ly, i) => {
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(W, ly);
        ctx.strokeStyle = i === 0 ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // — Draw connection lines + animated packets —
      CONNECTIONS.forEach(([fromId, toId], ci) => {
        const from = regionMap.get(fromId);
        const to = regionMap.get(toId);
        if (!from || !to) return;

        const fx = (from.x / 100) * W;
        const fy = (from.y / 100) * H;
        const tx = (to.x / 100) * W;
        const ty = (to.y / 100) * H;

        // Arc the control point upward
        const cpx = (fx + tx) / 2;
        const cpy = Math.min(fy, ty) - Math.abs(tx - fx) * 0.22;
        const cp: [number, number] = [cpx, cpy];

        // Line
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(cpx, cpy, tx, ty);
        ctx.strokeStyle = 'rgba(59,130,246,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Packets
        const packets = packetState[ci];
        if (!packets) return;
        packets.forEach(pkt => {
          pkt.t = (pkt.t + pkt.speed) % 1;
          const [px, py] = quadBezierPoint(pkt.t, [fx, fy], cp, [tx, ty]);

          // Outer glow
          const grad = ctx.createRadialGradient(px, py, 0, px, py, 7);
          grad.addColorStop(0, 'rgba(147,197,253,0.85)');
          grad.addColorStop(1, 'rgba(59,130,246,0)');
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          // Core dot
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(186,230,253,0.95)';
          ctx.fill();
        });
      });

      // — Draw nodes —
      REGIONS.forEach(region => {
        const rx = (region.x / 100) * W;
        const ry = (region.y / 100) * H;
        const isActive = activeRegionRef.current === region.id;
        const phaseOffset = region.x * 0.1 + region.y * 0.07;

        // Outer pulse ring (animated)
        const pulseR = (isActive ? 14 : 10) + Math.sin(tick * 0.04 + phaseOffset) * 3;
        const pulseAlpha = isActive
          ? 0.45 + Math.sin(tick * 0.04 + phaseOffset) * 0.15
          : 0.14 + Math.sin(tick * 0.04 + phaseOffset) * 0.06;

        ctx.beginPath();
        ctx.arc(rx, ry, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(59,130,246,${pulseAlpha})`;
        ctx.lineWidth = isActive ? 1.5 : 1;
        ctx.stroke();

        // Node ring
        ctx.beginPath();
        ctx.arc(rx, ry, isActive ? 7 : 5, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? 'rgba(147,197,253,0.95)' : 'rgba(59,130,246,0.55)';
        ctx.lineWidth = isActive ? 2 : 1.5;
        ctx.stroke();

        // Node fill
        if (isActive) {
          const nodeGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, 7);
          nodeGrad.addColorStop(0, 'rgba(186,230,253,1)');
          nodeGrad.addColorStop(1, 'rgba(59,130,246,0.6)');
          ctx.beginPath();
          ctx.arc(rx, ry, 5, 0, Math.PI * 2);
          ctx.fillStyle = nodeGrad;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(rx, ry, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(59,130,246,0.75)';
          ctx.fill();
        }

        // Label
        ctx.font = isActive ? 'bold 11px ui-sans-serif,system-ui,sans-serif' : '10px ui-sans-serif,system-ui,sans-serif';
        ctx.fillStyle = isActive ? 'rgba(147,197,253,1)' : 'rgba(148,163,184,0.75)';
        ctx.textAlign = 'center';
        ctx.fillText(region.label, rx, ry + 20);
      });

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []); // run once; activeRegion is read via ref

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
      aria-label="Provider network map"
    />
  );
}

export { REGIONS };
