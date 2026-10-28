from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import sys
import time
import json
import uuid
from collections import OrderedDict
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request as UrlRequest, urlopen

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai.optimizer import DynamicAntennaOptimizer

try:
    import serial
except ImportError:
    serial = None

app = Flask(__name__)
CORS(app)

optimizer = DynamicAntennaOptimizer()
with (PROJECT_ROOT / "data" / "network_towers.json").open(encoding="utf-8") as tower_file:
    TOWERS = json.load(tower_file)
TOWERS_BY_ID = {tower["id"]: tower for tower in TOWERS}

HARDWARE_MODE = os.getenv("NETONE_HARDWARE", "simulation").lower()
SERIAL_PORT = os.getenv("NETONE_SERIAL_PORT", "")
BAUD_RATE = int(os.getenv("NETONE_BAUD", "9600"))
LLM_ENDPOINT = os.getenv("NETONE_LLM_ENDPOINT", "")
LLM_MODEL = os.getenv("NETONE_LLM_MODEL", "")
LLM_API_KEY = os.getenv("NETONE_LLM_API_KEY", "")

serial_device = None

# Held-out next demand windows, kept server-side so the optimizer never sees them.
FUTURES = OrderedDict()


def resolve_pattern(scenario, tower):
    pattern = (scenario or {}).get("pattern")
    if pattern not in optimizer.PATTERNS:
        pattern = (tower or {}).get("pattern", "steady")
    return pattern

state = {
    "tower_id": "DEMO-CHI-01",
    "tower_name": "Chinhoyi Main",
    "current_azimuth": 35,
    "current_tilt": 3,
    "target_azimuth": 35,
    "target_tilt": 3,
    "dominant_sector": 35,
    "demand_score": 0,
    "signal_score": 0,
    "baseline_score": 0,
    "predicted_score": 0,
    "status": "READY",
    "hardware": HARDWARE_MODE,
    "hardware_connected": False,
    "last_action": "System ready",
    "moves": 0,
    "degrees_travelled": 0,
    "decisions": 0,
    "holds": 0,
    "forecast_confidence": None,
    "last_decision": "WAITING",
    "updated_at": time.time()
}


def selected_tower(tower_id):
    tower = TOWERS_BY_ID.get(tower_id or state["tower_id"])
    if tower is None:
        return None
    return tower


def build_scan_bundle(scenario):
    """Generate the current window, prior windows and a held-out next window."""
    scenario = dict(scenario or {})
    preferred = int(scenario.get("preferred_sector", 120)) % 360
    seed = int(scenario.get("seed", time.time() * 1000))
    pattern = scenario.get("pattern")
    if pattern not in optimizer.PATTERNS:
        pattern = "steady"
    history, current, future = optimizer.build_windows(preferred, seed, pattern)
    scan_id = uuid.uuid4().hex[:12]
    FUTURES[scan_id] = future
    while len(FUTURES) > 64:
        FUTURES.popitem(last=False)
    current["history"] = history
    current["history_label"] = f"synthetic prior windows ({pattern} demand behaviour)"
    current["pattern"] = pattern
    current["scan_id"] = scan_id
    return current


