import { supabase } from "@/integrations/supabase/client";
import {
  replayMatch,
  oversText,
  type InningsEvent,
  type MatchSetup,
  type Team,
  type WicketType,
} from "./engine";
import type { Database, Json } from "@/integrations/supabase/types";

type Summary = {
  setup: MatchSetup;
  events: [InningsEvent[], InningsEvent[]];
};

export type HistoryRow = {
  id: string;
  created_at: string;
  result_text: string | null;
  overs: number;
  setup: MatchSetup;
  events: [InningsEvent[], InningsEvent[]];
};

type MatchRow = {
  id: string;
  created_at: string;
  result_text: string | null;
  overs: number;
  summary: Json | null;
};

type BallInsert = Database["public"]["Tables"]["ball_by_ball"]["Insert"];

type DataRecord = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  color?: unknown;
  players?: unknown;
  k?: unknown;
  striker?: unknown;
  nonStriker?: unknown;
  slot?: unknown;
  runs?: unknown;
  extra?: unknown;
  wicket?: unknown;
  outId?: unknown;
  type?: unknown;
  setup?: unknown;
  events?: unknown;
  team1?: unknown;
  team2?: unknown;
  overs?: unknown;
  tossWinner?: unknown;
  decision?: unknown;
};

const isRecord = (value: unknown): value is DataRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isTeam(value: unknown): value is Team {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        isRecord(player) && typeof player.id === "string" && typeof player.name === "string",
    )
  );
}

const wicketTypes: WicketType[] = ["bowled", "caught", "lbw", "run_out", "stumped", "retired_out"];

function isEvent(value: unknown): value is InningsEvent {
  if (!isRecord(value) || typeof value.k !== "string") return false;
  if (value.k === "openers") {
    return (
      typeof value.striker === "string" &&
      (typeof value.nonStriker === "string" || value.nonStriker === null)
    );
  }
  if (value.k === "bowler" || value.k === "newBatter") return typeof value.id === "string";
  if (value.k === "replaceBatter") {
    return (
      (value.slot === "striker" || value.slot === "nonStriker") && typeof value.id === "string"
    );
  }
  if (value.k !== "ball") return false;
  if (
    typeof value.runs !== "number" ||
    !Number.isInteger(value.runs) ||
    value.runs < 0 ||
    !(value.extra === null || value.extra === "wd" || value.extra === "nb")
  ) {
    return false;
  }
  if (value.wicket === undefined) return true;
  return (
    isRecord(value.wicket) &&
    typeof value.wicket.outId === "string" &&
    wicketTypes.includes(value.wicket.type as WicketType)
  );
}

function parseSummary(value: Json | null): Summary {
  if (!isRecord(value)) throw new Error("A saved match has no valid event summary.");
  const setup = value.setup;
  const events = value.events;
  if (
    !isRecord(setup) ||
    !isTeam(setup.team1) ||
    !isTeam(setup.team2) ||
    typeof setup.overs !== "number" ||
    !Number.isInteger(setup.overs) ||
    setup.overs < 1 ||
    setup.overs > 50 ||
    (setup.tossWinner !== 0 && setup.tossWinner !== 1) ||
    (setup.decision !== "bat" && setup.decision !== "bowl") ||
    !Array.isArray(events) ||
    events.length !== 2 ||
    !Array.isArray(events[0]) ||
    !Array.isArray(events[1]) ||
    !events[0].every(isEvent) ||
    !events[1].every(isEvent)
  ) {
    throw new Error("A saved match contains invalid setup or ball-by-ball data.");
  }
  return {
    setup: {
      team1: setup.team1,
      team2: setup.team2,
      overs: setup.overs,
      tossWinner: setup.tossWinner,
      decision: setup.decision,
    },
    events: [events[0], events[1]],
  };
}

export async function saveTeam(team: Team) {
  const { error: teamError } = await supabase
    .from("teams")
    .upsert({ id: team.id, name: team.name, color: team.color });
  if (teamError) throw teamError;

  const { data: currentPlayers, error: readError } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", team.id);
  if (readError) throw readError;

  const retainedIds = new Set(team.players.map((player) => player.id));
  const removedIds = (currentPlayers ?? [])
    .map((player) => player.id)
    .filter((id) => !retainedIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from("players").delete().in("id", removedIds);
    if (error) throw error;
  }

  if (team.players.length) {
    const { error } = await supabase
      .from("players")
      .upsert(team.players.map((player) => ({ ...player, team_id: team.id })));
    if (error) throw error;
  }
}

