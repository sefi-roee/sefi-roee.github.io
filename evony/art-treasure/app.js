const CATEGORY_COUNT = 16;
const ITEM_PROBABILITY = 1 / CATEGORY_COUNT; // 6.25%
const DEFAULT_TARGETS = Array.from({ length: CATEGORY_COUNT }, () => 0);

const EXACT_AUTO_MAX_TOTAL_TARGET = 420;
const EXACT_WARN_TOTAL_TARGET = 800;
const APPROX_SAMPLES = 28000;
const APPROX_WARN_OPERATION_BUDGET = 210000000;

const ART_TREASURES = [
	{ key: "excalibur", name: "Excalibur", accentA: "#f59e0b", accentB: "#fcd34d" },
	{ key: "mona-list", name: "Mona List", accentA: "#dc2626", accentB: "#f87171" },
	{ key: "great-imperial-crown", name: "Great Imperial Crown", accentA: "#2563eb", accentB: "#60a5fa" },
	{ key: "discobolus", name: "Discobolus", accentA: "#7c3aed", accentB: "#c084fc" },
	{ key: "terracotta-army", name: "Terracotta Army", accentA: "#92400e", accentB: "#f59e0b" },
	{ key: "tutankhumun-mask", name: "Tutankhumun's Mask", accentA: "#0f766e", accentB: "#2dd4bf" },
	{ key: "ring-of-fafnir", name: "Ring of Fafnir", accentA: "#4f46e5", accentB: "#a5b4fc" },
	{ key: "champion-knight-armor", name: "Champion Knight Armor", accentA: "#be123c", accentB: "#fb7185" },
	{ key: "nike-of-samothrace", name: "Nike of Samothrace", accentA: "#16a34a", accentB: "#86efac" },
	{ key: "celtic-chariot", name: "Celtic Chariot", accentA: "#ea580c", accentB: "#fdba74" },
	{ key: "golden-eagle", name: "Golden Eagle", accentA: "#7c2d12", accentB: "#d97706" },
	{ key: "trojan-horse", name: "Trojan Horse", accentA: "#2d3748", accentB: "#718096" },
	{ key: "laurel-wreath", name: "Laurel Wreath", accentA: "#5b21b6", accentB: "#d8b4fe" },
	{ key: "yasakani-no-magatama", name: "Yasakani no Magatama", accentA: "#15803d", accentB: "#bbf7d0" },
	{ key: "iron-crown", name: "Iron Crown", accentA: "#c026d3", accentB: "#e9d5ff" },
	{ key: "gold-cup-eternal-stability", name: "Gold Cup of Eternal Stability", accentA: "#0891b2", accentB: "#a5f3fc" }
];

let targetInputs = [];

