// builder/src/components/scorecards/MotionSankeyChart.jsx
// ECharts Sankey for the Motion Funnel scorecard.
// Props: jointRows (raw joint-distribution rows), goal ('convert' | 'paid'), total (trial count).
// Handles: trajectory-focus highlighting, click-to-pin, default focus on goal node.

import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import EChart, { ChartErrorBoundary } from '../EChart';
import { toSankey, goalNodeName } from '../../lib/motionFunnelTransform';

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MotionSankeyChart({ jointRows = [], goal = 'paid', total = 0 }) {
  const echartsRef = useRef(null);
  const [pinnedNode, setPinnedNode] = useState(null);

  const { nodes, links } = useMemo(
    () => toSankey(jointRows, goal),
    [jointRows, goal],
  );

  // Build the ECharts option
  const option = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      triggerOn: 'mousemove',
      backgroundColor: '#ffffff',
      borderColor: '#e2e5e9',
      textStyle: {
        color: '#374151',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
      },
      formatter(params) {
        const v = params.value ?? 0;
        const p = pct(v, total);
        if (params.dataType === 'edge') {
          // Link: source → target
          const src = params.data.source;
          const tgt = params.data.target;
          return `${src} → <b>${tgt}</b><br/><b>${v.toLocaleString()}</b> · ${p}% of trials`;
        }
        // Node
        const name = params.data.name ?? params.name;
        return `<b>${name}</b><br/>${v.toLocaleString()} · ${p}% of trials`;
      },
    },
    series: [
      {
        type: 'sankey',
        left: 12,
        right: 158,
        top: 16,
        bottom: 16,
        nodeWidth: 14,
        nodeGap: 11,
        draggable: false,
        emphasis: {
          focus: 'trajectory',
        },
        data: nodes,
        links,
        lineStyle: {
          color: 'gradient',
          opacity: 0.36,
          curveness: 0.5,
        },
        label: {
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11.5,
          fontWeight: 600,
          color: '#1a1a1a',
          formatter(params) {
            return `${params.name} · ${(params.value ?? 0).toLocaleString()}`;
          },
        },
      },
    ],
  }), [nodes, links, total]);

  // Dispatch highlight for a given node name via the EChart ref.
  const focusNode = useCallback((name) => {
    const inst = echartsRef.current?.getEchartsInstance();
    if (!inst) return;
    inst.dispatchAction({ type: 'downplay', seriesIndex: 0 });
    if (name) {
      inst.dispatchAction({ type: 'highlight', seriesIndex: 0, name });
    }
  }, []); // echartsRef is a stable ref object — no deps needed

  // Reset pinned node when goal changes so stale focus doesn't survive a goal switch.
  useEffect(() => { setPinnedNode(null); }, [goal]);

  // On mount and whenever goal / jointRows / pinnedNode change, focus the
  // correct node. Run in a rAF so ECharts has finished its render pass.
  useEffect(() => {
    const target = pinnedNode ?? goalNodeName(goal);
    const raf = requestAnimationFrame(() => focusNode(target));
    return () => cancelAnimationFrame(raf);
  }, [goal, jointRows, nodes, links, pinnedNode, focusNode]);

  // Click handler: pin focus to clicked node, or reset to goal on blank click.
  const handleClick = useCallback((params) => {
    if (params.dataType === 'node' || params.dataType === 'edge') {
      const name = params.dataType === 'node'
        ? (params.data?.name ?? params.name)
        : null; // edge click: reset to goal

      const next = name ?? goalNodeName(goal);
      setPinnedNode(name ?? null);
      focusNode(next);
    } else {
      // Background click → reset
      setPinnedNode(null);
      focusNode(goalNodeName(goal));
    }
  }, [goal, focusNode]);

  if (total === 0 || jointRows.length === 0) {
    return (
      <div style={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
        No data for this window.
      </div>
    );
  }

  return (
    <ChartErrorBoundary>
      <EChart
        ref={echartsRef}
        option={option}
        style={{ height: 480, width: '100%' }}
        onEvents={{ click: handleClick }}
      />
    </ChartErrorBoundary>
  );
}
