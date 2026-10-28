const API = "http://127.0.0.1:5001/api";

const state = {
    scan: null,
    scenario: 120,
    towerId: "DEMO-CHI-01",
    towers: [],
    busy: false,
    flow: 1,
    view: 1,
    guided: true,
    decided: false,
    backup: false,
    audit: [],
    pattern: "auto",
    scans: 0
};

let assistantQueue = Promise.resolve();

const $ = (id) => document.getElementById(id);

function log(message, type = "info") {
    const el = document.createElement("div");
    el.className = `log-entry ${type}`;
    el.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    $("eventLog").prepend(el);
    const live = $("liveLine");
    if (live) {
        live.className = `live-line ${type}`;
        live.querySelector("span").textContent = message;
    }
}

function narrate(stage, text) {
    $("stageHint").innerHTML = `<b>${stage}:</b> ${text}`;
}

function renderSite() {
    const t = state.towers.find(x => x.id === state.towerId);
    $("siteCard").innerHTML = t
        ? `<strong>${t.name}</strong><span>${t.city} · ${t.region} · ${t.profile}</span><span class="site-meta">Mounted facing compass ${t.heading}°: the 0°–180° arc covers compass ${t.heading}° to ${(t.heading + 180) % 360}°. Default demand: ${t.pattern}.</span>`
        : "";
}

const STAGE_HINTS = [
    "Scan simulated user demand around the tower (72 directions, 5° apart).",
    "Forecast the next demand window from recent scans. Consistency must reach 65% or the system holds.",
    "Score every allowed azimuth/tilt within a 45° move. Hold if the gain is under 2 points.",
    "Apply the chosen setting to the virtual actuator (digital twin).",
    "Re-score the same demand before vs after, and compare against simple strategies."
];
const STAGE_NAMES = ["Observe", "Forecast", "Decide", "Simulate", "Verify"];

// progress = how far the pipeline has run (6 = all done); follow = also move the guided view
function setFlow(step, follow = false) {
    state.flow = step;
    if (follow) state.view = Math.min(step, 5);
    renderFlow();
}

function goTo(step) {
    state.view = Math.max(1, Math.min(5, step));
    renderFlow();
}

function renderFlow() {
    for (let i = 1; i <= 5; i++) {
        const el = $(`flow${i}`);
        el.classList.toggle("done", i < state.flow);
        el.classList.toggle("active", i === state.flow);
        el.classList.toggle("viewing", i === state.view);
        el.setAttribute("aria-current", i === state.view ? "step" : "false");
    }
    document.body.dataset.view = state.guided ? "guided" : "overview";
    document.querySelectorAll("[data-step]").forEach((el) => {
        const steps = el.dataset.step.split(" ").map(Number);
        el.classList.toggle("is-current", steps.includes(state.view));
    });
    $("stageHint").innerHTML = `<b>Step ${state.view} of 5 · ${STAGE_NAMES[state.view - 1]}.</b> ${STAGE_HINTS[state.view - 1]}`;
    $("prevStep").disabled = state.view === 1;
    $("nextStep").disabled = state.view === 5;
    $("viewToggle").textContent = state.guided ? "VIEW: GUIDED" : "VIEW: OVERVIEW";
}

function setStatus(text) {
    $("systemStatus").innerHTML =
        `<span class="dot"></span>${text}`;
}

function assistantContext(stage = "dashboard") {
    const selectedTower = state.towers.find(tower => tower.id === state.towerId);
    return {
        stage,
        tower_id: state.towerId,
        tower_name: selectedTower?.name || "selected demo tower",
        city: selectedTower?.city,
        profile: selectedTower?.profile,
        dominant_sector: state.scan?.dominant_sector,
        demand_score: state.scan?.dominant_score,
        target_azimuth: $("targetAzimuth").textContent.replace("°", ""),
        target_tilt: $("targetTilt").textContent.replace("°", ""),
        baseline_score: $("baselineScore").textContent,
        predicted_score: $("predictedScore").textContent,
        hardware_mode: $("controllerMode").textContent
    };
}

function addAssistantMessage(text, role = "assistant-response") {
    const message = document.createElement("p");
    message.className = `assistant-message ${role}`;
    message.textContent = text;
    $("assistantMessages").appendChild(message);
    $("assistantMessages").scrollTop = $("assistantMessages").scrollHeight;
}

async function assistantReply(message = "", stage = "dashboard", userText = "") {
    if (userText) addAssistantMessage(userText, "assistant-user");
    const responseTask = assistantQueue.then(async () => {
        try {
            const data = await api("/assistant", {
                method: "POST",
                body: JSON.stringify({
                    message,
                    context: assistantContext(stage)
                })
            });
            $("assistantMode").textContent = data.llm_configured ? "LLM CONFIGURED" : "LOCAL ASSISTANT";
            addAssistantMessage(data.reply);
            await speakAssistantReply(data.reply);
        } catch (error) {
            $("assistantMode").textContent = "ASSISTANT OFFLINE";
            addAssistantMessage("Assistant service is unavailable. Dashboard controls and the optimizer are still available.");
        }
    });
    assistantQueue = responseTask.catch(() => {});
    return responseTask;
}

