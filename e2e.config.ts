import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { chatgpt } from "e2e/oauth/chatgpt";

/**
 * tester-army/e2e, for exploration (the bug bash). Each explorer plays one phone at a table of
 * bots (e2e/bot-table.ts); APP_URL is that table's /join/CODE. Agent steps run on Jon's ChatGPT plan.
 * Multi-device flows stay Playwright seam tests in e2e/*.seam.test.ts.
 */
const table = "You are a grown-up at a family card-game night, playing Run Set Jimmy (a rummy game of runs and sets over 7 rounds) on your phone. Three other players are on their own phones; they take their turns by themselves, so after your turn, wait for yours to come back. The TV shows the table to everyone. Rules: draw (deck or discard), optionally go down with exactly the round's runs/sets, play cards onto melds once down, then discard one card. Others may buy a fresh discard within 3 seconds.";
const persona = (who: string) => ({ model: chatgpt("gpt-6-luna"), system: `${table} ${who}` });

export default {
  agents: {
    default: persona("Play normally and report anything broken or confusing."),
    "first-time-user": persona("You have never played rummy and never seen this app. Rely only on what the screen tells you."),
    "power-user": persona("You know rummy games well and play fast; you use every control: sorting, rearranging, the go-down builder, playing on other players' melds."),
    "error-paths": persona("You deliberately try wrong moves and bad timing to see whether the app explains what went wrong."),
    "edge-cases": persona("You probe limits: long or unusual names, the last-card rule, buying limits, jokers."),
    mobile: persona("You are on a small, older phone held in one hand; you care whether everything fits, is readable and tappable."),
    adversarial: persona("You are a mischievous player trying to cheat or break the game: tampering with the URL, double-tapping, acting out of turn, script in your name."),
  },
  targets: [
    { name: "phone", engine: web({ viewport: { width: 393, height: 852 } }), app: { url: process.env.APP_URL ?? "http://localhost:8797" } },
    { name: "phone-small", engine: web({ viewport: { width: 375, height: 667 } }), app: { url: process.env.APP_URL ?? "http://localhost:8797" } },
  ],
} satisfies E2EConfig;
