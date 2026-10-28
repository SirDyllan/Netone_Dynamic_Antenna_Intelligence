import math
import random
from typing import Dict, List


class DynamicAntennaOptimizer:
    """Transparent constrained optimizer for simulated directional demand.

    Demand is illustrative, not a substitute for measured RF KPIs. Candidate
    settings are evaluated with a simple directional coverage model so the
    baseline, recommendation, and verification use one consistent objective.
    """

    SECTORS = 72
    AZIMUTHS = tuple(range(0, 181, 5))
    TILTS = (3, 6, 9, 12)
    MAX_STEP_DEGREES = 45
    MIN_GAIN_TO_ACT = 2.0
    MIN_FORECAST_CONFIDENCE = 65.0

    @staticmethod
    def _angle_distance(a: float, b: float) -> float:
        return abs((a - b + 180) % 360 - 180)

    def generate_scan(self, scenario: Dict) -> Dict:
        scenario = scenario or {}
        seed = scenario.get("seed")
        rng = random.Random(int(seed)) if seed is not None else random.Random()
        preferred = int(scenario.get("preferred_sector", rng.choice(
            [35, 80, 120, 155, 205, 250, 290, 330]
        ))) % 360

        sectors: List[Dict] = []
        secondary = (preferred + 70) % 360
        tertiary = (preferred + 185) % 360
        for index in range(self.SECTORS):
            angle = index * 5
            distance = self._angle_distance(angle, preferred)
            main_peak = max(0, 100 - distance * 2.7)
            baseline = rng.uniform(7, 24)
            noise = rng.uniform(0, 10)
            demand = max(0, min(100, baseline + main_peak + noise))
            demand += max(0, 40 - self._angle_distance(angle, secondary) * 1.1)
            demand += max(0, 24 - self._angle_distance(angle, tertiary) * 0.8)
            sectors.append({"angle": angle, "demand": round(min(100, demand), 1)})

        dominant = max(sectors, key=lambda item: item["demand"])
        return {
            "sectors": sectors,
            "dominant_sector": dominant["angle"],
            "dominant_score": dominant["demand"],
            "estimated_signal_score": 0,
            "preferred_sector": preferred,
            "data_label": "SIMULATED DEMAND — NOT LIVE NETWORK DATA"
        }

    PATTERNS = ("steady", "drifting", "erratic")

    def build_windows(self, preferred: int, seed: int, pattern: str = "steady"):
        """Return (history, current, future) demand windows for one site.

        The peak direction follows a behaviour model (steady, drifting or
        erratic). History and the held-out next window are generated from that
        model with their own noise, so the forecast is a real prediction and
        verification can score on a window the optimizer never saw.
        """
        rng = random.Random(int(seed) * 7919 + 13)
        if pattern == "drifting":
            velocity = rng.choice((-1, 1)) * rng.uniform(8, 12)
            offsets = {k: velocity * k + rng.gauss(0, 2) for k in range(-3, 2)}
        elif pattern == "erratic":
            offsets = {k: rng.uniform(-165, 165) for k in range(-3, 2)}
        else:
            offsets = {k: rng.gauss(0, 3) for k in range(-3, 2)}

        def window(offset, window_seed):
            return self.generate_scan({"preferred_sector": int(round(preferred + offset)) % 360, "seed": window_seed})

        history = [window(offsets[k], int(seed) + 100 + k) for k in (-3, -2, -1)]
        current = self.generate_scan({"preferred_sector": int(preferred) % 360, "seed": int(seed)})
        future = window(offsets[1], int(seed) + 200)
        return history, current, future

    @staticmethod
    def _beam_width(tilt: int) -> float:
        # Illustrative angular service footprint: more down-tilt narrows it.
        return 42 - (tilt - 3) * 1.5

    def score_position(self, scan: Dict, azimuth: int, tilt: int) -> float:
        """Weighted demand served by an illustrative sector beam, 0–100."""
        sectors = scan["sectors"]
        width = self._beam_width(tilt)
        served = 0.0
        total = 0.0
        for item in sectors:
            demand = max(0.0, float(item["demand"]))
            distance = self._angle_distance(float(item["angle"]), float(azimuth))
            # Smooth edge models partial service instead of an abrupt cutoff.
            coverage = max(0.0, 1.0 - distance / width)
            served += demand * coverage
            total += demand
        return round(100 * served / total, 1) if total else 0.0

    def served_share(self, scan: Dict, azimuth: int, tilt: int) -> float:
        """Throughput proxy: % of demand inside the beam's half-gain zone (not Mbps)."""
        half = self._beam_width(tilt) / 2
        served = total = 0.0
        for item in scan["sectors"]:
            demand = max(0.0, float(item["demand"]))
            total += demand
            if self._angle_distance(float(item["angle"]), float(azimuth)) <= half:
                served += demand
        return round(100 * served / total, 1) if total else 0.0

    def day_profile(self, base: int, pattern: str, rng: random.Random):
        peaks = []
        for hour in range(25):
            if pattern == "drifting":
                peak = base + 50 * math.sin(2 * math.pi * (hour - 6) / 24) + rng.gauss(0, 3)
            elif pattern == "erratic":
                peak = rng.uniform(15, 165)
            else:
                peak = base + rng.gauss(0, 4)
            peaks.append(int(round(max(10, min(170, peak)) / 5) * 5))
        return peaks

    def simulate_day(self, base: int, pattern: str, seed: int = 2026, start=(35, 3)) -> Dict:
        """24 hourly decisions. Each decision uses scans up to hour h and is scored on hour h+1."""
        rng = random.Random(int(seed))
        peaks = self.day_profile(int(base), pattern, rng)
        scans = [self.generate_scan({"preferred_sector": p, "seed": int(seed) * 131 + h}) for h, p in enumerate(peaks)]
        future = scans[1:]

        best_fixed = max(
            ((sum(self.score_position(sc, az, t) for sc in future), az, t) for az in self.AZIMUTHS for t in self.TILTS)
        )
        _, fixed_az, fixed_tilt = best_fixed

        az, tilt = start
        moves = degrees = holds = 0
        hours = []
        for h in range(24):
            history = scans[max(0, h - 3):h]
            first_action = None
            for cycle in range(2):
                result = self.optimize(scans[h], az, tilt, history)
                first_action = first_action or result["action"]
                if result["action"] != "ADJUST":
                    break
                degrees += abs(result["target_azimuth"] - az)
                moves += 1
                az, tilt = result["target_azimuth"], result["target_tilt"]
            holds += first_action == "HOLD"
            nxt = scans[h + 1]
            hours.append({
                "hour": h + 1, "demand_peak": peaks[h + 1], "azimuth": az, "tilt": tilt, "action": first_action,
                "adaptive": self.score_position(nxt, az, tilt),
                "best_fixed": self.score_position(nxt, fixed_az, fixed_tilt),
                "installed": self.score_position(nxt, start[0], start[1]),
            })

        def mean(key):
            return round(sum(item[key] for item in hours) / len(hours), 1)

        share = lambda a, t, f: round(sum(self.served_share(sc, f(a), t) for sc in future) / len(future), 1)
        adaptive_share = round(sum(self.served_share(future[i], hours[i]["azimuth"], hours[i]["tilt"]) for i in range(24)) / 24, 1)
        fixed_share = share(fixed_az, fixed_tilt, lambda a: a)
        installed_share = share(start[0], start[1], lambda a: a)
        gain = round(mean("adaptive") - mean("best_fixed"), 1)
        return {
            "pattern": pattern, "seed": int(seed), "hours": hours,
            "best_fixed_setting": {"azimuth": fixed_az, "tilt": fixed_tilt},
            "summary": {
                "adaptive": {"coverage": mean("adaptive"), "demand_in_beam": adaptive_share, "moves": moves, "degrees": degrees, "holds": holds},
                "best_fixed": {"coverage": mean("best_fixed"), "demand_in_beam": fixed_share, "moves": 0, "degrees": 0},
                "installed": {"coverage": mean("installed"), "demand_in_beam": installed_share, "moves": 0, "degrees": 0},
                "gain_vs_best_fixed": gain,
                "gain_per_100_degrees": round(gain / (degrees / 100), 2) if degrees else None
            },
            "note": "Simulated day. Best fixed = the single static setting that scores highest over the whole day, chosen with hindsight (a strong baseline). Adaptive decisions never see the hour they are scored on."
        }

    def calculate_tilt(self, demand_score: float) -> int:
        """Compatibility helper; optimization evaluates every allowed tilt."""
        return 6 if demand_score >= 70 else 9

    def optimise_azimuth_for_servo(self, sector: int) -> int:
        # Keep directions physically honest: never fold >180° into a false heading.
        return max(0, min(180, int(round(sector / 5) * 5)))

    def forecast(self, scan: Dict, recent_scans: List[Dict] = None) -> Dict:
        """Create a damped one-step sector forecast and a consistency score.

        This is a transparent trend model for synthetic demonstration data,
        not a trained ML model or a calibrated probability estimate.
        """
        profiles = [item for item in (recent_scans or scan.get("history", [])) if item and item.get("sectors")]
        profiles = (profiles + [scan])[-5:]
        latest = profiles[-1]["sectors"]
        previous = profiles[-2]["sectors"] if len(profiles) > 1 else latest
        previous_by_angle = {int(item["angle"]): float(item["demand"]) for item in previous}
        forecast_sectors = []
        for item in latest:
            angle = int(item["angle"])
            value = float(item["demand"])
            old = previous_by_angle.get(angle, value)
            trend = value - old
            forecast_value = max(0.0, min(100.0, value + 0.35 * trend))
            forecast_sectors.append({"angle": angle, "demand": round(forecast_value, 1)})

        peaks = [max(profile["sectors"], key=lambda item: item["demand"])["angle"] for profile in profiles]
        x = sum(math.cos(math.radians(angle)) for angle in peaks) / len(peaks)
        y = sum(math.sin(math.radians(angle)) for angle in peaks) / len(peaks)
        mean_direction = math.degrees(math.atan2(y, x))
        spread = math.sqrt(sum(self._angle_distance(angle, mean_direction) ** 2 for angle in peaks) / len(peaks))
        directional_consistency = max(0.0, 1.0 - spread / 60.0)
        changes = []
        for left, right in zip(profiles, profiles[1:]):
            left_map = {int(item["angle"]): float(item["demand"]) for item in left["sectors"]}
            changes.append(sum(abs(float(item["demand"]) - left_map.get(int(item["angle"]), 0.0)) for item in right["sectors"]) / max(1, len(right["sectors"])))
        mean_change = sum(changes) / len(changes) if changes else 0.0
        profile_consistency = max(0.0, 1.0 - mean_change / 50.0)
        confidence = round(100 * (0.8 * directional_consistency + 0.2 * profile_consistency), 1)
        dominant = max(forecast_sectors, key=lambda item: item["demand"])
        return {
            "sectors": forecast_sectors,
            "dominant_sector": dominant["angle"],
            "dominant_score": dominant["demand"],
            "confidence": confidence,
            "history_windows": len(profiles),
            "confidence_note": "Simulation consistency indicator; not a calibrated probability."
        }

    def optimize(self, scan: Dict, current_azimuth: int, current_tilt: int, recent_scans: List[Dict] = None) -> Dict:
        current_azimuth = max(0, min(180, int(current_azimuth)))
        current_tilt = min(self.TILTS, key=lambda tilt: abs(tilt - int(current_tilt)))
        demand_score = float(scan["dominant_score"])
        forecast = self.forecast(scan, recent_scans)
        baseline_score = self.score_position(forecast, current_azimuth, current_tilt)

        # Evaluate all safe candidates within the movement limit. Prefer the
        # least movement when candidates have effectively equal coverage.
        candidates = []
        for azimuth in self.AZIMUTHS:
            if abs(azimuth - current_azimuth) > self.MAX_STEP_DEGREES:
                continue
            for tilt in self.TILTS:
                score = self.score_position(forecast, azimuth, tilt)
                movement = abs(azimuth - current_azimuth) + 2 * abs(tilt - current_tilt)
                candidates.append((score, -movement, azimuth, tilt, movement))
        best_score, _, target_azimuth, target_tilt, movement = max(candidates)
        recommendation_score = self.score_position(scan, target_azimuth, target_tilt)
        improvement = round(recommendation_score - baseline_score, 1)
        confidence = forecast["confidence"]
        action = "ADJUST"
        hold_reason = None
        if confidence < self.MIN_FORECAST_CONFIDENCE:
            action, hold_reason = "HOLD", "Forecast consistency is below the autonomous-action threshold."
        elif improvement < self.MIN_GAIN_TO_ACT:
            action, hold_reason = "HOLD", "Expected gain is below the minimum action threshold."
        seek = False
        peak = int(forecast["dominant_sector"])
        reach = self._beam_width(current_tilt)
        if (action == "HOLD" and confidence >= self.MIN_FORECAST_CONFIDENCE
                and 0 <= peak <= 180 and abs(peak - current_azimuth) > reach):
            # The beam cannot see the peak from here, so every nearby move looks like zero gain.
            # Step toward it (still capped) instead of freezing.
            direction = 1 if peak > current_azimuth else -1
            target_azimuth = current_azimuth + direction * min(self.MAX_STEP_DEGREES, abs(peak - current_azimuth) - int(reach // 2))
            target_azimuth = max(0, min(180, int(round(target_azimuth / 5) * 5)))
            target_tilt = current_tilt
            movement = abs(target_azimuth - current_azimuth)
            recommendation_score = self.score_position(scan, target_azimuth, target_tilt)
            improvement = round(recommendation_score - baseline_score, 1)
            action, hold_reason, seek = "ADJUST", None, True
        if action == "HOLD":
            target_azimuth, target_tilt = current_azimuth, current_tilt
            movement = 0
            recommendation_score = baseline_score
            improvement = 0.0
        reason = (
            f"Forecasted the next demand window from {forecast['history_windows']} simulated scan windows, "
            f"then evaluated {len(candidates)} safe settings. "
            + (f"SEEK STEP: the forecast peak ({peak}°) is beyond the beam's reach from {current_azimuth}°, so the expected gain cannot be measured from here. Moving {target_azimuth - current_azimuth:+d}° toward it (within the 45° limit); {confidence:.0f}% simulated consistency." if seek else
               f"Recommend {target_azimuth}° azimuth / {target_tilt}° tilt: forecast score {recommendation_score:.1f}/100 "
               f"versus {baseline_score:.1f}/100 at baseline, with {confidence:.0f}% simulated consistency." if action == "ADJUST"
               else f"AUTONOMOUS HOLD: {hold_reason} Forecast consistency is {confidence:.0f}%.")
        )
        return {
            "action": action,
            "target_azimuth": target_azimuth,
            "target_tilt": target_tilt,
            "dominant_sector": int(scan["dominant_sector"]),
            "demand_score": demand_score,
            "current_azimuth": current_azimuth,
            "current_tilt": current_tilt,
            "azimuth_change": abs(target_azimuth - current_azimuth),
            "movement_cost": movement,
            "baseline_coverage_score": baseline_score,
            "predicted_coverage_score": recommendation_score,
            "predicted_improvement": improvement,
            "forecast": forecast,
            "confidence": confidence,
            "confidence_label": "simulation consistency, not probability",
            "minimum_gain_to_act": self.MIN_GAIN_TO_ACT,
            "minimum_confidence_to_act": self.MIN_FORECAST_CONFIDENCE,
            "hold_reason": hold_reason,
            "seek": seek,
            "estimated_signal_score": recommendation_score,
            "reason": reason,
            "model": "Damped demand-trend forecast + constrained candidate search (transparent prototype)",
            "objective": "maximize forecast demand-weighted coverage; minimize movement on ties; hold below confidence/gain thresholds",
            "constraints": {"azimuth_min": 0, "azimuth_max": 180, "max_step_degrees": self.MAX_STEP_DEGREES, "allowed_tilts": list(self.TILTS)},
            "note": "All inputs and scores are illustrative simulations, not measured RF or live NetOne data."
        }