def generate_assistant_reply(message, context):
    if not LLM_ENDPOINT or not LLM_MODEL:
        stage = context.get("stage", "dashboard")
        tower_name = context.get("tower_name", state["tower_name"])
        sector = context.get("dominant_sector")
        if stage == "scan" and sector is not None:
            reply = f"The {tower_name} synthetic scan found its current demand peak at {sector}°. The autonomous engine forecasts the next window from recent simulated profiles, then evaluates bounded settings."
        elif stage == "cycle":
            reply = f"{message} The recommendation is simulated and does not control a live network."
        elif stage == "cycle-verify":
            reply = f"{message}"
        elif stage in ("optimise", "analysis"):
            reply = f"The optimizer has proposed azimuth {context.get('target_azimuth', state['target_azimuth'])}° and tilt {context.get('target_tilt', state['target_tilt'])}° for {tower_name}. This is simulated guidance, not a live network command."
        elif stage == "verify":
            reply = "Verification recomputes the illustrative coverage score against the observed synthetic demand profile. It is not measured RF telemetry."
        elif message:
            question = message.lower()
            if "optim" in question or "tilt" in question or "azimuth" in question:
                reply = "The optimizer checks safe azimuth and tilt candidates against all simulated demand sectors, respects the 180-degree and movement limits, and prefers less movement when scores tie. Current recommendation: azimuth " + f"{state['target_azimuth']}° and tilt {state['target_tilt']}°."
            elif "arduino" in question or "tinkercad" in question or "servo" in question or "wiring" in question:
                reply = "The Arduino demo uses a tilt servo on D9, an azimuth servo on D10, and serial commands at 9600 baud. Open Tinkercad Circuits from the dashboard; the documentation page lists wiring and power guidance."
            elif "demand" in question or "scan" in question or "sector" in question:
                reply = "Each scan generates 72 simulated directions at 5° intervals, with overlapping low, mid, and high demand bands. Run SCAN ENVIRONMENT to view the current distribution."
            elif "tower" in question or "site" in question:
                reply = f"{tower_name} is selected from the illustrative demo catalogue. Its default demand direction feeds the same optimizer as every other demo site; these entries are not verified live NetOne inventory."
            else:
                reply = f"I can explain scans, optimizer targets, hardware setup, and demo data. {tower_name} is currently selected; this catalogue is illustrative, not verified live NetOne site inventory."
        else:
            reply = f"Ready to help with {tower_name}. Select a demo tower, scan its simulated demand, then review the optimizer recommendation."
        return reply, False

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the GreenHex Team's NESARI demo explainer. "
                    "The autonomous decision engine is a transparent damped trend forecast plus constrained search with HOLD guardrails, not a trained ML model. "
                    "Explain the selected synthetic site, demand scan, forecast, optimizer, antenna command, "
                    "verification, and hardware setup. Never claim demo data is live network telemetry "
                    "or verified NetOne infrastructure. Be concise, technically clear, and use the supplied context."
                )
            },
            {"role": "user", "content": f"Context: {json.dumps(context)[:4000]}\nQuestion/event: {message or 'Explain the current system state.'}"}
        ],
        "temperature": 0.4
    }
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    request = UrlRequest(
        LLM_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
        answer = result["choices"][0]["message"]["content"].strip()
        if answer:
            return answer, True
    except (URLError, TimeoutError, ValueError, KeyError, IndexError):
        pass
    return "The configured language model could not respond. The dashboard optimizer and simulation remain available.", True


def connect_serial():
    global serial_device

    if HARDWARE_MODE != "arduino":
        return False

    if serial is None:
        state["last_action"] = "pyserial is not installed"
        return False

    if not SERIAL_PORT:
        state["last_action"] = "NETONE_SERIAL_PORT is not set"
        return False

    try:
        serial_device = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        time.sleep(2)
        state["hardware_connected"] = True
        state["last_action"] = f"Arduino connected on {SERIAL_PORT}"
        return True
    except Exception as exc:
        state["hardware_connected"] = False
        state["last_action"] = f"Arduino connection error: {exc}"
        return False


def send_hardware_command(azimuth, tilt):
    command = f"SET BOTH {int(azimuth)} {int(tilt)}"

    if HARDWARE_MODE != "arduino":
        return {
            "ok": True,
            "mode": "simulation",
            "command": command
        }

    if serial_device is None or not serial_device.is_open:
        if not connect_serial():
            return {
                "ok": False,
                "mode": "arduino",
                "command": command,
                "error": state["last_action"]
            }

    try:
        serial_device.write((command + "\n").encode())
        return {
            "ok": True,
            "mode": "arduino",
            "command": command
        }
    except Exception as exc:
        state["hardware_connected"] = False
        return {
            "ok": False,
            "mode": "arduino",
            "command": command,
            "error": str(exc)
        }


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "NetOne Dynamic Antenna Intelligence",
        "hardware_mode": HARDWARE_MODE,
        "hardware_connected": state["hardware_connected"],
        "timestamp": time.time()
    })


@app.get("/api/state")
def get_state():
    return jsonify(state)


@app.get("/api/towers")
def get_towers():
    return jsonify({
        "towers": TOWERS,
        "source": "illustrative demo catalogue; not live NetOne site inventory"
    })


@app.post("/api/scan")
def scan():
    scenario = request.get_json(silent=True) or {}
    tower = selected_tower(scenario.get("tower_id"))
    if tower is None:
        return jsonify({"error": "Unknown demo tower."}), 400
    scenario.setdefault("preferred_sector", tower["sector"])
    scenario["pattern"] = resolve_pattern(scenario, tower)
    result = build_scan_bundle(scenario)
    result["tower"] = tower

    state["tower_id"] = tower["id"]
    state["tower_name"] = tower["name"]
    state["dominant_sector"] = result["dominant_sector"]
    state["demand_score"] = result["dominant_score"]
    state["signal_score"] = 0
    state["status"] = "SCAN COMPLETE"
    state["last_action"] = "Environment scanned"
    state["updated_at"] = time.time()

    return jsonify(result)


