# Run Set Jimmy
A strategic card game of runs and sets, also known as "One Run One Set".

**Audience:** extended family and friends: adults with mixed card-game experience.
**Devices:** TV + phones through OGS (`/cast-party-game`). The TV shows the table (melds, discard
pile, buy window, scores); each phone holds one player's private hand.

## Goal
Seven rounds, each with a different requirement. In each round, be the first to play every card
out. Everyone else scores the cards left in their hand. Lowest total after round 7 wins.

## Components
| Players | Decks | Jokers | Cards |
|---------|-------|--------|-------|
| 2–3     | 2     | 4      | 108   |
| 4–7     | 3     | 6      | 162   |

Two jokers per deck in play. Duplicate cards (e.g. two 7♥) are normal.

## Melds
### Runs
- 4+ consecutive cards of the **same suit** (4♠-5♠-6♠-7♠).
- Ace is low (A-2-3-4) or high (J-Q-K-A). No wrapping (K-A-2 is invalid).
- A run cannot contain the same rank twice.

### Sets
- 3+ cards of the **same rank**, any suits (duplicate suits allowed: 8♠-8♠-8♥).

### Jokers
- Wild in any run or set. **No limit** on how many jokers a meld holds, but every meld needs
  **at least one real card**.
- A joker's value is **fixed by its position**: in 5♥-🃏-7♥-8♥ the joker *is* the 6♥. In a set it
  is one more of that rank.
- **Slide rule:** jokers can never be taken back into a hand. When someone plays the real card a
  joker stands for (the 6♥ above), the real card takes that spot and the joker moves to either end
  of the run (4♥ or 9♥), chosen by the player who played the card. The chosen end must be open:
  if the run already reaches the Ace at both ends, the joker can't be replaced. In a set, adding
  cards never moves a joker.
- Jokers may be discarded.

## Rounds
| Round | Requirement        | Min cards |
|-------|--------------------|-----------|
| 1     | 1 Run, 1 Set       | 7         |
| 2     | 2 Sets             | 6         |
| 3     | 2 Runs             | 8         |
| 4     | 2 Sets, 1 Run      | 10        |
| 5     | 2 Runs, 1 Set      | 11        |
| 6     | 3 Sets             | 9         |
| 7     | 3 Runs             | 12        |

Every game plays all 7 rounds. 11 cards are dealt every round. (Round 7 is possible without buys:
draw to 12, go down with three 4-card runs, out.)

## Deal
1. The **dealer** marker rotates one seat left each round. The player left of the dealer goes first.
2. **The cut:** before dealing, the player right of the dealer taps a spot in the deck on their
   phone. The cut card is revealed on the TV. If it is a **joker, the cutter keeps it** and is
   dealt one fewer card (10). Otherwise it goes back into the deck.
3. Deal 11 cards to each player (10 to a cutter who kept a joker).
4. Turn the top card face-up to start the discard pile. If it is a joker it stays; the first
   player (or a buyer) may take it.

## Turn
1. **Draw** one card: the top of the deck, or the top discard.
2. **Go down** (optional, once per round): lay out *exactly* the required number of runs and
   sets. Each meld may be longer than the minimum (a 6-card run, a 4-card set), but you can't
   lay out extra melds.
3. **Play on melds** (only once you're down, including the turn you went down): add cards to
   any meld on the table, yours or anyone's, following the slide rule for jokers.
4. **Discard** one card to end your turn.

### Going out
- You go out by **playing your last card onto the table**, never by discarding it.
- **You can never discard your last card.** After discarding you always hold at least 1 card. When
  you're down to 1 card, you draw to 2. If both play, you're out. If not, you play none, discard
  one and hold the other.
- So your plays may leave you holding a single card only if that card can still be played onto
  the table; otherwise keep 2 and discard one.
- If you go out, the turn ends without a discard, and so does the round.

## Buying
- You may buy only when it is **not your turn to draw**. If it's your draw, you just take the
  discard.
- A buy gives you the top discard **plus** the top card of the deck (2 cards).
- **Max 3 buys per player per round.**
- **Buy window (3 s, configurable):** after each discard the TV shows a countdown around the
  discard pile.
  - The **next player** may take the discard immediately; this cancels any buys. They **cannot
    draw from the deck until the window closes**.
  - Any other player may tap **Buy** during the window.
  - When the window closes with buy requests, the next player is prompted: *"X wants the 7♠:
    take it or let it go?"* If they let it go, the requester **closest in seat order after the
    next player** buys it, and the next player draws from the deck.
  - With no requests, the next player draws normally.

## Empty deck
Keep the top discard, shuffle the rest of the discard pile into a new deck.

## Scoring
| Card   | Points |
|--------|--------|
| 2–7    | 5      |
| 8–K    | 10     |
| Ace    | 20     |
| Joker  | 50     |

The player who went out scores 0 for the round. Lowest total after round 7 wins. **Ties share the
win.**

## Player help (phones)
- Sort hand by suit or by rank, and drag to rearrange.
- Requirement progress ("Need: 1 run, 1 set") lights up when the selected cards form a valid meld.
- Once you're down, cards that fit a meld on the table are highlighted.
- No automatic go-down suggestions.

## Also (confirmed 2026-10-07)
- You must draw before going down or playing.
- You may only play cards during your own turn (buying is the only out-of-turn action).
- Players who are already down may still buy.
- You may discard a card that would fit a meld on the table.
- 2–7 players, all human: no bots in the POC, and no turn timer.
- A disconnected player rejoins the same seat with the same hand.
