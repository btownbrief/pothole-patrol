# 🚧 POTHOLE PATROL

A Whac-A-Mole–style arcade game set on **North Ave in Burlington, Vermont's New
North End** during mud season. Part of **Btown Games**, the browser arcade of the
[BTown Brief](https://www.btownbrief.com).

**Play it:** https://btownbrief.github.io/pothole-patrol/

## How it plays

- Potholes erupt at fixed spots along North Ave. **Tap to slap asphalt in.**
- Fresh holes take **1 tap**; ignore one and it cracks into a **crater (2 taps)**.
- A **Subaru Outback** cruises up and down the avenue. If it hits an open
  pothole you lose one of **3 hubcaps** — lose all three and the run ends.
- Waves escalate: more simultaneous holes, faster eruptions, faster car.
- **🍁 maple syrup** = bonus points · **🚜 snowplow** = fills every open hole.
- Chain fast fills for a **combo multiplier** (up to x5); whiffs break the chain.
- Endless, with monthly shared leaderboards and local best score.

## Tech

Plain static site — no build step. `index.html` + `style.css` + ES modules in
`js/`. All art is canvas-drawn, all sfx are synthesized WebAudio. The monthly
leaderboard uses the shared Btown Games Supabase backend (`js/leaderboard.js`,
game slug `pothole-patrol`); if its config values are removed the game runs
fine with all leaderboard UI hidden.

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.

---

A Btown Games production · [Read the BTown Brief →](https://www.btownbrief.com)
