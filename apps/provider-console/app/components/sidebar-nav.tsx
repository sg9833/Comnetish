"use client";

import { useEffect, useMemo, useState } from 'react';

const sidebarItems = [
  { label: 'Dashboard', href: '#dashboard' },
  { label: 'Active Leases', href: '#active-leases' },
  { label: 'Earnings', href: '#earnings' },
  { label: 'Resources', href: '#resources' },
  { label: 'Settings', href: '#settings' }
];

export function SidebarNav() {
  const sectionIds = useMemo(() => sidebarItems.map((item) => item.href.replace('#', '')), []);
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? 'dashboard');

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0) {
          setActiveSection(visible[0]!.target.id);
        }
      },
      {
        root: null,
        rootMargin: '-24% 0px -56% 0px',
        threshold: [0.1, 0.2, 0.4, 0.6]
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
  }, [sectionIds]);

  return (
    <aside className="h-full rounded-2xl border border-white/10 bg-[#111827] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)] lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Comnetish</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Provider Node</h2>
      </div>

      <nav className="space-y-2" aria-label="Sidebar">
        {sidebarItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={[
              'block rounded-xl px-4 py-3 text-sm transition-colors',
              activeSection === item.href.replace('#', '')
                ? 'bg-[#3B82F6]/20 text-[#93C5FD]'
                : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
            ].join(' ')}
            aria-current={activeSection === item.href.replace('#', '') ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
