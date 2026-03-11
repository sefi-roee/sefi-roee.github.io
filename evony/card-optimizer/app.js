// Evony Card Compose Optimizer - Core Logic & UI

const defaultCards = [
    { name: 'Green', img: 'https://www.evonytkrguide.com/img/items/green_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Blue', img: 'https://www.evonytkrguide.com/img/items/blue_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Purple', img: 'https://www.evonytkrguide.com/img/items/purple_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Orange', img: 'https://www.evonytkrguide.com/img/items/orange_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Red', img: 'https://www.evonytkrguide.com/img/items/red_lucky_composing_gift_card.jpg', count: 0 },
];

const defaultRecipes = [
    { name: 'Compose I', cards: { Green: 1, Blue: 1, Purple: 1 }, outcome: 'Lucky Box I', value: 10 },
    { name: 'Compose II', cards: { Green: 1, Blue: 1, Orange: 1 }, outcome: 'Lucky Box II', value: 12 },
    { name: 'Compose III', cards: { Green: 1, Blue: 1, Red: 1 }, outcome: 'Lucky Box III', value: 14 },
    { name: 'Compose IV', cards: { Green: 1, Purple: 1, Orange: 1 }, outcome: 'Lucky Box IV', value: 16 },
    { name: 'Compose V', cards: { Green: 1, Purple: 1, Red: 1 }, outcome: 'Lucky Box V', value: 18 },
    { name: 'Compose VI', cards: { Blue: 1, Purple: 1, Red: 1 }, outcome: 'Lucky Box VI', value: 20 },
    { name: 'Compose VII', cards: { Blue: 1, Purple: 1, Orange: 1 }, outcome: 'Lucky Box VII', value: 22 },
    { name: 'Compose VIII', cards: { Green: 1, Orange: 1, Red: 1 }, outcome: 'Lucky Box VIII', value: 24 },
    { name: 'Compose IX', cards: { Blue: 1, Orange: 1, Red: 1 }, outcome: 'Lucky Box IX', value: 26 },
    { name: 'Compose X', cards: { Purple: 1, Orange: 1, Red: 1 }, outcome: 'Lucky Box X', value: 28 },
];

const defaultRewardConfig = {
    metadata: {
        probabilities: {
            '1_reward': 0.60,
            '2_rewards': 0.2667,
            '3_rewards': 0.1333,
        },
    },
    boxes: {},
};

const objectiveModes = {
    manual: 'manual',
    rewards: 'rewards',
};

const rankPresets = {
    'Minimal Residual': [0.9, 0.95, 0.95, 1, 1, 0.95, 0.95, 1, 0.95, 1.2],
    'High Value Focus': [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10],
    'Box X Priority': [0.5, 0.5, 0.5, 1, 1, 1, 2, 3, 5, 10],
    'Mid-Tier (VI-VIII)': [0.5, 0.5, 1, 1.5, 2, 3, 3, 3, 2, 1],
    Balanced: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 3],
};

const rewardPresetDefinitions = [
    {
        key: 'all',
        label: 'All Rewards',
        description: 'Enable everything with balanced weight',
        getWeight: () => 1,
    },
    {
        key: 'rss',
        label: 'RSS Focus',
        description: 'Prioritize resources and resource chests',
        getWeight: name => {
            const n = normalizeRewardName(name);
            if (n.includes('food') || n.includes('ore') || n.includes('stone') || n.includes('lumber') || n.includes('gold')) return 2.2;
            if (n.includes('resource chest')) return 2.4;
            if (n.includes('chips')) return 1.4;
            return 0;
        },
    },
    {
        key: 'stamina',
        label: 'Stamina/Hunting',
        description: 'Prioritize stamina and hunt utility',
        getWeight: name => {
            const n = normalizeRewardName(name);
            if (n.includes('stamina')) return 3.0;
            if (n.includes('teleporter')) return 1.8;
            if (n.includes('speedup')) return 1.2;
            if (n.includes('gathering speed')) return 1.5;
            return 0;
        },
    },
    {
        key: 'speedups',
        label: 'Speedups',
        description: 'Prioritize all speedups and time reducers',
        getWeight: name => {
            const n = normalizeRewardName(name);
            if (n.includes('speedup') || n.includes('gathering speed')) return 2.6;
            return 0;
        },
    },
    {
        key: 'war',
        label: 'PvP/War',
        description: 'Prioritize combat utility rewards',
        getWeight: name => {
            const n = normalizeRewardName(name);
            if (n.includes('attack increase')) return 2.6;
            if (n.includes('truce')) return 2.8;
            if (n.includes('teleporter')) return 2.4;
            if (n.includes('stamina')) return 1.4;
            return 0;
        },
    },
    {
        key: 'growth',
        label: 'Growth/EXP',
        description: 'Prioritize EXP, materials, refining, chips',
        getWeight: name => {
            const n = normalizeRewardName(name);
            if (n.includes('exp')) return 2.2;
            if (n.includes('material chest')) return 2.0;
            if (n.includes('refining stone')) return 2.2;
            if (n.includes('chips')) return 1.9;
            return 0;
        },
    },
];

