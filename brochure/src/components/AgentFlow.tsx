import { useMemo } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Globe,
  MonitorSmartphone,
  Bot,
  Cpu,
  AlertTriangle,
  Lock,
  Accessibility,
  Zap,
  Eye,
  KeyRound,
  ShieldCheck,
  Search,
  Bug,
  FileText,
  LayoutDashboard,
  Download,
  Share2,
  type LucideIcon,
} from 'lucide-react';

// ── Custom node ────────────────────────────────────────────────────────────

interface FlowNodeData {
  label: string;
  sublabel?: string;
  icon: LucideIcon;
  accent: string;
  hasInput?: boolean;
  hasOutput?: boolean;
}

function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const Icon = data.icon;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 168,
        padding: '10px 14px',
        borderRadius: 12,
        background: 'rgba(24, 24, 27, 0.92)',
        border: `1px solid ${data.accent}55`,
        boxShadow: `0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px -12px ${data.accent}aa`,
        backdropFilter: 'blur(6px)',
      }}
    >
      {data.hasInput !== false && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: data.accent, width: 7, height: 7, border: 'none' }}
        />
      )}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          background: `linear-gradient(135deg, ${data.accent}, ${data.accent}99)`,
        }}
      >
        <Icon size={18} color="#0b0b12" strokeWidth={2.4} />
      </div>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>{data.label}</div>
        {data.sublabel && (
          <div style={{ fontSize: 10.5, color: '#a1a1aa', marginTop: 2 }}>{data.sublabel}</div>
        )}
      </div>
      {data.hasOutput !== false && (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: data.accent, width: 7, height: 7, border: 'none' }}
        />
      )}
    </div>
  );
}

const nodeTypes = { flow: FlowNode };

// ── Graph definition ─────────────────────────────────────────────────────────

interface DetectorDef {
  id: string;
  label: string;
  icon: LucideIcon;
  accent: string;
}

const detectors: DetectorDef[] = [
  { id: 'd-network', label: 'Network', icon: AlertTriangle, accent: '#fb923c' },
  { id: 'd-security', label: 'Security', icon: Lock, accent: '#f87171' },
  { id: 'd-a11y', label: 'Accessibility', icon: Accessibility, accent: '#c084fc' },
  { id: 'd-perf', label: 'Performance', icon: Zap, accent: '#facc15' },
  { id: 'd-race', label: 'Race Conditions', icon: Eye, accent: '#22d3ee' },
  { id: 'd-auth', label: 'Authentication', icon: KeyRound, accent: '#4ade80' },
  { id: 'd-valid', label: 'Validation', icon: ShieldCheck, accent: '#f472b6' },
  { id: 'd-seo', label: 'SEO & Meta', icon: Search, accent: '#2dd4bf' },
];

const DETECTOR_X = 980;
const DETECTOR_Y0 = 0;
const DETECTOR_GAP = 70;

function buildNodes(): Node<FlowNodeData>[] {
  const spine: Node<FlowNodeData>[] = [
    {
      id: 'url',
      type: 'flow',
      position: { x: 0, y: 245 },
      data: { label: 'Target URL', sublabel: 'Your web app', icon: Globe, accent: '#60a5fa', hasInput: false },
    },
    {
      id: 'browser',
      type: 'flow',
      position: { x: 250, y: 245 },
      data: { label: 'Playwright Browser', sublabel: 'Headless Chromium', icon: MonitorSmartphone, accent: '#38bdf8' },
    },
    {
      id: 'agent',
      type: 'flow',
      position: { x: 500, y: 245 },
      data: { label: 'AI Agent Explorer', sublabel: 'LLM-driven navigation', icon: Bot, accent: '#a78bfa' },
    },
    {
      id: 'engine',
      type: 'flow',
      position: { x: 740, y: 245 },
      data: { label: 'Detector Engine', sublabel: 'Runs 8 analyzers', icon: Cpu, accent: '#f472b6' },
    },
  ];

  const detectorNodes: Node<FlowNodeData>[] = detectors.map((d, i) => ({
    id: d.id,
    type: 'flow',
    position: { x: DETECTOR_X, y: DETECTOR_Y0 + i * DETECTOR_GAP },
    data: { label: d.label, icon: d.icon, accent: d.accent },
  }));

  const tail: Node<FlowNodeData>[] = [
    {
      id: 'aggregator',
      type: 'flow',
      position: { x: 1280, y: 245 },
      data: { label: 'Bug Aggregator', sublabel: 'Dedup + severity', icon: Bug, accent: '#fb7185' },
    },
    {
      id: 'report',
      type: 'flow',
      position: { x: 1530, y: 245 },
      data: { label: 'Report Builder', sublabel: 'Evidence + repro', icon: FileText, accent: '#60a5fa' },
    },
    {
      id: 'out-dash',
      type: 'flow',
      position: { x: 1790, y: 120 },
      data: { label: 'Dashboard', sublabel: 'Live results', icon: LayoutDashboard, accent: '#a78bfa', hasOutput: false },
    },
    {
      id: 'out-export',
      type: 'flow',
      position: { x: 1790, y: 245 },
      data: { label: 'PDF / CSV', sublabel: 'Shareable export', icon: Download, accent: '#34d399', hasOutput: false },
    },
    {
      id: 'out-integrations',
      type: 'flow',
      position: { x: 1790, y: 370 },
      data: { label: 'Jira / Slack', sublabel: 'Auto-file tickets', icon: Share2, accent: '#fbbf24', hasOutput: false },
    },
  ];

  return [...spine, ...detectorNodes, ...tail];
}

function buildEdges(): Edge[] {
  const spine: Edge[] = [
    { id: 'e-url-browser', source: 'url', target: 'browser' },
    { id: 'e-browser-agent', source: 'browser', target: 'agent' },
    { id: 'e-agent-engine', source: 'agent', target: 'engine' },
    { id: 'e-agg-report', source: 'aggregator', target: 'report' },
    { id: 'e-report-dash', source: 'report', target: 'out-dash' },
    { id: 'e-report-export', source: 'report', target: 'out-export' },
    { id: 'e-report-int', source: 'report', target: 'out-integrations' },
  ].map((e) => ({ ...e, animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.6 } }));

  const fanOut: Edge[] = detectors.map((d) => ({
    id: `e-engine-${d.id}`,
    source: 'engine',
    target: d.id,
    animated: true,
    style: { stroke: `${d.accent}aa`, strokeWidth: 1.4 },
  }));

  const fanIn: Edge[] = detectors.map((d) => ({
    id: `e-${d.id}-agg`,
    source: d.id,
    target: 'aggregator',
    animated: true,
    style: { stroke: `${d.accent}66`, strokeWidth: 1.2 },
  }));

  return [...spine, ...fanOut, ...fanIn];
}

// ── Component ────────────────────────────────────────────────────────────────

/** The interactive pipeline canvas. Designed to sit inside a `.frame`. */
export function AgentFlowCanvas() {
  const nodes = useMemo(buildNodes, []);
  const edges = useMemo(buildEdges, []);

  return (
    <div className="flow-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.14 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesConnectable={false}
        edgesFocusable={false}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#27272a" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as FlowNodeData)?.accent ?? '#3b82f6'}
          maskColor="rgba(9, 9, 11, 0.7)"
          style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </ReactFlow>
    </div>
  );
}