async function speakAssistantReply(text) {
    if (!$("voiceToggle").checked || !("speechSynthesis" in window)) return;

    const sentences = text.split(/(?<=[.!?])\s+/).filter(sentence => sentence.trim());
    for (const sentence of sentences) {
        if (!$("voiceToggle").checked) return;
        await new Promise((resolve) => {
            const utterance = new SpeechSynthesisUtterance(sentence.trim());
            utterance.rate = 0.88;
            utterance.onend = resolve;
            utterance.onerror = resolve;
            window.speechSynthesis.speak(utterance);
        });
    }
}

async function loadTowers() {
    try {
        const data = await api("/towers");
        state.towers = data.towers;
        const select = $("towerSelect");
        select.replaceChildren();
        state.towers.forEach((tower) => {
            const option = document.createElement("option");
            option.value = tower.id;
            option.textContent = `${tower.name} · ${tower.city}`;
            option.dataset.sector = tower.sector;
            option.dataset.profile = tower.profile;
            select.appendChild(option);
        });
        if (!state.towers.some(tower => tower.id === state.towerId)) {
            state.towerId = state.towers[0]?.id;
        }
        select.value = state.towerId;
        renderSite();
        const selected = state.towers.find(tower => tower.id === state.towerId);
        if (selected) state.scenario = selected.sector;
    } catch (error) {
        $("towerSelect").innerHTML = '<option value="">Demo sites unavailable</option>';
    }
}

function changeTower() {
    const selected = state.towers.find(tower => tower.id === $("towerSelect").value);
    if (!selected) return;
    state.towerId = selected.id;
    state.scenario = selected.sector;
    state.scan = null;
    state.decided = false;
    renderSite();
    $("verifyText").textContent = `${selected.name} selected. Scan its simulated demand to begin.`;
    log(`Selected demo site: ${selected.name}, ${selected.city}.`, "info");
    assistantReply(`${selected.name} in ${selected.city} is now selected.`, "tower");
}

function auditPush(kind, ai, extra = {}) {
    const tower = state.towers.find(t => t.id === state.towerId) || {};
    const entry = {
        time: new Date().toISOString(), site: tower.name || state.towerId, behaviour: state.scan?.pattern || state.pattern, kind,
        scan_peak_deg: state.scan?.dominant_sector ?? "", forecast_peak_deg: ai.forecast?.dominant_sector ?? "",
        confidence_pct: Number(ai.confidence ?? 0).toFixed(1), action: ai.action, seek_step: ai.seek ? "yes" : "no",
        from_azimuth: ai.current_azimuth, from_tilt: ai.current_tilt, to_azimuth: ai.target_azimuth, to_tilt: ai.target_tilt,
        reason: ai.reason ?? "", coverage_before: "", coverage_after: "", demand_in_beam_before: "", demand_in_beam_after: "",
        evaluated_on: "", data_source: state.backup ? "backup (recorded)" : "live engine", ...extra
    };
    state.audit.push(entry);
    $("exportAuditBtn").textContent = `⬇ EXPORT AUDIT LOG (${state.audit.length})`;
    return entry;
}