function buildTreasurePlaceholder(index) {
	const treasure = ART_TREASURES[index];
	const num = index + 1;
	
	const iconSvg = `
		<circle cx="36" cy="36" r="20" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
		<text x="36" y="42" text-anchor="middle" font-size="20" font-weight="bold" fill="#ffffff">${num}</text>
	`;

	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
			<defs>
				<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stop-color="${treasure.accentA}" />
					<stop offset="100%" stop-color="${treasure.accentB}" />
				</linearGradient>
			</defs>
			<rect width="72" height="72" rx="36" fill="url(#g)" />
			<circle cx="36" cy="36" r="28" fill="rgba(255,255,255,0.14)" />
			${iconSvg}
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
	const grid = document.getElementById("artTargets");
	grid.innerHTML = "";
	targetInputs = [];

	for (let i = 0; i < CATEGORY_COUNT; i += 1) {
		const treasure = ART_TREASURES[i];
		const tile = document.createElement("div");
		tile.className = "art-tile";

		const badge = document.createElement("div");
		badge.className = "art-badge";
		badge.style.backgroundImage = `url('${buildTreasurePlaceholder(i)}')`;

		const name = document.createElement("div");
		name.className = "art-name";
		name.textContent = treasure.name;

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
	// Refresh reverse calculator when targets change
	handleReverseChestsChange();
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
	const treasureNames = ART_TREASURES.map(t => t.name).join(", ");
	const targetsText = `[${targets.join(", ")}]`;

	return `
		<div class="result-value">${result.minChests} chests</div>
		<div class="result-sub">Method: <strong>${modeLabel}</strong></div>
		<div class="result-sub">Requested probability: <strong>${formatPercent(targetProbability)}%</strong></div>
		<div class="result-sub">Achieved at ${result.minChests}: <strong>${formatPercent(result.achieved)}%</strong></div>
		<div class="result-sub">At ${prevLabel}: <strong>${prevProb}</strong></div>
		<div class="result-sub">Targets: <strong>${targetsText}</strong></div>
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
	const example = [10, 8, 9, 7, 6, 8, 10, 5, 7, 9, 6, 8, 7, 6, 8, 9];
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

function handleReverseChestsChange() {
	const targets = readTargets();
	const totalTarget = getTotalTarget(targets);
	
	const chestsSlider = document.getElementById("reverseChestsSlider");
	const probSlider = document.getElementById("reverseProbSlider");
	const chests = parseInt(chestsSlider.value);

	if (totalTarget === 0) {
		// With 0 targets, probability is 100% regardless of chests
		probSlider.value = 99.99;
		document.getElementById("reverseProbValue").textContent = "99.99";
		document.getElementById("reverseMessage").innerHTML = '<span class="text-success">✓ 100% (no targets set)</span>';
		return;
	}

	if (chests < totalTarget) {
		document.getElementById("reverseMessage").innerHTML = '<span class="text-warning">Chests must be ≥ ' + totalTarget + ' (total target)</span>';
		return;
	}

	const evaluate = buildEvaluator("approx", targets);
	const probability = evaluate(chests);
	
	probSlider.value = (probability * 100).toFixed(2);
	document.getElementById("reverseProbValue").textContent = (probability * 100).toFixed(2);
	document.getElementById("reverseMessage").innerHTML = '<span class="text-success">✓ Probability calculated</span>';
}

function handleReverseProbChange() {
	const targets = readTargets();
	const totalTarget = getTotalTarget(targets);
	
	const probSlider = document.getElementById("reverseProbSlider");
	const chestsSlider = document.getElementById("reverseChestsSlider");
	const targetProb = parseFloat(probSlider.value) / 100;

	if (totalTarget === 0) {
		// With 0 targets, any chests >= 0 achieves 100% probability
		chestsSlider.value = 0;
		document.getElementById("reverseChestsValue").textContent = "0";
		document.getElementById("reverseMessage").innerHTML = '<span class="text-success">✓ 0 chests (no targets set)</span>';
		return;
	}
	
	const evaluate = buildEvaluator("approx", targets);
	let low = totalTarget;
	let high = Math.max(1, totalTarget);

	let highProb = evaluate(high);
	let expandGuard = 0;
	while (highProb < targetProb && expandGuard < 32) {
		high *= 2;
		highProb = evaluate(high);
		expandGuard += 1;
	}

	if (highProb < targetProb) {
		document.getElementById("reverseMessage").innerHTML = '<span class="text-warning">No solution in range for this probability</span>';
		return;
	}

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		const p = evaluate(mid);

		if (p >= targetProb) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	chestsSlider.value = low;
	document.getElementById("reverseChestsValue").textContent = low;
	document.getElementById("reverseMessage").innerHTML = '<span class="text-success">✓ Minimum chests calculated</span>';
}

function initReverseCalculator() {
	const chestsSlider = document.getElementById("reverseChestsSlider");
	const probSlider = document.getElementById("reverseProbSlider");
	
	chestsSlider.addEventListener("input", (e) => {
		if (e.isTrusted) { // Only handle user input, not programmatic changes
			document.getElementById("reverseChestsValue").textContent = chestsSlider.value;
			handleReverseChestsChange();
		}
	});

	probSlider.addEventListener("input", (e) => {
		if (e.isTrusted) { // Only handle user input, not programmatic changes
			document.getElementById("reverseProbValue").textContent = parseFloat(probSlider.value).toFixed(2);
			handleReverseProbChange();
		}
	});
}

function init() {
	renderTargetInputs();
	document.getElementById("calculateBtn").addEventListener("click", calculate);
	document.getElementById("exampleBtn").addEventListener("click", loadExample);
	document.getElementById("resetBtn").addEventListener("click", resetInputs);
	document.getElementById("solverMode").addEventListener("change", refreshHint);
	document.getElementById("targetProbability").addEventListener("input", refreshRuntimeWarning);
	initReverseCalculator();
	refreshHint();
}

init();
