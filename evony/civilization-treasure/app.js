const CATEGORY_COUNT = 7;
const DEFAULT_TARGETS = Array.from({ length: CATEGORY_COUNT }, () => 0);

const EXACT_AUTO_MAX_TOTAL_TARGET = 420;
const EXACT_WARN_TOTAL_TARGET = 800;
const APPROX_SAMPLES = 28000;
const APPROX_WARN_OPERATION_BUDGET = 210000000;

const CIVILIZATIONS = [
	{
		key: "orb",
		name: "Globus Cruciger",
		accentA: "#f59e0b",
		accentB: "#fcd34d"
	},
	{
		key: "imperial-seal",
		name: "Imperial Seal",
		accentA: "#dc2626",
		accentB: "#f87171"
	},
	{
		key: "seven-branched-sword",
		name: "Seven-Branched Sword",
		accentA: "#2563eb",
		accentB: "#60a5fa"
	},
	{
		key: "faberge-egg",
		name: "Faberge Egg",
		accentA: "#7c3aed",
		accentB: "#c084fc"
	},
	{
		key: "code-of-hammurabi",
		name: "Code of Hammurabi",
		accentA: "#92400e",
		accentB: "#f59e0b"
	},
	{
		key: "tutankhamuns-dagger",
		name: "Tutankhamun's Dagger",
		accentA: "#0f766e",
		accentB: "#2dd4bf"
	},
	{
		key: "agamemnons-mask",
		name: "Agamemnon's Mask",
		accentA: "#4f46e5",
		accentB: "#a5b4fc"
	}
];

let targetInputs = [];

