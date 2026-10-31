import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createMatch } from "@/lib/db";
import { NeuButton, NeuModal, PageShell, TeamDot } from "@/components/neu";
import { setState, useApp } from "@/lib/store";
import { playCoin } from "@/lib/sound";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/toss")({
  head: () => ({
    meta: [
      { title: "Match Options & Toss — Live Scoring" },
      { name: "description", content: "Pick overs and flip the coin to decide who bats first." },
      { property: "og:title", content: "Match Options & Toss — Live Scoring" },
      {
        property: "og:description",
        content: "Pick overs and flip the coin to decide who bats first.",
      },
    ],
  }),
  component: Toss,
});

const QUICK = [2, 5, 6, 10, 15, 20];

function Toss() {
  const nav = useNavigate();
  const app = useApp();
  const [t1, t2] = app.teams;
  const [call, setCall] = useState<0 | 1>(0); // team1 calls
  const [pick, setPick] = useState<"H" | "T">("H");
  const [flipping, setFlipping] = useState(false);
  const [face, setFace] = useState<"H" | "T" | null>(null);
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [flipKey, setFlipKey] = useState(0);
  const [starting, setStarting] = useState(false);

  const flip = () => {
    if (flipping) return;
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const result: "H" | "T" = (arr[0] ?? 0) % 2 === 0 ? "H" : "T";
    setFace(null);
    setFlipping(true);
    setFlipKey((k) => k + 1);
    playCoin();
    setTimeout(() => {
      setFace(result);
      setFlipping(false);
      const callerWon = result === pick;
      setWinner((callerWon ? call : 1 - call) as 0 | 1);
    }, 1600);
  };

  const start = async (decision: "bat" | "bowl") => {
    if (winner === null || starting) return;
    setStarting(true);
    const setup = { team1: t1, team2: t2, overs: app.overs, tossWinner: winner, decision };
    try {
      const matchId = await createMatch(setup);
      setState((s) => ({
        ...s,
        setup,
        events: [[], []],
        matchId,
      }));
      nav({ to: "/live" });
    } catch (error) {
      console.error("Could not create the match in Supabase.", error);
      toast.error(
        `Couldn't start match: ${error instanceof Error ? error.message : "Supabase request failed"}`,
      );
    } finally {
      setStarting(false);
    }
  };

  const teams = [t1, t2];
  return (
    <PageShell>
      <header className="mb-6 flex items-center gap-3">
        <NeuButton size="icon" onClick={() => nav({ to: "/setup" })} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </NeuButton>
        <h1 className="text-2xl font-bold">Match Options</h1>
      </header>

      <section className="neu p-5">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-muted-foreground">
          Overs
        </h2>
        <div className="grid grid-cols-6 gap-2">
          {QUICK.map((o) => (
            <NeuButton
              key={o}
              size="sm"
              variant={app.overs === o ? "solid" : "default"}
              onClick={() => setState((s) => ({ ...s, overs: o }))}
            >
              {o}
            </NeuButton>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Custom</span>
          <input
            type="number"
            min={1}
            max={50}
            value={app.overs}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                overs: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
              }))
            }
            className="neu-inset w-24 rounded-xl px-3 py-2 font-display text-lg outline-none"
          />
          <span className="text-sm text-muted-foreground">overs</span>
        </div>
      </section>

      <section className="neu mt-6 p-5">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-muted-foreground">
          Coin Toss
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {teams.map((t, i) => (
            <NeuButton
              key={t.id}
              size="sm"
              variant={call === i ? "primary" : "muted"}
              onClick={() => setCall(i as 0 | 1)}
            >
              <TeamDot color={t.color} /> <span className="truncate">{t.name} calls</span>
            </NeuButton>
          ))}
          {(["H", "T"] as const).map((f) => (
            <NeuButton
              key={f}
              size="sm"
              variant={pick === f ? "accent" : "muted"}
              onClick={() => setPick(f)}
            >
              {f === "H" ? "Heads" : "Tails"}
            </NeuButton>
          ))}
        </div>

        <div className="my-10 flex justify-center [perspective:800px]">
          <button
            key={flipKey}
            onClick={flip}
            aria-label="Flip coin"
            className={cn(
              "flex h-36 w-36 items-center justify-center rounded-full bg-gradient-primary glow-primary font-display text-5xl font-bold text-primary-foreground",
              flipping && "animate-coin",
            )}
          >
            <span className="neu-inset flex h-28 w-28 items-center justify-center rounded-full text-primary">
              {flipping ? "" : (face ?? "?")}
            </span>
          </button>
        </div>
        <p className="text-center text-muted-foreground">
          {flipping
            ? "Flipping…"
            : face
              ? `It's ${face === "H" ? "Heads" : "Tails"}!`
              : "Tap the coin to flip"}
        </p>
      </section>

      <NeuModal
        open={winner !== null && !flipping}
        onOpenChange={(o) => !o && setWinner(null)}
        title={
          winner !== null
            ? `${teams.find((_, i) => i === winner)?.name ?? "Team"} won the toss`
            : ""
        }
        description="Choose to Bat or Bowl first?"
      >
        <div className="grid grid-cols-2 gap-4 pt-2">
          <NeuButton
            variant="solid"
            size="lg"
            disabled={starting}
            onClick={() => void start("bat")}
          >
            Bat
          </NeuButton>
          <NeuButton
            variant="accent"
            size="lg"
            disabled={starting}
            onClick={() => void start("bowl")}
          >
            Bowl
          </NeuButton>
        </div>
      </NeuModal>
    </PageShell>
  );
}
