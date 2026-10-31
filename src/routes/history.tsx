import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, History, Trophy } from "lucide-react";
import { toast } from "sonner";
import { loadHistory, type HistoryRow } from "@/lib/db";
import { NeuButton, PageShell, TeamDot } from "@/components/neu";
import { playClick } from "@/lib/sound";
import {
  economy,
  oversText,
  replayMatch,
  runRate,
  strikeRate,
  type InningsState,
} from "@/lib/engine";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Match History — Live Scoring" },
      {
        name: "description",
        content: "Review saved local match results, scorecards, and over-by-over histories.",
      },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const nav = useNavigate();
  const [matches, setMatches] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedInning, setSelectedInning] = useState<0 | 1>(0);

  useEffect(() => {
    let active = true;
    loadHistory()
      .then((rows) => {
        if (active) setMatches(rows);
      })
      .catch((error: unknown) => {
        console.error("Could not load match history from Supabase.", error);
        toast.error(
          `Couldn't load match history: ${error instanceof Error ? error.message : "Supabase request failed"}`,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell>
      <header className="mb-6 flex items-center gap-3">
        <NeuButton size="icon" onClick={() => nav({ to: "/" })} aria-label="Back to home">
          <ArrowLeft className="h-5 w-5" />
        </NeuButton>
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">
            Saved in Supabase
          </p>
          <h1 className="text-2xl font-bold">Match History</h1>
        </div>
      </header>

      {loading ? (
        <div className="neu p-8 text-center text-sm text-muted-foreground">
          Loading match history…
        </div>
      ) : matches.length === 0 ? (
        <div className="neu flex flex-col items-center px-6 py-12 text-center">
          <History className="mb-4 h-10 w-10 text-primary" />
          <h2 className="font-display text-xl font-bold">No matches yet</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Completed matches saved to Supabase will appear here.
          </p>
          <NeuButton variant="solid" className="mt-6" onClick={() => nav({ to: "/setup" })}>
            Start a match
          </NeuButton>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {matches.map((saved) => {
            const match = replayMatch(saved.setup, saved.events);
            const open = expanded === saved.id;
            const first = match.innings[0];
            const second = match.innings[1];
            return (
              <article key={saved.id} className="neu overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() => {
                    playClick();
                    setExpanded(open ? null : saved.id);
                    if (!open) setSelectedInning(0);
                  }}
                  aria-expanded={open}
                >
                  <Trophy
                    className={`h-5 w-5 shrink-0 ${match.result?.winnerTeam ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display font-bold">
                      {match.result?.text ?? "Match completed"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(saved.created_at).toLocaleString()} · {saved.setup.overs} overs
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <TeamDot color={saved.setup.team1.color} />{" "}
                      <span className="truncate">{saved.setup.team1.name}</span>
                      <span className="text-muted-foreground">vs</span>
                      <TeamDot color={saved.setup.team2.color} />{" "}
                      <span className="truncate">{saved.setup.team2.name}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-sm">
                      {first.runs}/{first.wickets}
                    </p>
                    {second && (
                      <p className="font-display text-sm">
                        {second.runs}/{second.wickets}
                      </p>
                    )}
                  </div>
                  {open ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {open && (
                  <div className="border-t border-border/70 p-4">
                    <div
                      className="mb-4 grid grid-cols-2 gap-2"
                      aria-label="Select innings scorecard"
                    >
                      {([0, 1] as const).map((idx) => {
                        const score = match.innings[idx];
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={!score}
                            aria-pressed={selectedInning === idx}
                            onClick={() => {
                              playClick();
                              setSelectedInning(idx);
                            }}
                            className={`rounded-xl px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selectedInning === idx ? "neu-inset text-primary" : "neu-btn text-muted-foreground"}`}
                          >
                            <span className="block font-display font-semibold">
                              Innings {idx + 1}
                            </span>
                            <span className="mt-1 block truncate">
                              {score
                                ? `${score.battingTeam.name} · ${score.runs}/${score.wickets}`
                                : "Not started"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <InningsSummary
                      inning={match.innings[selectedInning] ?? first}
                      number={selectedInning + 1}
                      overs={saved.setup.overs}
                    />
                    {second && (
                      <p className="mb-4 rounded-xl bg-primary/10 px-3 py-2 text-center font-display font-bold text-primary">
                        {match.result?.text}
                      </p>
                    )}
                    <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-muted-foreground">
                      Innings {selectedInning + 1} · Over history
                    </h3>
                    <div className="flex flex-col gap-2">
                      {(match.innings[selectedInning] ?? first).overs.map((over) => (
                        <p
                          key={over.number}
                          className="neu-inset rounded-xl border-t border-border/50 px-3 py-2 text-xs"
                        >
                          <span className="mr-2 text-primary">Over {over.number}</span>
                          {over.balls.join(" · ") || "No deliveries"}{" "}
                          <span className="float-right text-muted-foreground">
                            {over.runs} runs
                          </span>
                        </p>
                      ))}
                      {(match.innings[selectedInning] ?? first).overs.length === 0 && (
                        <p className="text-xs text-muted-foreground">No recorded overs.</p>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function InningsSummary({
  inning,
  number,
  overs,
}: {
  inning: InningsState;
  number: number;
  overs: number;
}) {
  return (
    <section className="neu-inset rounded-xl p-3">
      <h3 className="truncate text-xs font-semibold">
        {number === 1 ? "1st" : "2nd"} · {inning.battingTeam.name}
      </h3>
      <p className="mt-2 font-display text-2xl font-bold">
        {inning.runs}/{inning.wickets}
      </p>
      <p className="text-xs text-muted-foreground">
        {oversText(inning.legalBalls)} / {overs} overs · CRR{" "}
        {runRate(inning.runs, inning.legalBalls)}
      </p>
      <div className="mt-3 border-t border-border/60 pt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Batting</p>
        {inning.batters.map((b) => (
          <p key={b.id} className="flex justify-between gap-2 text-[11px]">
            <span className="truncate">
              {b.name} <span className="text-muted-foreground">{b.howOut ?? "not out"}</span>
            </span>
            <span>
              {b.runs} ({b.balls}) · {strikeRate(b.runs, b.balls)}
            </span>
          </p>
        ))}
      </div>
      <div className="mt-3 border-t border-border/60 pt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Bowling</p>
        {inning.bowlers.map((b) => (
          <p key={b.id} className="flex justify-between gap-2 text-[11px]">
            <span className="truncate">{b.name}</span>
            <span>
              {oversText(b.legalBalls)}-{b.maidens}-{b.runs}-{b.wickets} ·{" "}
              {economy(b.runs, b.legalBalls)}
            </span>
          </p>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Extras {inning.extras.wd + inning.extras.nb} (Wd {inning.extras.wd}, Nb {inning.extras.nb})
      </p>
    </section>
  );
}
