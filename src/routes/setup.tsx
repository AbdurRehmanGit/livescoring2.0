import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadTeams, saveTeam } from "@/lib/db";
import { NeuButton, NeuModal, PageShell, TeamDot } from "@/components/neu";
import { playClick } from "@/lib/sound";
import { setState, uid, useApp, newTeam } from "@/lib/store";
import type { Team } from "@/lib/engine";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Team Setup — Live Scoring" },
      { name: "description", content: "Create or load teams and players before the match." },
      { property: "og:title", content: "Team Setup — Live Scoring" },
      { property: "og:description", content: "Create or load teams and players before the match." },
    ],
  }),
  component: Setup,
});

const PRESETS = [
  "#ff8a00",
  "#d4ff3a",
  "#22d3ee",
  "#f43f5e",
  "#a3e635",
  "#38bdf8",
  "#facc15",
  "#fb7185",
];

function Setup() {
  const nav = useNavigate();
  const app = useApp();
  const teams = app.teams;
  const history = useRef<[Team, Team][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [loadFor, setLoadFor] = useState<0 | 1 | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadTeams()
      .then((savedTeams) => {
        if (active) setState((s) => ({ ...s, savedTeams }));
      })
      .catch((error: unknown) => {
        console.error("Could not load teams from Supabase.", error);
        toast.error(
          `Couldn't load teams: ${error instanceof Error ? error.message : "Supabase request failed"}`,
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (fn: (t: [Team, Team]) => [Team, Team]) => {
    history.current.push(teams);
    setCanUndo(true);
    setState((s) => ({ ...s, teams: fn(s.teams) }));
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) setState((s) => ({ ...s, teams: prev }));
    setCanUndo(history.current.length > 0);
  };
  const editTeam = (i: 0 | 1, patch: Partial<Team>) =>
    update((t) => {
      const c: [Team, Team] = [t[0], t[1]];
      c[i] = { ...c[i], ...patch };
      return c;
    });

  const validate = () => {
    for (const t of teams) {
      if (!t.name.trim()) return "Every team needs a name";
      if (t.players.filter((p) => p.name.trim()).length < 2)
        return `${t.name} needs at least 2 players`;
    }
    if (teams[0].id === teams[1].id) return "Pick two different teams";
    return null;
  };

  const persist = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return false;
    }
    const clean = teams.map((t) => ({
      ...t,
      name: t.name.trim(),
      players: t.players.filter((p) => p.name.trim()),
    })) as [Team, Team];
    setState((s) => ({ ...s, teams: clean }));
    setBusy(true);
    try {
      await Promise.all(clean.map(saveTeam));
      setState((s) => {
        const savedTeams = [...s.savedTeams];
        for (const team of clean) {
          const index = savedTeams.findIndex((saved) => saved.id === team.id);
          if (index >= 0) savedTeams[index] = team;
          else savedTeams.unshift(team);
        }
        return { ...s, savedTeams };
      });
      return true;
    } catch (error) {
      console.error("Could not save teams to Supabase.", error);
      toast.error(
        `Couldn't save teams: ${error instanceof Error ? error.message : "Supabase request failed"}`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team Setup</h1>
        <NeuButton size="sm" variant="muted" disabled={!canUndo} onClick={undo}>
          <RotateCcw className="h-4 w-4" /> Undo
        </NeuButton>
      </header>

      <div className="flex flex-col gap-6">
        {([0, 1] as const).map((i) => (
          <TeamCard
            key={i}
            team={teams[i]}
            onChange={(p) => editTeam(i, p)}
            onLoad={() => setLoadFor(i)}
            onClear={() =>
              editTeam(i, { ...newTeam(`Team ${i + 1}`, PRESETS[i * 2] ?? "#ff8a00") })
            }
          />
        ))}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <NeuButton size="icon" onClick={() => nav({ to: "/" })} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </NeuButton>
          <NeuButton
            variant="primary"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              if (await persist()) toast.success("Teams saved to Supabase");
            }}
          >
            <Save className="h-5 w-5" /> Save
          </NeuButton>
          <NeuButton
            variant="solid"
            size="icon"
            disabled={busy}
            aria-label="Save teams and next"
            onClick={async () => {
              if (await persist()) nav({ to: "/toss" });
            }}
          >
            <ArrowRight className="h-5 w-5" />
          </NeuButton>
        </div>
      </nav>

      <LoadTeamModal
        open={loadFor !== null}
        onClose={() => setLoadFor(null)}
        teams={app.savedTeams}
        onPick={(t) => {
          if (loadFor !== null) editTeam(loadFor, t);
          setLoadFor(null);
        }}
      />
    </PageShell>
  );
}

function TeamCard({
  team,
  onChange,
  onLoad,
  onClear,
}: {
  team: Team;
  onChange: (p: Partial<Team>) => void;
  onLoad: () => void;
  onClear: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  useEffect(() => setName(team.name), [team.name]);
  return (
    <section className="neu p-5" style={{ borderTop: `3px solid ${team.color}` }}>
      <div className="flex items-center gap-3">
        <TeamDot color={team.color} />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name !== team.name) onChange({ name });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="neu-inset min-w-0 flex-1 rounded-xl px-3 py-2 font-display text-lg outline-none"
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-xl font-bold" style={{ color: team.color }}>
            {team.name}
          </h2>
        )}
        <NeuButton
          size="icon"
          className="h-9 w-9"
          aria-label="Edit team name"
          onClick={() => setEditing(true)}
        >
          <Pencil className="h-4 w-4" />
        </NeuButton>
        <NeuButton size="icon" className="h-9 w-9" aria-label="Load saved team" onClick={onLoad}>
          <Download className="h-4 w-4" />
        </NeuButton>
        <NeuButton
          size="icon"
          variant="danger"
          className="h-9 w-9"
          aria-label="Clear team"
          onClick={onClear}
        >
          <Trash2 className="h-4 w-4" />
        </NeuButton>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((c) => (
          <button
            key={c}
            aria-label={`Colour ${c}`}
            onClick={() => {
              playClick();
              onChange({ color: c });
            }}
            className="neu-btn h-7 w-7 rounded-full p-1"
          >
            <span
              className="block h-full w-full rounded-full"
              style={{
                background: c,
                outline: team.color === c ? "2px solid currentColor" : undefined,
                outlineOffset: 2,
              }}
            />
          </button>
        ))}
        <label
          className="neu-btn relative h-7 w-7 cursor-pointer overflow-hidden rounded-full"
          aria-label="Custom colour"
        >
          <input
            type="color"
            value={team.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
            +
          </span>
        </label>
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {team.players.map((p, idx) => (
          <PlayerRow
            key={p.id}
            index={idx + 1}
            name={p.name}
            onRename={(n) =>
              onChange({
                players: team.players.map((x) => (x.id === p.id ? { ...x, name: n } : x)),
              })
            }
            onRemove={() => onChange({ players: team.players.filter((x) => x.id !== p.id) })}
          />
        ))}
      </ul>
      <NeuButton
        variant="primary"
        size="sm"
        className="mt-4 w-full"
        onClick={() => onChange({ players: [...team.players, { id: uid(), name: "" }] })}
      >
        <Plus className="h-4 w-4" /> Add Player
      </NeuButton>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {team.players.length} players
      </p>
    </section>
  );
}

