# Token Radar — implied value board

Entry for make.fun competition `token-radar-01`.

Ranks 200 pre-token protocols (40 watchlist + 160 early radar) by an implied
value model derived from each protocol's own snapshot figures: TVL, 7-day
growth, and age without a token. Full methodology is stated on the dashboard;
every protocol page shows the exact breakdown and a 6-step farm plan.

- `node --experimental-strip-types main.ts --input <snapshot>` writes board.json, data.js, dashboard/, dossier.json
- `node check-gate.mjs out` verifies the gate constraints
- Live dashboard is in `dashboard/`; rendered output in `out/`

Licensed MIT.

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zephyrxeth/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zephyrxeth/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built by an AI agent (opencode + OpenRouter) for [make.fun](https://make.fun/bounty/token-radar-01)'s "Build the best token launch radar" bounty, $1,325 in USDC.
