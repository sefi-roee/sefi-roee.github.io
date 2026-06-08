const DEFAULT_STATE = {
	probabilityPerScrollPercent: 14.81,
	targetSuccesses: 16,
	repetitions: 17
};

const PRESETS = {
	premium: {
		probabilityPerScrollPercent: 14.81,
		targetSuccesses: 16
	},
	regular: {
		probabilityPerScrollPercent: 8.66,
		targetSuccesses: 16
	}
};

const MIN_REPETITIONS = 1;
const MAX_REPETITIONS = 300;

const elements = {
	probabilityPerScroll: document.getElementById("scrollProbability"),
	targetSuccesses: document.getElementById("targetSuccesses"),
	winProbabilityRange: document.getElementById("winProbabilityRange"),
	winProbabilityNumber: document.getElementById("winProbabilityNumber"),
	repetitionsRange: document.getElementById("repetitionsRange"),
	repetitionsNumber: document.getElementById("repetitionsNumber"),
	probabilityValue: document.getElementById("probabilityValue"),
	probabilityDetail: document.getElementById("probabilityDetail"),
	repetitionsValue: document.getElementById("repetitionsValue"),
	repetitionsDetail: document.getElementById("repetitionsDetail"),
	expectedValue: document.getElementById("expectedValue"),
	summaryLine: document.getElementById("summaryLine"),
	formulaCurrent: document.getElementById("formulaCurrent"),
	formulaDetail: document.getElementById("formulaDetail"),
	probabilityChart: document.getElementById("probabilityChart"),
	presetPremiumBtn: document.getElementById("presetPremiumBtn"),
	presetRegularBtn: document.getElementById("presetRegularBtn"),
	resetBtn: document.getElementById("resetBtn")
};

const state = {
	probabilityPerScroll: DEFAULT_STATE.probabilityPerScrollPercent / 100,
	targetSuccesses: DEFAULT_STATE.targetSuccesses,
	repetitions: DEFAULT_STATE.repetitions
};

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function parseProbabilityPercent(rawValue) {
	const value = Number(rawValue);
	if (!Number.isFinite(value)) {
		return DEFAULT_STATE.probabilityPerScrollPercent / 100;
	}
	return clamp(value, 0, 100) / 100;
}

function parseTargetSuccesses(rawValue) {
	const value = Math.floor(Number(rawValue));
	if (!Number.isFinite(value) || value < 1) {
		return 1;
	}
	return value;
}

function parseRepetitions(rawValue) {
	const value = Math.floor(Number(rawValue));
	if (!Number.isFinite(value) || value < MIN_REPETITIONS) {
		return MIN_REPETITIONS;
	}
	return Math.min(value, MAX_REPETITIONS);
}

