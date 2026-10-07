import { describe, expect, it } from "vitest";
import { sittingReport } from "./sitting";

const base = { roomCode: "KQTP", round: 0, gameOver: false };

describe("sittingReport: the label the OGS app shows for this sitting", () => {
  it("names the room until the first round is dealt", () => {
    expect(sittingReport(base)).toEqual({
      instanceId: "run-set-jimmy:KQTP",
      appId: "run-set-jimmy",
      status: "lobby",
      title: "Room KQTP",
      detail: "",
    });
  });

  it("names the round by what it asks for once play starts", () => {
    expect(sittingReport({ ...base, round: 3 })).toMatchObject({ status: "active", title: "Two runs", detail: "Room KQTP" });
    expect(sittingReport({ ...base, round: 1 })).toMatchObject({ title: "One run, one set" });
  });

  it("says when the game is over", () => {
    expect(sittingReport({ ...base, round: 7, gameOver: true })).toMatchObject({ status: "completed", title: "Final scores" });
  });

  it("keeps one instance id per room, and passes the resume URL", () => {
    expect(sittingReport({ ...base, round: 5, resumeUrl: "https://x/join/KQTP?t=1" })).toMatchObject({
      instanceId: "run-set-jimmy:KQTP",
      resumeUrl: "https://x/join/KQTP?t=1",
    });
  });
});
