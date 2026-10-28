# GreenHex Team | NESARI 2026 — NetOne Topic 2

## Adaptive Antenna Intelligence

A software-first prototype that forecasts a synthetic directional demand profile, evaluates bounded antenna settings, explains its decision, and verifies the resulting simulated coverage score. The team needs no physical components to present it. Tinkercad provides an optional virtual Arduino Uno and one servo as a visual actuator demonstration.

> All sites, demand profiles, forecasts, and scores are illustrative simulations. They are not live NetOne data, measured RF results, or evidence of field coverage improvement.

## Competition story

The differentiator is **trust-aware autonomy**: the dashboard shows the forecast and why it acted, limits azimuth movement, and chooses **HOLD** when the forecast is inconsistent or the projected gain is under the configured threshold. The comparison view scores fixed, busiest-direction, and forecast-aware methods against one reproducible demand profile.

The decision engine is a transparent damped trend forecast plus constrained candidate search. It is not a trained machine-learning model. The confidence value is a synthetic profile-consistency indicator, not a calibrated probability.

## Five-step demonstration

1. **Observe:** choose a demo site and scan 72 simulated directions.
2. **Forecast:** compare the recent synthetic profiles and show the forecast peak and consistency.
3. **Decide:** score allowed azimuth/tilt candidates within the 45-degree movement bound.
4. **Act or hold:** show the recommended setting and the guardrail reason.
5. **Verify:** compare the same demand scan before and after the simulated setting.

For the live pitch, run **Compare Strategies** first. It uses a reproducible seed and shows three scores against one forecast. Then run **Run Autonomous Cycle** to show the full animation and verification. If time is short, stay in the dashboard; Tinkercad is an optional visual add-on.

## Tinkercad virtual demo (no purchases)

Open the Tinkercad link in the dashboard or `hardware/tinkercad/TINKERCAD_SETUP.md`. Add only a virtual Arduino Uno R3 and one Micro Servo. Load `hardware/arduino/antenna_controller.ino`, connect servo signal to D10, VCC to 5V, and GND to GND, then run the simulation. The sketch's `DEMO` command shows the virtual servo sweeping through example azimuths.

Tinkercad and the dashboard are separate simulations; the dashboard does not directly control the Tinkercad circuit. Narrate the dashboard's displayed `SET AZIMUTH N` target, then enter a corresponding command manually in the virtual circuit if its serial input is available. Otherwise, run the sketch's `DEMO` sequence and explain the matching target. Do not describe this as a live connection. No Arduino, servo, wires, or other physical parts need to be bought.

## Run the dashboard

Use Python 3.10+ and install the dependencies in `requirements.txt`. From the project root, run the backend and frontend in separate terminals:

```powershell
python -m pip install -r requirements.txt
python backend/server.py
```

In another terminal:

```powershell
python -m http.server 8000 --directory frontend
```

Open `http://127.0.0.1:8000`. The backend listens on `http://127.0.0.1:5001`. Keep `NETONE_HARDWARE` unset or set to `simulation` for the competition demo.

## Decision method and guardrails

- 72 directional bins at 5-degree intervals.
- Damped one-step trend forecast from up to four recent synthetic windows.
- Search across 37 azimuth candidates (0–180 degrees, in 5-degree steps) and four illustrative tilt settings (3, 6, 9, and 12 degrees).
- Maximum azimuth movement of 45 degrees per action.
- Prefer lower movement when scores tie.
- Hold below 65% simulated consistency or below 2 points of forecast gain.

These are prototype settings, not NetOne engineering limits. The coverage score is a simple illustrative demand-weighted beam model. A field study would require authorised, privacy-safe network and RF data, calibration, repeated baseline evaluation, and operator review.

## Project map

- `frontend/index.html`, `frontend/css/style.css`, `frontend/js/app.js` — dashboard interface and flow.
- `backend/server.py` — API, demo state, scan generation, and verification.
- `ai/optimizer.py` — forecast, constrained search, and HOLD guardrails.
- `hardware/arduino/antenna_controller.ino` — one-servo virtual Arduino sketch.
- `hardware/tinkercad/TINKERCAD_SETUP.md` — virtual circuit setup and demo script.
- `docs/NESARI_PRESENTATION_PLAN.md` — competition pitch plan.
- `docs/PRESENTATION_FLOW.md` — operator run sheet.
- `deliverables/` — Word documents and the PowerPoint presentation.

## Update: reachable demand and held-out verification

- **Mounting heading.** Each demo site has a compass mounting heading (`data/network_towers.json`). The antenna's 0–180 degree range covers compass `heading` to `heading + 180`, and each site's main demand peak falls inside it. The radar uses the antenna's own frame. Some secondary demand still lies behind the antenna; the dashboard reports the share inside the arc.
- **Demand behaviour.** Each site is `steady`, `drifting` or `erratic` (override with the DEMAND BEHAVIOUR selector). Prior windows follow that behaviour instead of being derived from the current scan, so forecast consistency varies and HOLD can trigger.
- **Held-out verification.** The server generates a next demand window that the optimizer never sees. Verification and Compare Strategies score on that window. In a 40-run test: steady and drifting demand always acted with a positive held-out gain; erratic demand held in 32 of 40 runs, and in the 8 runs where it acted the average outcome was not positive.

## Update: operations, metrics and a 24-hour simulation

- **Copy command.** A COPY button beside the Virtual Actuator Target copies `SET AZIMUTH N` for the Tinkercad Serial Monitor.
- **Backup mode.** If the backend is unreachable the dashboard switches to a recorded session (`frontend/data/backup.json`, real engine outputs for every site and behaviour) and shows an orange BACKUP MODE banner. RETRY LIVE restores the live engine. Re-record it after any engine change: start the backend, then run `python tools_record_backup.py`.
- **Audit log.** EXPORT AUDIT LOG downloads every decision as CSV: time, site, behaviour, scan and forecast peaks, confidence, action, from/to settings, reason, before/after scores and whether the score used the held-out next window.
- **Extra metrics.** Demand in beam (a throughput proxy, not Mbps), plus moves, degrees travelled and holds as equipment-use measures.
- **24-hour simulation.** `POST /api/day_sim` runs hourly decisions against a daily demand profile and scores each on the next hour. Baselines: the best fixed setting (chosen with hindsight) and the installed setting.
- **Engine fixes found by the simulation.** (1) Forecast consistency now uses the spread of peak directions; the circular average it used before could not drop low for demand confined to a half-plane, so HOLD rarely fired on erratic demand. (2) A SEEK STEP lets the engine move toward a forecast peak that is beyond the beam's reach instead of freezing, still within the 45 degree limit and the confidence guardrail.
- **Measured results (illustrative simulation).** Single scan, 40 runs: steady and drifting demand always acted with a positive gain on the next window (worst +3.1); erratic demand held in 39 of 40. 24-hour, Chinhoyi: drifting +5.4 points over the best fixed setting (11 moves, 220 degrees); steady -0.6; erratic -4.3. Adapting only pays when demand moves predictably.