const optimizerSettingsStorageKey = 'evony-card-optimizer-settings-v1';

let cards = null;
let recipes = null;
let luckyBoxRewards = defaultRewardConfig;
let rewardWeights = {};
let rewardEnabled = {};
let rewardReferenceAmounts = {};
let activeRewardPresetKey = null;
let objectiveMode = objectiveModes.rewards;
let configLoaded = false;
let optimizeResult = null;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadJson(path) {
    return fetch(path, { cache: 'no-store' }).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load ${path}`);
        }
        return response.json();
    });
}

function persistOptimizerSettings() {
    try {
        const payload = {
            objectiveMode,
            activeRewardPresetKey,
            rewardWeights,
            rewardEnabled,
        };
        localStorage.setItem(optimizerSettingsStorageKey, JSON.stringify(payload));
    } catch (_error) {
        // Ignore storage errors (privacy mode or disabled storage)
    }
}

function restorePersistedSettings() {
    try {
        const raw = localStorage.getItem(optimizerSettingsStorageKey);
        if (!raw) {
            return;
        }

        const data = JSON.parse(raw);
        if (data.objectiveMode === objectiveModes.manual || data.objectiveMode === objectiveModes.rewards) {
            objectiveMode = data.objectiveMode;
        }

        if (data.rewardWeights && typeof data.rewardWeights === 'object') {
            Object.keys(rewardWeights).forEach(rewardName => {
                if (Object.prototype.hasOwnProperty.call(data.rewardWeights, rewardName)) {
                    rewardWeights[rewardName] = Math.max(0, Number(data.rewardWeights[rewardName]) || 0);
                }
            });
        }

        if (data.rewardEnabled && typeof data.rewardEnabled === 'object') {
            Object.keys(rewardEnabled).forEach(rewardName => {
                if (Object.prototype.hasOwnProperty.call(data.rewardEnabled, rewardName)) {
                    rewardEnabled[rewardName] = Boolean(data.rewardEnabled[rewardName]);
                }
            });
        }

        if (typeof data.activeRewardPresetKey === 'string' && rewardPresetDefinitions.some(item => item.key === data.activeRewardPresetKey)) {
            activeRewardPresetKey = data.activeRewardPresetKey;
        } else {
            activeRewardPresetKey = null;
        }
    } catch (_error) {
        // Ignore malformed stored state
    }
}

function makeDomId(prefix, value) {
    return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function formatAmount(value) {
    return Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function isSpeedupReward(rewardName) {
    return normalizeRewardName(rewardName).includes('speedup');
}

function isRssReward(rewardName) {
    const name = normalizeRewardName(rewardName);
    return name.includes('food') || name.includes('lumber') || name.includes('ore') || name.includes('stone');
}

function isGoldReward(rewardName) {
    return normalizeRewardName(rewardName).includes('gold');
}

function isExpReward(rewardName) {
    const name = normalizeRewardName(rewardName);
    return name.includes('general exp') || name.includes('monarch exp');
}

function formatMillions(value) {
    return `${(Number(value) / 1000000).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}M`;
}

function formatRewardAmount(rewardName, amount) {
    if (isRssReward(rewardName) || isGoldReward(rewardName) || isExpReward(rewardName)) {
        return formatMillions(amount);
    }
    return formatAmount(amount);
}

function formatMinutesAsDays(minutes) {
    const days = Number(minutes) / (60 * 24);
    return Number(days).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function normalizeRewardName(name) {
    return String(name || '').toLowerCase();
}

function applyRewardPreset(presetKey) {
    const preset = rewardPresetDefinitions.find(item => item.key === presetKey);
    if (!preset) {
        return;
    }

    Object.keys(rewardWeights).forEach(rewardName => {
        const weight = Number(preset.getWeight(rewardName)) || 0;
        rewardEnabled[rewardName] = weight > 0;
        rewardWeights[rewardName] = weight > 0 ? weight : 1;
    });

    activeRewardPresetKey = presetKey;
    persistOptimizerSettings();

    renderApp();
}

function applyRankPreset(presetName) {
    if (!rankPresets[presetName]) {
        return;
    }

    const values = rankPresets[presetName];
    for (let index = 0; index < recipes.length && index < values.length; index += 1) {
        recipes[index].value = values[index];
    }

    renderApp();
}

function loadConfigAndInit() {
    Promise.allSettled([
        loadJson('evony-config.json'),
        loadJson('lucky-box-rewards.json'),
    ]).then(([configResult, rewardsResult]) => {
        const config = configResult.status === 'fulfilled' ? configResult.value : null;
        const rewardsConfig = rewardsResult.status === 'fulfilled' ? rewardsResult.value : null;

        cards = clone(defaultCards);
        recipes = clone(defaultRecipes);
        luckyBoxRewards = rewardsConfig && rewardsConfig.boxes ? rewardsConfig : clone(defaultRewardConfig);

        if (config && Array.isArray(config.defaultCardCounts) && config.defaultCardCounts.length === cards.length) {
            for (let index = 0; index < cards.length; index += 1) {
                cards[index].count = config.defaultCardCounts[index];
            }
        }

        if (config && Array.isArray(config.defaultRecipeValues) && config.defaultRecipeValues.length === recipes.length) {
            for (let index = 0; index < recipes.length; index += 1) {
                recipes[index].value = config.defaultRecipeValues[index];
            }
        }

        initializeRewardWeights();
        restorePersistedSettings();
        configLoaded = true;
        renderApp();
    });
}

function initializeRewardWeights() {
    const nextWeights = {};
    const nextEnabled = {};
    const rewardAmounts = {};

    Object.values(luckyBoxRewards.boxes || {}).forEach(box => {
        (box.rewards || []).forEach(item => {
            if (!item || !item.reward) {
                return;
            }

            nextWeights[item.reward] = Object.prototype.hasOwnProperty.call(rewardWeights, item.reward)
                ? rewardWeights[item.reward]
                : 1;
            nextEnabled[item.reward] = Object.prototype.hasOwnProperty.call(rewardEnabled, item.reward)
                ? rewardEnabled[item.reward]
                : true;

            if (!rewardAmounts[item.reward]) {
                rewardAmounts[item.reward] = [];
            }
            rewardAmounts[item.reward].push(Number(item.amount) || 0);
        });
    });

    rewardWeights = nextWeights;
    rewardEnabled = nextEnabled;
    rewardReferenceAmounts = buildRewardReferenceAmounts(rewardAmounts);
}

function buildRewardReferenceAmounts(rewardAmounts) {
    const references = {};

    Object.entries(rewardAmounts).forEach(([rewardName, amounts]) => {
        const sorted = amounts
            .filter(amount => amount > 0)
            .sort((left, right) => left - right);

        if (!sorted.length) {
            references[rewardName] = 1;
            return;
        }

        const middle = Math.floor(sorted.length / 2);
        references[rewardName] = sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle];
    });

    return references;
}

function getRewardReferenceAmount(rewardName) {
    return rewardReferenceAmounts[rewardName] || 1;
}

function getNormalizedRewardAmount(rewardName, amount) {
    return amount / getRewardReferenceAmount(rewardName);
}

function getOpeningProbabilities() {
    const probabilities = luckyBoxRewards.metadata && luckyBoxRewards.metadata.probabilities;
    if (!probabilities) {
        return defaultRewardConfig.metadata.probabilities;
    }

    return {
        '1_reward': Number(probabilities['1_reward']) || 0,
        '2_rewards': Number(probabilities['2_rewards']) || 0,
        '3_rewards': Number(probabilities['3_rewards']) || 0,
    };
}

function getExpectedDrawCount() {
    const probabilities = getOpeningProbabilities();
    return probabilities['1_reward'] + (2 * probabilities['2_rewards']) + (3 * probabilities['3_rewards']);
}

function getBoxData(outcome) {
    return Object.values(luckyBoxRewards.boxes || {}).find(box => box.name === outcome) || null;
}

function getExpectedRewardsForOutcome(outcome) {
    const box = getBoxData(outcome);
    if (!box || !Array.isArray(box.rewards) || box.rewards.length === 0) {
        return [];
    }

    const expectedSelectionsPerReward = getExpectedDrawCount() / box.rewards.length;
    const totals = new Map();

    box.rewards.forEach(item => {
        if (!item || !item.reward) {
            return;
        }

        const amount = Number(item.amount) || 0;
        totals.set(item.reward, (totals.get(item.reward) || 0) + (amount * expectedSelectionsPerReward));
    });

    return Array.from(totals.entries())
        .map(([reward, amount]) => ({ reward, amount }))
        .sort((left, right) => right.amount - left.amount || left.reward.localeCompare(right.reward));
}

function getRewardScoreForOutcome(outcome) {
    return getExpectedRewardsForOutcome(outcome).reduce((total, item) => {
        if (!rewardEnabled[item.reward]) {
            return total;
        }
        return total + (getNormalizedRewardAmount(item.reward, item.amount) * (rewardWeights[item.reward] ?? 0));
    }, 0);
}

function getRecipeObjectiveValue(recipe) {
    return objectiveMode === objectiveModes.rewards
        ? getRewardScoreForOutcome(recipe.outcome)
        : recipe.value;
}

function getRewardSummaryText(outcome, multiplier = 1, limit = 3) {
    const rewards = getExpectedRewardsForOutcome(outcome);
    if (!rewards.length) {
        return 'No reward data';
    }

    return rewards
        .slice(0, limit)
        .map(item => `${item.reward}: ${formatAmount(item.amount * multiplier)}`)
        .join(' | ');
}

function renderMobileCollapsibleSection(title, contentNode, openByDefault) {
    const wrapper = document.createElement('details');
    wrapper.className = 'mobile-collapsible';
    if (openByDefault) {
        wrapper.open = true;
    }

    const summary = document.createElement('summary');
    summary.className = 'mobile-collapsible-summary';
    summary.textContent = title;

    const body = document.createElement('div');
    body.className = 'mobile-collapsible-body';
    body.appendChild(contentNode);

    wrapper.appendChild(summary);
    wrapper.appendChild(body);
    return wrapper;
}

function renderApp() {
    if (!configLoaded) {
        const root = document.getElementById('app-root') || document.getElementById('main-flex');
        if (root) {
            root.innerHTML = '<div class="text-center text-muted">Loading configuration...</div>';
        }
        return;
    }

    const cardCol = document.getElementById('card-col');
    const recipeCol = document.getElementById('recipe-col');
    const resultCol = document.getElementById('result-col');

    if (cardCol && recipeCol && resultCol) {
        cardCol.innerHTML = '';
        recipeCol.innerHTML = '';
        resultCol.innerHTML = '';

        const inventoryControls = document.createElement('div');
        inventoryControls.appendChild(renderCardInput());
        inventoryControls.appendChild(renderOptimizeControls());
        inventoryControls.appendChild(renderRewardWeightsPanel());

        cardCol.appendChild(renderMobileCollapsibleSection('Inventory & Controls', inventoryControls, true));
        recipeCol.appendChild(renderMobileCollapsibleSection('Recipes', renderRecipeInput(), true));
        resultCol.appendChild(renderMobileCollapsibleSection('Results', renderResults(), true));
        return;
    }

    const root = document.getElementById('app-root');
    if (!root) {
        return;
    }

    root.innerHTML = '';
    const inventoryControls = document.createElement('div');
    inventoryControls.appendChild(renderCardInput());
    inventoryControls.appendChild(renderOptimizeControls());
    inventoryControls.appendChild(renderRewardWeightsPanel());

    root.appendChild(renderMobileCollapsibleSection('Inventory & Controls', inventoryControls, true));
    root.appendChild(renderMobileCollapsibleSection('Recipes', renderRecipeInput(), true));
    root.appendChild(renderMobileCollapsibleSection('Results', renderResults(), true));
}

function renderCardInput() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = '<h4>Card Inventory</h4>';

    cards.forEach((card, index) => {
        const row = document.createElement('div');
        row.className = 'compose-row';
        row.innerHTML = `
            <img src="${card.img || 'https://via.placeholder.com/48x64?text=' + card.name}" class="card-img" alt="${card.name}">
            <span class="me-2">${card.name}</span>
            <input type="number" min="0" value="${card.count}" class="form-control form-control-sm w-25" id="card-count-${index}">
        `;
        row.querySelector('input').addEventListener('input', event => {
            cards[index].count = Math.max(0, parseInt(event.target.value, 10) || 0);
        });
        div.appendChild(row);
    });

    return div;
}

function getLuckyBoxImage(outcome) {
    const map = {
        'Lucky Box I': 'https://www.evonytkrguide.com/img/items/lucky_box_i_1.jpg',
        'Lucky Box II': 'https://www.evonytkrguide.com/img/items/lucky_box_ii_2.jpg',
        'Lucky Box III': 'https://www.evonytkrguide.com/img/items/lucky_box_iii_3.jpg',
        'Lucky Box IV': 'https://www.evonytkrguide.com/img/items/lucky_box_iv_4.jpg',
        'Lucky Box V': 'https://www.evonytkrguide.com/img/items/lucky_box_v_5.jpg',
        'Lucky Box VI': 'https://www.evonytkrguide.com/img/items/lucky_box_vi_6.jpg',
        'Lucky Box VII': 'https://www.evonytkrguide.com/img/items/lucky_box_vii_7.jpg',
        'Lucky Box VIII': 'https://www.evonytkrguide.com/img/items/lucky_box_viii_8.jpg',
        'Lucky Box IX': 'https://www.evonytkrguide.com/img/items/lucky_box_ix_9.jpg',
        'Lucky Box X': 'https://www.evonytkrguide.com/img/items/lucky_box_x_10.jpg',
    };

    return map[outcome] || '';
}

function getCardImg(cardName) {
    const card = defaultCards.find(item => item.name === cardName);
    return card ? card.img : '';
}

function renderRecipeInput() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = '<h4>Recipes, Rewards & Ranking</h4>';

    recipes.forEach((recipe, index) => {
        const row = document.createElement('div');
        row.className = 'recipe-row recipe-row-stacked';
        const cardIcons = Object.keys(recipe.cards)
            .map(cardName => `<img src="${getCardImg(cardName)}" title="${cardName}" class="recipe-card-icon">`)
            .join('+');
        const boxImg = getLuckyBoxImage(recipe.outcome);

        row.innerHTML = `
            <div class="recipe-row-main">
                <div class="recipe-cards">${cardIcons}</div>
                <div class="recipe-arrow">→</div>
                <div class="recipe-outcome">
                    <img src="${boxImg}" title="${recipe.outcome}" class="recipe-box-icon">
                    <span>${recipe.outcome.replace('Lucky Box ', 'Box ')}</span>
                </div>
                <div class="recipe-value">
                    <input type="number" min="0" step="0.1" value="${recipe.value}" class="form-control form-control-sm outcome-rank" id="recipe-value-${index}">
                </div>
            </div>
            <div class="recipe-meta">
                <span class="recipe-score">Reward Score: ${formatAmount(getRewardScoreForOutcome(recipe.outcome))}</span>
                <span class="recipe-summary">Expected: ${getRewardSummaryText(recipe.outcome)}</span>
            </div>
        `;

        row.querySelector('input').addEventListener('input', event => {
            recipes[index].value = Math.max(0, parseFloat(event.target.value) || 0);
        });

        div.appendChild(row);
    });

    const presetsDiv = document.createElement('div');
    presetsDiv.className = 'mb-3 d-flex flex-wrap gap-2';
    presetsDiv.innerHTML = '<small class="w-100 text-muted mb-1">Manual rank presets:</small>';
    Object.keys(rankPresets).forEach(presetName => {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-secondary';
        button.textContent = presetName;
        button.onclick = () => applyRankPreset(presetName);
        presetsDiv.appendChild(button);
    });
    div.appendChild(presetsDiv);
    div.appendChild(renderExpectedRewardsReference());

    return div;
}

function renderOptimizeControls() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = `
        <h4>Optimization Goal</h4>
        <label class="form-label small text-muted" for="objective-mode">Optimize by</label>
        <select id="objective-mode" class="form-select form-select-sm mb-2">
            <option value="rewards" ${objectiveMode === objectiveModes.rewards ? 'selected' : ''}>Weighted rewards</option>
            <option value="manual" ${objectiveMode === objectiveModes.manual ? 'selected' : ''}>Manual box ranks</option>
        </select>
        <div class="small text-muted mb-2">Reward mode uses normalized units: each reward is divided by its median amount across the box data, then multiplied by your priority weight.</div>
    `;

    div.querySelector('select').addEventListener('change', event => {
        objectiveMode = event.target.value;
        persistOptimizerSettings();
        renderApp();
    });

    const button = document.createElement('button');
    button.className = 'btn btn-primary btn-lg w-100 optimize-action-btn';
    button.textContent = objectiveMode === objectiveModes.rewards ? 'Optimize for Rewards' : 'Optimize by Rank';
    button.onclick = () => {
        const progressBarContainer = document.getElementById('progress-bar-container');
        const progressBar = document.getElementById('progress-bar');
        if (progressBarContainer && progressBar) {
            progressBarContainer.style.display = '';
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
        }

        window.requestAnimationFrame(() => {
            setTimeout(() => {
                optimizeComposes();
                renderApp();
            }, 10);
        });
    };

    div.appendChild(button);
    return div;
}

function renderRewardWeightsPanel() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = '<h4>Reward Priorities</h4><div class="small text-muted mb-2">Tick the rewards that matter to you. Only selected rewards affect reward-mode optimization. Priority applies to normalized reward units.</div>';

    const presetDiv = document.createElement('div');
    presetDiv.className = 'reward-preset-group mb-2';
    presetDiv.innerHTML = '<small class="w-100 text-muted mb-1">Quick reward presets:</small>';
    rewardPresetDefinitions.forEach(preset => {
        const button = document.createElement('button');
        button.className = preset.key === activeRewardPresetKey
            ? 'btn btn-sm btn-primary reward-preset-active'
            : 'btn btn-sm btn-outline-primary';
        button.textContent = preset.label;
        button.title = preset.description;
        button.onclick = () => applyRewardPreset(preset.key);
        presetDiv.appendChild(button);
    });
    div.appendChild(presetDiv);

    const rewardNames = Object.keys(rewardWeights).sort((left, right) => left.localeCompare(right));
    if (!rewardNames.length) {
        div.innerHTML += '<p class="text-muted">No lucky box reward data loaded.</p>';
        return div;
    }

    rewardNames.forEach(rewardName => {
        const inputId = makeDomId('reward-weight', rewardName);
        const checkboxId = makeDomId('reward-enabled', rewardName);
        const referenceAmount = getRewardReferenceAmount(rewardName);
        const row = document.createElement('div');
        row.className = 'reward-weight-row';
        row.innerHTML = `
            <input type="checkbox" class="form-check-input reward-enable-input" id="${checkboxId}" ${rewardEnabled[rewardName] ? 'checked' : ''}>
            <label class="reward-weight-label" for="${inputId}">
                <span>${rewardName}</span>
                <small class="reward-weight-note">1 normalized unit = ${formatAmount(referenceAmount)}</small>
            </label>
            <input type="number" min="0" step="0.01" value="${rewardWeights[rewardName]}" class="form-control form-control-sm reward-weight-input" id="${inputId}">
        `;

        const checkbox = row.querySelector('.reward-enable-input');
        const numberInput = row.querySelector('.reward-weight-input');
        numberInput.disabled = !rewardEnabled[rewardName];

        checkbox.addEventListener('change', event => {
            rewardEnabled[rewardName] = event.target.checked;
            numberInput.disabled = !rewardEnabled[rewardName];
            row.classList.toggle('reward-weight-row-disabled', !rewardEnabled[rewardName]);
            activeRewardPresetKey = null;
            persistOptimizerSettings();
            renderApp();
        });

        numberInput.addEventListener('change', event => {
            rewardWeights[rewardName] = Math.max(0, parseFloat(event.target.value) || 0);
            activeRewardPresetKey = null;
            persistOptimizerSettings();
            renderApp();
        });

        row.classList.toggle('reward-weight-row-disabled', !rewardEnabled[rewardName]);

        div.appendChild(row);
    });

    return div;
}

function renderExpectedRewardsReference() {
    const wrapper = document.createElement('div');
    wrapper.className = 'reward-reference';
    wrapper.innerHTML = '<h5>Per Box Expected Rewards</h5>';

    recipes.forEach(recipe => {
        const rewards = getExpectedRewardsForOutcome(recipe.outcome);
        const item = document.createElement('div');
        item.className = 'reward-reference-item';
        item.innerHTML = `
            <div class="reward-reference-title">
                <strong>${recipe.name}</strong>
                <span>${recipe.outcome}</span>
                <span class="reward-score">Score: ${formatAmount(getRewardScoreForOutcome(recipe.outcome))}</span>
            </div>
            <div class="reward-chip-list">
                ${rewards.length
                    ? rewards.map(entry => `<span class="reward-chip">${entry.reward}: ${formatRewardAmount(entry.reward, entry.amount)} (${formatAmount(getNormalizedRewardAmount(entry.reward, entry.amount))} norm)</span>`).join('')
                    : '<span class="text-muted">No reward data</span>'}
            </div>
        `;
        wrapper.appendChild(item);
    });

    return wrapper;
}

function optimizeComposes() {
    const cardNames = cards.map(card => card.name);
    const recipeCount = recipes.length;
    const objectiveValues = recipes.map(recipe => getRecipeObjectiveValue(recipe));

    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    if (progressBarContainer && progressBar) {
        progressBarContainer.style.display = '';
        progressBar.style.width = '10%';
        progressBar.textContent = 'Solving...';
    }

    const needs = recipes.map(recipe => cardNames.map(cardName => recipe.cards[cardName] || 0));
    const active = [];
    for (let index = 0; index < recipeCount; index += 1) {
        if (objectiveValues[index] > 0) {
            active.push(index);
        }
    }

    const scale = 10000;
    const model = { optimize: 'value', opType: 'max', constraints: {}, variables: {} };
    cards.forEach(card => {
        model.constraints[card.name] = { max: card.count };
    });

    for (let recipeIndex = 0; recipeIndex < recipeCount; recipeIndex += 1) {
        if (objectiveValues[recipeIndex] <= 0) {
            continue;
        }

        const variableName = 'r' + recipeIndex;
        model.variables[variableName] = { value: Math.round(objectiveValues[recipeIndex] * scale) };
        cardNames.forEach(cardName => {
            const need = recipes[recipeIndex].cards[cardName] || 0;
            if (need > 0) {
                model.variables[variableName][cardName] = need;
            }
        });
    }

    const lpSolution = solver.Solve(model);

    if (progressBar) {
        progressBar.style.width = '40%';
        progressBar.textContent = 'Optimizing...';
    }

    const used = new Array(recipeCount).fill(0);
    const remaining = cards.map(card => card.count);
    for (let recipeIndex = 0; recipeIndex < recipeCount; recipeIndex += 1) {
        if (objectiveValues[recipeIndex] <= 0) {
            continue;
        }

        used[recipeIndex] = Math.floor(lpSolution['r' + recipeIndex] || 0);
        for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
            remaining[cardIndex] -= needs[recipeIndex][cardIndex] * used[recipeIndex];
        }
    }

    function canAdd(recipeIndex, remainingCards) {
        for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
            if (needs[recipeIndex][cardIndex] > 0 && remainingCards[cardIndex] < needs[recipeIndex][cardIndex]) {
                return false;
            }
        }
        return true;
    }

    const recipeOrder = active.slice().sort((left, right) => objectiveValues[right] - objectiveValues[left]);
    let filling = true;
    while (filling) {
        filling = false;
        recipeOrder.forEach(recipeIndex => {
            while (canAdd(recipeIndex, remaining)) {
                used[recipeIndex] += 1;
                for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                    remaining[cardIndex] -= needs[recipeIndex][cardIndex];
                }
                filling = true;
            }
        });
    }

    if (progressBar) {
        progressBar.style.width = '60%';
        progressBar.textContent = 'Local search...';
    }

    const epsilon = 1e-9;
    let improved = true;
    let rounds = 0;
    while (improved && rounds < 100) {
        improved = false;
        rounds += 1;

        for (const highRecipe of recipeOrder) {
            for (const lowRecipe of active) {
                if (lowRecipe === highRecipe || used[lowRecipe] <= 0) {
                    continue;
                }
                if (objectiveValues[highRecipe] <= objectiveValues[lowRecipe] + epsilon) {
                    continue;
                }

                const trialRemaining = remaining.slice();
                for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                    trialRemaining[cardIndex] += needs[lowRecipe][cardIndex];
                }

                if (!canAdd(highRecipe, trialRemaining)) {
                    continue;
                }

                for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                    trialRemaining[cardIndex] -= needs[highRecipe][cardIndex];
                    remaining[cardIndex] = trialRemaining[cardIndex];
                }
                used[lowRecipe] -= 1;
                used[highRecipe] += 1;
                improved = true;
            }
        }

        for (const lowRecipe of active) {
            if (used[lowRecipe] <= 0 || improved) {
                continue;
            }

            const trialRemaining = remaining.slice();
            for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                trialRemaining[cardIndex] += needs[lowRecipe][cardIndex];
            }

            for (let firstIndex = 0; firstIndex < active.length && !improved; firstIndex += 1) {
                const firstRecipe = active[firstIndex];
                if (!canAdd(firstRecipe, trialRemaining)) {
                    continue;
                }

                const afterFirst = trialRemaining.slice();
                for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                    afterFirst[cardIndex] -= needs[firstRecipe][cardIndex];
                }

                for (let secondIndex = firstIndex; secondIndex < active.length; secondIndex += 1) {
                    const secondRecipe = active[secondIndex];
                    if (!canAdd(secondRecipe, afterFirst)) {
                        continue;
                    }

                    const gain = objectiveValues[firstRecipe] + objectiveValues[secondRecipe] - objectiveValues[lowRecipe];
                    if (gain <= epsilon) {
                        continue;
                    }

                    const afterSecond = afterFirst.slice();
                    for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                        afterSecond[cardIndex] -= needs[secondRecipe][cardIndex];
                        remaining[cardIndex] = afterSecond[cardIndex];
                    }
                    used[lowRecipe] -= 1;
                    used[firstRecipe] += 1;
                    used[secondRecipe] += 1;
                    improved = true;
                    break;
                }
            }
        }

        if (!improved) {
            for (let removeFirstIndex = 0; removeFirstIndex < active.length && !improved; removeFirstIndex += 1) {
                const removeFirst = active[removeFirstIndex];
                if (used[removeFirst] <= 0) {
                    continue;
                }

                for (let removeSecondIndex = removeFirstIndex; removeSecondIndex < active.length && !improved; removeSecondIndex += 1) {
                    const removeSecond = active[removeSecondIndex];
                    if (used[removeSecond] <= (removeFirst === removeSecond ? 1 : 0)) {
                        continue;
                    }

                    const trialRemaining = remaining.slice();
                    const lostValue = objectiveValues[removeFirst] + objectiveValues[removeSecond];
                    for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                        trialRemaining[cardIndex] += needs[removeFirst][cardIndex] + needs[removeSecond][cardIndex];
                    }

                    for (let addFirstIndex = 0; addFirstIndex < active.length && !improved; addFirstIndex += 1) {
                        const addFirst = active[addFirstIndex];
                        if (!canAdd(addFirst, trialRemaining)) {
                            continue;
                        }

                        const afterFirst = trialRemaining.slice();
                        for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                            afterFirst[cardIndex] -= needs[addFirst][cardIndex];
                        }

                        for (let addSecondIndex = addFirstIndex; addSecondIndex < active.length; addSecondIndex += 1) {
                            const addSecond = active[addSecondIndex];
                            if (!canAdd(addSecond, afterFirst)) {
                                continue;
                            }

                            const gain = objectiveValues[addFirst] + objectiveValues[addSecond] - lostValue;
                            if (gain <= epsilon) {
                                continue;
                            }

                            const afterSecond = afterFirst.slice();
                            for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                                afterSecond[cardIndex] -= needs[addSecond][cardIndex];
                                remaining[cardIndex] = afterSecond[cardIndex];
                            }
                            used[removeFirst] -= 1;
                            used[removeSecond] -= 1;
                            used[addFirst] += 1;
                            used[addSecond] += 1;
                            improved = true;
                            break;
                        }
                    }
                }
            }
        }

        recipeOrder.forEach(recipeIndex => {
            while (canAdd(recipeIndex, remaining)) {
                used[recipeIndex] += 1;
                for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
                    remaining[cardIndex] -= needs[recipeIndex][cardIndex];
                }
                improved = true;
            }
        });
    }

    const cardCounts = {};
    for (let cardIndex = 0; cardIndex < cardNames.length; cardIndex += 1) {
        cardCounts[cardNames[cardIndex]] = remaining[cardIndex];
    }

    optimizeResult = {
        used,
        cardCounts,
        objectiveValues,
        objectiveMode,
    };

    if (progressBarContainer && progressBar) {
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';
        setTimeout(() => {
            progressBarContainer.style.display = 'none';
        }, 500);
    }
}

function renderResults() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = '<h4>Optimization Results</h4>';

    if (!optimizeResult) {
        div.innerHTML += '<p class="text-muted">Click the optimize button to see the best composition strategy and total expected rewards.</p>';
        return div;
    }

    const totalRewards = new Map();
    let totalObjective = 0;
    const list = document.createElement('ul');
    list.className = 'result-list';

    recipes.forEach((recipe, recipeIndex) => {
        const count = optimizeResult.used[recipeIndex];
        if (!count) {
            return;
        }

        totalObjective += optimizeResult.objectiveValues[recipeIndex] * count;
        getExpectedRewardsForOutcome(recipe.outcome).forEach(item => {
            totalRewards.set(item.reward, (totalRewards.get(item.reward) || 0) + (item.amount * count));
        });

        const listItem = document.createElement('li');
        listItem.className = 'result-item';
        listItem.innerHTML = `
            <div><strong>${recipe.name}</strong>: ${count} times</div>
            <div class="small text-muted">${recipe.outcome} | Objective contribution: ${formatAmount(optimizeResult.objectiveValues[recipeIndex] * count)}</div>
            <div class="result-summary">${getRewardSummaryText(recipe.outcome, count, 6)}</div>
        `;
        list.appendChild(listItem);
    });

    div.appendChild(list);
    div.innerHTML += `<p><strong>Total ${optimizeResult.objectiveMode === objectiveModes.rewards ? 'Reward Score' : 'Manual Rank Value'}:</strong> ${formatAmount(totalObjective)}</p>`;

    const rewardsSection = document.createElement('div');
    rewardsSection.className = 'mb-3';
    rewardsSection.innerHTML = '<h5>Total Expected Rewards</h5>';

    const rewardTotals = Array.from(totalRewards.entries())
        .map(([reward, amount]) => ({ reward, amount }))
        .sort((left, right) => right.amount - left.amount || left.reward.localeCompare(right.reward));

    if (rewardTotals.length) {
        const rewardList = document.createElement('div');
        rewardList.className = 'reward-chip-list';
        rewardTotals.forEach(item => {
            const chip = document.createElement('span');
            chip.className = 'reward-chip reward-chip-total';
            const speedupDaysText = isSpeedupReward(item.reward)
                ? ` (${formatMinutesAsDays(item.amount)}d)`
                : '';
            chip.textContent = `${item.reward}: ${formatRewardAmount(item.reward, item.amount)}${speedupDaysText}`;
            rewardList.appendChild(chip);
        });
        rewardsSection.appendChild(rewardList);
    } else {
        rewardsSection.innerHTML += '<p class="text-muted">No expected rewards were produced.</p>';
    }

    div.appendChild(rewardsSection);

    let totalResidual = 0;
    let residualHtml = '<h5>Residual Cards</h5><ul>';
    cards.forEach(card => {
        const left = optimizeResult.cardCounts[card.name];
        totalResidual += left;
        residualHtml += `<li><img src="${card.img}" style="width:20px;height:26px;vertical-align:middle;margin-right:4px;" alt="${card.name}"> ${card.name}: <strong>${left}</strong></li>`;
    });
    residualHtml += `</ul><p><strong>Total Residual:</strong> ${totalResidual}</p>`;
    div.innerHTML += residualHtml;

    const canvas = document.createElement('canvas');
    canvas.id = 'remainingChart';
    div.appendChild(canvas);
    setTimeout(() => {
        const ctx = document.getElementById('remainingChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: cards.map(card => card.name),
                datasets: [{
                    label: 'Cards Left',
                    data: cards.map(card => optimizeResult.cardCounts[card.name]),
                    backgroundColor: '#0d6efd88',
                }],
            },
            options: {
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } },
            },
        });
    }, 100);

    return div;
}

document.addEventListener('DOMContentLoaded', loadConfigAndInit);