function exportAudit() {
    if (!state.audit.length) {
        log("Nothing to export yet. Run a cycle first.", "warn");
        return;
    }
    const cols = Object.keys(state.audit[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...state.audit.map(r => cols.map(c => esc(r[c])).join(","))].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `greenhex-audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    log(`Exported ${state.audit.length} decisions to CSV.`, "ok");
}

async function copyCommand() {
    const btn = $("copyCmdBtn");
    const text = $("tinkercadCommand").textContent.trim();
    const flash = (label) => { btn.textContent = label; setTimeout(() => { btn.textContent = "COPY"; }, 1600); };
    if (!/^SET AZIMUTH \d+$/.test(text)) {
        log("Nothing to copy: the engine is holding or has not decided yet.", "warn");
        flash("NO COMMAND");
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        const box = document.createElement("textarea");
        box.value = text;
        box.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(box);
        box.select();
        document.execCommand("copy");
        box.remove();
    }
    flash("COPIED ✓");
    log(`Copied "${text}". Paste it into the Tinkercad Serial Monitor.`, "ok");
}

function renderDay(d) {
    const W = 640, H = 260, L = 38, R = 12, T = 14, B = 36, hrs = d.hours;
    const top = Math.max(30, Math.ceil(Math.max(...hrs.flatMap(h => [h.adaptive, h.best_fixed, h.installed])) / 10) * 10);
    const x = h => L + (h - 1) * (W - L - R) / 23, y = v => T + (1 - v / top) * (H - T - B);
    const path = k => hrs.map((h, i) => `${i ? "L" : "M"}${x(h.hour).toFixed(1)},${y(h[k]).toFixed(1)}`).join(" ");
    const grid = [0, top / 2, top].map(v => `<line class="dc-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="dc-tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("");
    const ticks = [1, 4, 8, 12, 16, 20, 24].map(h => `<text class="dc-tick" x="${x(h)}" y="${H - 18}" text-anchor="middle">${h}h</text>`).join("");
    const moves = hrs.filter(h => h.action === "ADJUST").map(h => `<circle class="dc-move" cx="${x(h.hour)}" cy="${y(h.adaptive)}" r="4"/>`).join("");
    $("dayChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Coverage score over 24 hours for adaptive, best fixed and installed antenna settings">${grid}${ticks}<path class="dc-line dc-installed" d="${path("installed")}"/><path class="dc-line dc-fixed" d="${path("best_fixed")}"/><path class="dc-line dc-adaptive" d="${path("adaptive")}"/>${moves}<text class="dc-tick" x="${L}" y="10">coverage score (out of 100)</text></svg>
        <div class="dc-legend"><span><i class="k-adaptive"></i>Adaptive (dots = hours it moved)</span><span><i class="k-fixed"></i>Best fixed, chosen with hindsight (${d.best_fixed_setting.azimuth}° / ${d.best_fixed_setting.tilt}°)</span><span><i class="k-installed"></i>Installed setting (35° / 3°)</span></div>`;
    const sm = d.summary, row = (name, o) => `<tr><td>${name}</td><td>${o.coverage}</td><td>${o.demand_in_beam}%</td><td>${o.moves}</td><td>${o.degrees}°</td></tr>`;
    const gain = sm.gain_vs_best_fixed;
    const verdict = gain >= 1
        ? `Adapting pays off here: +${gain} points over the best fixed setting${sm.gain_per_100_degrees ? `, about ${sm.gain_per_100_degrees} points for every 100° of antenna travel` : ""}.`
        : gain <= -1
            ? `A fixed setting wins here (${gain} points). Demand is ${d.pattern}, so the engine held in ${sm.adaptive.holds} of 24 hours, but its moves still cost more than they gained.`
            : `About equal to the best fixed setting (${gain >= 0 ? "+" : ""}${gain} points). With ${d.pattern} demand, adapting adds little; a good static setting is as good.`;
    $("daySummary").innerHTML = `<table><thead><tr><th>Strategy</th><th>Avg coverage</th><th>Demand in beam</th><th>Moves</th><th>Travel</th></tr></thead><tbody>${row("Adaptive engine", sm.adaptive)}${row("Best fixed (hindsight)", sm.best_fixed)}${row("Installed setting", sm.installed)}</tbody></table><p class="day-verdict">${verdict}</p><p class="metric-note">${d.note}</p>`;
}

async function runDaySim() {
    if (state.busy) return;
    state.busy = true;
    $("daySimBtn").disabled = true;
    setStatus("SIMULATING 24 HOURS");
    try {
        const d = await api("/day_sim", { method: "POST", body: JSON.stringify({ tower_id: state.towerId, pattern: state.pattern }) });
        renderDay(d);
        log(`24-hour simulation (${d.pattern} demand): adaptive ${d.summary.adaptive.coverage} vs best fixed ${d.summary.best_fixed.coverage} vs installed ${d.summary.installed.coverage}; ${d.summary.adaptive.moves} moves.`, d.summary.gain_vs_best_fixed >= 1 ? "ok" : "warn");
        setStatus("24-HOUR SIMULATION COMPLETE");
    } catch (error) {
        log(error.message, "error");
        setStatus("SIMULATION ERROR");
    } finally {
        state.busy = false;
        $("daySimBtn").disabled = false;
    }
}

// ---------- Backup mode: replays a recorded session when the backend is unreachable ----------
let BACKUP = null, backupPromise = null, bs = null, bsession = null, bcycle = 0;

function loadBackup() {
    backupPromise = backupPromise || fetch("data/backup.json").then(r => { if (!r.ok) throw new Error("backup missing"); return r.json(); }).then(j => (BACKUP = j));
    return backupPromise;
}

function backupReset() {
    bs = { tower_id: state.towerId, tower_name: "", current_azimuth: 35, current_tilt: 3, target_azimuth: 35, target_tilt: 3, dominant_sector: 35,
        demand_score: 0, signal_score: 0, baseline_score: 0, predicted_score: 0, forecast_confidence: null, last_decision: "WAITING",
        status: "READY (BACKUP)", hardware: "backup", hardware_connected: false, last_action: "Backup mode: recorded session",
        moves: 0, degrees_travelled: 0, decisions: 0, holds: 0 };
    bsession = null;
    bcycle = 0;
}

async function enterBackup() {
    if (state.backup) return true;
    try { await loadBackup(); } catch (error) { return false; }
    state.backup = true;
    backupReset();
    $("backupBanner").hidden = false;
    document.body.classList.add("backup");
    log("Backend unreachable: switched to BACKUP MODE (recorded session, not live computation).", "warn");
    setStatus("BACKUP MODE");
    return true;
}

async function retryLive() {
    try {
        const r = await fetch(API + "/health");
        if (!r.ok) throw new Error("offline");
    } catch (error) {
        log("Backend still offline. Staying in backup mode.", "warn");
        return;
    }
    state.backup = false;
    $("backupBanner").hidden = true;
    document.body.classList.remove("backup");
    log("Backend is back. Live engine restored.", "ok");
    await loadTowers();
    await healthCheck();
    await scanEnvironment();
}

function backupPick(body, force = false) {
    const towerId = body.tower_id || state.towerId;
    const tower = BACKUP.towers.find(t => t.id === towerId) || BACKUP.towers[0];
    const wanted = body.pattern || body.scenario?.pattern;
    const pattern = ["steady", "drifting", "erratic"].includes(wanted) ? wanted : tower.pattern;
    const key = `${tower.id}|${pattern}`;
    if (!force && bsession && bsession.tower_id === tower.id) return bsession;
    if (!bsession || bsession.key !== key) {
        bcycle = 0;
        bs.current_azimuth = 35; bs.current_tilt = 3;
    }
    bsession = { ...BACKUP.sessions[key], key };
    bs.tower_id = tower.id; bs.tower_name = tower.name;
    return bsession;
}

async function backupApi(path, options = {}) {
    await loadBackup();
    const body = options.body ? JSON.parse(options.body) : {};
    const clone = (o) => JSON.parse(JSON.stringify(o));
    switch (path) {
        case "/health": return { ok: true, hardware_mode: "backup", service: "recorded backup" };
        case "/state": return { ...bs };
        case "/towers": return { towers: BACKUP.towers, source: "recorded backup catalogue; not live NetOne inventory" };
        case "/reset": backupReset(); return { ok: true, state: { ...bs } };
        case "/scan": { const s = backupPick(body, true); return clone(s.scan); }
        case "/analyse": { const s = backupPick(body); return clone(s.cycles[Math.min(bcycle, s.cycles.length - 1)].ai); }
        case "/optimise": {
            const s = backupPick(body);
            const ai = clone(s.cycles[Math.min(bcycle, s.cycles.length - 1)].ai);
            bcycle++;
            bs.decisions++;
            if (ai.action === "HOLD") bs.holds++; else { bs.moves++; bs.degrees_travelled += ai.azimuth_change; bs.current_azimuth = ai.target_azimuth; bs.current_tilt = ai.target_tilt; }
            Object.assign(bs, { target_azimuth: ai.target_azimuth, target_tilt: ai.target_tilt, dominant_sector: ai.dominant_sector, demand_score: ai.demand_score,
                signal_score: ai.estimated_signal_score, baseline_score: ai.baseline_coverage_score, predicted_score: ai.predicted_coverage_score,
                forecast_confidence: ai.confidence, last_decision: ai.action, status: ai.action === "HOLD" ? "AUTONOMOUS HOLD (BACKUP)" : "RECOMMENDED SETTING APPLIED (BACKUP)" });
            return { ok: true, scan: clone(s.scan), ai, hardware: { ok: true, mode: "backup", command: ai.action === "HOLD" ? "HOLD" : `SET AZIMUTH ${ai.target_azimuth}` }, state: { ...bs } };
        }
        case "/verify": {
            const s = backupPick(body);
            const v = clone(s.cycles[Math.max(0, bcycle - 1)].verify);
            bs.signal_score = v.measured_coverage_score; bs.status = "VERIFIED (BACKUP)";
            return { ok: true, verification: v, state: { ...bs } };
        }
        case "/score": { const s = backupPick(body); return { ok: true, score: s.scores[`${body.azimuth}_${body.tilt}`] ?? s.scores.fixed }; }
        case "/assistant": return { reply: body.message || "Backup mode is replaying a recorded session.", llm_configured: false };
        case "/day_sim": return clone(backupPick(body).day);
        default: throw new Error(`Backup mode has no recording for ${path}.`);
    }
}

async function api(path, options = {}) {
    if (state.backup) return backupApi(path, options);
    let response;
    try {
        response = await fetch(API + path, {
            headers: {
                "Content-Type": "application/json"
            },
            ...options
        });
    } catch (error) {
        if (await enterBackup()) return backupApi(path, options);
        throw new Error(
            `Cannot reach the backend at ${API}. Start backend/server.py and check that port 5001 is available.`
        );
    }

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        const body = await response.text();
        data = { error: body || `Backend returned HTTP ${response.status}` };
    }

    if (!response.ok) {
        throw new Error(
            data.error || data.last_action || `API request failed (HTTP ${response.status})`
        );
    }

    return data;
}

function renderDemand(scan) {
    const container = $("demandPoints");
    container.innerHTML = "";

    const points = scan.sectors;
    const counts = { low: 0, medium: 0, high: 0 };
    let inArc = 0, total = 0;

    points.forEach((sector) => {
        const angle = sector.angle * Math.PI / 180;
        const radius = 28 + sector.demand * 0.29;

        const x = 50 + Math.sin(angle) * radius;
        const y = 50 - Math.cos(angle) * radius;

        const point = document.createElement("span");

        let cls = "low";
        if (sector.demand >= 70) cls = "high";
        else if (sector.demand >= 40) cls = "medium";
        counts[cls]++;

        total += sector.demand;
        if (sector.angle <= 180) inArc += sector.demand;
        point.className = `demand-point ${cls}${sector.angle > 180 ? " out" : ""}`;
        point.style.left = `${x}%`;
        point.style.top = `${y}%`;

        point.title = `${sector.angle}°: ${sector.demand}`;

        container.appendChild(point);
    });

    $("lowCount").textContent = counts.low;
    $("mediumCount").textContent = counts.medium;
    $("highCount").textContent = counts.high;

    const beam = $("targetBeam");
    beam.style.transform =
        `rotate(${scan.dominant_sector}deg)`;

    $("dominantSector").textContent =
        `${scan.dominant_sector}°`;

    $("demandScore").textContent =
        `${scan.dominant_score}`;

    $("signalScore").textContent = "—";

    const share = total ? Math.round(100 * inArc / total) : 0;
    $("arcNote").textContent = `${share}% of this site's simulated demand lies inside the antenna's steerable 0°–180° arc (shaded). Faded dots are outside it.`;
}

function renderDecision(ai) {
    state.decided = true;
    $("curLabel").textContent = "POSITION BEFORE THIS DECISION";
    $("currentAzimuth").textContent = `${ai.current_azimuth}°`;
    $("currentTilt").textContent = `${ai.current_tilt}°`;
    const action = ai.action || "ADJUST";
    $("forecastPeak").textContent = `${ai.forecast?.dominant_sector ?? ai.dominant_sector}°`;
    $("forecastConfidence").textContent = `${Number(ai.confidence ?? 0).toFixed(0)}%`;
    $("decisionStatus").textContent = action === "HOLD" ? "HOLD" : "ADJUST";
    $("decisionStatus").classList.toggle("hold", action === "HOLD");
    $("tinkercadCommand").textContent = action === "HOLD"
        ? "HOLD - no virtual servo movement"
        : `SET AZIMUTH ${ai.target_azimuth}`;
    $("baselineScore").textContent = `${Number(ai.baseline_coverage_score).toFixed(1)}/100`;
    $("predictedScore").textContent = `${Number(ai.predicted_coverage_score).toFixed(1)}/100`;
    $("movementCost").textContent = `${ai.azimuth_change}° / ${ai.current_tilt}°→${ai.target_tilt}°`;
    $("targetAzimuth").textContent = `${ai.target_azimuth}°`;
    $("targetTilt").textContent = `${ai.target_tilt}°`;
    $("reason").textContent = ai.reason;
}

function updateState(s) {
    if (!state.decided) {
        $("curLabel").textContent = "CURRENT POSITION";
        $("currentAzimuth").textContent = `${s.current_azimuth}°`;
        $("currentTilt").textContent = `${s.current_tilt}°`;
        $("targetAzimuth").textContent = "—";
        $("targetTilt").textContent = "—";
    }

    $("servoAzimuth").textContent =
        `${s.current_azimuth}°`;

    $("servoTilt").textContent =
        `${s.current_tilt}°`;

    $("controllerMode").textContent =
        String(s.hardware).toUpperCase();

    $("hardwareBadge").textContent =
        String(s.hardware).toUpperCase() === "SIMULATION" ? "VIRTUAL MODE" : String(s.hardware).toUpperCase();

    $("signalScore").textContent = Number(s.signal_score) > 0 ? `${Number(s.signal_score).toFixed(1)}/100` : "—";

    $("verifyScore").textContent = Number(s.signal_score) > 0 ? Number(s.signal_score).toFixed(1) : "—";
    if (Number(s.baseline_score) > 0) $("baselineScore").textContent = `${Number(s.baseline_score).toFixed(1)}/100`;
    if (Number(s.predicted_score) > 0) $("predictedScore").textContent = `${Number(s.predicted_score).toFixed(1)}/100`;
    if (Number.isFinite(Number(s.forecast_confidence))) $("forecastConfidence").textContent = `${Number(s.forecast_confidence).toFixed(0)}%`;
    if (s.last_decision) $("decisionStatus").textContent = s.last_decision;

    $("mMoves").textContent = s.moves ?? 0;
    $("mDegrees").textContent = `${s.degrees_travelled ?? 0}°`;
    $("mHolds").textContent = `${s.holds ?? 0} / ${s.decisions ?? 0}`;

    animateAntenna(
        s.current_azimuth,
        s.current_tilt
    );
}

function animateAntenna(azimuth, tilt) {
    const rotation =
        (azimuth - 90) * 0.65;

    const tiltRotation =
        (tilt - 7.5) * 2.5;

    $("currentBeam").style.transform = `rotate(${azimuth}deg)`;

    $("antennaHead").style.transform =
        `rotate(${tiltRotation}deg)`;

    $("coverageCone").style.transform =
        `rotate(${rotation}deg)`;

    $("movementFill").style.width =
        `${Math.min(100, Math.abs(rotation) + 35)}%`;
}

async function healthCheck() {
    try {
        const data = await api("/health");

        $("hardwareBadge").textContent =
            data.hardware_mode.toUpperCase();

        $("controllerMode").textContent =
            data.hardware_mode.toUpperCase();

        log(
            `Backend online. Hardware mode: ${data.hardware_mode}`,
            "ok"
        );

        const current = await api("/state");
        updateState(current);
    } catch (error) {
        setStatus("BACKEND OFFLINE");
        log(
            "Backend is not running. Start backend/server.py.",
            "error"
        );
    }
}

async function scanEnvironment() {
    if (state.busy) return;

    state.busy = true;
    state.decided = false;
    setFlow(1);
    setStatus("SCANNING ENVIRONMENT");
    $("radar").classList.add("scanning");
    $("scanBtn").disabled = true;
    $("scanBtn").textContent = "SCANNING…";
    log("Scanning 72 directions around the tower…", "info");

    try {
        const data = await api("/scan", {
            method: "POST",
            body: JSON.stringify({
                preferred_sector: state.scenario,
                tower_id: state.towerId,
                pattern: state.pattern,
                seed: Date.now()
            })
        });

        await wait(900);
        state.scan = data;
        state.scans++;

        renderDemand(data);

        log(
            `Scan #${state.scans} complete: demand peaks near ${data.dominant_sector}° (${data.dominant_score}/100). Press NEXT or RUN AUTONOMOUS CYCLE.`,
            "ok"
        );
        setFlow(2);
        setStatus("SCAN COMPLETE");
    } catch (error) {
        log(error.message, "error");
        setStatus("ERROR");
    } finally {
        state.busy = false;
        $("radar").classList.remove("scanning");
        $("scanBtn").disabled = false;
        $("scanBtn").textContent = "SCAN ENVIRONMENT";
    }
}