@app.post("/api/analyse")
def analyse():
    payload = request.get_json(silent=True) or {}
    scan = payload.get("scan")

    if not scan:
        scan = optimizer.generate_scan({})

    result = optimizer.optimize(
        scan,
        current_azimuth=state["current_azimuth"],
        current_tilt=state["current_tilt"],
        recent_scans=scan.get("history", [])
    )

    state["baseline_azimuth"] = state["current_azimuth"]
    state["baseline_tilt"] = state["current_tilt"]

    state["target_azimuth"] = result["target_azimuth"]
    state["target_tilt"] = result["target_tilt"]
    state["dominant_sector"] = result["dominant_sector"]
    state["demand_score"] = result["demand_score"]
    state["signal_score"] = result["estimated_signal_score"]
    state["forecast_confidence"] = result["confidence"]
    state["last_decision"] = result["action"]
    state["status"] = "AUTONOMOUS HOLD PREVIEW" if result["action"] == "HOLD" else "AUTONOMOUS DECISION READY"
    state["last_action"] = result["reason"]
    state["updated_at"] = time.time()

    return jsonify(result)


@app.post("/api/optimise")
def optimise():
    payload = request.get_json(silent=True) or {}
    tower = selected_tower(payload.get("tower_id"))
    if tower is None:
        return jsonify({"error": "Unknown demo tower."}), 400

    scan = payload.get("scan")
    if not scan or not scan.get("sectors"):
        scenario = payload.get("scenario", {})
        scenario.setdefault("preferred_sector", tower["sector"])
        scenario["pattern"] = resolve_pattern(scenario, tower)
        scan = build_scan_bundle(scenario)
    scan["tower"] = tower

    result = optimizer.optimize(
        scan,
        current_azimuth=state["current_azimuth"],
        current_tilt=state["current_tilt"],
        recent_scans=scan.get("history", [])
    )

    state["status"] = "EVALUATING SAFE SETTING"
    state["tower_id"] = tower["id"]
    state["tower_name"] = tower["name"]
    state["baseline_azimuth"] = state["current_azimuth"]
    state["baseline_tilt"] = state["current_tilt"]
    state["target_azimuth"] = result["target_azimuth"]
    state["target_tilt"] = result["target_tilt"]
    state["dominant_sector"] = result["dominant_sector"]
    state["demand_score"] = result["demand_score"]
    state["signal_score"] = result["estimated_signal_score"]
    state["baseline_score"] = result["baseline_coverage_score"]
    state["predicted_score"] = result["predicted_coverage_score"]
    state["forecast_confidence"] = result["confidence"]
    state["last_decision"] = result["action"]
    state["updated_at"] = time.time()

    state["decisions"] = state.get("decisions", 0) + 1
    if result["action"] == "HOLD":
        state["holds"] = state.get("holds", 0) + 1
    else:
        state["moves"] = state.get("moves", 0) + 1
        state["degrees_travelled"] = state.get("degrees_travelled", 0) + result["azimuth_change"]
    if result["action"] == "HOLD":
        hardware = {"ok": True, "mode": HARDWARE_MODE, "command": "HOLD — guardrail prevented an adjustment"}
    else:
        hardware = send_hardware_command(result["target_azimuth"], result["target_tilt"])

    if not hardware["ok"]:
        state["status"] = "HARDWARE ERROR"
        return jsonify({
            "ok": False,
            "ai": result,
            "hardware": hardware,
            "state": state
        }), 503

    if result["action"] == "ADJUST":
        state["current_azimuth"] = result["target_azimuth"]
        state["current_tilt"] = result["target_tilt"]
        state["status"] = "RECOMMENDED SETTING APPLIED IN SIMULATION"
        state["last_action"] = f"Simulated actuator set to {result['target_azimuth']}° azimuth / {result['target_tilt']}° tilt"
    else:
        state["status"] = "AUTONOMOUS HOLD"
        state["last_action"] = result["hold_reason"]
    state["updated_at"] = time.time()

    return jsonify({
        "ok": True,
        "scan": scan,
        "ai": result,
        "hardware": hardware,
        "state": state
    })


