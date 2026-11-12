"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { getSwarmAgent, SWARM_AGENTS, type SwarmThought } from "@/lib/swarm-agents";

export function SwarmThinking({
  runId,
  initialThoughts,
  initialStatus,
}: {
  runId: string;
  initialThoughts: SwarmThought[];
  initialStatus: string;
}) {
  const [thoughts, setThoughts] = useState(initialThoughts);
  const [active, setActive] = useState(initialStatus === "QUEUED" || initialStatus === "RUNNING");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const known = useRef(new Set(initialThoughts.map((thought) => thought.id)));
  const router = useRouter();
  const lastStatus = useRef<string>(initialStatus);
  const latest = thoughts.at(-1);
  const latestAgent = latest ? getSwarmAgent(latest.agent) : null;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/assessments/${runId}/events`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const data = (await response.json()) as { events?: SwarmThought[]; status?: string };
        if (cancelled) return;
        setError(false);
        let changed = false;
        if (Array.isArray(data.events)) {
          const next = data.events.filter((thought) => !known.current.has(thought.id));
          if (next.length > 0) {
            next.forEach((thought) => known.current.add(thought.id));
            setThoughts((current) => [...current, ...next]);
            changed = true;
          }
        }
        if (data.status && data.status !== lastStatus.current) {
          lastStatus.current = data.status;
          changed = true;
          if (data.status !== "RUNNING" && data.status !== "QUEUED") setActive(false);
        }
        if (changed) router.refresh();
      } catch {
        if (!cancelled) setError(true);
      }
    };
    const timer = window.setInterval(load, 3_500);
    void load();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, runId, router]);

  return (
    <section className="overflow-hidden rounded-[2px] border border-slate-200 bg-white text-slate-900 shadow-sm" aria-label="Swarm thinking">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-blue-700">
            <Icon name="psychology" size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Swarm thinking</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Curated operator notes, not raw model reasoning.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">{thoughts.length} notes</span>
          {active ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              live
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">archive</span>
          )}
          {latest?.important ? (
            <span className="inline-flex items-center gap-1 rounded-[2px] border border-red-300 bg-red-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-red-700">
              <Icon name="warning" size={11} />
              warning
            </span>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={`swarm-notes-${runId}`}
          >
            {open ? "Collapse" : "Expand"}
            <Icon name={open ? "expand_less" : "expand_more"} size={16} />
          </button>
        </div>
      </div>

      {open ? (
        <div id={`swarm-notes-${runId}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 px-4 py-2.5 text-[10px] sm:px-5">
            {SWARM_AGENTS.map((agent) => (
              <span key={agent.id} className="inline-flex items-center gap-1.5 text-slate-500">
                <span className={`h-1.5 w-1.5 rounded-full ${agent.dot}`} />
                <span className={agent.lightText}>{agent.name}</span>
              </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-1.5 text-red-700">
              <Icon name="warning" size={12} />
              warning label
            </span>
          </div>

          {thoughts.length === 0 ? (
            <div className="px-4 py-10 text-center text-slate-500 sm:px-5">
              <p className="text-sm">Waiting for the first notes from the swarm.</p>
              {error ? <p className="mt-2 text-xs text-red-700">Could not refresh the stream. Pull the page to retry.</p> : null}
            </div>
          ) : (
            <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {thoughts.map((thought) => {
                const agent = getSwarmAgent(thought.agent);
                const important = thought.important;
                return (
                  <article
                    key={thought.id}
                    className={`flex gap-3 border-l-2 px-4 py-3.5 sm:px-5 ${
                      important ? "border-red-500 bg-red-50/70" : `${agent.lightBorder} bg-white`
                    }`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${important ? "bg-red-500" : agent.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${agent.lightText}`}>{agent.name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{agent.role}</span>
                        {thought.tag && !(important && thought.tag === "warning") ? (
                          <span className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${agent.lightChip}`}>{thought.tag}</span>
                        ) : null}
                        {important ? (
                          <span className="inline-flex items-center gap-1 rounded-[2px] border border-red-300 bg-red-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-red-700">
                            <Icon name="warning" size={11} />
                            warning
                          </span>
                        ) : null}
                        <time className="ml-auto font-mono text-[9px] text-slate-400" dateTime={thought.createdAt}>
                          {new Date(thought.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </time>
                      </div>
                      <p className={`mt-1.5 text-sm leading-6 ${important ? "font-medium text-red-800 underline decoration-red-400 underline-offset-4" : "text-slate-700"}`}>
                        {thought.text}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {error && thoughts.length > 0 ? (
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-red-700 sm:px-5">Stream refresh failed. Pull the page to retry.</p>
          ) : null}
          {active ? <p className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 sm:px-5">Updates every few seconds while the run is active.</p> : null}
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={`swarm-notes-${runId}`}
        >
          {latest && latestAgent ? (
            <>
              <span className={`h-2 w-2 shrink-0 rounded-full ${latest.important ? "bg-red-500" : latestAgent.dot}`} />
              <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${latestAgent.lightText}`}>{latestAgent.name}</span>
              {latest.important ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-red-300 bg-red-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-red-700">
                  <Icon name="warning" size={10} />
                  warning
                </span>
              ) : null}
              <span className={`min-w-0 flex-1 truncate text-xs ${latest.important ? "text-red-800 underline decoration-red-400 underline-offset-2" : "text-slate-600"}`}>{latest.text}</span>
            </>
          ) : (
            <span className="flex-1 text-xs text-slate-500">Waiting for the first notes from the swarm.</span>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-500">Read notes <Icon name="expand_more" size={15} /></span>
        </button>
      )}
    </section>
  );
}
