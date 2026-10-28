# Presentation Run Sheet — GreenHex Team

## Before presenting

1. Start the backend and dashboard.
2. Confirm the system status says **SYSTEM READY** and actuator mode says **VIRTUAL MODE**.
3. Keep the browser on the dashboard and reset to baseline.
4. Open the Tinkercad virtual circuit in a separate tab only if using it.
5. Have the Tinkercad `DEMO` command ready as the visual fallback.

## Main live run (about 2 minutes)

1. **Compare:** select **Compare Strategies**. Explain that all three approaches use the same fixed synthetic profile and the same forecast objective.
2. **Forecast:** point to the forecast peak and consistency indicator. Clarify that consistency is not a probability.
3. **Decide:** describe the bounded candidate search and the visible reason for ADJUST or HOLD.
4. **Simulate:** select **Run Autonomous Cycle** and show the dashboard actuator animation.
5. **Verify:** read the same-profile score check, labeled as simulated coverage.
6. **Tinkercad (optional):** show the virtual Uno and one servo. Manually enter the dashboard target if serial input is available, otherwise run `DEMO`.

## Suggested narration

> “The system observes a directional demand profile, forecasts the next synthetic window, and evaluates constrained antenna settings. It limits movement and shows why it recommends a change or chooses HOLD. We then verify against the same demand profile. The dashboard and Tinkercad are separate simulations; no physical parts or live network connection are involved.”

## Differentiator to emphasize

The system can decline to move. It uses a configurable consistency threshold of 65% and a minimum forecast gain of two points. That safety behavior is visible, explainable, and easy for judges to challenge. Present it as the team's prototype design choice, not a NetOne standard.

## If something fails

- If Tinkercad is slow, stay in the dashboard and use its antenna animation.
- If a backend request fails, reset once and run the fixed-seed comparison.
- If the assistant text panel fails, explain the reason already shown in the decision card.
- Never spend the pitch troubleshooting Tinkercad.

## One-minute AI explanation

The current implementation combines a damped trend forecast over recent simulated windows with a constrained search over candidate azimuth and tilt settings. It is a transparent predictive-control prototype, not a trained machine-learning model. Its confidence measure is a synthetic profile-consistency indicator and cannot be interpreted as a calibrated probability.

## Judge questions to prepare

**Is this live NetOne data?** No. Sites, demand, and results are illustrative simulations.

**Is it a trained AI model?** No. It demonstrates forecasting and automated constrained decision logic using a transparent trend method.

**Why use Tinkercad?** It makes the proposed single-axis actuator easy to see without purchasing or transporting hardware. It is not directly connected to the dashboard.

**What would make it field-ready?** Authorised privacy-safe inputs, validated propagation and RF measurements, repeated offline baseline comparisons, and operator review with rollback.