@app.post("/api/verify")
def verify():
    payload = request.get_json(silent=True) or {}
    demand_scan = payload.get("scan")
    if not demand_scan or not demand_scan.get("sectors"):
        return jsonify({"error": "Scan the environment before verification."}), 400
    future = FUTURES.get(demand_scan.get("scan_id"))
    eval_scan = future or demand_scan
    measured_score = optimizer.score_position(
        eval_scan, state["current_azimuth"], state["current_tilt"]
    )
    baseline = optimizer.score_position(
        eval_scan,
        int(state.get("baseline_azimuth", state["current_azimuth"])),
        int(state.get("baseline_tilt", state["current_tilt"]))
    )
    improvement = round(measured_score - baseline, 1)
    base_az = int(state.get("baseline_azimuth", state["current_azimuth"]))
    base_tilt = int(state.get("baseline_tilt", state["current_tilt"]))
    state["status"] = "VERIFIED"
    state["signal_score"] = measured_score
    state["last_action"] = f"Simulated coverage score: {measured_score:.1f}/100 ({improvement:+.1f} vs baseline)"
    state["updated_at"] = time.time()

    return jsonify({
        "ok": True,
        "verification": {
            "estimated_signal_improvement": improvement,
            "new_demo_signal_score": measured_score,
            "baseline_coverage_score": baseline,
            "measured_coverage_score": measured_score,
            "baseline_served_share": optimizer.served_share(eval_scan, base_az, base_tilt),
            "measured_served_share": optimizer.served_share(eval_scan, state["current_azimuth"], state["current_tilt"]),
            "evaluated_on": "held-out next window" if future else "same scan",
            "note": ("Scored on the next demand window, which the engine never saw. " if future else "Scored on the same scan. ") + "Simulated demand-weighted coverage score, not a real RF measurement."
        },
        "state": state
    })


@app.post("/api/day_sim")
def day_sim():
    payload = request.get_json(silent=True) or {}
    tower = selected_tower(payload.get("tower_id"))
    if tower is None:
        return jsonify({"error": "Unknown demo tower."}), 400
    pattern = resolve_pattern(payload, tower)
    result = optimizer.simulate_day(tower["sector"], pattern, int(payload.get("seed", 2026)))
    result["tower_id"] = tower["id"]
    return jsonify(result)


@app.post("/api/score")
def score_candidate():
    payload = request.get_json(silent=True) or {}
    scan = payload.get("scan")
    if not scan or not scan.get("sectors"):
        return jsonify({"error": "A directional scan is required."}), 400
    try:
        azimuth = int(payload["azimuth"])
        tilt = int(payload.get("tilt", 3))
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "Numeric azimuth and tilt are required."}), 400
    if not 0 <= azimuth <= 180 or tilt not in optimizer.TILTS:
        return jsonify({"error": "Candidate is outside the demonstration constraints."}), 400
    objective = payload.get("objective", scan)
    if payload.get("basis") == "future":
        held_out = FUTURES.get(scan.get("scan_id"))
        if held_out is None:
            return jsonify({"error": "No held-out window for this scan."}), 400
        objective = held_out
    return jsonify({"azimuth": azimuth, "tilt": tilt, "score": optimizer.score_position(objective, azimuth, tilt), "label": "simulated demand-weighted coverage score"})


@app.post("/api/reset")
def reset():
    state.update({
        "current_azimuth": 35,
        "current_tilt": 3,
        "target_azimuth": 35,
        "target_tilt": 3,
        "dominant_sector": 35,
        "demand_score": 0,
        "signal_score": 0,
        "baseline_score": 0,
        "predicted_score": 0,
        "forecast_confidence": None,
        "last_decision": "WAITING",
        "status": "READY",
        "last_action": "System reset to baseline",
        "moves": 0,
        "degrees_travelled": 0,
        "decisions": 0,
        "holds": 0,
        "updated_at": time.time()
    })

    send_hardware_command(35, 3)

    return jsonify({
        "ok": True,
        "state": state
    })


@app.post("/api/manual")
def manual():
    payload = request.get_json(silent=True) or {}

    try:
        azimuth = max(0, min(180, int(payload["azimuth"])))
        tilt = max(0, min(15, int(payload["tilt"])))
    except (KeyError, TypeError, ValueError):
        return jsonify({
            "ok": False,
            "error": "Expected numeric azimuth (0-180) and tilt (0-15)."
        }), 400

    hardware = send_hardware_command(azimuth, tilt)

    if not hardware["ok"]:
        return jsonify({
            "ok": False,
            "hardware": hardware
        }), 503

    state["current_azimuth"] = azimuth
    state["current_tilt"] = tilt
    state["target_azimuth"] = azimuth
    state["target_tilt"] = tilt
    state["status"] = "MANUAL POSITION"
    state["last_action"] = f"Manual position {azimuth}° / {tilt}°"
    state["updated_at"] = time.time()

    return jsonify({
        "ok": True,
        "hardware": hardware,
        "state": state
    })


@app.post("/api/assistant")
def assistant():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", ""))[:1200]
    context = payload.get("context", {})
    if not isinstance(context, dict):
        context = {}
    reply, configured = generate_assistant_reply(message, context)
    return jsonify({"reply": reply, "llm_configured": configured})


if __name__ == "__main__":
    print("=" * 60)
    print("NETONE DYNAMIC ANTENNA INTELLIGENCE")
    print("=" * 60)
    print(f"Hardware mode: {HARDWARE_MODE}")
    print(f"Serial port: {SERIAL_PORT or 'not configured'}")
    print("Backend: http://127.0.0.1:5001")
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5001,
        debug=False
    )
