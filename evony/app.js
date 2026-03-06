// Evony Card Compose Optimizer - Core Logic & UI

// Example card and recipe data (can be replaced by user input)
const defaultCards = [
    { name: 'Green', img: 'https://www.evonytkrguide.com/img/items/green_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Blue', img: 'https://www.evonytkrguide.com/img/items/blue_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Purple', img: 'https://www.evonytkrguide.com/img/items/purple_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Orange', img: 'https://www.evonytkrguide.com/img/items/orange_lucky_composing_gift_card.jpg', count: 0 },
    { name: 'Red', img: 'https://www.evonytkrguide.com/img/items/red_lucky_composing_gift_card.jpg', count: 0 },
];

const defaultRecipes = [
    { name: 'Compose I',   cards: { 'Green': 1, 'Blue': 1, 'Purple': 1 }, outcome: 'Lucky Box I', value: 10 },
    { name: 'Compose II',  cards: { 'Green': 1, 'Blue': 1, 'Orange': 1 }, outcome: 'Lucky Box II', value: 12 },
    { name: 'Compose III', cards: { 'Green': 1, 'Blue': 1, 'Red': 1 }, outcome: 'Lucky Box III', value: 14 },
    { name: 'Compose IV',  cards: { 'Green': 1, 'Purple': 1, 'Orange': 1 }, outcome: 'Lucky Box IV', value: 16 },
    { name: 'Compose V',   cards: { 'Green': 1, 'Purple': 1, 'Red': 1 }, outcome: 'Lucky Box V', value: 18 },
    { name: 'Compose VI',  cards: { 'Blue': 1, 'Purple': 1, 'Red': 1 }, outcome: 'Lucky Box VI', value: 20 },
    { name: 'Compose VII', cards: { 'Blue': 1, 'Purple': 1, 'Orange': 1 }, outcome: 'Lucky Box VII', value: 22 },
    { name: 'Compose VIII',cards: { 'Green': 1, 'Orange': 1, 'Red': 1 }, outcome: 'Lucky Box VIII', value: 24 },
    { name: 'Compose IX',  cards: { 'Blue': 1, 'Orange': 1, 'Red': 1 }, outcome: 'Lucky Box IX', value: 26 },
    { name: 'Compose X',   cards: { 'Purple': 1, 'Orange': 1, 'Red': 1 }, outcome: 'Lucky Box X', value: 28 },
];



let cards = null;
let recipes = null;
let configLoaded = false;

function loadConfigAndInit() {
    fetch('evony-config.json')
        .then(r => r.json())
        .then(cfg => {
            cards = JSON.parse(JSON.stringify(defaultCards));
            recipes = JSON.parse(JSON.stringify(defaultRecipes));
            if (cfg.defaultCardCounts && cfg.defaultCardCounts.length === cards.length) {
                for (let i = 0; i < cards.length; ++i) cards[i].count = cfg.defaultCardCounts[i];
            }
            if (cfg.defaultRecipeValues && cfg.defaultRecipeValues.length === recipes.length) {
                for (let i = 0; i < recipes.length; ++i) recipes[i].value = cfg.defaultRecipeValues[i];
            }
            configLoaded = true;
            renderApp();
        })
        .catch(() => {
            cards = JSON.parse(JSON.stringify(defaultCards));
            recipes = JSON.parse(JSON.stringify(defaultRecipes));
            configLoaded = true;
            renderApp();
        });
}

function renderApp() {
    if (!configLoaded) {
        const root = document.getElementById('app-root') || document.getElementById('main-flex');
        if (root) root.innerHTML = '<div class="text-center text-muted">Loading configuration...</div>';
        return;
    }
    // New layout: 3 columns
    const cardCol = document.getElementById('card-col');
    const recipeCol = document.getElementById('recipe-col');
    const resultCol = document.getElementById('result-col');
    if (cardCol && recipeCol && resultCol) {
        cardCol.innerHTML = '';
        recipeCol.innerHTML = '';
        resultCol.innerHTML = '';
        cardCol.appendChild(renderCardInput());
        cardCol.appendChild(renderOptimizeButton());
        recipeCol.appendChild(renderRecipeInput());
        resultCol.appendChild(renderResults());
    } else {
        // fallback for old root
        const root = document.getElementById('app-root');
        if (root) {
            root.innerHTML = '';
            root.appendChild(renderCardInput());
            root.appendChild(renderRecipeInput());
            root.appendChild(renderOptimizeButton());
            root.appendChild(renderResults());
        }
    }
}

