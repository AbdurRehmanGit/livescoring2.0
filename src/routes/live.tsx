import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Trophy, Undo2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { NeuButton, NeuModal, PageShell, TeamDot } from "@/components/neu";
import {
  availableBatters,
  economy,
  oversText,
  replayMatch,
  runRate,
  strikeRate,
  type InningsEvent,
  type InningsState,
  type WicketType,
} from "@/lib/engine";
import { loadInProgressMatch, syncMatch } from "@/lib/db";
import { playBoo, playCheer, playClick } from "@/lib/sound";
import { getState, setState, useApp } from "@/lib/store";

export const Route = createFileRoute("/live")({
  head: () => ({
    meta: [
      { title: "Live Match — Live Scoring" },
      {
        name: "description",
        content: "Score a cricket match ball by ball and follow live innings statistics.",
      },
    ],
  }),
  component: Live,
});

type Modal =
  | "openers"
  | "bowler"
  | "newBatter"
  | "wicket"
  | "wide"
  | "wideWicket"
  | "noBall"
  | "changeBatter"
  | null;
type ScoreTab = "batting" | "bowling" | "overs";

const DISMISSALS: Array<{ value: WicketType; label: string }> = [
  { value: "bowled", label: "Bowled" },
  { value: "caught", label: "Caught" },
  { value: "lbw", label: "LBW" },
  { value: "run_out", label: "Run out" },
  { value: "stumped", label: "Stumped" },
];