async function analyse() {
    if (state.busy) return;

    if (!state.scan) {
        await scanEnvironment();
        if (!state.scan) return;
    }

    state.busy = true;
    setFlow(2);
    setStatus("ANALYSING");

    try {
        const data = await api("/analyse", {
            method: "POST",
            body: JSON.stringify({
                scan: state.scan
            })
        });

        renderDecision(data);
        auditPush("preview", data);

        log(
            `${data.action}: forecast ${data.forecast.dominant_sector}°; confidence ${data.confidence}%; target ${data.target_azimuth}° / ${data.target_tilt}°`,
            data.action === "HOLD" ? "warn" : "ok"
        );
        assistantReply(data.reason, "analysis");

        setFlow(4);
        setStatus(data.action === "HOLD" ? "AUTONOMOUS HOLD PREVIEW" : "AUTONOMOUS DECISION READY");
    } catch (error) {
        log(error.message, "error");
        setStatus("ERROR");
    } finally {
        state.busy = false;
    }
}

async function optimise(follow = true) {
    if (state.busy) return;

    state.busy = true;
    setFlow(1, follow);
    setStatus("OBSERVING DEMAND");

    try {
        const data = await api("/optimise", {
            method: "POST",
            body: JSON.stringify({
                scenario: {
                    preferred_sector: state.scenario,
                    pattern: state.pattern,
                    seed: Date.now()
                },
                tower_id: state.towerId
            })
        });

        state.scan = data.scan;

        renderDemand(data.scan);
        narrate("Observe", `scanned 72 directions; demand peaks near ${data.scan.dominant_sector}°.`);
        await wait(1500);
        setFlow(2, follow);
        setStatus("FORECASTING NEXT DEMAND WINDOW");
        narrate("Forecast", `next-window peak ${data.ai.forecast.dominant_sector}°, consistency ${Number(data.ai.confidence).toFixed(0)}% (needs 65%).`);
        await wait(1500);
        setFlow(3, follow);
        setStatus("EVALUATING SAFE SETTINGS");
        renderDecision(data.ai);
        auditPush("autonomous cycle", data.ai);
        narrate("Decide", data.ai.action === "HOLD" ? `HOLD, ${data.ai.hold_reason}` : `move from ${data.ai.current_azimuth}°/${data.ai.current_tilt}° to ${data.ai.target_azimuth}°/${data.ai.target_tilt}° (${data.ai.azimuth_change}° step, limit 45°).`);
        await wait(1500);
        setFlow(4, follow);
        setStatus(data.ai.action === "HOLD" ? "AUTONOMOUS HOLD" : "APPLYING VIRTUAL SETTING");

        log(
            `Virtual actuator: ${data.hardware.command}`,
            "info"
        );
        assistantReply(data.ai.reason, "optimise");

        log(data.ai.action === "HOLD"
            ? `Automatic hold: ${data.ai.hold_reason}`
            : `Virtual setting applied: AZ ${data.state.current_azimuth}° / TILT ${data.state.current_tilt}°`,
            data.ai.action === "HOLD" ? "warn" : "ok");
        updateState(data.state);

        $("movementLabel").textContent =
            data.ai.action === "HOLD" ? "SAFE HOLD — NO CHANGE" : "VIRTUAL SETTING UPDATED";

        narrate("Simulate", data.ai.action === "HOLD" ? "virtual antenna stays where it is." : `virtual antenna now at ${data.state.current_azimuth}° azimuth / ${data.state.current_tilt}° tilt.`);
        await wait(1500);

        await verify(follow);

    } catch (error) {
        log(error.message, "error");
        setStatus("OPTIMISATION ERROR");
    } finally {
        state.busy = false;
    }
}