function PlayerRow({
  index,
  name,
  onRename,
  onRemove,
}: {
  index: number;
  name: string;
  onRename: (n: string) => void;
  onRemove: () => void;
}) {
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  return (
    <li className="flex items-center gap-2">
      <span className="w-6 text-right font-display text-sm text-muted-foreground">{index}</span>
      <input
        value={v}
        placeholder="Player name"
        autoFocus={!name}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== name && onRename(v)}
        className="neu-inset min-w-0 flex-1 rounded-xl px-3 py-2 outline-none placeholder:text-muted-foreground"
      />
      <NeuButton
        size="icon"
        variant="danger"
        className="h-9 w-9"
        aria-label="Remove player"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </NeuButton>
    </li>
  );
}

function LoadTeamModal({
  open,
  onClose,
  onPick,
  teams,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: Team) => void;
  teams: Team[];
}) {
  return (
    <NeuModal open={open} onOpenChange={(o) => !o && onClose()} title="Load saved team">
      {teams.length === 0 ? (
        <p className="text-muted-foreground">No saved teams yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {teams.map((t) => (
            <NeuButton key={t.id} className="justify-start" onClick={() => onPick(t)}>
              <TeamDot color={t.color} />
              <span className="flex-1 truncate text-left">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.players.length} players</span>
            </NeuButton>
          ))}
        </div>
      )}
    </NeuModal>
  );
}