function Live() {
  const nav = useNavigate();
  const app = useApp();
  const setup = app.setup;
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [firstOpener, setFirstOpener] = useState<string | null>(null);
  const [replacementSlot, setReplacementSlot] = useState<"striker" | "nonStriker">("striker");
  const [tab, setTab] = useState<ScoreTab>("batting");
  const [scorecardInning, setScorecardInning] = useState<0 | 1>(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncRetry, setSyncRetry] = useState(0);
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const lastSyncKey = useRef<string | null>(null);
  const persistedSyncKey = useRef<string | null>(null);

  const match = useMemo(() => (setup ? replayMatch(setup, app.events) : null), [setup, app.events]);
  const inning = match?.innings[match.current] ?? null;
  const scorecard = match?.innings[scorecardInning] ?? null;
  const currentSyncKey = app.matchId ? JSON.stringify([app.matchId, app.events]) : null;
  const syncReady = syncStatus === "synced" && persistedSyncKey.current === currentSyncKey;
  const currentInningsIndex = match?.current;

  useEffect(() => {
    let active = true;
    if (getState().setup) {
      setHydrated(true);
      return () => {
        active = false;
      };
    }

    loadInProgressMatch()
      .then((savedMatch) => {
        if (active && savedMatch && !getState().setup) {
          setState((s) => ({
            ...s,
            teams: [savedMatch.setup.team1, savedMatch.setup.team2],
            overs: savedMatch.setup.overs,
            setup: savedMatch.setup,
            events: savedMatch.events,
            matchId: savedMatch.id,
          }));
        }
      })
      .catch((error: unknown) => {
        console.error("Could not resume match from Supabase.", error);
        toast.error(
          `Couldn't resume match: ${error instanceof Error ? error.message : "Supabase request failed"}`,
        );
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated && !setup) nav({ to: "/" });
  }, [hydrated, setup, nav]);

  useEffect(() => {
    if (!match || !inning) return;
    if (match.finished) {
      setModal(null);
      return;
    }
    if (inning.needs) setModal(inning.needs);
  }, [app.events, inning, match]);

  useEffect(() => {
    if (!app.matchId || !setup) return;
    const key = JSON.stringify([app.matchId, app.events]);
    if (lastSyncKey.current === key) return;
    lastSyncKey.current = key;
    setSyncStatus("syncing");
    const matchId = app.matchId;
    const currentSetup = setup;
    const currentEvents = app.events;
    syncQueue.current = syncQueue.current
      .catch(() => undefined)
      .then(() => syncMatch(matchId, currentSetup, currentEvents))
      .then(() => {
        persistedSyncKey.current = key;
        if (lastSyncKey.current === key) setSyncStatus("synced");
      })
      .catch((error: unknown) => {
        console.error("Could not sync match scoring to Supabase.", error);
        if (lastSyncKey.current === key) setSyncStatus("error");
        toast.error(
          `Couldn't sync score to Supabase: ${error instanceof Error ? error.message : "Supabase request failed"}`,
        );
      });
  }, [app.events, app.matchId, setup, syncRetry]);

  useEffect(() => {
    if (currentInningsIndex !== undefined) setScorecardInning(currentInningsIndex);
  }, [currentInningsIndex]);

  if (!hydrated || !setup || !match || !inning) {
    return (
      <PageShell>
        <p className="py-20 text-center text-muted-foreground">Preparing match…</p>
      </PageShell>
    );
  }

  const activeIdx = match.current;
  const locked = inning.complete || inning.needs !== null;
  const striker = inning.batters.find((b) => b.id === inning.striker);
  const nonStriker = inning.batters.find((b) => b.id === inning.nonStriker);
  const bowler = inning.bowlers.find((b) => b.id === inning.bowler);
  const currentOver = inning.overs.at(-1);
  const ballsRemaining = Math.max(0, setup.overs * 6 - inning.legalBalls);
  const target = inning.target;
  const runsRequired = target === null ? null : Math.max(0, target - inning.runs);
  const rrr =
    runsRequired !== null && ballsRemaining > 0
      ? ((runsRequired / ballsRemaining) * 6).toFixed(2)
      : runsRequired === 0
        ? "0.00"
        : "—";

  const pushBall = (
    runs: number,
    extra: "wd" | "nb" | null = null,
    wicket?: { type: WicketType; outId: string },
  ) => {
    if (runs === 4 || runs === 6) playCheer();
    setState((s) => {
      const events: [(typeof s.events)[0], (typeof s.events)[1]] = [
        [...s.events[0]],
        [...s.events[1]],
      ];
      events[activeIdx].push({ k: "ball", runs, extra, ...(wicket ? { wicket } : {}) });
      return { ...s, events };
    });
  };

  const pushInningsEvent = (event: InningsEvent) => {
    setState((s) => {
      const events: [(typeof s.events)[0], (typeof s.events)[1]] = [
        [...s.events[0]],
        [...s.events[1]],
      ];
      events[activeIdx].push(event);
      return { ...s, events };
    });
  };

  const pickOpeners = (id: string) => {
    if (!firstOpener) {
      setFirstOpener(id);
      return;
    }
    if (id === firstOpener) {
      toast.error("Choose two different batters.");
      return;
    }
    pushInningsEvent({ k: "openers", striker: firstOpener, nonStriker: id });
    setFirstOpener(null);
    setModal(null);
  };

  const pickBowler = (id: string) => {
    pushInningsEvent({ k: "bowler", id });
    setModal(null);
  };

  const pickNewBatter = (id: string) => {
    pushInningsEvent({ k: "newBatter", id });
    setModal(null);
  };

  const chooseWicket = (type: WicketType, outId: string, extra: "wd" | "nb" | null = null) => {
    playBoo();
    pushBall(0, extra, { type, outId });
    setModal(null);
  };

  const undo = () => {
    setState((s) => {
      const events: [(typeof s.events)[0], (typeof s.events)[1]] = [
        [...s.events[0]],
        [...s.events[1]],
      ];
      const targetInning = events[activeIdx].length
        ? activeIdx
        : activeIdx === 1 && events[0].length
          ? 0
          : null;
      if (targetInning === null) return s;
      events[targetInning].pop();
      return { ...s, events };
    });
    setModal(null);
  };

  const allBatters = inning.battingTeam.players;
  const activeBatters = [striker, nonStriker].filter((b): b is NonNullable<typeof b> => Boolean(b));
  const choices = availableBatters(inning);
  const canEditOpeners =
    app.events[activeIdx].some((e) => e.k === "openers") &&
    !app.events[activeIdx].some((e) => e.k === "ball");

  return (
    <PageShell className="pb-10">
      <header className="mb-5 flex items-center justify-between gap-3">
        <NeuButton size="icon" onClick={() => nav({ to: "/" })} aria-label="Back to home">
          <ArrowLeft className="h-5 w-5" />
        </NeuButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">Live Scoring</p>
          <h1 className="truncate text-lg font-bold">{inning.battingTeam.name} batting</h1>
          <p className="text-[10px] text-muted-foreground" aria-live="polite">
            {syncStatus === "syncing"
              ? "Syncing to Supabase…"
              : syncStatus === "synced"
                ? "Saved to Supabase"
                : syncStatus === "error"
                  ? "Sync failed"
                  : ""}
          </p>
        </div>
        <NeuButton
          size="icon"
          variant="muted"
          disabled={!app.events[activeIdx].length && (activeIdx === 0 || !app.events[0].length)}
          onClick={undo}
          aria-label="Undo last action"
        >
          <Undo2 className="h-5 w-5" />
        </NeuButton>
      </header>

      <section
        className="neu overflow-hidden p-5"
        style={{ borderTop: `3px solid ${inning.battingTeam.color}` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <TeamDot color={inning.battingTeam.color} />
              <span className="truncate font-display text-sm uppercase tracking-wider">
                {inning.battingTeam.name}
              </span>
            </div>
            <p className="font-display text-5xl font-bold tracking-tight">
              {inning.runs}
              <span className="text-2xl text-muted-foreground">/{inning.wickets}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="neu-inset inline-flex rounded-full px-3 py-1 text-xs font-semibold text-primary">
              {activeIdx === 0 ? "1st" : "2nd"} Innings
            </span>
            <p className="mt-3 font-display text-xl">
              {oversText(inning.legalBalls)}{" "}
              <span className="text-sm text-muted-foreground">/ {setup.overs}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              CRR {runRate(inning.runs, inning.legalBalls)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
          <div>
            <p className="text-muted-foreground">Extras</p>
            <p className="mt-1 font-display text-base">{inning.extras.wd + inning.extras.nb}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Toss</p>
            <p className="mt-1 truncate font-display text-base">
              {setup.tossWinner === 0 ? setup.team1.name : setup.team2.name}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Decision</p>
            <p className="mt-1 font-display text-base">
              {setup.decision === "bat" ? "Bat" : "Bowl"}
            </p>
          </div>
        </div>
        {target !== null && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-background/60 px-4 py-3 text-sm">
            <span>
              Target <b className="font-display text-primary">{target}</b>
            </span>
            <span>
              Need <b className="font-display text-primary">{runsRequired}</b> off {ballsRemaining}{" "}
              balls
            </span>
            <span>
              RRR <b className="font-display text-primary">{rrr}</b>
            </span>
          </div>
        )}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3">
        <div className="neu p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Batters
            </h2>
            <NeuButton
              size="icon"
              variant="muted"
              className="h-8 w-8"
              disabled={!choices.length}
              onClick={() => setModal("changeBatter")}
              aria-label="Change batter"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </NeuButton>
          </div>
          {[striker, nonStriker].map((b, i) => (
            <div
              key={i}
              className={`mb-2 rounded-xl px-2 py-2 last:mb-0 ${b?.id === inning.striker ? "bg-primary/10" : ""}`}
            >
              <div className="flex items-center gap-2">
                {b?.id === inning.striker ? (
                  <span className="text-primary">●</span>
                ) : (
                  <span className="w-2" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {b?.name ?? "Waiting…"}
                </span>
                <span className="font-display text-lg">
                  {b?.runs ?? "—"}
                  <span className="ml-1 text-xs text-muted-foreground">({b?.balls ?? 0})</span>
                </span>
              </div>
              {b && (
                <p className="pl-4 text-[11px] text-muted-foreground">
                  4s {b.fours} · 6s {b.sixes} · SR {strikeRate(b.runs, b.balls)}
                </p>
              )}
            </div>
          ))}
          {canEditOpeners && (
            <button
              className="mt-2 text-xs text-primary underline"
              onClick={() => {
                playClick();
                setState((s) => {
                  const events: [(typeof s.events)[0], (typeof s.events)[1]] = [
                    [...s.events[0]],
                    [...s.events[1]],
                  ];
                  events[activeIdx] = [];
                  return { ...s, events };
                });
                setFirstOpener(null);
                setModal("openers");
              }}
            >
              Change opening batters
            </button>
          )}
        </div>

        <div className="neu p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xs uppercase tracking-widest text-muted-foreground">
              Bowler
            </h2>
            <span className="text-xs text-muted-foreground">
              {inning.freeHit ? "FREE HIT" : ""}
            </span>
          </div>
          <p className="truncate font-semibold">
            {bowler?.name ?? (inning.needs === "bowler" ? "Select bowler" : "—")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {bowler
              ? `${oversText(bowler.legalBalls)} · ${bowler.maidens} · ${bowler.runs} · ${bowler.wickets}`
              : "O · M · R · W"}
          </p>
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              This over
            </p>
            <div className="flex min-h-7 flex-wrap gap-1">
              {currentOver?.balls.map((ball, i) => (
                <span
                  key={i}
                  className={`neu-inset flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs ${ball.includes("W") || ball === "RO" ? "text-destructive" : ""}`}
                >
                  {ball}
                </span>
              ))}
              {!currentOver?.balls.length && (
                <span className="text-xs text-muted-foreground">No deliveries yet</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="neu mt-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">
            Scoring pad
          </h2>
          {inning.needs && (
            <span className="text-xs text-primary">Complete selection to continue</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((run) => (
            <NeuButton
              key={run}
              size="key"
              variant={run === 4 || run === 6 ? "solid" : "default"}
              disabled={locked}
              onClick={() => pushBall(run)}
            >
              {run}
              {run === 4 ? <span className="text-[9px]">FOUR</span> : null}
              {run === 6 ? <span className="text-[9px]">SIX</span> : null}
            </NeuButton>
          ))}
          <NeuButton size="key" variant="accent" disabled={locked} onClick={() => setModal("wide")}>
            WD
          </NeuButton>
          <NeuButton
            size="key"
            variant="accent"
            disabled={locked}
            onClick={() => setModal("noBall")}
          >
            NB
          </NeuButton>
          <NeuButton
            size="key"
            variant="danger"
            disabled={locked}
            onClick={() => setModal("wicket")}
          >
            OUT
          </NeuButton>
          <NeuButton
            size="key"
            variant="muted"
            disabled={locked || !striker}
            onClick={() => chooseWicket("retired_out", inning.striker!)}
          >
            RO
          </NeuButton>
        </div>
      </section>

      <section className="neu mt-5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">
            Scorecard
          </h2>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2" aria-label="Select innings scorecard">
          {([0, 1] as const).map((idx) => {
            const score = match.innings[idx];
            return (
              <button
                key={idx}
                type="button"
                disabled={!score}
                aria-pressed={scorecardInning === idx}
                onClick={() => {
                  playClick();
                  setScorecardInning(idx);
                }}
                className={`rounded-xl px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${scorecardInning === idx ? "neu-inset text-primary" : "neu-btn text-muted-foreground"}`}
              >
                <span className="block font-display font-semibold">Innings {idx + 1}</span>
                <span className="mt-1 block truncate">
                  {score
                    ? `${score.battingTeam.name} · ${score.runs}/${score.wickets}`
                    : "Not started"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(["batting", "bowling", "overs"] as const).map((value) => (
            <button
              key={value}
              onClick={() => {
                playClick();
                setTab(value);
              }}
              className={`rounded-xl px-2 py-2 text-xs font-semibold capitalize ${tab === value ? "neu-inset text-primary" : "neu-btn text-muted-foreground"}`}
            >
              {value === "overs" ? "Over log" : value}
            </button>
          ))}
        </div>
        {scorecard ? (
          <>
            <p className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {scorecardInning === 0 ? "1st" : "2nd"} innings · {scorecard.battingTeam.name}
              </span>
              <span className="font-display text-sm text-foreground">
                {scorecard.runs}/{scorecard.wickets} · {oversText(scorecard.legalBalls)} ov
              </span>
            </p>
            {tab === "batting" && <BattingTable inning={scorecard} />}
            {tab === "bowling" && <BowlingTable inning={scorecard} />}
            {tab === "overs" && <OverTable inning={scorecard} />}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This innings has not started yet.</p>
        )}
      </section>

      <footer className="mt-5 flex justify-center">
        <div className="flex items-center gap-2">
          {syncStatus === "error" && (
            <NeuButton
              variant="accent"
              size="sm"
              onClick={() => {
                lastSyncKey.current = null;
                setSyncRetry((value) => value + 1);
              }}
            >
              Retry sync
            </NeuButton>
          )}
          <NeuButton variant="muted" size="sm" onClick={() => nav({ to: "/" })}>
            Exit to home
          </NeuButton>
        </div>
      </footer>

      {match.finished && match.result && (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-xl">
          <div className="neu flex items-center gap-3 border border-primary/40 p-4 glow-primary">
            <Trophy className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-primary">Match complete</p>
              <p className="truncate text-sm">{match.result.text}</p>
            </div>
            <NeuButton
              size="sm"
              variant="solid"
              disabled={!syncReady}
              onClick={() => nav({ to: "/history" })}
            >
              Summary
            </NeuButton>
          </div>
        </div>
      )}

      <NeuModal
        open={modal === "openers"}
        onOpenChange={(open) => {
          if (!open && !inning.needs) setModal(null);
        }}
        title="Choose opening batters"
        description={firstOpener ? "Now choose the non-striker." : "Choose the striker first."}
        dismissable={!inning.needs}
      >
        <PlayerChoices
          players={allBatters}
          selected={firstOpener ? [firstOpener] : []}
          onPick={pickOpeners}
        />
      </NeuModal>

      <NeuModal
        open={modal === "bowler"}
        title="Select bowler"
        description="Choose a bowler for the next over. The previous over's bowler cannot bowl consecutive overs."
        dismissable={!inning.needs}
      >
        <div className="flex flex-col gap-2">
          {inning.bowlingTeam.players
            .filter((p) => p.id !== inning.lastBowler || inning.bowlingTeam.players.length === 1)
            .map((p) => {
              const stats = inning.bowlers.find((b) => b.id === p.id);
              return (
                <NeuButton key={p.id} className="justify-between" onClick={() => pickBowler(p.id)}>
                  <span>{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {stats
                      ? `${oversText(stats.legalBalls)} ov · ${stats.runs} runs · ${stats.wickets} wkts`
                      : "New spell"}
                  </span>
                </NeuButton>
              );
            })}
        </div>
      </NeuModal>

      <NeuModal
        open={modal === "newBatter"}
        title="Choose next batter"
        description="Select the incoming batter from the remaining roster."
        dismissable={false}
      >
        <PlayerChoices players={choices} onPick={pickNewBatter} />
      </NeuModal>

      <NeuModal
        open={modal === "wicket"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Wicket"
        description="Select the dismissal and batter."
      >
        <WicketChoices
          inning={inning}
          types={inning.freeHit ? DISMISSALS.filter((d) => d.value === "run_out") : DISMISSALS}
          onPick={(type, id) => chooseWicket(type, id)}
        />
        {inning.freeHit && (
          <p className="mt-3 text-xs text-muted-foreground">
            On a free hit, only a run out can be scored as a wicket.
          </p>
        )}
      </NeuModal>

      <NeuModal
        open={modal === "wide"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Wide delivery"
        description="Choose completed runs, or a stumping."
      >
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2, 3, 4].map((r) => (
            <NeuButton
              key={r}
              variant="muted"
              onClick={() => {
                pushBall(r, "wd");
                setModal(null);
              }}
            >
              WD + {r}
            </NeuButton>
          ))}
          <NeuButton variant="danger" onClick={() => setModal("wideWicket")}>
            WD + OUT
          </NeuButton>
        </div>
      </NeuModal>

      <NeuModal
        open={modal === "wideWicket"}
        onOpenChange={(open) => !open && setModal("wide")}
        title="Wide + stumping"
        description="Select the batter dismissed."
      >
        <PlayerChoices
          players={activeBatters.map((b) => ({ id: b.id, name: b.name }))}
          onPick={(id) => chooseWicket("stumped", id, "wd")}
        />
      </NeuModal>

      <NeuModal
        open={modal === "noBall"}
        onOpenChange={(open) => !open && setModal(null)}
        title="No ball"
        description="Choose runs scored off the bat. The delivery does not count and the next legal ball is a free hit."
      >
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((r) => (
            <NeuButton
              key={r}
              variant={r === 4 || r === 6 ? "solid" : "muted"}
              onClick={() => {
                pushBall(r, "nb");
                setModal(null);
              }}
            >
              NB + {r}
            </NeuButton>
          ))}
        </div>
      </NeuModal>

      <NeuModal
        open={modal === "changeBatter"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Change batter"
        description="Replace an active batter with a player who has not yet batted."
      >
        <div className="mb-3 flex gap-2">
          {(["striker", "nonStriker"] as const).map((slot) => (
            <NeuButton
              key={slot}
              size="sm"
              variant={replacementSlot === slot ? "solid" : "muted"}
              onClick={() => setReplacementSlot(slot)}
            >
              {slot === "striker" ? "Striker" : "Non-striker"}
            </NeuButton>
          ))}
        </div>
        <PlayerChoices
          players={choices}
          onPick={(id) => {
            pushInningsEvent({ k: "replaceBatter", slot: replacementSlot, id });
            setModal(null);
          }}
        />
      </NeuModal>
    </PageShell>
  );
}

function PlayerChoices({
  players,
  onPick,
  selected = [],
}: {
  players: Array<{ id: string; name: string }>;
  onPick: (id: string) => void;
  selected?: string[];
}) {
  if (!players.length)
    return (
      <p className="rounded-xl bg-background/50 p-4 text-sm text-muted-foreground">
        No eligible players are available.
      </p>
    );
  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
      {players.map((p) => (
        <NeuButton
          key={p.id}
          variant={selected.includes(p.id) ? "accent" : "default"}
          className="justify-start"
          onClick={() => onPick(p.id)}
        >
          <UserRound className="h-4 w-4 text-primary" /> {p.name}
        </NeuButton>
      ))}
    </div>
  );
}

function WicketChoices({
  inning,
  types,
  onPick,
}: {
  inning: InningsState;
  types: typeof DISMISSALS;
  onPick: (type: WicketType, id: string) => void;
}) {
  const active = [inning.striker, inning.nonStriker].filter((id): id is string => Boolean(id));
  const [type, setType] = useState<WicketType>(types[0]?.value ?? "bowled");
  useEffect(() => {
    if (!types.some((dismissal) => dismissal.value === type)) setType(types[0]?.value ?? "run_out");
  }, [type, types]);
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {types.map((dismissal) => (
          <NeuButton
            key={dismissal.value}
            size="sm"
            variant={type === dismissal.value ? "solid" : "muted"}
            onClick={() => setType(dismissal.value)}
          >
            {dismissal.label}
          </NeuButton>
        ))}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Who is out?</p>
      <div className="flex flex-col gap-2">
        {active.map((id) => {
          const batter = inning.batters.find((b) => b.id === id);
          if (!batter) return null;
          return (
            <NeuButton
              key={id}
              className="justify-start"
              variant="danger"
              onClick={() => onPick(type, id)}
            >
              {batter.name}
            </NeuButton>
          );
        })}
      </div>
    </div>
  );
}

function BattingTable({ inning }: { inning: InningsState }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-2">Batter</th>
            <th>R</th>
            <th>B</th>
            <th>4s</th>
            <th>6s</th>
            <th>SR</th>
            <th>Dismissal</th>
          </tr>
        </thead>
        <tbody>
          {inning.batters.map((b) => (
            <tr key={b.id} className="border-t border-border/70">
              <td className="py-2 font-semibold">{b.name}</td>
              <td>{b.runs}</td>
              <td>{b.balls}</td>
              <td>{b.fours}</td>
              <td>{b.sixes}</td>
              <td>{strikeRate(b.runs, b.balls)}</td>
              <td className="text-muted-foreground">{b.howOut ?? (b.out ? "Out" : "not out")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">
        Extras: {inning.extras.wd + inning.extras.nb} (Wd {inning.extras.wd}, Nb {inning.extras.nb})
      </p>
    </div>
  );
}

function BowlingTable({ inning }: { inning: InningsState }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[400px] text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="pb-2">Bowler</th>
            <th>O</th>
            <th>M</th>
            <th>R</th>
            <th>W</th>
            <th>WD</th>
            <th>NB</th>
            <th>Eco</th>
          </tr>
        </thead>
        <tbody>
          {inning.bowlers.map((b) => (
            <tr key={b.id} className="border-t border-border/70">
              <td className="py-2 font-semibold">{b.name}</td>
              <td>{oversText(b.legalBalls)}</td>
              <td>{b.maidens}</td>
              <td>{b.runs}</td>
              <td>{b.wickets}</td>
              <td>{b.wides}</td>
              <td>{b.noBalls}</td>
              <td>{economy(b.runs, b.legalBalls)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverTable({ inning }: { inning: InningsState }) {
  return (
    <div className="flex flex-col gap-2">
      {inning.overs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No overs have been bowled yet.</p>
      ) : (
        inning.overs.map((over) => {
          const bowler = inning.bowlingTeam.players.find((p) => p.id === over.bowlerId);
          return (
            <div
              key={over.number}
              className="neu-inset flex items-center gap-3 rounded-xl px-3 py-2"
            >
              <span className="w-12 font-display text-primary">Over {over.number}</span>
              <span className="min-w-0 flex-1 text-sm">{over.balls.join(" · ") || "—"}</span>
              <span className="text-right text-xs text-muted-foreground">
                {over.runs} runs{over.wickets ? `, ${over.wickets} wkts` : ""}
                <br />
                {bowler?.name ?? ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}
