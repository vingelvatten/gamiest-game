# Aethermoor — A Massively *Singleplayer* RPG

A top-down, browser-based fantasy action-RPG where the world is alive with **simulated
players**: dozens of AI adventurers that roam, hunt, level up, chat, form guilds and climb
a shared leaderboard right alongside you — all running locally, no servers, no networking.

It *feels* like an MMO. It's entirely singleplayer.

## Run it

```bash
npm install
npm run dev      # play at http://localhost:5173
```

Other scripts: `npm run build` (production bundle) · `npm run check` (type-check) · `npm run preview`.

## Play

| Keys | Action |
|------|--------|
| `W A S D` / Arrows | Move |
| `Space` / Left-click | Basic attack (aims at the cursor) |
| `Q` `E` | Class abilities |
| `R` | Quaff a potion |
| `F` / Enter | Talk to NPCs (look for `!` quest markers) |
| `I C J L M H` | Bag · Hero · Quests · Ranks · Map · Help |
| `Esc` | Close panels |

Pick a **Warrior**, **Mage** or **Ranger**, then hunt your way out from the town of
Aethermoor through the **Greenfields → Darkwood → Sunken Ruins**, leveling up, looting
gear, completing quests, climbing the leaderboard, and finally slaying the **Ancient
Golem**. Progress autosaves to your browser.

## How it works

Everything is custom TypeScript on an HTML5 canvas — no game engine, and **all art is drawn
procedurally** (zero image assets).

```
src/
  engine.ts       loop · input · camera · seeded RNG
  art.ts          procedural tiles, characters, monsters
  world.ts        the live game context (zones, combat routing, loot, ticks)
  zones.ts        town + 3 wilderness zone generators
  entities.ts     player, monsters, NPCs
  combat.ts       damage, projectiles, particles, class abilities
  simulation.ts   ★ the simulated players: AI brains, chat, guilds, leaderboard
  items.ts        items, loot tables, equipment, shops
  quests.ts       main questline, side quests, repeatable bounties
  progression.ts  classes, stats, leveling
  ui.ts           DOM HUD + all panels
  state.ts        save / load
  main.ts         title, class select, boot
```

The simulated players are the heart of it (`simulation.ts`): nearby ones are rendered and
fight monsters in real time; distant ones are advanced by a lightweight off-screen tick, so
the leaderboard genuinely shifts and the world keeps moving while you're away.