function formatPercent(probability) {
	if (probability >= 0.9999995) {
		return "100%";
	}
	if (probability <= 0.0000005) {
		return "0%";
	}

	const percent = probability * 100;
	const decimals = percent >= 10 ? 2 : 4;
	return `${percent.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function formatDecimal(value) {
	if (Math.abs(value) >= 100) {
		return value.toFixed(1).replace(/\.0$/, "");
	}
	return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPercentNumber(probability) {
	const percent = probability * 100;
	return percent.toFixed(percent >= 10 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "");
}

function successProbabilityAtLeast(repetitions, targetSuccesses, perScrollProbability) {
	if (targetSuccesses <= 0) {
		return 1;
	}
	if (repetitions < targetSuccesses) {
		return 0;
	}
	if (perScrollProbability <= 0) {
		return 0;
	}
	if (perScrollProbability >= 1) {
		return 1;
	}

	const missProbability = 1 - perScrollProbability;
	let term = Math.pow(missProbability, repetitions);
	let cumulativeFail = term;

	for (let successes = 0; successes < targetSuccesses - 1; successes += 1) {
		term *= ((repetitions - successes) / (successes + 1)) * (perScrollProbability / missProbability);
		cumulativeFail += term;
	}

	const success = 1 - cumulativeFail;
	return clamp(success, 0, 1);
}

function findMinimumRepetitions(perScrollProbability, targetSuccesses, desiredProbability) {
	if (targetSuccesses <= 0 || desiredProbability <= 0) {
		return MIN_REPETITIONS;
	}
	if (perScrollProbability <= 0) {
		return Number.POSITIVE_INFINITY;
	}
	if (perScrollProbability >= 1) {
		return targetSuccesses;
	}

	let low = 0;
	let high = Math.max(targetSuccesses, 1);

	while (high < MAX_REPETITIONS && successProbabilityAtLeast(high, targetSuccesses, perScrollProbability) < desiredProbability) {
		high *= 2;
	}

	if (high >= MAX_REPETITIONS && successProbabilityAtLeast(MAX_REPETITIONS, targetSuccesses, perScrollProbability) < desiredProbability) {
		return Number.POSITIVE_INFINITY;
	}

	high = Math.min(high, MAX_REPETITIONS);

	while (low + 1 < high) {
		const mid = Math.floor((low + high) / 2);
		if (successProbabilityAtLeast(mid, targetSuccesses, perScrollProbability) >= desiredProbability) {
			high = mid;
		} else {
			low = mid;
		}
	}

	return high;
}

function updateRepetitionRangeMax(currentRepetitions) {
	elements.repetitionsRange.min = String(MIN_REPETITIONS);
	elements.repetitionsRange.max = String(MAX_REPETITIONS);
	elements.repetitionsNumber.min = String(MIN_REPETITIONS);
	elements.repetitionsNumber.max = String(MAX_REPETITIONS);
}

function renderFormula(currentFormula) {
	if (window.katex) {
		window.katex.render(currentFormula, elements.formulaCurrent, {
			throwOnError: false,
			displayMode: true
		});
		return;
	}

	elements.formulaCurrent.textContent = currentFormula;
}

function buildChartSvg(points, selectedAttempts, selectedProbability) {
	const width = 760;
	const height = 250;
	const left = 52;
	const right = 18;
	const top = 20;
	const bottom = 38;
	const plotWidth = width - left - right;
	const plotHeight = height - top - bottom;
	const maxAttempts = points[points.length - 1].attempts;

	const xFor = attempts => left + (maxAttempts === 0 ? 0 : (attempts / maxAttempts) * plotWidth);
	const yFor = probability => top + (1 - probability) * plotHeight;

	const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.attempts).toFixed(2)} ${yFor(point.probability).toFixed(2)}`).join(" ");
	const areaPath = `${linePath} L ${xFor(maxAttempts).toFixed(2)} ${(top + plotHeight).toFixed(2)} L ${xFor(points[0].attempts).toFixed(2)} ${(top + plotHeight).toFixed(2)} Z`;
	const selectedX = xFor(selectedAttempts);
	const selectedY = yFor(selectedProbability);

	const xLabels = [0, Math.round(maxAttempts / 3), Math.round((2 * maxAttempts) / 3), maxAttempts]
		.filter((value, index, arr) => arr.indexOf(value) === index)
		.map(value => `<text class="chart-label" x="${xFor(value)}" y="${height - 12}" text-anchor="middle">${value}</text>`)
		.join("");

	const yTicks = [0, 0.25, 0.5, 0.75, 1]
		.map(probability => {
			const y = yFor(probability);
			return `<text class="chart-label" x="${left - 10}" y="${y + 4}" text-anchor="end">${Math.round(probability * 100)}%</text>`;
		})
		.join("");

	return `
		<line x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}" stroke="#7f93aa" stroke-width="1.2"></line>
		<line x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}" stroke="#7f93aa" stroke-width="1.2"></line>
		<path class="chart-area" d="${areaPath}"></path>
		<path class="chart-line" d="${linePath}"></path>
		<line class="chart-guide" x1="${selectedX}" y1="${top + plotHeight}" x2="${selectedX}" y2="${selectedY}"></line>
		<line class="chart-guide" x1="${left}" y1="${selectedY}" x2="${selectedX}" y2="${selectedY}"></line>
		<circle class="chart-highlight" cx="${selectedX}" cy="${selectedY}" r="6"></circle>
		<text class="chart-axis" x="${left + plotWidth / 2}" y="${height - 4}" text-anchor="middle">Attempts</text>
		<text class="chart-axis" x="16" y="${top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 16 ${top + plotHeight / 2})">Win probability</text>
		<text class="chart-label" x="${Math.min(selectedX + 12, left + plotWidth - 8)}" y="${Math.max(selectedY - 12, top + 14)}">(${selectedAttempts}, ${formatPercentNumber(selectedProbability)}%)</text>
		${xLabels}
		${yTicks}
	`;
}

