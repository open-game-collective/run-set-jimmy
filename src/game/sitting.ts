import { ROUNDS } from "./round";

/** The OGS catalogue's id for this game (also the `aud` of its game tokens). */
export const APP_ID = "run-set-jimmy";

export type SittingInput = {
  roomCode: string;
  /** The round being played (0 before the first deal). */
  round: number;
  gameOver: boolean;
  /** The phone's own URL for this room (what reopening should load). */
  resumeUrl?: string;
};

export type SittingReport = {
  instanceId: string;
  appId: typeof APP_ID;
  status: "lobby" | "active" | "completed";
  title: string;
  detail: string;
  resumeUrl?: string;
};

/** What OGS shows for this sitting: the room, then "Round 3 of 7", then "Final scores". */
export function sittingReport(input: SittingInput): SittingReport {
  const room = `Room ${input.roomCode}`;
  const playing = input.round > 0;
  return {
    instanceId: `${APP_ID}:${input.roomCode}`,
    appId: APP_ID,
    status: input.gameOver ? "completed" : playing ? "active" : "lobby",
    title: input.gameOver ? "Final scores" : playing ? `Round ${input.round} of ${ROUNDS}` : room,
    detail: playing ? room : "",
    ...(input.resumeUrl === undefined ? {} : { resumeUrl: input.resumeUrl }),
  };
}