export async function loadTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("id,name,color,players(id,name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
    players: team.players ?? [],
  }));
}

const summaryFor = (setup: MatchSetup, events: [InningsEvent[], InningsEvent[]]): Json =>
  JSON.parse(JSON.stringify({ setup, events })) as Json;

export async function createMatch(setup: MatchSetup): Promise<string> {
  const events: [InningsEvent[], InningsEvent[]] = [[], []];
  const tossWinner = setup.tossWinner === 0 ? setup.team1 : setup.team2;
  const { data, error } = await supabase
    .from("matches")
    .insert({
      team1_id: setup.team1.id,
      team2_id: setup.team2.id,
      overs: setup.overs,
      toss_winner_id: tossWinner.id,
      toss_decision: setup.decision,
      status: "in_progress",
      summary: summaryFor(setup, events),
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await syncMatch(data.id, setup, events);
  } catch (error) {
    const { error: cleanupError } = await supabase.from("matches").delete().eq("id", data.id);
    if (cleanupError) {
      console.error("Could not remove a partially initialized Supabase match.", cleanupError);
    }
    throw error;
  }
  return data.id;
}

export async function syncMatch(
  matchId: string,
  setup: MatchSetup,
  events: [InningsEvent[], InningsEvent[]],
) {
  const match = replayMatch(setup, events);
  const tossWinner = setup.tossWinner === 0 ? setup.team1 : setup.team2;
  const { error: matchError } = await supabase
    .from("matches")
    .update({
      team1_id: setup.team1.id,
      team2_id: setup.team2.id,
      overs: setup.overs,
      toss_winner_id: tossWinner.id,
      toss_decision: setup.decision,
      winner_id: match.result?.winnerTeam?.id ?? null,
      status: match.finished ? "completed" : "in_progress",
      result_text: match.result?.text ?? null,
      summary: summaryFor(setup, events),
    })
    .eq("id", matchId)
    .select("id")
    .single();
  if (matchError) throw matchError;

  const { data: existingInnings, error: inningsReadError } = await supabase
    .from("innings")
    .select("id,inning_number")
    .eq("match_id", matchId);
  if (inningsReadError) throw inningsReadError;

  const inningIds = new Map<number, string>();
  for (const inning of match.innings) {
    if (!inning) continue;
    const inningNumber = match.innings.indexOf(inning) + 1;
    const existing = existingInnings?.find((row) => row.inning_number === inningNumber);
    if (existing) {
      const { error } = await supabase
        .from("innings")
        .update({
          batting_team_id: inning.battingTeam.id,
          bowling_team_id: inning.bowlingTeam.id,
          total_runs: inning.runs,
          total_wickets: inning.wickets,
          total_overs_bowled: oversText(inning.legalBalls),
        })
        .eq("id", existing.id);
      if (error) throw error;
      inningIds.set(inningNumber, existing.id);
    } else {
      const { data, error } = await supabase
        .from("innings")
        .insert({
          match_id: matchId,
          inning_number: inningNumber,
          batting_team_id: inning.battingTeam.id,
          bowling_team_id: inning.bowlingTeam.id,
          total_runs: inning.runs,
          total_wickets: inning.wickets,
          total_overs_bowled: oversText(inning.legalBalls),
        })
        .select("id")
        .single();
      if (error) throw error;
      inningIds.set(inningNumber, data.id);
    }
  }

  const { data: existingBalls, error: ballsReadError } = await supabase
    .from("ball_by_ball")
    .select(
      "id,inning_id,over_number,ball_number,bowler_id,striker_id,non_striker_id,runs_scored,extra_type,extra_runs,is_wicket,wicket_type",
    )
    .eq("match_id", matchId);
  if (ballsReadError) throw ballsReadError;

  const ballRows: BallInsert[] = [];

  for (const index of [0, 1] as const) {
    const inningId = inningIds.get(index + 1);
    if (!inningId) continue;

    let striker: string | null = null;
    let nonStriker: string | null = null;
    let bowler: string | null = null;
    let legalBalls = 0;
    let deliveryNumber = 0;
    for (const event of events[index]) {
      if (event.k === "openers") {
        striker = event.striker;
        nonStriker = event.nonStriker;
      } else if (event.k === "bowler") {
        bowler = event.id;
      } else if (event.k === "newBatter") {
        if (!striker) striker = event.id;
        else nonStriker = event.id;
      } else if (event.k === "replaceBatter") {
        if (event.slot === "striker") striker = event.id;
        else nonStriker = event.id;
      } else if (event.k === "ball") {
        deliveryNumber += 1;
        ballRows.push({
          match_id: matchId,
          inning_id: inningId,
          over_number: Math.floor(legalBalls / 6) + 1,
          ball_number: deliveryNumber,
          bowler_id: bowler,
          striker_id: striker,
          non_striker_id: nonStriker,
          runs_scored: event.extra === "wd" ? 0 : event.runs,
          extra_type: event.extra,
          extra_runs: event.extra === "wd" ? 1 + event.runs : event.extra === "nb" ? 1 : 0,
          is_wicket: Boolean(event.wicket),
          wicket_type: event.wicket?.type ?? null,
        });

        const legal = event.extra === null && event.wicket?.type !== "retired_out";
        if (event.runs % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
        if (event.wicket) {
          if (striker === event.wicket.outId) striker = null;
          else if (nonStriker === event.wicket.outId) nonStriker = null;
          if (!striker && nonStriker) [striker, nonStriker] = [nonStriker, null];
        }
        if (legal) {
          legalBalls += 1;
          if (legalBalls % 6 === 0) {
            [striker, nonStriker] = [nonStriker, striker];
            deliveryNumber = 0;
          }
        }
      }
    }
  }

  const ballKey = (row: { inning_id: string; over_number: number; ball_number: number }) =>
    `${row.inning_id}:${row.over_number}:${row.ball_number}`;
  const existingByKey = new Map((existingBalls ?? []).map((row) => [ballKey(row), row] as const));
  const expectedKeys = new Set(ballRows.map(ballKey));
  const rowsToUpsert: Array<BallInsert & { id?: string }> = [];

  for (const row of ballRows) {
    const existing = existingByKey.get(ballKey(row));
    if (!existing) {
      rowsToUpsert.push(row);
    } else if (
      existing.bowler_id !== row.bowler_id ||
      existing.striker_id !== row.striker_id ||
      existing.non_striker_id !== row.non_striker_id ||
      existing.runs_scored !== row.runs_scored ||
      existing.extra_type !== row.extra_type ||
      existing.extra_runs !== row.extra_runs ||
      existing.is_wicket !== row.is_wicket ||
      existing.wicket_type !== row.wicket_type
    ) {
      rowsToUpsert.push({ ...row, id: existing.id });
    }
  }

  if (rowsToUpsert.length) {
    const { error } = await supabase.from("ball_by_ball").upsert(rowsToUpsert);
    if (error) throw error;
  }

  const staleBallIds = (existingBalls ?? [])
    .filter(
      (row) => !expectedKeys.has(ballKey(row)) || existingByKey.get(ballKey(row))?.id !== row.id,
    )
    .map((row) => row.id);
  if (staleBallIds.length) {
    const { error } = await supabase.from("ball_by_ball").delete().in("id", staleBallIds);
    if (error) throw error;
  }

  const currentInningNumbers = new Set(inningIds.keys());
  const staleIds = (existingInnings ?? [])
    .filter((inning) => !currentInningNumbers.has(inning.inning_number))
    .map((inning) => inning.id);
  if (staleIds.length) {
    const { error } = await supabase.from("innings").delete().in("id", staleIds);
    if (error) throw error;
  }
}

function parseMatchRow(row: MatchRow): HistoryRow {
  const { setup, events } = parseSummary(row.summary);
  return {
    id: row.id,
    created_at: row.created_at,
    result_text: row.result_text,
    overs: row.overs,
    setup,
    events,
  };
}

export async function loadHistory(): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("id,created_at,result_text,overs,summary")
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => parseMatchRow(row));
}

export async function loadInProgressMatch(): Promise<HistoryRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("id,created_at,result_text,overs,summary")
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? parseMatchRow(data) : null;
}

export async function abandonMatch(matchId: string) {
  const { error } = await supabase
    .from("matches")
    .update({ status: "abandoned" })
    .eq("id", matchId);
  if (error) throw error;
}
