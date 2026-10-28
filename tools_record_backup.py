"""Record real engine outputs for every demo site and behaviour into frontend/data/backup.json.

Run with the backend started:  python tools_record_backup.py
The dashboard replays this file in BACKUP MODE when the backend is unreachable.
Re-run it whenever the engine changes so the backup stays honest.
"""
import json
import time

import requests

B = "http://127.0.0.1:5001/api"
towers = requests.get(B + "/towers").json()["towers"]
out = {"version": 1, "generated": time.strftime("%Y-%m-%d %H:%M:%S"), "towers": towers, "sessions": {}}

for t in towers:
    for pattern in ("steady", "drifting", "erratic"):
        requests.post(B + "/reset")
        scan = requests.post(B + "/scan", json={"tower_id": t["id"], "preferred_sector": t["sector"], "pattern": pattern, "seed": 2026}).json()

        cycles = []
        for _ in range(4):
            ai = requests.post(B + "/optimise", json={"scan": scan, "tower_id": t["id"]}).json()["ai"]
            ver = requests.post(B + "/verify", json={"scan": scan}).json()["verification"]
            ai["forecast"].pop("sectors", None)
            cycles.append({"ai": ai, "verify": ver})
            if ai["action"] == "HOLD":
                break

        first = cycles[0]["ai"]
        start_az, start_tilt = first["current_azimuth"], first["current_tilt"]
        busiest = max(0, min(180, round(first["forecast"]["dominant_sector"] / 5) * 5))

        def future(az, tilt):
            body = {"scan": scan, "basis": "future", "azimuth": az, "tilt": tilt}
            return requests.post(B + "/score", json=body).json()["score"]

        scores = {
            f"{start_az}_{start_tilt}": future(start_az, start_tilt),
            f"{busiest}_{start_tilt}": future(busiest, start_tilt),
            f"{first['target_azimuth']}_{first['target_tilt']}": future(first["target_azimuth"], first["target_tilt"]),
        }
        scores["fixed"] = scores[f"{start_az}_{start_tilt}"]

        day = requests.post(B + "/day_sim", json={"tower_id": t["id"], "pattern": pattern, "seed": 2026}).json()
        scan.pop("history", None)
        scan["scan_id"] = "backup"
        out["sessions"][f"{t['id']}|{pattern}"] = {
            "tower_id": t["id"], "pattern": pattern, "scan": scan, "cycles": cycles, "scores": scores, "day": day,
        }

requests.post(B + "/reset")
with open("frontend/data/backup.json", "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
print("recorded", len(out["sessions"]), "sessions")
