import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { History, Play, Radio } from "lucide-react";
import { toast } from "sonner";
import { abandonMatch, loadInProgressMatch } from "@/lib/db";
import { NeuButton, PageShell } from "@/components/neu";
import { replayMatch } from "@/lib/engine";
import { getState, resetMatch, setState, useApp } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Scoring — Ball-by-ball cricket scorer" },
      {
        name: "description",
        content: "Start a cricket match, score every ball and keep a full match history.",
      },
      { property: "og:title", content: "Live Scoring — Ball-by-ball cricket scorer" },
      {
        property: "og:description",
        content: "Start a cricket match, score every ball and keep a full match history.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  const app = useApp();
  const [starting, setStarting] = useState(false);
  const inProgress = !!app.setup && !!app.matchId && !replayMatch(app.setup, app.events).finished;

  useEffect(() => {
    let active = true;
    if (getState().matchId) return;
    loadInProgressMatch()
      .then((match) => {
        if (!active || !match || getState().matchId) return;
        setState((s) => ({
          ...s,
          teams: [match.setup.team1, match.setup.team2],
          overs: match.setup.overs,
          setup: match.setup,
          events: match.events,
          matchId: match.id,
        }));
      })
      .catch((error: unknown) => {
        console.error("Could not check for an in-progress match.", error);
        toast.error(
          `Couldn't load in-progress match: ${error instanceof Error ? error.message : "Supabase request failed"}`,
        );
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <PageShell className="flex flex-col items-center justify-center gap-10 pb-6">
      <div className="neu flex h-36 w-36 items-center justify-center rounded-full">
        <div className="neu-inset flex h-24 w-24 items-center justify-center rounded-full">
          <span className="h-12 w-12 rounded-full bg-gradient-primary glow-primary" />
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight text-glow text-primary">Live Scoring</h1>
        <p className="mt-3 text-muted-foreground">Ball-by-ball cricket scoring, in your pocket.</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-5">
        {inProgress && (
          <NeuButton variant="accent" size="lg" onClick={() => nav({ to: "/live" })}>
            <Radio className="h-5 w-5" /> Resume Match
          </NeuButton>
        )}
        <NeuButton
          variant="solid"
          size="lg"
          disabled={starting}
          onClick={async () => {
            const current = getState();
            const currentMatchId =
              current.matchId &&
              current.setup &&
              !replayMatch(current.setup, current.events).finished
                ? current.matchId
                : null;
            setStarting(true);
            try {
              if (currentMatchId) await abandonMatch(currentMatchId);
              resetMatch();
              nav({ to: "/setup" });
            } catch (error) {
              console.error("Could not abandon the current match in Supabase.", error);
              toast.error(
                `Couldn't start a new match: ${error instanceof Error ? error.message : "Supabase request failed"}`,
              );
            } finally {
              setStarting(false);
            }
          }}
        >
          <Play className="h-5 w-5" /> Start a Match
        </NeuButton>
        <NeuButton variant="primary" size="lg" onClick={() => nav({ to: "/history" })}>
          <History className="h-5 w-5" /> Match History
        </NeuButton>
      </div>
    </PageShell>
  );
}
