# NESARI 2026 Pitch Plan — GreenHex Team

## Core pitch

**Adaptive Antenna Intelligence:** a software-first prototype that forecasts directional demand, evaluates safe antenna settings, explains its recommendation, and verifies a simulated result. The competitive edge is trust-aware autonomy: it can explain a bounded adjustment or choose HOLD when its forecast is unstable or its expected gain is too small.

## Suggested 7-minute presentation

| Time | Section | Presenter focus |
| --- | --- | --- |
| 0:00–0:35 | Opening | State the problem and introduce GreenHex Team and NetOne Topic 2. |
| 0:35–1:20 | Need | Explain that directional demand can shift while a fixed setting remains unchanged. |
| 1:20–2:20 | Approach | Introduce the observe → forecast → decide/hold → simulate → verify loop. |
| 2:20–3:20 | AI method | Describe the transparent trend forecast, candidate search, movement bound, and hold thresholds. |
| 3:20–4:05 | Differentiator | Show the reason behind the decision and disclose the synthetic consistency indicator. |
| 4:05–5:50 | Live demo | Compare three strategies on the same reproducible profile, then run one autonomous cycle. |
| 5:50–6:25 | Tinkercad | Show the virtual Uno + one servo and explain the manual, separate simulation. |
| 6:25–7:00 | Validation and close | State limitations and next validation steps; invite questions. |

## Live demonstration order

1. Start both dashboard services and open the dashboard. Confirm **VIRTUAL MODE**.
2. Run **Compare Strategies**. Explain that fixed, busiest-direction, and forecast-aware scores use one reproducible synthetic demand profile and one forecast objective.
3. Point to the forecast peak, consistency value, recommendation, and explanation.
4. Run **Run Autonomous Cycle**. Show the bounded setting or the HOLD outcome and the same-scan verification.
5. Optionally show the Tinkercad virtual servo. Repeat the displayed azimuth command manually if serial input works; otherwise use `DEMO`.
6. Return to the dashboard for questions.

Keep Tinkercad optional. The dashboard is the main proof of the decision process.

## Presenter roles

- **Presenter 1:** opening, problem, and research question.
- **Presenter 2:** method, AI logic, constraints, and responsible-use limitations.
- **Presenter 3:** laptop operation and Tinkercad virtual circuit.
- **All presenters:** prepare concise answers on evidence limits, data needs, and deployment.

## AI explanation for judges

> “Our prototype forecasts the next synthetic demand profile with a transparent damped-trend method, then evaluates bounded azimuth and tilt settings. It limits movement, explains its choice, and holds when profile consistency is below 65% or projected forecast gain is below two points. This is an explainable predictive-control prototype, not a trained model. The confidence number is a simulation consistency indicator, not a probability.”

## Tinkercad explanation

> “We are presenting a no-purchase software prototype. Tinkercad gives us a virtual Uno and one servo to make the actuator idea visible. It is a separate simulation: we repeat the dashboard target manually or use the demo sweep. The dashboard animation and verification show the autonomous logic.”

## Visual direction

Use the GreenHex emblem as a small, consistent brand mark. Lead with a clean navy, teal, and warm-gold palette. Keep slide titles short, use large type, and let the five-step flow carry the story. Show only the decision evidence the team can support. Avoid stock circuit clutter and unsupported real-world performance claims.

## Limitations and next validation

All sites, demand profiles, forecasts, scores, and actuators are simulated. The optimizer is not trained on NetOne data and the beam score is an illustrative geometry model, not a real RF KPI. A credible next step is authorised, privacy-safe data access, propagation-model calibration, repeated baseline comparison, and operator review.

## Rehearsal checklist

- Run the dashboard without Tinkercad and confirm the software demonstration stands on its own.
- Rehearse both ADJUST and HOLD explanations; the current random scan may choose either.
- Use the fixed-seed strategy comparison when reproducible on-screen numbers are useful.
- Confirm Tinkercad simulation and sketch compile before presentation day.
- Practice a 7-minute version and a 3-minute fallback.
- Replace no values with unmeasured field gains; clearly label every demonstration score as simulated.
