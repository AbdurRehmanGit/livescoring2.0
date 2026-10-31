// Pure cricket scoring engine. State is derived by replaying events, so undo = drop last event.

export type Player = { id: string; name: string };
export type Team = { id: string; name: string; color: string; players: Player[] };

export type WicketType = "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "retired_out";

export type InningsEvent =
  | { k: "openers"; striker: string; nonStriker: string | null }
  | { k: "bowler"; id: string }
  | { k: "newBatter"; id: string }
  | { k: "replaceBatter"; slot: "striker" | "nonStriker"; id: string }
  | {
      k: "ball";
      runs: number; // runs off bat (or runs run on a wide)
      extra: null | "wd" | "nb";
      wicket?: { type: WicketType; outId: string };
    };

export type MatchSetup = {
  team1: Team;
  team2: Team;
  overs: number;
  tossWinner: 0 | 1;
  decision: "bat" | "bowl";
};

export type BatterStats = {
  id: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  howOut: string | null;
};
export type BowlerStats = {
  id: string;
  name: string;
  legalBalls: number;
  runs: number;
  wickets: number;
  maidens: number;
  wides: number;
  noBalls: number;
};
export type OverRecord = {
  number: number;
  bowlerId: string | null;
  balls: string[];
  runs: number;
  wickets: number;
};

export type InningsState = {
  battingTeam: Team;
  bowlingTeam: Team;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: { wd: number; nb: number };
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  lastBowler: string | null;
  batters: BatterStats[]; // in batting order
  bowlers: BowlerStats[];
  overs: OverRecord[];
  freeHit: boolean;
  needs: null | "openers" | "bowler" | "newBatter";
  complete: boolean;
  target: number | null;
};

export const BALLS_PER_OVER = 6;

export function oversText(legalBalls: number) {
  return `${Math.floor(legalBalls / BALLS_PER_OVER)}.${legalBalls % BALLS_PER_OVER}`;
}

export function battingOrder(setup: MatchSetup): [Team, Team] {
  const winner = setup.tossWinner === 0 ? setup.team1 : setup.team2;
  const loser = setup.tossWinner === 0 ? setup.team2 : setup.team1;
  return setup.decision === "bat" ? [winner, loser] : [loser, winner];
}

const creditBowler = (t: WicketType) => t !== "run_out" && t !== "retired_out";

const HOW_OUT: Record<WicketType, string> = {
  bowled: "b",
  caught: "caught",
  lbw: "lbw b",
  run_out: "run out",
  stumped: "st b",
  retired_out: "retired out",
};