async function verify(follow = false) {
    setFlow(5, follow);
    setStatus("VERIFYING");

    try {
        const data = await api("/verify", {
            method: "POST",
            body: JSON.stringify({ scan: state.scan })
        });

        updateState(data.state);
        const v = data.verification;
        if (v.measured_served_share !== undefined) $("mBeam").textContent = `${v.baseline_served_share}% → ${v.measured_served_share}%`;
        const open = [...state.audit].reverse().find(e => e.kind === "autonomous cycle" && e.coverage_after === "");
        if (open) Object.assign(open, { coverage_before: v.baseline_coverage_score, coverage_after: v.measured_coverage_score, demand_in_beam_before: v.baseline_served_share ?? "", demand_in_beam_after: v.measured_served_share ?? "", evaluated_on: v.evaluated_on ?? "" });

        $("verifyText").textContent =
            `${data.verification.note} Baseline ${data.verification.baseline_coverage_score}/100; after ${data.verification.measured_coverage_score}/100 (${data.verification.estimated_signal_improvement >= 0 ? "+" : ""}${data.verification.estimated_signal_improvement} points).`;

        log(
            `Verification complete. Simulated coverage: ${Number(data.state.signal_score).toFixed(1)}/100`,
            "ok"
        );
        assistantReply($("verifyText").textContent, "verify");

        setFlow(6);
        narrate("Verify", `simulated coverage ${data.verification.baseline_coverage_score} → ${data.verification.measured_coverage_score}/100 on the same demand.`);
        setStatus("OPTIMISATION VERIFIED");
    } catch (error) {
        log(error.message, "error");
        setStatus("VERIFICATION ERROR");
    }
}