function renderProbabilityChart(selectedProbability) {
	const chartMax = MAX_REPETITIONS;
	const points = [];

	for (let attempts = MIN_REPETITIONS; attempts <= chartMax; attempts += 1) {
		points.push({
			attempts,
			probability: successProbabilityAtLeast(attempts, state.targetSuccesses, state.probabilityPerScroll)
		});
	}

	elements.probabilityChart.innerHTML = buildChartSvg(points, state.repetitions, selectedProbability);
}

function renderFormulaSection(selectedProbability) {
	const p = state.probabilityPerScroll;
	const n = state.repetitions;
	const k = state.targetSuccesses;
	const currentFormula = String.raw`P(X \ge ${k})=1-\sum_{i=0}^{${Math.max(k - 1, 0)}} \binom{${n}}{i} (${p.toFixed(4)})^i (${(1 - p).toFixed(4)})^{${n}-i}=${selectedProbability.toFixed(6)}`;
	renderFormula(currentFormula);
	elements.formulaDetail.textContent = `Here, n = ${n} attempts, p = ${formatPercent(p)} per scroll, and the target is at least ${k} success${k === 1 ? "" : "es"}.`;
}

function syncOutputs() {
	const winProbability = successProbabilityAtLeast(state.repetitions, state.targetSuccesses, state.probabilityPerScroll);
	const expectedSuccesses = state.repetitions * state.probabilityPerScroll;

	updateRepetitionRangeMax(state.repetitions);

	elements.winProbabilityRange.value = String(winProbability * 100);
	elements.winProbabilityNumber.value = (winProbability * 100).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
	elements.repetitionsRange.value = String(state.repetitions);
	elements.repetitionsNumber.value = String(state.repetitions);
	elements.probabilityValue.textContent = formatPercent(winProbability);
	elements.repetitionsValue.textContent = String(state.repetitions);
	elements.expectedValue.textContent = formatDecimal(expectedSuccesses);
	elements.probabilityDetail.textContent = `Exact chance to get at least ${state.targetSuccesses} success${state.targetSuccesses === 1 ? "" : "es"} in ${state.repetitions} attempt${state.repetitions === 1 ? "" : "s"}.`;
	elements.repetitionsDetail.textContent = `This is the scroll-attempt count currently represented by the linked controls.`;
	elements.summaryLine.textContent = `With ${formatPercent(state.probabilityPerScroll)} success per scroll, ${state.repetitions} repetitions gives an average of ${formatDecimal(expectedSuccesses)} successes.`;
	renderFormulaSection(winProbability);
	renderProbabilityChart(winProbability);
}

