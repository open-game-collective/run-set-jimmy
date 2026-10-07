// import { describe, it, expect } from 'vitest';
// import { validateHand, findRuns, findSets } from './player-view';

// describe('Card validation functions', () => {
//   describe('findRuns', () => {
//     it('finds valid runs of 4+ consecutive cards', () => {
//       const cards = [
//         { id: "1", suit: "hearts", rank: "4" },
//         { id: "2", suit: "hearts", rank: "5" },
//         { id: "3", suit: "hearts", rank: "6" },
//         { id: "4", suit: "hearts", rank: "7" },
//       ];
//       const runs = findRuns(cards);
//       expect(runs).toHaveLength(1);
//       expect(runs[0]).toHaveLength(4);
//     });

//     // Add more test cases...
//   });

//   describe('findSets', () => {
//     it('finds valid sets of 3+ cards of same rank', () => {
//       const cards = [
//         { id: "1", suit: "hearts", rank: "Q" },
//         { id: "2", suit: "diamonds", rank: "Q" },
//         { id: "3", suit: "spades", rank: "Q" },
//       ];
//       const sets = findSets(cards);
//       expect(sets).toHaveLength(1);
//       expect(sets[0]).toHaveLength(3);
//     });

//     // Add more test cases...
//   });
// });