async function changeDemand() {
    if (state.busy) return;
    const choices = [25, 50, 80, 110, 140, 165];
    const old = state.scenario;
    const available = choices.filter(x => Math.abs(x - old) >= 25);
    state.scenario = available[Math.floor(Math.random() * available.length)];
    state.decided = false;
    log(`Users moved: demand concentration shifts from ~${old}° to ~${state.scenario}°. Rescanning…`, "warn");
    setStatus("ENVIRONMENT CHANGED");
    $("verifyText").textContent = "Demand changed. The engine must re-evaluate.";
    assistantReply(`Demand changed to a simulated peak near ${state.scenario} degrees.`, "demand");
    await scanEnvironment();
}

async function fullDemo() {
    if (state.busy) return;
    if (!state.towers.length) {
        log("Demo sites are still loading. Try again in a moment.", "error");
        return;
    }

    state.busy = true;
    try {
        const tower = state.towers.find(item => item.id === state.towerId) || state.towers[0];
        state.towerId = tower.id;
        $("towerSelect").value = tower.id;
        state.scenario = tower.sector;
        setFlow(1);
        setStatus("PREPARING FAIR COMPARISON");
        await api("/reset", { method: "POST" });
        const scan = await api("/scan", {
            method: "POST",
            body: JSON.stringify({ tower_id: tower.id, preferred_sector: state.scenario, pattern: state.pattern, seed: 2026 })
        });
        state.scan = scan;
        state.decided = false;
        renderDemand(scan);
        log(`Fixed scan (${scan.pattern} demand) near ${scan.dominant_sector}°. Every strategy is scored on the NEXT demand window, which none of them saw.`, "warn");

        const first = await api("/optimise", { method: "POST", body: JSON.stringify({ scan, tower_id: tower.id }) });
        let last = first, cycles = 1;
        while (last.ai.action === "ADJUST" && cycles < 4) {
            last = await api("/optimise", { method: "POST", body: JSON.stringify({ scan, tower_id: tower.id }) });
            cycles++;
        }
        const moves = last.ai.action === "HOLD" ? cycles - 1 : cycles;
        const startAz = first.ai.current_azimuth, startTilt = first.ai.current_tilt;
        const busiestAz = Math.max(0, Math.min(180, Math.round(first.ai.forecast.dominant_sector / 5) * 5));
        const future = (azimuth, tilt) => api("/score", { method: "POST", body: JSON.stringify({ scan, basis: "future", azimuth, tilt }) }).then(r => r.score);
        const fixed = await future(startAz, startTilt);
        const busiest = await future(busiestAz, startTilt);
        const step1 = await future(first.ai.target_azimuth, first.ai.target_tilt);
        const verification = await api("/verify", { method: "POST", body: JSON.stringify({ scan }) });
        const converged = verification.verification.measured_coverage_score;

        updateState(verification.state);
        renderDecision(first.ai);
        auditPush("strategy comparison", first.ai, { coverage_before: fixed, coverage_after: converged, evaluated_on: "held-out next window" });
        $("baselineScore").textContent = `${fixed.toFixed(1)}/100`;
        $("predictedScore").textContent = `${converged.toFixed(1)}/100`;
        renderCompare([
            ["Fixed (no move)", fixed],
            [`Busiest direction (${Math.abs(busiestAz - startAz)}° jump)`, busiest],
            ["Forecast-aware, step 1 (≤45°)", step1],
            [`Forecast-aware, ${moves} safe move${moves === 1 ? "" : "s"}${last.ai.action === "HOLD" ? ", then HOLD" : ""}`, converged]
        ]);
        log(`Confidence ${Number(first.ai.confidence).toFixed(0)}% (${scan.pattern}). Next-window scores: fixed ${fixed}, busiest ${busiest}, ours ${converged}.`, first.ai.action === "HOLD" ? "warn" : "ok");
        $("verifyText").textContent = `Held-out comparison on the next demand window (${scan.pattern} behaviour): fixed ${fixed}/100; busiest-direction ${busiest}/100 (ignores the 45° limit); forecast-aware ${converged}/100 after ${moves} safe move(s). Illustrative, not measured RF.`;
        setFlow(6);
        setStatus("COMPARISON COMPLETE");
        await assistantReply($("verifyText").textContent, "verify");
    } catch (error) {
        log(error.message, "error");
        setStatus("COMPARISON ERROR");
    } finally {
        state.busy = false;
    }
}

