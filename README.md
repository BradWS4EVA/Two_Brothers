# TWO BROTHERS

**Two brothers.** In a van. And then a meteor hit. And they ran as fast as they could — from giant cat monsters. And then a giant tornado came, and that's when things got knocked into **12th gear**. A Mexican armada shows up, with weapons made from tomatoes. And you better bet your bottom dollar that these two brothers know how to handle business.

**In: Alaska.**

It's just called: *Two Brothers.*

A fan-made mobile game tribute to the greatest improvised movie trailer of all time. Built as a zero-dependency HTML5 canvas game that installs on Android like a native app (PWA — fullscreen, offline, home-screen icon).

---

## 🎮 How to play

You control **both brothers at the same time** — one thumb each:

| Input | Action |
|---|---|
| **Left thumb** (left half of screen) | Top brother jumps |
| **Right thumb** (right half of screen) | Bottom brother jumps |
| Tap again mid-air | Double jump |
| Tap 🔊 (top-right) or press `M` | Toggle sound |

Desktop testing: `A`/`W` = top brother, `L`/`↑` = bottom brother.

The brothers share **4 hearts**. Lose them all and, well... they were handling business.

### The trailer script IS the level design

The game escalates through the actual beats of the trailer, with cinematic letterboxed title cards between waves:

1. **THE VAN** — you start riding it. It does not survive.
2. **AND THEN A METEOR HIT** — flaming meteors rain down with warning markers, leaving burning craters.
3. **GIANT CAT MONSTERS** — a monster looms at the edge of the screen slamming giant paws (with toe beans) into your lanes.
4. **THE GIANT TORNADO** — flying debris at head height (don't jump into it!), sideways snow... and then things get knocked into **12TH GEAR** (permanent speed boost).
5. **THE MEXICAN ARMADA** — floating galleons lob arcing tomato cannonballs at marked splat zones.
6. **HANDLING BUSINESS** — everything at once, looping faster and faster until the brothers go down.

### Power-ups

- 🍅 **Tomato crate** — the brothers auto-throw tomatoes at threats ahead. Weapons made from tomatoes: it works both ways.
- 🚐 **The Van** — 4.5 seconds of invincible, obstacle-plowing glory. Honk honk.
- ❤️ **Heart** — heals one heart.
- ⚙️ **x2 Gear** — double score for 9 seconds.

Score, best run, and best wave are saved on-device. Everything (art, sound, music) is generated in code — no assets, no downloads, works offline in a van in Alaska.

---

## 📱 Get it on your Android phone

The game is a static site — easiest path is **GitHub Pages**:

1. On GitHub: **Settings → Pages → Source: GitHub Actions** (a deploy workflow is already included in `.github/workflows/deploy-pages.yml`; it deploys the default branch on every push).
2. Open the Pages URL in Chrome on your phone.
3. Chrome menu (⋮) → **Add to Home screen** → **Install**.
4. Launch from the icon: fullscreen, portrait-locked, works offline.

### Run it locally right now

```bash
cd Two_Brothers
python3 -m http.server 8080
# open http://<your-computer-ip>:8080 on your phone (same Wi-Fi)
```

### Regenerate icons

```bash
node tools/make-icons.mjs
```

---

## 🗺️ Roadmap

- [x] **v1 — single phone.** Two brothers, one player, two thumbs. The whole trailer.
- [ ] **v1.1 — polish.** More trailer deep cuts (the old woman?!), pause button, achievements ("Bottom Dollar": survive Handling Business without a hit), daily-run seed.
- [ ] **v2 — MULTIPLAYER: one brother each.** The dream: two phones, each player controls one brother, hearts still shared — you win together or eat snow together.
  - Plan A: WebRTC peer-to-peer (via a tiny signaling service) — same Wi-Fi = low latency.
  - Plan B: room-code lobby over WebSockets for cross-network play.
  - Deterministic lockstep sim (fixed timestep + shared RNG seed) so both phones stay in sync.
- [ ] **v2.1 — Play Store.** Wrap the PWA in a Trusted Web Activity (Bubblewrap) for a real APK/AAB.

## ⚖️ Note

This is a non-commercial fan tribute inspired by an improvised bit in *Rick and Morty* (S1E8 "Rixty Minutes"). No assets, audio, or footage from the show are used — everything is drawn and synthesized in code. Rick and Morty is © Adult Swim / Cartoon Network.