function syncBaseInputs() {
	elements.probabilityPerScroll.value = (state.probabilityPerScroll * 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
	elements.targetSuccesses.value = String(state.targetSuccesses);
}

function syncPresetButtons() {
	const premiumActive = Math.abs(state.probabilityPerScroll - PRESETS.premium.probabilityPerScrollPercent / 100) < 0.000001
		&& state.targetSuccesses === PRESETS.premium.targetSuccesses;
	const regularActive = Math.abs(state.probabilityPerScroll - PRESETS.regular.probabilityPerScrollPercent / 100) < 0.000001
		&& state.targetSuccesses === PRESETS.regular.targetSuccesses;

	elements.presetPremiumBtn.className = `btn ${premiumActive ? "btn-primary" : "btn-outline-secondary"} preset-btn`;
	elements.presetRegularBtn.className = `btn ${regularActive ? "btn-primary" : "btn-outline-secondary"} preset-btn`;
}

function applyPreset(preset) {
	state.probabilityPerScroll = preset.probabilityPerScrollPercent / 100;
	state.targetSuccesses = preset.targetSuccesses;
	syncBaseInputs();
	syncPresetButtons();
	syncOutputs();
}

function applyProbabilityPosition(rawPercent) {
	const desiredProbability = clamp(Number(rawPercent), 0, 99.9999) / 100;
	const repetitions = findMinimumRepetitions(state.probabilityPerScroll, state.targetSuccesses, desiredProbability);
	state.repetitions = Number.isFinite(repetitions) ? repetitions : MAX_REPETITIONS;
	syncOutputs();

	if (!Number.isFinite(repetitions)) {
		elements.repetitionsDetail.textContent = `More than ${MAX_REPETITIONS.toLocaleString()} attempts would be needed to reach that probability with the current per-scroll chance.`;
	}
	if (desiredProbability > 0) {
		elements.probabilityDetail.textContent += " The probability slider snaps to the first reachable exact value.";
	}
}

function applyRepetitionPosition(rawValue) {
	state.repetitions = parseRepetitions(rawValue);
	if (state.repetitions < state.targetSuccesses && state.probabilityPerScroll > 0) {
		state.repetitions = Math.max(0, state.repetitions);
	}
	syncOutputs();
}

function refreshFromBaseInputs() {
	state.probabilityPerScroll = parseProbabilityPercent(elements.probabilityPerScroll.value);
	state.targetSuccesses = parseTargetSuccesses(elements.targetSuccesses.value);
	state.repetitions = clamp(state.repetitions, MIN_REPETITIONS, MAX_REPETITIONS);
	if (state.probabilityPerScroll >= 1) {
		state.repetitions = clamp(Math.max(state.repetitions, state.targetSuccesses), MIN_REPETITIONS, MAX_REPETITIONS);
	}
	syncBaseInputs();
	syncOutputs();
}

function loadExample() {
	state.probabilityPerScroll = 0.17;
	state.targetSuccesses = 3;
	state.repetitions = findMinimumRepetitions(state.probabilityPerScroll, state.targetSuccesses, 0.8);
	syncBaseInputs();
	syncOutputs();
}

function resetState() {
	state.probabilityPerScroll = DEFAULT_STATE.probabilityPerScrollPercent / 100;
	state.targetSuccesses = DEFAULT_STATE.targetSuccesses;
	state.repetitions = DEFAULT_STATE.repetitions;
	syncBaseInputs();
	syncOutputs();
}

elements.probabilityPerScroll.addEventListener("input", refreshFromBaseInputs);
elements.targetSuccesses.addEventListener("input", refreshFromBaseInputs);

elements.winProbabilityRange.addEventListener("input", event => {
	applyProbabilityPosition(event.target.value);
});

elements.winProbabilityNumber.addEventListener("input", event => {
	applyProbabilityPosition(event.target.value);
});

elements.repetitionsRange.addEventListener("input", event => {
	applyRepetitionPosition(event.target.value);
});

elements.repetitionsNumber.addEventListener("input", event => {
	applyRepetitionPosition(event.target.value);
});

elements.presetPremiumBtn.addEventListener("click", () => {
	applyPreset(PRESETS.premium);
});

elements.presetRegularBtn.addEventListener("click", () => {
	applyPreset(PRESETS.regular);
});

elements.resetBtn.addEventListener("click", resetState);

resetState();

if (window.katex) {
	resetState();
} else {
	window.addEventListener("load", () => {
		syncOutputs();
	});
}