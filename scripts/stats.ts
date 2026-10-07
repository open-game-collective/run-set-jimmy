import { playGame } from "../src/game/sim";
const players = Number(process.argv[2] ?? 4);
const per: number[][] = Array.from({ length: 7 }, () => []);
let fails = 0;
for (let seed = 1; seed <= 40; seed++) {
  try { playGame({ seed, players }).rounds.forEach((r, i) => per[i]!.push(r.turns / players)); } catch (e) { fails++; console.log(String(e)); }
}
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
per.forEach((a, i) => console.log(`round ${i + 1}: median ${med(a).toFixed(1)} turns each, max ${Math.max(...a).toFixed(0)}`));
console.log("stalled games:", fails);
