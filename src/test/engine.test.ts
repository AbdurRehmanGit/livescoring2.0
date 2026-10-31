import { describe, expect, it } from "vitest";
import {
  replayInnings,
  replayMatch,
  type InningsEvent,
  type MatchSetup,
  type Team,
} from "@/lib/engine";

const makeTeam = (id: string, name: string): Team => ({
  id,
  name,
  color: id === "a" ? "#ff8a00" : "#22d3ee",
  players: [1, 2, 3, 4].map((n) => ({ id: `${id}${n}`, name: `${name} ${n}` })),
});

const teamA = makeTeam("a", "Alpha");
const teamB = makeTeam("b", "Beta");
const setup: MatchSetup = { team1: teamA, team2: teamB, overs: 1, tossWinner: 0, decision: "bat" };

describe("cricket scoring engine", () => {
  it("replays legal balls, extras, strike changes, and bowler figures", () => {
    const inning = replayInnings(
      teamA,
      teamB,
      [
        { k: "openers", striker: "a1", nonStriker: "a2" },
        { k: "bowler", id: "b1" },
        { k: "ball", runs: 1, extra: null },
        { k: "ball", runs: 4, extra: null },
        { k: "ball", runs: 2, extra: "nb" },
        { k: "ball", runs: 1, extra: "wd" },
      ],
      1,
      null,
    );

    expect(inning.runs).toBe(10);
    expect(inning.legalBalls).toBe(2);
    expect(inning.extras).toEqual({ wd: 2, nb: 1 });
    expect(inning.batters.find((b) => b.id === "a1")).toMatchObject({ runs: 1, balls: 1 });
    expect(inning.batters.find((b) => b.id === "a2")).toMatchObject({
      runs: 6,
      balls: 2,
      fours: 1,
    });
    expect(inning.bowlers.at(0)).toMatchObject({ legalBalls: 2, runs: 10, wides: 1, noBalls: 1 });
    expect(inning.overs.at(0)?.balls).toEqual(["1", "4", "Nb+2", "Wd+1"]);
  });

  it("finishes an over, rotates strike, and starts the second innings at the target", () => {
    const firstEvents: InningsEvent[] = [
      { k: "openers", striker: "a1", nonStriker: "a2" },
      { k: "bowler", id: "b1" },
      ...Array.from({ length: 6 }, () => ({ k: "ball" as const, runs: 0, extra: null })),
    ];
    const first = replayInnings(teamA, teamB, firstEvents, 1, null);
    expect(first.complete).toBe(true);
    expect(first.legalBalls).toBe(6);
    expect(first.striker).toBe("a2");
    expect(first.needs).toBeNull();

    const secondEvents: InningsEvent[] = [
      { k: "openers", striker: "b1", nonStriker: "b2" },
      { k: "bowler", id: "a1" },
      { k: "ball", runs: 1, extra: null },
    ];
    const second = replayMatch(setup, [firstEvents, secondEvents]);
    expect(second.innings[1]?.target).toBe(1);
    expect(second.finished).toBe(true);
    expect(second.result?.text).toBe("Beta won by 4 wickets");
  });

  it("preserves the lone remaining batter until the innings limit is reached", () => {
    const inning = replayInnings(
      teamA,
      teamB,
      [
        { k: "openers", striker: "a1", nonStriker: "a2" },
        { k: "bowler", id: "b1" },
        { k: "ball", runs: 0, extra: null, wicket: { type: "bowled", outId: "a2" } },
        { k: "newBatter", id: "a3" },
        { k: "ball", runs: 0, extra: null, wicket: { type: "caught", outId: "a3" } },
        { k: "newBatter", id: "a4" },
        { k: "ball", runs: 0, extra: null, wicket: { type: "bowled", outId: "a4" } },
      ],
      1,
      null,
    );

    expect(inning.wickets).toBe(3);
    expect(inning.complete).toBe(false);
    expect(inning.striker).toBe("a1");
    expect(inning.nonStriker).toBeNull();
    expect(inning.needs).toBeNull();
  });

  it("keeps a free hit through wides and clears it after the next legal delivery", () => {
    const events: InningsEvent[] = [
      { k: "openers", striker: "a1", nonStriker: "a2" },
      { k: "bowler", id: "b1" },
      { k: "ball", runs: 0, extra: "nb" },
      { k: "ball", runs: 0, extra: "wd" },
    ];
    expect(replayInnings(teamA, teamB, events, 1, null).freeHit).toBe(true);

    events.push({ k: "ball", runs: 0, extra: null });
    expect(replayInnings(teamA, teamB, events, 1, null).freeHit).toBe(false);
  });
});
