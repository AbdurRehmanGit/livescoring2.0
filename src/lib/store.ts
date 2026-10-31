import { useSyncExternalStore } from "react";
import type { InningsEvent, MatchSetup, Team } from "./engine";

export type AppState = {
  teams: [Team, Team];
  savedTeams: Team[];
  overs: number;
  setup: MatchSetup | null;
  events: [InningsEvent[], InningsEvent[]];
  matchId: string | null;
};

export const uid = () => crypto.randomUUID();

export const newTeam = (name: string, color: string): Team => ({
  id: uid(),
  name,
  color,
  players: [],
});

const initial = (): AppState => ({
  teams: [newTeam("Team 1", "#ff8a00"), newTeam("Team 2", "#22d3ee")],
  savedTeams: [],
  overs: 6,
  setup: null,
  events: [[], []],
  matchId: null,
});

let state: AppState = initial();
const listeners = new Set<() => void>();

export function setState(fn: (s: AppState) => AppState) {
  state = fn(state);
  listeners.forEach((listener) => listener());
}

export function getState() {
  return state;
}

const serverSnapshot = initial();
export function useApp(): AppState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState,
    () => serverSnapshot,
  );
}

export function resetMatch() {
  setState((s) => ({ ...s, setup: null, events: [[], []], matchId: null }));
}