export function replayInnings(
  battingTeam: Team,
  bowlingTeam: Team,
  events: InningsEvent[],
  maxOvers: number,
  target: number | null,
): InningsState {
  const s: InningsState = {
    battingTeam,
    bowlingTeam,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wd: 0, nb: 0 },
    striker: null,
    nonStriker: null,
    bowler: null,
    lastBowler: null,
    batters: [],
    bowlers: [],
    overs: [],
    freeHit: false,
    needs: "openers",
    complete: false,
    target,
  };
  const pname = (team: Team, id: string) => team.players.find((p) => p.id === id)?.name ?? "?";
  const batter = (id: string) => {
    let b = s.batters.find((x) => x.id === id);
    if (!b) {
      b = {
        id,
        name: pname(battingTeam, id),
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
        howOut: null,
      };
      s.batters.push(b);
    }
    return b;
  };
  const bowlerStats = (id: string) => {
    let b = s.bowlers.find((x) => x.id === id);
    if (!b) {
      b = {
        id,
        name: pname(bowlingTeam, id),
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        maidens: 0,
        wides: 0,
        noBalls: 0,
      };
      s.bowlers.push(b);
    }
    return b;
  };
  const n = battingTeam.players.length;
  const swap = () => {
    if (s.nonStriker) [s.striker, s.nonStriker] = [s.nonStriker, s.striker];
  };
  let current: OverRecord | null = null;
  let overConceded = 0;

  for (const e of events) {
    if (e.k === "openers") {
      s.striker = e.striker;
      s.nonStriker = e.nonStriker;
      batter(e.striker);
      if (e.nonStriker) batter(e.nonStriker);
    } else if (e.k === "bowler") {
      s.bowler = e.id;
      bowlerStats(e.id);
      current = { number: s.overs.length + 1, bowlerId: e.id, balls: [], runs: 0, wickets: 0 };
      s.overs.push(current);
      overConceded = 0;
    } else if (e.k === "newBatter") {
      batter(e.id);
      if (!s.striker) s.striker = e.id;
      else s.nonStriker = e.id;
    } else if (e.k === "replaceBatter") {
      const previousId = e.slot === "striker" ? s.striker : s.nonStriker;
      if (previousId) batter(previousId).howOut = "retired not out";
      batter(e.id);
      if (e.slot === "striker") s.striker = e.id;
      else s.nonStriker = e.id;
    } else if (e.k === "ball" && s.striker && s.bowler && current) {
      const bw = bowlerStats(s.bowler);
      const st = batter(s.striker);
      let label: string;
      let total: number;
      let legal = true;
      if (e.extra === "wd") {
        legal = false;
        total = 1 + e.runs;
        s.extras.wd += total;
        bw.wides += 1;
        bw.runs += total;
        label = e.runs ? `Wd+${e.runs}` : "Wd";
      } else if (e.extra === "nb") {
        legal = false;
        total = 1 + e.runs;
        s.extras.nb += 1;
        bw.noBalls += 1;
        bw.runs += total;
        st.runs += e.runs;
        st.balls += 1;
        if (e.runs === 4) st.fours++;
        if (e.runs === 6) st.sixes++;
        label = e.runs ? `Nb+${e.runs}` : "Nb";
      } else {
        total = e.runs;
        bw.runs += total;
        st.runs += e.runs;
        st.balls += 1;
        if (e.runs === 4) st.fours++;
        if (e.runs === 6) st.sixes++;
        label = String(e.runs);
      }
      if (e.wicket?.type === "retired_out") {
        legal = false;
        st.balls = Math.max(0, st.balls - (e.extra ? 0 : 1));
        label = "RO";
      }
      s.runs += total;
      current.runs += total;
      overConceded += total;
      if (legal) {
        s.legalBalls += 1;
        bw.legalBalls += 1;
      }
      // strike rotation on runs actually run
      if (e.runs % 2 === 1) swap();

      if (e.wicket) {
        const out = batter(e.wicket.outId);
        out.out = true;
        const bowlerName = bw.name;
        out.howOut =
          e.wicket.type === "run_out" ||
          e.wicket.type === "retired_out" ||
          e.wicket.type === "caught"
            ? HOW_OUT[e.wicket.type]
            : `${HOW_OUT[e.wicket.type]} ${bowlerName}`;
        s.wickets += 1;
        current.wickets += 1;
        if (creditBowler(e.wicket.type)) bw.wickets += 1;
        if (e.wicket.type !== "retired_out") label = e.extra ? `${label}+W` : "W";
        if (s.striker === out.id) s.striker = null;
        else if (s.nonStriker === out.id) s.nonStriker = null;
        // last man standing: keep the survivor on strike
        if (!s.striker && s.nonStriker) {
          s.striker = s.nonStriker;
          s.nonStriker = null;
        }
      }
      if (e.extra === "nb") s.freeHit = true;
      else if (legal) s.freeHit = false;
      current.balls.push(label);

      if (legal && s.legalBalls % BALLS_PER_OVER === 0) {
        if (overConceded === 0) bw.maidens += 1;
        swap();
        s.lastBowler = s.bowler;
        s.bowler = null;
        current = null;
      }
    }
  }

  const allOut = n > 0 && s.wickets >= n;
  const oversDone = s.legalBalls >= maxOvers * BALLS_PER_OVER;
  const chased = target !== null && s.runs >= target;
  s.complete = allOut || oversDone || chased;
  if (s.complete) s.needs = null;
  else if (!events.some((e) => e.k === "openers")) s.needs = "openers";
  else if (s.batters.filter((b) => !b.out).length < Math.min(2, n - s.wickets) && hasAvailable(s))
    s.needs = "newBatter";
  else if (!s.bowler) s.needs = "bowler";
  else s.needs = null;
  return s;
}

function hasAvailable(s: InningsState) {
  return availableBatters(s).length > 0;
}

export function availableBatters(s: InningsState) {
  const used = new Set(s.batters.map((b) => b.id));
  return s.battingTeam.players.filter((p) => !used.has(p.id));
}

export type MatchState = {
  setup: MatchSetup;
  innings: [InningsState, InningsState | null];
  current: 0 | 1;
  finished: boolean;
  result: { winnerIdx: 0 | 1 | null; text: string; winnerTeam: Team | null } | null;
};

export function replayMatch(
  setup: MatchSetup,
  events: [InningsEvent[], InningsEvent[]],
): MatchState {
  const [bat1, bat2] = battingOrder(setup);
  const i1 = replayInnings(bat1, bat2, events[0], setup.overs, null);
  let i2: InningsState | null = null;
  if (i1.complete) i2 = replayInnings(bat2, bat1, events[1], setup.overs, i1.runs + 1);
  const finished = !!i2?.complete;
  let result: MatchState["result"] = null;
  if (finished && i2) {
    if (i2.runs > i1.runs) {
      const left = bat2.players.length - i2.wickets;
      result = {
        winnerIdx: 1,
        winnerTeam: bat2,
        text: `${bat2.name} won by ${left} wicket${left === 1 ? "" : "s"}`,
      };
    } else if (i1.runs > i2.runs) {
      const d = i1.runs - i2.runs;
      result = {
        winnerIdx: 0,
        winnerTeam: bat1,
        text: `${bat1.name} won by ${d} run${d === 1 ? "" : "s"}`,
      };
    } else result = { winnerIdx: null, winnerTeam: null, text: "Match tied" };
  }
  return { setup, innings: [i1, i2], current: i1.complete ? 1 : 0, finished, result };
}

export const strikeRate = (r: number, b: number) => (b ? ((r / b) * 100).toFixed(1) : "0.0");
export const economy = (r: number, balls: number) =>
  balls ? ((r / balls) * 6).toFixed(2) : "0.00";
export const runRate = (r: number, balls: number) =>
  balls ? ((r / balls) * 6).toFixed(2) : "0.00";