function renderCompare(rows) {
    const best = Math.max(...rows.map(r => r[1]));
    $("compareBars").innerHTML = rows.map(([label, score]) =>
        `<div class="cb-row${score === best ? " best" : ""}"><span>${label}</span><div class="cb-track"><div class="cb-fill" style="width:${Math.max(2, score)}%"></div></div><b>${Number(score).toFixed(1)}</b></div>`
    ).join("");
}

async function resetSystem() {
    try {
        const data = await api("/reset", {
            method: "POST"
        });

        updateState(data.state);

        $("compareBars").innerHTML = "";
        state.scan = null;
        state.scenario = state.towers.find(tower => tower.id === state.towerId)?.sector || 120;

        state.decided = false;
        $("curLabel").textContent = "CURRENT POSITION";
        $("dominantSector").textContent = "—";
        $("demandScore").textContent = "—";
        $("targetAzimuth").textContent = "—";
        $("targetTilt").textContent = "—";

        $("baselineScore").textContent = "—";
        $("predictedScore").textContent = "—";
        $("movementCost").textContent = "—";
        $("forecastPeak").textContent = "—";
        $("forecastConfidence").textContent = "—";
        $("decisionStatus").textContent = "WAITING";
        $("decisionStatus").classList.remove("hold");
        $("tinkercadCommand").textContent = "Waiting for recommendation";

        $("reason").textContent =
            "Scan the environment to generate an optimisation decision.";

        $("verifyText").textContent =
            "Run an autonomous cycle to evaluate the virtual position.";

        $("movementLabel").textContent = "READY";

        setFlow(1, true);
        setStatus("SYSTEM READY");

        log("System reset to baseline.", "info");
        assistantReply("The system has returned to the baseline antenna position.", "reset");
    } catch (error) {
        log(error.message, "error");
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

$("scanBtn").addEventListener("click", scanEnvironment);
$("analyseBtn").addEventListener("click", analyse);
$("optimiseBtn").addEventListener("click", () => optimise(true));
$("changeDemandBtn").addEventListener("click", changeDemand);
$("verifyBtn").addEventListener("click", () => verify(false));
$("fullDemoBtn").addEventListener("click", fullDemo);
$("resetBtn").addEventListener("click", resetSystem);
$("towerSelect").addEventListener("change", changeTower);
$("copyCmdBtn").addEventListener("click", copyCommand);
$("exportAuditBtn").addEventListener("click", exportAudit);
$("daySimBtn").addEventListener("click", runDaySim);
$("retryLiveBtn").addEventListener("click", retryLive);
setTimeout(() => loadBackup().catch(() => {}), 2500);
$("patternSelect").addEventListener("change", async (e) => {
    state.pattern = e.target.value;
    state.decided = false;
    log(`Demand behaviour set to ${state.pattern === "auto" ? "the site default" : state.pattern}. Rescanning…`, "warn");
    await scanEnvironment();
});
$("assistantForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("assistantInput");
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    assistantReply(question, "question", question);
});
$("voiceToggle").addEventListener("change", () => {
    if (!$("voiceToggle").checked && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
});

document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => goTo(Number(b.dataset.go))));
$("prevStep").addEventListener("click", () => goTo(state.view - 1));
$("nextStep").addEventListener("click", () => goTo(state.view + 1));
$("runCycleBtn").addEventListener("click", () => optimise(true));
$("viewToggle").addEventListener("click", () => { state.guided = !state.guided; renderFlow(); });
let autoTimer = null;
$("autoToggle").addEventListener("change", (e) => {
    clearInterval(autoTimer);
    if (e.target.checked) {
        log("Auto mode on: the engine re-scans and decides every 15 s.", "info");
        autoTimer = setInterval(() => { if (!state.busy) optimise(false); }, 15000);
    } else {
        log("Auto mode off.", "info");
    }
});

renderFlow();
loadTowers().then(() => {
    assistantReply("Welcome. Select one of the illustrative demo sites to get started.", "dashboard");
    scanEnvironment();
});
healthCheck();
setInterval(healthCheck, 8000);