function renderCardInput() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = `<h4>Card Inventory</h4>`;
    cards.forEach((card, idx) => {
        const row = document.createElement('div');
        row.className = 'compose-row';
        row.innerHTML = `
            <img src="${card.img || 'https://via.placeholder.com/48x64?text=' + card.name}" class="card-img" alt="${card.name}">
            <span class="me-2">${card.name}</span>
            <input type="number" min="0" value="${card.count}" class="form-control form-control-sm w-25" id="card-count-${idx}">
        `;
        row.querySelector('input').addEventListener('input', e => {
            cards[idx].count = Math.max(0, parseInt(e.target.value) || 0);
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
    const card = defaultCards.find(c => c.name === cardName);
    return card ? card.img : '';
}

function renderRecipeInput() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = `<h4>Recipes & Ranking</h4>`;
    recipes.forEach((recipe, idx) => {
        const row = document.createElement('div');
        row.className = 'recipe-row';
        const cardIcons = Object.entries(recipe.cards).map(([k, v]) =>
            `<img src="${getCardImg(k)}" title="${k}" class="recipe-card-icon">`
        ).join('+');
        const boxImg = getLuckyBoxImage(recipe.outcome);
        row.innerHTML = `
            <div class="recipe-cards">${cardIcons}</div>
            <div class="recipe-arrow">→</div>
            <div class="recipe-outcome">
                <img src="${boxImg}" title="${recipe.outcome}" class="recipe-box-icon">
                <span>${recipe.outcome.replace('Lucky Box ', 'Box ')}</span>
            </div>
            <div class="recipe-value">
                <input type="number" min="0" step="0.1" value="${recipe.value}" class="form-control form-control-sm outcome-rank" id="recipe-value-${idx}">
            </div>
        `;
        row.querySelector('input').addEventListener('input', e => {
            recipes[idx].value = Math.max(0, parseFloat(e.target.value) || 0);
        });
        div.appendChild(row);
    });
    return div;
}

function renderOptimizeButton() {
    const div = document.createElement('div');
    div.className = 'mb-4 text-center';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary btn-lg';
    btn.textContent = 'Optimize Composes!';
    btn.onclick = () => {
        // Show progress bar and force browser to render it before computation
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
    div.appendChild(btn);
    return div;
}

let optimizeResult = null;

function optimizeComposes() {
    const cardNames = cards.map(c => c.name);
    const n = recipes.length;

    // Progress bar setup
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    if (progressBarContainer && progressBar) {
        progressBarContainer.style.display = '';
        progressBar.style.width = '10%';
        progressBar.textContent = 'Solving...';
    }

    // Build recipe needs matrix: needs[i][j] = how many of card j recipe i needs
    const needs = [];
    for (let i = 0; i < n; ++i) {
        needs.push(cardNames.map(cn => recipes[i].cards[cn] || 0));
    }

    // Filter to active recipes (value > 0)
    const active = [];
    for (let i = 0; i < n; ++i) {
        if (recipes[i].value > 0) active.push(i);
    }

    // For each card type, which active recipes use it?
    const cardRecipes = cardNames.map((_, j) => active.filter(i => needs[i][j] > 0));

    // Find the bottleneck card (smallest count)
    let bottleneckIdx = 0;
    let bottleneckCount = cards[0].count;
    for (let j = 1; j < cardNames.length; ++j) {
        if (cards[j].count < bottleneckCount) {
            bottleneckCount = cards[j].count;
            bottleneckIdx = j;
        }
    }

    // Strategy: Use LP to get initial solution, then do extensive local search
    // with all swap types to handle float sensitivity

    // Step 1: Solve LP relaxation with scaled values for better precision
    const scale = 10000;
    const model = { optimize: 'value', opType: 'max', constraints: {}, variables: {} };
    for (const card of cards) {
        model.constraints[card.name] = { max: card.count };
    }
    for (let i = 0; i < n; ++i) {
        if (recipes[i].value <= 0) continue;
        const varName = 'r' + i;
        model.variables[varName] = { value: Math.round(recipes[i].value * scale) };
        for (const cardName of cardNames) {
            const need = recipes[i].cards[cardName] || 0;
            if (need > 0) model.variables[varName][cardName] = need;
        }
    }
    const lpSolution = solver.Solve(model);

    if (progressBar) {
        progressBar.style.width = '40%';
        progressBar.textContent = 'Optimizing...';
    }

    // Step 2: Build initial integer solution from LP floor
    const used = new Array(n).fill(0);
    const remaining = cards.map(c => c.count);
    for (let i = 0; i < n; ++i) {
        if (recipes[i].value <= 0) continue;
        used[i] = Math.floor(lpSolution['r' + i] || 0);
        for (let j = 0; j < cardNames.length; ++j) {
            remaining[j] -= needs[i][j] * used[i];
        }
    }

    // Helper: check if we can add 1 of recipe i
    function canAdd(i, rem) {
        for (let j = 0; j < cardNames.length; ++j) {
            if (needs[i][j] > 0 && rem[j] < needs[i][j]) return false;
        }
        return true;
    }

    // Helper: compute total value
    function totalValue(u) {
        let v = 0;
        for (let i = 0; i < n; ++i) v += u[i] * recipes[i].value;
        return v;
    }

    // Step 3: Greedy fill (sorted by value/usage efficiency)
    const recipeOrder = active.slice().sort((a, b) => recipes[b].value - recipes[a].value);
    let filling = true;
    while (filling) {
        filling = false;
        for (const i of recipeOrder) {
            while (canAdd(i, remaining)) {
                used[i]++;
                for (let j = 0; j < cardNames.length; ++j) remaining[j] -= needs[i][j];
                filling = true;
            }
        }
    }

    if (progressBar) {
        progressBar.style.width = '60%';
        progressBar.textContent = 'Local search...';
    }

    // Step 4: Extensive local search with float-aware comparisons
    const EPS = 1e-9;
    let searchImproved = true;
    let searchRound = 0;
    while (searchImproved && searchRound < 100) {
        searchImproved = false;
        searchRound++;

        // 4a: 1-for-1 swap: remove 1 of lo, add 1 of hi
        for (const hi of recipeOrder) {
            for (const lo of active) {
                if (lo === hi || used[lo] <= 0) continue;
                if (recipes[hi].value <= recipes[lo].value + EPS) continue;
                const tr = remaining.slice();
                for (let j = 0; j < cardNames.length; ++j) tr[j] += needs[lo][j];
                if (canAdd(hi, tr)) {
                    for (let j = 0; j < cardNames.length; ++j) tr[j] -= needs[hi][j];
                    used[lo]--;
                    used[hi]++;
                    for (let j = 0; j < cardNames.length; ++j) remaining[j] = tr[j];
                    searchImproved = true;
                }
            }
        }

        // 4b: 1-for-2 swap: remove 1, try to add 2 that give more value
        for (const lo of active) {
            if (used[lo] <= 0) continue;
            const tr = remaining.slice();
            for (let j = 0; j < cardNames.length; ++j) tr[j] += needs[lo][j];
            // Try all pairs
            for (let a = 0; a < active.length; ++a) {
                const ra = active[a];
                if (!canAdd(ra, tr)) continue;
                const tr2 = tr.slice();
                for (let j = 0; j < cardNames.length; ++j) tr2[j] -= needs[ra][j];
                for (let b = a; b < active.length; ++b) {
                    const rb = active[b];
                    if (!canAdd(rb, tr2)) continue;
                    const gain = recipes[ra].value + recipes[rb].value - recipes[lo].value;
                    if (gain > EPS) {
                        const tr3 = tr2.slice();
                        for (let j = 0; j < cardNames.length; ++j) tr3[j] -= needs[rb][j];
                        used[lo]--;
                        used[ra]++;
                        used[rb]++;
                        for (let j = 0; j < cardNames.length; ++j) remaining[j] = tr3[j];
                        searchImproved = true;
                        break;
                    }
                }
                if (searchImproved) break;
            }
            if (searchImproved) break;
        }

        // 4c: 2-for-2 swap: remove 1 each of two recipes, add 1 each of two others
        if (!searchImproved) {
            for (let a = 0; a < active.length && !searchImproved; ++a) {
                const ra = active[a];
                if (used[ra] <= 0) continue;
                for (let b = a; b < active.length && !searchImproved; ++b) {
                    const rb = active[b];
                    if (used[rb] <= (ra === rb ? 1 : 0)) continue;
                    const lostValue = recipes[ra].value + recipes[rb].value;
                    const tr = remaining.slice();
                    for (let j = 0; j < cardNames.length; ++j) tr[j] += needs[ra][j] + needs[rb][j];
                    for (let c = 0; c < active.length && !searchImproved; ++c) {
                        const rc = active[c];
                        if (!canAdd(rc, tr)) continue;
                        const tr2 = tr.slice();
                        for (let j = 0; j < cardNames.length; ++j) tr2[j] -= needs[rc][j];
                        for (let d = c; d < active.length; ++d) {
                            const rd = active[d];
                            if (!canAdd(rd, tr2)) continue;
                            const gain = recipes[rc].value + recipes[rd].value - lostValue;
                            if (gain > EPS) {
                                const tr3 = tr2.slice();
                                for (let j = 0; j < cardNames.length; ++j) tr3[j] -= needs[rd][j];
                                used[ra]--;
                                used[rb]--;
                                used[rc]++;
                                used[rd]++;
                                for (let j = 0; j < cardNames.length; ++j) remaining[j] = tr3[j];
                                searchImproved = true;
                            }
                        }
                    }
                }
            }
        }

        // 4d: Try greedy fill again after swaps
        for (const i of recipeOrder) {
            while (canAdd(i, remaining)) {
                used[i]++;
                for (let j = 0; j < cardNames.length; ++j) remaining[j] -= needs[i][j];
                searchImproved = true;
            }
        }
    }

    const cardCounts = {};
    for (let j = 0; j < cardNames.length; ++j) {
        cardCounts[cardNames[j]] = remaining[j];
    }
    optimizeResult = { used, cardCounts };

    // Hide progress bar when done
    if (progressBarContainer && progressBar) {
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';
        setTimeout(() => { progressBarContainer.style.display = 'none'; }, 500);
    }
}

function renderResults() {
    const div = document.createElement('div');
    div.className = 'mb-4';
    div.innerHTML = `<h4>Optimization Results</h4>`;
    if (!optimizeResult) {
        div.innerHTML += '<p class="text-muted">Click "Optimize Composes!" to see results.</p>';
        return div;
    }
    let totalValue = 0;
    let list = document.createElement('ul');
    recipes.forEach((r, i) => {
        if (optimizeResult.used[i] > 0) {
            let val = optimizeResult.used[i] * r.value;
            totalValue += val;
            let li = document.createElement('li');
            li.innerHTML = `<b>${r.name}</b>: ${optimizeResult.used[i]} times (Total Value: ${val})`;
            list.appendChild(li);
        }
    });
    div.appendChild(list);
    div.innerHTML += `<p><b>Total Value:</b> ${totalValue}</p>`;
    // Residuals summary
    let totalResidual = 0;
    let residualHtml = '<h5>Residual Cards</h5><ul>';
    cards.forEach(c => {
        const left = optimizeResult.cardCounts[c.name];
        totalResidual += left;
        residualHtml += `<li><img src="${c.img}" style="width:20px;height:26px;vertical-align:middle;margin-right:4px;"> ${c.name}: <b>${left}</b></li>`;
    });
    residualHtml += `</ul><p><b>Total Residual:</b> ${totalResidual}</p>`;
    div.innerHTML += residualHtml;
    // Remaining cards chart
    let canvas = document.createElement('canvas');
    canvas.id = 'remainingChart';
    div.appendChild(canvas);
    setTimeout(() => {
        let ctx = document.getElementById('remainingChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: cards.map(c => c.name),
                datasets: [{
                    label: 'Cards Left',
                    data: cards.map(c => optimizeResult.cardCounts[c.name]),
                    backgroundColor: '#0d6efd88',
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }, 100);
    return div;
}

document.addEventListener('DOMContentLoaded', loadConfigAndInit);
