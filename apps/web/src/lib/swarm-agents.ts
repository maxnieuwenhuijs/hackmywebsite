export type SwarmAgentDefinition = {
  id: string;
  name: string;
  role: string;
  dot: string;
  text: string;
  border: string;
  chip: string;
  lightText: string;
  lightBorder: string;
  lightChip: string;
};

export const SWARM_AGENTS: SwarmAgentDefinition[] = [
  {
    id: "mapper",
    name: "Mapper",
    role: "Surface mapping",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    border: "border-emerald-400",
    chip: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
    lightText: "text-emerald-700",
    lightBorder: "border-emerald-500",
    lightChip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    id: "authz",
    name: "Authz",
    role: "Access control",
    dot: "bg-sky-400",
    text: "text-sky-300",
    border: "border-sky-400",
    chip: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    lightText: "text-sky-700",
    lightBorder: "border-sky-500",
    lightChip: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    id: "injector",
    name: "Injector",
    role: "Input and injection",
    dot: "bg-amber-300",
    text: "text-amber-200",
    border: "border-amber-300",
    chip: "border-amber-300/30 bg-amber-300/10 text-amber-100",
    lightText: "text-amber-700",
    lightBorder: "border-amber-500",
    lightChip: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    id: "chain",
    name: "Chain",
    role: "Attack paths",
    dot: "bg-fuchsia-400",
    text: "text-fuchsia-300",
    border: "border-fuchsia-400",
    chip: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200",
    lightText: "text-fuchsia-700",
    lightBorder: "border-fuchsia-500",
    lightChip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  },
  {
    id: "exploiter",
    name: "Exploiter",
    role: "Impact proof",
    dot: "bg-violet-400",
    text: "text-violet-300",
    border: "border-violet-400",
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-200",
    lightText: "text-violet-700",
    lightBorder: "border-violet-500",
    lightChip: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    id: "reporter",
    name: "Reporter",
    role: "Evidence and narrative",
    dot: "bg-orange-300",
    text: "text-orange-200",
    border: "border-orange-300",
    chip: "border-orange-300/30 bg-orange-300/10 text-orange-100",
    lightText: "text-orange-700",
    lightBorder: "border-orange-500",
    lightChip: "border-orange-200 bg-orange-50 text-orange-800",
  },
];

export function getSwarmAgent(id: string | null | undefined): SwarmAgentDefinition {
  return SWARM_AGENTS.find((agent) => agent.id === id) ?? SWARM_AGENTS[0];
}

export type SwarmThought = {
  id: string;
  seq: number;
  agent: string;
  text: string;
  important: boolean;
  tag: string | null;
  createdAt: string;
};

export function thoughtFromEvent(event: {
  id: string;
  seq: number;
  payload: unknown;
  createdAt: Date;
}): SwarmThought | null {
  if (!event.payload || typeof event.payload !== "object") return null;
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.text !== "string" || !payload.text.trim()) return null;
  return {
    id: event.id,
    seq: event.seq,
    agent: typeof payload.agent === "string" ? payload.agent : "mapper",
    text: payload.text.trim(),
    important: payload.important === true,
    tag: typeof payload.tag === "string" ? payload.tag : null,
    createdAt: event.createdAt.toISOString(),
  };
}