function buildTreasurePlaceholder(civ) {
	const iconMap = {
		orb: `
			<circle cx="36" cy="39" r="15" fill="#fde68a" stroke="#fff7ed" stroke-width="2.5" />
			<path d="M36 12v14M29 19h14" stroke="#fff7ed" stroke-width="3.2" stroke-linecap="round" />
			<path d="M28 51h16" stroke="#fff7ed" stroke-width="3" stroke-linecap="round" />
		`,
		"imperial-seal": `
			<rect x="23" y="22" width="26" height="24" rx="5" fill="#fecaca" stroke="#fff1f2" stroke-width="2.5" />
			<path d="M30 22c0-6 3-10 6-10s6 4 6 10" fill="none" stroke="#fff1f2" stroke-width="3" stroke-linecap="round" />
			<circle cx="36" cy="34" r="5" fill="#b91c1c" opacity="0.85" />
		`,
		"seven-branched-sword": `
			<path d="M36 12v40" stroke="#eff6ff" stroke-width="3.2" stroke-linecap="round" />
			<path d="M26 20h20M24 28h8M40 28h8M24 36h8M40 36h8" stroke="#eff6ff" stroke-width="3" stroke-linecap="round" />
			<path d="M30 52h12M33 56h6" stroke="#eff6ff" stroke-width="3" stroke-linecap="round" />
		`,
		"faberge-egg": `
			<path d="M36 14c10 0 15 10 15 21 0 10-7 17-15 17s-15-7-15-17c0-11 5-21 15-21Z" fill="#f5d0fe" stroke="#fff7ff" stroke-width="2.5" />
			<path d="M26 36h20M36 20v28" stroke="#fff7ff" stroke-width="2.5" opacity="0.9" />
			<circle cx="36" cy="36" r="4" fill="#fde68a" />
		`,
		"code-of-hammurabi": `
			<path d="M28 14h16l4 10v28H24V24Z" fill="#fcd34d" stroke="#fff7ed" stroke-width="2.5" />
			<path d="M29 30h14M29 36h14M29 42h14" stroke="#92400e" stroke-width="2" stroke-linecap="round" opacity="0.7" />
		`,
		"tutankhamuns-dagger": `
			<path d="M38 14 46 26 38 44 34 44 37 26 34 14Z" fill="#ccfbf1" stroke="#f0fdfa" stroke-width="2" />
			<path d="M28 42h16M31 42v12M41 42v12" stroke="#fef3c7" stroke-width="3" stroke-linecap="round" />
			<circle cx="36" cy="42" r="3" fill="#fde68a" />
		`,
		"agamemnons-mask": `
			<path d="M24 20c0-5 5-8 12-8s12 3 12 8v15c0 11-8 19-12 19s-12-8-12-19Z" fill="#e0e7ff" stroke="#eef2ff" stroke-width="2.5" />
			<path d="M30 30h3M39 30h3M32 40c2 2 6 2 8 0M34 34h4" stroke="#4338ca" stroke-width="2.2" stroke-linecap="round" />
		`
	};

	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
			<defs>
				<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stop-color="${civ.accentA}" />
					<stop offset="100%" stop-color="${civ.accentB}" />
				</linearGradient>
			</defs>
			<rect width="72" height="72" rx="36" fill="url(#g)" />
			<circle cx="36" cy="36" r="28" fill="rgba(255,255,255,0.14)" />
			${iconMap[civ.key]}
		</svg>
	`;
	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatPercent(probability) {
	return (probability * 100).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function clampProbability(inputPercent) {
	if (!Number.isFinite(inputPercent)) return null;
	const p = inputPercent / 100;
	if (p <= 0 || p >= 1) return null;
	return p;
}

function readTargets() {
	return targetInputs.map(input => Math.max(0, Math.floor(Number(input.value) || 0)));
}

function getTotalTarget(targets) {
	return targets.reduce((sum, v) => sum + v, 0);
}

function chooseAutoMode(targets) {
	return getTotalTarget(targets) <= EXACT_AUTO_MAX_TOTAL_TARGET ? "exact" : "approx";
}

function currentModeHintText(targets) {
	const modeChoice = document.getElementById("solverMode").value;
	const total = getTotalTarget(targets);

	if (modeChoice === "exact") {
		return `Exact selected. Total target ${total}.`;
	}
	if (modeChoice === "approx") {
		return `Fast approximation selected. Total target ${total}.`;
	}
	const autoPick = chooseAutoMode(targets);
	return `Auto currently picks ${autoPick === "exact" ? "Exact" : "Fast approximation"} (total ${total}).`;
}

function renderTargetInputs() {
	const grid = document.getElementById("civTargets");
	grid.innerHTML = "";
	targetInputs = [];

	for (let i = 0; i < CATEGORY_COUNT; i += 1) {
		const civ = CIVILIZATIONS[i];
		const tile = document.createElement("div");
		tile.className = "civ-tile";

		const badge = document.createElement("div");
		badge.className = "civ-badge";
		badge.style.backgroundImage = `url('${buildTreasurePlaceholder(civ)}')`;

		const name = document.createElement("div");
		name.className = "civ-name";
		name.textContent = `${civ.name} (Y${i + 1})`;

		const input = document.createElement("input");
		input.type = "number";
		input.min = "0";
		input.step = "1";
		input.className = "form-control form-control-sm target-input";
		input.value = DEFAULT_TARGETS[i];
		input.id = `target-${i + 1}`;
		input.addEventListener("input", refreshHint);

		tile.appendChild(badge);
		tile.appendChild(name);
		tile.appendChild(input);
		grid.appendChild(tile);
		targetInputs.push(input);
	}
}

function refreshHint() {
	const hint = document.getElementById("methodHint");
	hint.textContent = currentModeHintText(readTargets());
	refreshRuntimeWarning();
}

function getBinomialPmfArray(trials, categoriesRemaining) {
	const p = 1 / categoriesRemaining;
	const q = 1 - p;
	const pmf = new Array(trials + 1).fill(0);

	if (q === 0) {
		pmf[trials] = 1;
		return pmf;
	}

	pmf[0] = Math.pow(q, trials);
	const ratio = p / q;

	for (let k = 0; k < trials; k += 1) {
		pmf[k + 1] = pmf[k] * ((trials - k) / (k + 1)) * ratio;
	}

	return pmf;
}

function successProbabilityExact(chests, targets) {
	const requiredTotal = getTotalTarget(targets);
	if (requiredTotal > chests) return 0;

	const suffixMin = new Array(CATEGORY_COUNT + 1).fill(0);
	for (let i = CATEGORY_COUNT - 1; i >= 0; i -= 1) {
		suffixMin[i] = suffixMin[i + 1] + targets[i];
	}

	const memo = new Map();
	const pmfCache = new Map();

	function recurse(index, remaining) {
		const memoKey = `${index}|${remaining}`;
		if (memo.has(memoKey)) return memo.get(memoKey);

		const categoriesRemaining = CATEGORY_COUNT - index;
		if (categoriesRemaining === 1) {
			return remaining >= targets[index] ? 1 : 0;
		}

		if (remaining < suffixMin[index]) return 0;

		const minCurrent = targets[index];
		const maxCurrent = remaining - suffixMin[index + 1];
		if (minCurrent > maxCurrent) {
			memo.set(memoKey, 0);
			return 0;
		}

		const pmfKey = `${remaining}|${categoriesRemaining}`;
		let pmf = pmfCache.get(pmfKey);
		if (!pmf) {
			pmf = getBinomialPmfArray(remaining, categoriesRemaining);
			pmfCache.set(pmfKey, pmf);
		}

		let total = 0;
		for (let x = minCurrent; x <= maxCurrent; x += 1) {
			const next = recurse(index + 1, remaining - x);
			if (next > 0 && pmf[x] > 0) {
				total += pmf[x] * next;
			}
		}

		memo.set(memoKey, total);
		return total;
	}

	return recurse(0, chests);
}

function hashTargets(targets) {
	let hash = 2166136261;
	for (let i = 0; i < targets.length; i += 1) {
		hash ^= (targets[i] + 31 * i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function makeRng(seed) {
	let state = seed >>> 0;
	return function rng() {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function makeNormalSampler(rng) {
	let spare = null;
	return function sampleNormal() {
		if (spare !== null) {
			const out = spare;
			spare = null;
			return out;
		}

		let u = 0;
		let v = 0;
		while (u <= Number.EPSILON) u = rng();
		while (v <= Number.EPSILON) v = rng();

		const mag = Math.sqrt(-2 * Math.log(u));
		const angle = 2 * Math.PI * v;
		spare = mag * Math.sin(angle);
		return mag * Math.cos(angle);
	};
}

function successProbabilityApprox(chests, targets) {
	const requiredTotal = getTotalTarget(targets);
	if (requiredTotal > chests) return 0;

	const mean = chests / CATEGORY_COUNT;
	const scale = Math.sqrt(chests / CATEGORY_COUNT);
	const seed = (1469598103 ^ chests ^ hashTargets(targets)) >>> 0;
	const rng = makeRng(seed);
	const sampleNormal = makeNormalSampler(rng);

	let success = 0;
	for (let s = 0; s < APPROX_SAMPLES; s += 1) {
		const z = new Array(CATEGORY_COUNT);
		let sum = 0;

		for (let i = 0; i < CATEGORY_COUNT; i += 1) {
			z[i] = sampleNormal();
			sum += z[i];
		}

		const avg = sum / CATEGORY_COUNT;
		let ok = true;
		for (let i = 0; i < CATEGORY_COUNT; i += 1) {
			const xApprox = mean + scale * (z[i] - avg);
			if (xApprox + 0.5 < targets[i]) {
				ok = false;
				break;
			}
		}

		if (ok) success += 1;
	}

	return success / APPROX_SAMPLES;
}

function buildEvaluator(mode, targets) {
	const cache = new Map();
	return function evaluate(chests) {
		if (cache.has(chests)) return cache.get(chests);

		const p = mode === "exact"
			? successProbabilityExact(chests, targets)
			: successProbabilityApprox(chests, targets);
		cache.set(chests, p);
		return p;
	};
}

function estimateApproxOperations(targets) {
	const total = getTotalTarget(targets);
	const expectedEvals = 36;
	return expectedEvals * APPROX_SAMPLES * CATEGORY_COUNT + total * 200;
}

function resolveMode(choice, targets) {
	if (choice === "auto") return chooseAutoMode(targets);
	return choice;
}

function findMinimumChests(targetProbability, targets, modeChoice) {
	const mode = resolveMode(modeChoice, targets);
	const evaluate = buildEvaluator(mode, targets);

	const minPossible = getTotalTarget(targets);
	let low = minPossible;
	let high = Math.max(1, minPossible);

	let highProb = evaluate(high);
	let expandGuard = 0;
	while (highProb < targetProbability && expandGuard < 32) {
		high *= 2;
		highProb = evaluate(high);
		expandGuard += 1;
	}

	if (highProb < targetProbability) return null;

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		const p = evaluate(mid);

		if (p >= targetProbability) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	const minChests = low;
	return {
		minChests,
		achieved: evaluate(minChests),
		below: minChests > 0 ? evaluate(minChests - 1) : 0,
		mode
	};
}

function renderResultHtml(result, targetProbability, targets) {
	if (!result) {
		return '<div class="result-warning">Could not find a solution in range. Try lower targets or lower probability.</div>';
	}

	const modeLabel = result.mode === "exact" ? "Exact solver" : "Fast approximation";
	const prevLabel = result.minChests > 0 ? `${result.minChests - 1}` : "N/A";
	const prevProb = result.minChests > 0 ? `${formatPercent(result.below)}%` : "N/A";
	const targetsText = `[${targets.join(", ")}]`;

	return `
		<div class="result-value">${result.minChests} chests</div>
		<div class="result-sub">Method: <strong>${modeLabel}</strong></div>
		<div class="result-sub">Requested probability: <strong>${formatPercent(targetProbability)}%</strong></div>
		<div class="result-sub">Achieved at ${result.minChests}: <strong>${formatPercent(result.achieved)}%</strong></div>
		<div class="result-sub">At ${prevLabel}: <strong>${prevProb}</strong></div>
		<div class="result-sub">Targets Y1..Y7: <strong>${targetsText}</strong></div>
	`;
}

function getRuntimeWarningMessage(targets, modeChoice) {
	const mode = resolveMode(modeChoice, targets);
	const total = getTotalTarget(targets);

	if (mode === "exact" && total >= EXACT_WARN_TOTAL_TARGET) {
		return "Warning: this input is large for the exact solver and may take a long time to finish.";
	}

	if (mode === "approx") {
		const ops = estimateApproxOperations(targets);
		if (ops > APPROX_WARN_OPERATION_BUDGET) {
			return "Warning: this input is large enough that even the fast approximation may take over about 1 minute.";
		}
	}

	return "";
}

function refreshRuntimeWarning() {
	const warningEl = document.getElementById("runtimeWarning");
	const targets = readTargets();
	const modeChoice = document.getElementById("solverMode").value;
	const message = getRuntimeWarningMessage(targets, modeChoice);

	if (message) {
		warningEl.textContent = message;
		warningEl.hidden = false;
	} else {
		warningEl.textContent = "";
		warningEl.hidden = true;
	}
}

function calculate() {
	const probabilityInput = document.getElementById("targetProbability");
	const resultText = document.getElementById("resultText");
	const modeChoice = document.getElementById("solverMode").value;

	const targetProbability = clampProbability(Number(probabilityInput.value));
	if (!targetProbability) {
		resultText.innerHTML = '<span class="result-warning">Enter a probability between 0 and 100 (exclusive).</span>';
		return;
	}

	const targets = readTargets();

	resultText.innerHTML = '<span class="text-muted">Calculating...</span>';
	setTimeout(() => {
		const result = findMinimumChests(targetProbability, targets, modeChoice);
		resultText.innerHTML = renderResultHtml(result, targetProbability, targets);
	}, 0);
}

function loadExample() {
	const probabilityInput = document.getElementById("targetProbability");
	probabilityInput.value = "95";
	const example = [200, 180, 150, 140, 120, 100, 80];
	targetInputs.forEach((input, idx) => {
		input.value = example[idx];
	});
	refreshHint();
}

function resetInputs() {
	document.getElementById("targetProbability").value = "95";
	document.getElementById("solverMode").value = "auto";
	targetInputs.forEach(input => {
		input.value = "0";
	});
	document.getElementById("resultText").textContent = "Enter targets and click calculate.";
	refreshHint();
}

function init() {
	renderTargetInputs();
	document.getElementById("calculateBtn").addEventListener("click", calculate);
	document.getElementById("exampleBtn").addEventListener("click", loadExample);
	document.getElementById("resetBtn").addEventListener("click", resetInputs);
	document.getElementById("solverMode").addEventListener("change", refreshHint);
	document.getElementById("targetProbability").addEventListener("input", refreshRuntimeWarning);
	refreshHint();
}

init();
