const LEVELS = {
  1: {
    rows: 4,
    cols: 4,
    pieces: [
      { type: "purple", size: [2, 2], count: 1 },
      { type: "green", size: [1, 1], count: 4 },
    ],
    description: "4×4 grid, 1 purple 2×2, 4 green 1×1",
  },
  2: {
    rows: 5,
    cols: 5,
    pieces: [
      { type: "purple", size: [2, 2], count: 1 },
      { type: "blue", size: [1, 2], count: 4 }, // 1×2 can be horizontal or vertical
    ],
    description: "5×5 grid, 1 purple 2×2, 4 blue 1×2 (rotatable)",
  },
  3: {
    rows: 6,
    cols: 6,
    pieces: [
      { type: "green", size: [1, 1], count: 2 },
      { type: "blue", size: [1, 2], count: 2, rotatable: true },
      { type: "blue", size: [1, 3], count: 1, rotatable: true },
      { type: "yellow", size: [3, 2], count: 1, rotatable: false },
    ],
    description: "6×6 grid, 2 green 1×1, 2 blue 1×2, 1 blue 1×3 (rotatable), 1 yellow 3×2 (fixed)",
  },
  4: {
    rows: 7,
    cols: 7,
    pieces: [
      { type: "red", size: [3, 3], count: 1 },
      { type: "blue", size: [1, 4], count: 2, rotatable: true },
      { type: "blue", size: [1, 2], count: 4, rotatable: true },
    ],
    description: "7×7 grid, 1 red 3×3, 2 blue 1×4 (rotatable), 4 blue 1×2 (rotatable)",
  },
};

const STRATEGY_DESCRIPTIONS = {
  "any-hit": "Minimize expected hammers to complete the level. Picks cells with highest probability of hitting any piece, balancing across all piece types.",
  "rare-focus": "Prioritize revealing the rarest piece type first. Targets the single yellow piece in Level 3, or purple in other levels.",
  "common-focus": "Focus on common piece types. Targets green and blue pieces, useful when rare pieces are already found.",
  "checkerboard": "Coverage with parity bias. Picks cells that maximize hit probability while favoring a checkerboard pattern for balanced spatial coverage.",
};

const PURPLE_OFFSETS = {
  "purple-tl": [0, 0],
  "purple-tr": [0, 1],
  "purple-bl": [1, 0],
  "purple-br": [1, 1],
};

const BLUE_OFFSETS = {
  "blue-h-l": [0, 0], // horizontal left
  "blue-h-m": [0, 1], // horizontal middle (1×3)
  "blue-h-r": [0, 1], // horizontal right (1×2) / [0,2] for 1×3 — position-verified in isBoardConsistent
  "blue-v-t": [0, 0], // vertical top
  "blue-v-m": [1, 0], // vertical middle (1×3)
  "blue-v-b": [1, 0], // vertical bottom (1×2) / [2,0] for 1×3
};

const YELLOW_OFFSETS = {
  "yellow-tl": [0, 0],
  "yellow-tr": [0, 1],
  "yellow-ml": [1, 0],
  "yellow-mr": [1, 1],
  "yellow-bl": [2, 0],
  "yellow-br": [2, 1],
};

const RED_OFFSETS = {
  "red-tl": [0, 0],
  "red-tc": [0, 1],
  "red-tr": [0, 2],
  "red-ml": [1, 0],
  "red-mc": [1, 1],
  "red-mr": [1, 2],
  "red-bl": [2, 0],
  "red-bc": [2, 1],
  "red-br": [2, 2],
};

const state = {
  level: 1,
  optimizer: "any-hit",
  grid: null,
  calcTimeout: null,
  recalcToken: 0,
  allBoardsByLevel: {},
  consistentBoardsCache: new Map(),
  worker: null,
  workerRequestSeq: 0,
  workerPending: new Map(),
  lastL3CellProbs: new Map(),
  lastL4CellProbs: new Map(),
};

const LEVEL3_NUM_SAMPLES = 10000;
const LEVEL3_SAMPLE_TIME_LIMIT = 2000;

function getLevelConfig() {
  return LEVELS[state.level];
}

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => "unknown"));
}

function countKnownCells(grid) {
  let known = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== "unknown") known++;
    }
  }
  return known;
}

// If any neighbor's blue label forces this cell to be blue (possibly multiple variants),
// returns the array of valid blue labels. Returns null if unconstrained.
function getConstrainedBlueOptions(grid, r, c, rows, cols) {
  const leftV  = c > 0       ? grid[r][c - 1] : null;
  const rightV = c < cols - 1 ? grid[r][c + 1] : null;
  const topV   = r > 0       ? grid[r - 1][c] : null;
  const botV   = r < rows - 1 ? grid[r + 1][c] : null;

  const options = new Set();

  // Left neighbor forces horizontal continuation
  if (leftV === "blue-h-l") {
    options.add("blue-h-r");                          // end of 1×2
    if (c + 1 < cols) options.add("blue-h-m");        // middle of 1×3
  }
  if (leftV === "blue-h-m") options.add("blue-h-r");  // must be right end of 1×3

  // Right neighbor forces horizontal continuation
  if (rightV === "blue-h-r") {
    options.add("blue-h-l");                           // start of 1×2
    if (c - 1 >= 0) options.add("blue-h-m");           // middle of 1×3
  }
  if (rightV === "blue-h-m") options.add("blue-h-l"); // must be left end of 1×3

  // Top neighbor forces vertical continuation
  if (topV === "blue-v-t") {
    options.add("blue-v-b");                           // end of 1×2
    if (r + 1 < rows) options.add("blue-v-m");         // middle of 1×3
  }
  if (topV === "blue-v-m") options.add("blue-v-b");   // must be bottom end of 1×3

  // Bottom neighbor forces vertical continuation
  if (botV === "blue-v-b") {
    options.add("blue-v-t");                           // start of 1×2
    if (r - 1 >= 0) options.add("blue-v-m");           // middle of 1×3
  }
  if (botV === "blue-v-m") options.add("blue-v-t");   // must be top end of 1×3

  return options.size > 0 ? [...options] : null;
}

function fastFeasibleStatesLevel3(grid, r, c) {
  const snapshot = grid[r][c];
  const states = ["unknown"];
  const rows = 6, cols = 6;
  // Total piece cells: 2×1 + 2×2 + 1×3 + 1×6 = 15
  const totalPieceCells = 15;

  // Scan grid (excluding target cell) to count placed pieces and find yellow anchor
  let greenCount = 0;
  let blueCount = 0;
  let yellowCellCount = 0;
  let yellowAnchor = null;
  let unknownCount = 0;

  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      if (ri === r && ci === c) continue;
      const v = grid[ri][ci];
      if (v === "unknown") unknownCount++;
      else if (v === "green") greenCount++;
      else if (v === "blue" || v.startsWith("blue-")) blueCount++;
      else if (v in YELLOW_OFFSETS) {
        yellowCellCount++;
        const [dr, dc] = YELLOW_OFFSETS[v];
        yellowAnchor = [ri - dr, ci - dc];
      }
    }
  }

  // Enumerate all valid yellow anchor positions given the current grid (excluding target cell).
  // A placement is valid if every of its 6 cells is either unknown, the target cell, or already
  // labeled as the correct yellow part.
  function validYellowAnchors() {
    const valid = [];
    for (let ar = 0; ar + 3 <= rows; ar++) {
      for (let ac = 0; ac + 2 <= cols; ac++) {
        let ok = true;
        for (const [yp, [ydr, ydc]] of Object.entries(YELLOW_OFFSETS)) {
          const yr = ar + ydr, yc = ac + ydc;
          if (yr === r && yc === c) continue; // target cell — OK either way
          const v = grid[yr][yc];
          if (v !== "unknown" && v !== yp) { ok = false; break; }
        }
        if (ok) valid.push([ar, ac]);
      }
    }
    return valid;
  }

  // If yellow anchor is already known from revealed parts, use it.
  // Otherwise compute valid placements — if only one remains, it's forced.
  if (!yellowAnchor && yellowCellCount === 0) {
    const valids = validYellowAnchors();
    if (valids.length === 1) yellowAnchor = valids[0];
  }

  // If yellow anchor is already determined (by other revealed yellow parts),
  // and this cell falls inside the yellow footprint, it MUST be that yellow part.
  if (yellowAnchor) {
    const [ar, ac] = yellowAnchor;
    const dr = r - ar, dc = c - ac;
    if (dr >= 0 && dr <= 2 && dc >= 0 && dc <= 1) {
      for (const [part, [pdr, pdc]] of Object.entries(YELLOW_OFFSETS)) {
        if (pdr === dr && pdc === dc) {
          if (snapshot !== "unknown" && snapshot !== part) states.push(snapshot);
          else states.push(part);
          return states;
        }
      }
    }
  }

  // If a neighbor blue cell constrains which blue variant(s) this cell can be,
  // return only those — no green/yellow/miss possible.
  const constrainedBlue = getConstrainedBlueOptions(grid, r, c, rows, cols);
  if (constrainedBlue) {
    for (const opt of constrainedBlue) states.push(opt);
    if (snapshot !== "unknown" && !states.includes(snapshot)) states.push(snapshot);
    return states;
  }

  // --- Green: feasible if fewer than 2 greens placed AND cell not in yellow footprint ---
  let inYellowFootprint = false;
  if (yellowAnchor) {
    const [ar, ac] = yellowAnchor;
    const dr = r - ar, dc = c - ac;
    if (dr >= 0 && dr <= 2 && dc >= 0 && dc <= 1) inYellowFootprint = true;
  }
  if (greenCount < 2 && !inYellowFootprint) states.push("green");

  // Helper: is an unknown cell not in yellow footprint (available for a new piece)?
  function freeCell(cr, cc) {
    const v = grid[cr][cc];
    if (v !== "unknown") return false;
    if (yellowAnchor) {
      const [ar, ac] = yellowAnchor;
      const dr = cr - ar, dc = cc - ac;
      if (dr >= 0 && dr <= 2 && dc >= 0 && dc <= 1) return false;
    }
    return true;
  }
  // Is a neighbor cell compatible with a specific expected blue label?
  // (either unknown-and-free, or already labeled exactly as expected)
  function blueCompat(cr, cc, expected) {
    if (cr === r && cc === c) return true;
    const v = grid[cr][cc];
    if (v === expected) return true;
    return freeCell(cr, cc);
  }

  // --- Blue: offer only orientation parts whose full piece placement is still valid ---
  if (blueCount < 7) {
    // blue-h-l: current is left end; need c+1=blue-h-r (1×2) or c+1=blue-h-m & c+2=blue-h-r (1×3)
    if ((c + 1 < cols && blueCompat(r, c + 1, "blue-h-r")) ||
        (c + 2 < cols && blueCompat(r, c + 1, "blue-h-m") && blueCompat(r, c + 2, "blue-h-r")))
      states.push("blue-h-l");

    // blue-h-r: current is right end; need c-1=blue-h-l (1×2) or c-2=blue-h-l & c-1=blue-h-m (1×3)
    if ((c - 1 >= 0 && blueCompat(r, c - 1, "blue-h-l")) ||
        (c - 2 >= 0 && blueCompat(r, c - 2, "blue-h-l") && blueCompat(r, c - 1, "blue-h-m")))
      states.push("blue-h-r");

    // blue-h-m: current is middle of 1×3; need c-1=blue-h-l and c+1=blue-h-r
    if (c - 1 >= 0 && c + 1 < cols && blueCompat(r, c - 1, "blue-h-l") && blueCompat(r, c + 1, "blue-h-r"))
      states.push("blue-h-m");

    // blue-v-t: current is top end; need r+1=blue-v-b (1×2) or r+1=blue-v-m & r+2=blue-v-b (1×3)
    if ((r + 1 < rows && blueCompat(r + 1, c, "blue-v-b")) ||
        (r + 2 < rows && blueCompat(r + 1, c, "blue-v-m") && blueCompat(r + 2, c, "blue-v-b")))
      states.push("blue-v-t");

    // blue-v-b: current is bottom end; need r-1=blue-v-t (1×2) or r-2=blue-v-t & r-1=blue-v-m (1×3)
    if ((r - 1 >= 0 && blueCompat(r - 1, c, "blue-v-t")) ||
        (r - 2 >= 0 && blueCompat(r - 2, c, "blue-v-t") && blueCompat(r - 1, c, "blue-v-m")))
      states.push("blue-v-b");

    // blue-v-m: current is middle of 1×3 vertical; need r-1=blue-v-t and r+1=blue-v-b
    if (r - 1 >= 0 && r + 1 < rows && blueCompat(r - 1, c, "blue-v-t") && blueCompat(r + 1, c, "blue-v-b"))
      states.push("blue-v-m");
  }

  // --- Yellow parts: check each of the 6 sub-parts ---
  for (const [part, [dr, dc]] of Object.entries(YELLOW_OFFSETS)) {
    const ar = r - dr, ac = c - dc;
    // Yellow is 3×2: needs rows ar..ar+2, cols ac..ac+1
    if (ar < 0 || ar + 3 > rows || ac < 0 || ac + 2 > cols) continue;
    // If yellow anchor already determined by other revealed parts, must match
    if (yellowAnchor && (yellowAnchor[0] !== ar || yellowAnchor[1] !== ac)) continue;
    // Check all 6 cells of yellow piece are compatible
    let ok = true;
    for (const [yp, [ydr, ydc]] of Object.entries(YELLOW_OFFSETS)) {
      const yr = ar + ydr, yc = ac + ydc;
      if (yr === r && yc === c) continue;
      const v = grid[yr][yc];
      if (v !== "unknown" && v !== yp) { ok = false; break; }
    }
    if (ok) states.push(part);
  }

  // --- Miss: feasible if remaining unknowns can still fit all unplaced pieces ---
  const placedCells = greenCount + blueCount + yellowCellCount;
  const remainingPieceCells = totalPieceCells - placedCells;
  if (unknownCount >= remainingPieceCells) states.push("miss");

  // Apply probability-based filter: if solver determined this cell is 100% hit,
  // remove impossible piece types from toggle options.
  const cellProbs = state.lastL3CellProbs && state.lastL3CellProbs.get(`${r},${c}`);
  if (cellProbs && cellProbs.anyP > 1 - 1e-6) {
    const filtered = states.filter(s =>
      s === "unknown" ||
      (s === "green" && cellProbs.greenP > 1e-6) ||
      (s in YELLOW_OFFSETS && cellProbs.yellowP > 1e-6) ||
      (s.startsWith("blue-") && (cellProbs.blueLabelP?.[s] ?? 0) > 1e-6)
    );
    if (snapshot !== "unknown" && !filtered.includes(snapshot)) filtered.push(snapshot);
    return filtered;
  }

  if (snapshot !== "unknown" && !states.includes(snapshot)) states.push(snapshot);
  return states;
}

function fastFeasibleStatesLevel4(grid, r, c) {
  const snapshot = grid[r][c];
  const states = ["unknown"];
  const rows = 7, cols = 7;
  // Total piece cells: 9 (red 3×3) + 8 (2× blue 1×4) + 8 (4× blue 1×2) = 25
  const totalPieceCells = 25;

  let redCellCount = 0;
  let redAnchor = null;
  let blueCount = 0;
  let unknownCount = 0;

  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      if (ri === r && ci === c) continue;
      const v = grid[ri][ci];
      if (v === "unknown") unknownCount++;
      else if (v in RED_OFFSETS) {
        redCellCount++;
        const [dr, dc] = RED_OFFSETS[v];
        redAnchor = [ri - dr, ci - dc];
      } else if (v.startsWith("blue-")) blueCount++;
    }
  }

  // If red anchor is already known (from revealed red parts), and this cell is in its footprint,
  // it MUST be that specific red part.
  if (redAnchor) {
    const [ar, ac] = redAnchor;
    const dr = r - ar, dc = c - ac;
    if (dr >= 0 && dr <= 2 && dc >= 0 && dc <= 2) {
      for (const [part, [pdr, pdc]] of Object.entries(RED_OFFSETS)) {
        if (pdr === dr && pdc === dc) {
          if (snapshot !== "unknown" && snapshot !== part) states.push(snapshot);
          else states.push(part);
          return states;
        }
      }
    }
  }

  // If a neighbor blue cell constrains what this cell can be, return only those options.
  const constrainedBlue = getConstrainedBlueOptions4(grid, r, c, rows, cols);
  if (constrainedBlue) {
    for (const opt of constrainedBlue) states.push(opt);
    if (snapshot !== "unknown" && !states.includes(snapshot)) states.push(snapshot);
    return states;
  }

  // Is cell in red footprint?
  let inRedFootprint = false;
  if (redAnchor) {
    const [ar, ac] = redAnchor;
    const dr = r - ar, dc = c - ac;
    if (dr >= 0 && dr <= 2 && dc >= 0 && dc <= 2) inRedFootprint = true;
  }

  // --- Red parts: check all 9 sub-parts ---
  if (redCellCount < 9 && !inRedFootprint) {
    for (const [part, [dr, dc]] of Object.entries(RED_OFFSETS)) {
      const ar = r - dr, ac = c - dc;
      if (ar < 0 || ar + 3 > rows || ac < 0 || ac + 3 > cols) continue;
      if (redAnchor && (redAnchor[0] !== ar || redAnchor[1] !== ac)) continue;
      let ok = true;
      for (const [rp, [rdr, rdc]] of Object.entries(RED_OFFSETS)) {
        const rr = ar + rdr, rc = ac + rdc;
        if (rr === r && rc === c) continue;
        const v = grid[rr][rc];
        if (v !== "unknown" && v !== rp) { ok = false; break; }
      }
      if (ok) states.push(part);
    }
  }

  // --- Blue pieces ---
  // Level 4 has 2× 1×4 and 4× 1×2; total 16 blue cells.
  // We can't count exactly how many are placed without piece tracking,
  // but we cap at totalPieceCells - redCellCount - (anything already placed).
  if (blueCount < 16 && !inRedFootprint) {
    // 1×4 horizontal: positions in piece: l=0, m2=1, m3=2, r=3
    // blue-h-l: c+1,c+2,c+3 must be available
    if (c + 3 < cols && blueCompat4(grid, r, c+1, "blue-h-m2", r, c) && blueCompat4(grid, r, c+2, "blue-h-m3", r, c) && blueCompat4(grid, r, c+3, "blue-h-r", r, c))
      states.push("blue-h-l");
    // blue-h-m2: second cell of 1×4 horizontal (c-1=l, c+1=m3, c+2=r)
    if (c - 1 >= 0 && c + 2 < cols && blueCompat4(grid, r, c-1, "blue-h-l", r, c) && blueCompat4(grid, r, c+1, "blue-h-m3", r, c) && blueCompat4(grid, r, c+2, "blue-h-r", r, c))
      states.push("blue-h-m2");
    // blue-h-m3: third cell of 1×4 horizontal (c-2=l, c-1=m2, c+1=r)
    if (c - 2 >= 0 && c + 1 < cols && blueCompat4(grid, r, c-2, "blue-h-l", r, c) && blueCompat4(grid, r, c-1, "blue-h-m2", r, c) && blueCompat4(grid, r, c+1, "blue-h-r", r, c))
      states.push("blue-h-m3");
    // blue-h-r: right end of 1×2 horizontal (c-1=l) OR right end of 1×4 (c-3=l, c-2=m2, c-1=m3)
    if ((c - 1 >= 0 && blueCompat4(grid, r, c-1, "blue-h-l", r, c)) ||
        (c - 3 >= 0 && blueCompat4(grid, r, c-3, "blue-h-l", r, c) && blueCompat4(grid, r, c-2, "blue-h-m2", r, c) && blueCompat4(grid, r, c-1, "blue-h-m3", r, c)))
      states.push("blue-h-r");
    // 1×2 horizontal: blue-h-l (c+1=r) — already handled above? No, need separate check for 1×2
    // Actually blue-h-l means it could be start of 1×2 or 1×4. The label is the same in both cases.
    // But for 1×4 we need m2/m3 labels. So blue-h-l for a 1×2: c+1=blue-h-r and no m2
    // The above "blue-h-l" check already handles 1×4; add 1×2 case:
    if (c + 1 < cols && blueCompat4(grid, r, c+1, "blue-h-r", r, c) && !states.includes("blue-h-l"))
      states.push("blue-h-l");

    // 1×4 vertical: positions: t=0, m2=1, m3=2, b=3
    if (r + 3 < rows && blueCompat4(grid, r+1, c, "blue-v-m2", r, c) && blueCompat4(grid, r+2, c, "blue-v-m3", r, c) && blueCompat4(grid, r+3, c, "blue-v-b", r, c))
      states.push("blue-v-t");
    if (r - 1 >= 0 && r + 2 < rows && blueCompat4(grid, r-1, c, "blue-v-t", r, c) && blueCompat4(grid, r+1, c, "blue-v-m3", r, c) && blueCompat4(grid, r+2, c, "blue-v-b", r, c))
      states.push("blue-v-m2");
    if (r - 2 >= 0 && r + 1 < rows && blueCompat4(grid, r-2, c, "blue-v-t", r, c) && blueCompat4(grid, r-1, c, "blue-v-m2", r, c) && blueCompat4(grid, r+1, c, "blue-v-b", r, c))
      states.push("blue-v-m3");
    if ((r - 1 >= 0 && blueCompat4(grid, r-1, c, "blue-v-t", r, c)) ||
        (r - 3 >= 0 && blueCompat4(grid, r-3, c, "blue-v-t", r, c) && blueCompat4(grid, r-2, c, "blue-v-m2", r, c) && blueCompat4(grid, r-1, c, "blue-v-m3", r, c)))
      states.push("blue-v-b");
    if (r + 1 < rows && blueCompat4(grid, r+1, c, "blue-v-b", r, c) && !states.includes("blue-v-t"))
      states.push("blue-v-t");
  }

  // --- Miss: feasible if remaining unknowns can fit remaining pieces ---
  const placedCells = redCellCount + blueCount;
  const remainingPieceCells = totalPieceCells - placedCells;
  if (unknownCount >= remainingPieceCells) states.push("miss");

  // Apply probability-based filter
  const cellProbs = state.lastL4CellProbs && state.lastL4CellProbs.get(`${r},${c}`);
  if (cellProbs && cellProbs.anyP > 1 - 1e-6) {
    const filtered = states.filter(s =>
      s === "unknown" ||
      (s in RED_OFFSETS && cellProbs.redP > 1e-6) ||
      (s.startsWith("blue-") && (cellProbs.blueLabelP?.[s] ?? 0) > 1e-6)
    );
    if (snapshot !== "unknown" && !filtered.includes(snapshot)) filtered.push(snapshot);
    return filtered;
  }

  if (snapshot !== "unknown" && !states.includes(snapshot)) states.push(snapshot);
  return states;
}

// Returns constrained blue options for level 4 (1×2 and 1×4 pieces).
function getConstrainedBlueOptions4(grid, r, c, rows, cols) {
  const leftV  = c > 0       ? grid[r][c - 1] : null;
  const rightV = c < cols - 1 ? grid[r][c + 1] : null;
  const topV   = r > 0       ? grid[r - 1][c] : null;
  const botV   = r < rows - 1 ? grid[r + 1][c] : null;

  const options = new Set();

  // Horizontal constraints
  if (leftV === "blue-h-l") {
    options.add("blue-h-r");                            // end of 1×2
    if (c + 1 < cols && rightV !== "blue-h-m3" && rightV !== "blue-h-m2" && rightV !== "blue-h-l") 
      options.add("blue-h-m2");                         // 2nd of 1×4 (only if right isn't part of a 1×4)
  }
  if (leftV === "blue-h-m2") options.add("blue-h-m3");  // 3rd of 1×4
  if (leftV === "blue-h-m3") options.add("blue-h-r");   // end of 1×4

  if (rightV === "blue-h-r") {
    // blue-h-l (1×2) only valid if no blue-h label on left (would create overlap)
    if (leftV !== "blue-h-m2" && leftV !== "blue-h-m3" && leftV !== "blue-h-r")
      options.add("blue-h-l");                          // start of 1×2 or 1×4
    // blue-h-m3 (part of 1×4) only valid if no blue on left side (so this is 3rd cell)
    if (c - 1 >= 0 && leftV !== "blue-h-l" && leftV !== "blue-h-m2")
      options.add("blue-h-m3");                         // 3rd of 1×4
  }
  if (rightV === "blue-h-m3") {
    // This cell is 2nd of 1×4 only if left doesn't conflict
    if (leftV !== "blue-h-r" && leftV !== "blue-h-m3")
      options.add("blue-h-m2");                         // 2nd of 1×4
  }
  if (rightV === "blue-h-m2") {
    // This cell is start of 1×4 only if left doesn't have blue-h
    if (leftV !== "blue-h-l" && leftV !== "blue-h-m2" && leftV !== "blue-h-m3" && leftV !== "blue-h-r")
      options.add("blue-h-l");                          // start of 1×4
  }

  // Vertical constraints (same logic)
  if (topV === "blue-v-t") {
    options.add("blue-v-b");                            // end of 1×2
    if (r + 1 < rows && botV !== "blue-v-m3" && botV !== "blue-v-m2" && botV !== "blue-v-t")
      options.add("blue-v-m2");                         // 2nd of 1×4
  }
  if (topV === "blue-v-m2") options.add("blue-v-m3");
  if (topV === "blue-v-m3") options.add("blue-v-b");

  if (botV === "blue-v-b") {
    if (topV !== "blue-v-m2" && topV !== "blue-v-m3" && topV !== "blue-v-b")
      options.add("blue-v-t");                          // start of 1×2 or 1×4
    if (r - 1 >= 0 && topV !== "blue-v-t" && topV !== "blue-v-m2")
      options.add("blue-v-m3");                         // 3rd of 1×4
  }
  if (botV === "blue-v-m3") {
    if (topV !== "blue-v-b" && topV !== "blue-v-m3")
      options.add("blue-v-m2");                         // 2nd of 1×4
  }
  if (botV === "blue-v-m2") {
    if (topV !== "blue-v-t" && topV !== "blue-v-m2" && topV !== "blue-v-m3" && topV !== "blue-v-b")
      options.add("blue-v-t");                          // start of 1×4
  }

  return options.size > 0 ? [...options] : null;
}

// Is neighbor (nr,nc) compatible with expected blue label, for level 4?
function blueCompat4(grid, nr, nc, expected, skipR, skipC) {
  if (nr === skipR && nc === skipC) return true;
  const v = grid[nr][nc];
  if (v === expected) return true;
  if (v !== "unknown") return false;
  // Make sure it's not in known red footprint
  return true;
}

function gridKeyFor(level, grid) {
  return `${level}_${JSON.stringify(grid)}`;
}

function clearConsistentBoardCacheForLevel(level) {
  for (const key of state.consistentBoardsCache.keys()) {
    if (key.startsWith(`${level}_`)) state.consistentBoardsCache.delete(key);
  }
}

function getAllBoardsForLevel(level) {
  if (level === 3) {
    const config = LEVELS[level];
    const unknownGrid = makeGrid(config.rows, config.cols);
    return enumerateConsistentBoards(unknownGrid);
  }
  if (state.allBoardsByLevel[level]) return state.allBoardsByLevel[level];

  const prevLevel = state.level;
  state.level = level;
  const config = getLevelConfig();
  const unknownGrid = makeGrid(config.rows, config.cols);
  const boards = enumerateConsistentBoards(unknownGrid);
  state.level = prevLevel;
  state.allBoardsByLevel[level] = boards;
  return boards;
}

function getConsistentBoards(level, grid) {
  const cacheKey = gridKeyFor(level, grid);
  if (state.consistentBoardsCache.has(cacheKey)) {
    return state.consistentBoardsCache.get(cacheKey);
  }

  let boards;
  if (level === 3) {
    const prevLevel = state.level;
    state.level = level;
    boards = sampleConsistentBoardsLevel3(grid, LEVELS[level]);
    state.level = prevLevel;
  } else {
    const allBoards = getAllBoardsForLevel(level);
    boards = allBoards.filter((board) => isBoardConsistent(board, grid));
  }
  state.consistentBoardsCache.set(cacheKey, boards);
  return boards;
}

function initWorker() {
  if (typeof Worker === "undefined") return;
  if (state.worker) {
    state.worker.terminate();
    for (const { reject } of state.workerPending.values()) {
      reject(new Error("Worker terminated"));
    }
    state.workerPending.clear();
    state.worker = null;
  }
  const worker = new Worker("solver-worker.js");
  worker.onmessage = (event) => {
    const { id, ok, data, error } = event.data || {};
    if (!state.workerPending.has(id)) return;
    const pending = state.workerPending.get(id);
    state.workerPending.delete(id);
    if (ok) pending.resolve(data);
    else pending.reject(new Error(error || "Worker error"));
  };
  worker.onerror = () => {
    state.worker = null;
    state.workerPending.clear();
  };
  state.worker = worker;
}

function requestWorker(type, payload) {
  if (!state.worker) return Promise.reject(new Error("Worker unavailable"));
  const id = ++state.workerRequestSeq;
  return new Promise((resolve, reject) => {
    state.workerPending.set(id, { resolve, reject });
    state.worker.postMessage({ id, type, payload });
  });
}

async function runRecalc(level, grid, optimizer) {
  if (state.worker) {
    try {
      return await requestWorker("recalc", { level, grid, optimizer });
    } catch {
      // Fallback to main thread if worker fails.
      if (level === 4) {
        // Level 4 has no main-thread fallback; return empty.
        return { boardsCount: 0, bestCells: [], topCells: [], forcedGuaranteed: false, approximate: false };
      }
    }
  }
  if (level === 4) {
    return { boardsCount: 0, bestCells: [], topCells: [], forcedGuaranteed: false, approximate: false };
  }
  const boards = getConsistentBoards(level, grid);
  const prevLevel = state.level;
  state.level = level;
  const result = scoreCellsFromBoards(boards, grid, optimizer);
  state.level = prevLevel;
  return {
    boardsCount: boards.length,
    bestCells: result.bestCells,
    topCells: result.topCells,
    forcedGuaranteed: result.forcedGuaranteed,
    approximate: false,
  };
}

async function runFeasibleStates(level, grid, r, c) {
  if (level === 3) {
    return fastFeasibleStatesLevel3(grid, r, c);
  }
  if (level === 4) {
    return fastFeasibleStatesLevel4(grid, r, c);
  }

  if (state.worker) {
    try {
      return await requestWorker("feasible", { level, grid, r, c });
    } catch {
      // Fallback to main thread if worker fails.
    }
  }
  return feasibleStatesForCellSync(level, grid, r, c);
}

function init() {
  initWorker();
  state.grid = makeGrid(getLevelConfig().rows, getLevelConfig().cols);
  bindControls();
  updateLevelDescription();
  updateStrategyDescription();
  renderGrid();
  if (state.worker && state.level !== 3) {
    requestWorker("warm", { level: state.level }).catch(() => {});
  }
  recalcAndRender();
}

function bindControls() {
  document.getElementById("levelSelect").addEventListener("change", (e) => {
    state.level = parseInt(e.target.value);
    state.recalcToken++;
    clearConsistentBoardCacheForLevel(state.level);
    initWorker();
    const config = getLevelConfig();
    state.grid = makeGrid(config.rows, config.cols);
    updateLevelDescription();
    updateStrategyDescription();
    renderGrid();
    if (state.worker && state.level !== 3) {
      requestWorker("warm", { level: state.level }).catch(() => {});
    }
    recalcAndRender();
  });

  document.getElementById("optimizerSelect").addEventListener("change", (e) => {
    state.optimizer = e.target.value;
    updateStrategyDescription();
    recalcAndRender();
  });

  document.getElementById("resetGridBtn").addEventListener("click", () => {
    state.recalcToken++;
    clearConsistentBoardCacheForLevel(state.level);
    const config = getLevelConfig();
    state.grid = makeGrid(config.rows, config.cols);
    renderGrid();
    recalcAndRender();
  });
}

function updateLevelDescription() {
  const config = getLevelConfig();
  document.getElementById("levelDesc").textContent = `Level ${state.level}: ${config.description}`;
}

function updateStrategyDescription() {
  const desc = STRATEGY_DESCRIPTIONS[state.optimizer] || "";
  document.getElementById("strategyDesc").textContent = desc;
}

function renderGrid() {
  const config = getLevelConfig();
  const { rows, cols } = config;
  const wrap = document.getElementById("gridWrap");
  wrap.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size, 34px))`;
  wrap.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("button");
      const cellState = state.grid[r][c];
      cell.className = `cell ${cellState}`;
      cell.textContent = cellState === "unknown" ? `R${r + 1}C${c + 1}` : labelFor(cellState);
      cell.setAttribute("data-r", r);
      cell.setAttribute("data-c", c);
      cell.addEventListener("click", async () => {
        await toggleCellState(r, c);
        renderGrid();
        recalcAndRender();
      });
      cell.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        await toggleCellStateReverse(r, c);
        renderGrid();
        recalcAndRender();
      });
      wrap.appendChild(cell);
    }
  }
}

function recalcAndRender() {
  // Debounce: cancel pending calc and reschedule
  if (state.calcTimeout) {
    clearTimeout(state.calcTimeout);
  }
  
  const t = document.getElementById("recommendationText");
  const stats = document.getElementById("statsText");
  const list = document.getElementById("topCells");
  t.textContent = "Calculating...";
  stats.classList.add("is-pending");
  list.classList.add("is-pending");
  
  const token = ++state.recalcToken;
  state.calcTimeout = setTimeout(async () => {
    const level = state.level;
    const grid = state.grid.map((row) => row.slice());
    const optimizer = state.optimizer;
    const data = await runRecalc(level, grid, optimizer);
    if (token !== state.recalcToken) return;

    if (level === 3 && data.allCells) {
      state.lastL3CellProbs = new Map(data.allCells.map(c => [`${c.r},${c.c}`, c]));
    } else if (level === 4 && data.allCells) {
      state.lastL4CellProbs = new Map(data.allCells.map(c => [`${c.r},${c.c}`, c]));
    } else if (level !== 3 && level !== 4) {
      state.lastL3CellProbs = new Map();
      state.lastL4CellProbs = new Map();
    }

    const expectedHammers = null; // Disabled for performance
    renderRecommendations(data.bestCells, data.topCells, data.boardsCount, data.forcedGuaranteed, expectedHammers, data.approximate);
    highlightBest(data.bestCells);
    stats.classList.remove("is-pending");
    list.classList.remove("is-pending");
  }, 300);
}

async function toggleCellState(r, c) {
  const options = await runFeasibleStates(state.level, state.grid.map((row) => row.slice()), r, c);
  if (!options.length) {
    state.grid[r][c] = "unknown";
    return;
  }

  const current = state.grid[r][c];
  const idx = options.indexOf(current);
  if (idx === -1) {
    state.grid[r][c] = options[0];
  } else {
    state.grid[r][c] = options[(idx + 1) % options.length];
  }
}

async function toggleCellStateReverse(r, c) {
  const options = await runFeasibleStates(state.level, state.grid.map((row) => row.slice()), r, c);
  if (!options.length) {
    state.grid[r][c] = "unknown";
    return;
  }

  const current = state.grid[r][c];
  const idx = options.indexOf(current);
  if (idx === -1) {
    state.grid[r][c] = options[options.length - 1];
  } else {
    state.grid[r][c] = options[(idx - 1 + options.length) % options.length];
  }
}

function feasibleStatesForCellSync(level, grid, r, c) {
  // Evaluate possibilities with this cell unconstrained so toggling can switch
  // away from the current mark (e.g., miss -> purple/green when still feasible).
  const snapshot = grid[r][c];
  grid[r][c] = "unknown";
  const boards = getConsistentBoards(level, grid);
  grid[r][c] = snapshot;
  const states = ["unknown"];
  const isLevel3 = level === 3;

  if (!boards.length) {
    if (isLevel3) {
      states.push("miss", "green", "blue", "yellow-tl", "yellow-tr", "yellow-ml", "yellow-mr", "yellow-bl", "yellow-br");
    } else {
      states.push("miss", "green", "purple-tl", "purple-tr", "purple-bl", "purple-br", "blue-h-l", "blue-h-r", "blue-v-t", "blue-v-b");
    }
    return states;
  }

  const partCounts = {
    miss: 0,
    green: 0,
    blue: 0,
    "yellow-tl": 0,
    "yellow-tr": 0,
    "yellow-ml": 0,
    "yellow-mr": 0,
    "yellow-bl": 0,
    "yellow-br": 0,
    "purple-tl": 0,
    "purple-tr": 0,
    "purple-bl": 0,
    "purple-br": 0,
    "blue-h-l": 0,
    "blue-h-r": 0,
    "blue-v-t": 0,
    "blue-v-b": 0,
  };

  for (const b of boards) {
    const k = key(r, c);
    const isPurple = b.purpleSet.has(k);
    const isGreen = b.greenSet.has(k);
    const isBlue = b.blueSet.has(k);
    const isYellow = b.yellowSet.has(k);
    const isEmpty = !isPurple && !isGreen && !isBlue && !isYellow;
    if (isEmpty) partCounts.miss++;
    if (isGreen) partCounts.green++;
    if (isYellow && b.yellowAnchor) {
      const dr = r - b.yellowAnchor[0];
      const dc = c - b.yellowAnchor[1];
      if (dr === 0 && dc === 0) partCounts["yellow-tl"]++;
      else if (dr === 0 && dc === 1) partCounts["yellow-tr"]++;
      else if (dr === 1 && dc === 0) partCounts["yellow-ml"]++;
      else if (dr === 1 && dc === 1) partCounts["yellow-mr"]++;
      else if (dr === 2 && dc === 0) partCounts["yellow-bl"]++;
      else if (dr === 2 && dc === 1) partCounts["yellow-br"]++;
    }
    if (isPurple && b.purpleAnchor) {
      const dr = r - b.purpleAnchor[0];
      const dc = c - b.purpleAnchor[1];
      if (dr === 0 && dc === 0) partCounts["purple-tl"]++;
      else if (dr === 0 && dc === 1) partCounts["purple-tr"]++;
      else if (dr === 1 && dc === 0) partCounts["purple-bl"]++;
      else if (dr === 1 && dc === 1) partCounts["purple-br"]++;
    }
    if (isBlue) {
      if (isLevel3) {
        partCounts.blue++;
      } else {
        const bluePiece = b.bluePieces.find((p) => p.cells.includes(k));
        if (bluePiece) {
          const [ar, ac] = bluePiece.anchor;
          if (bluePiece.orientation === "h") {
            if (r === ar && c === ac) partCounts["blue-h-l"]++;
            else if (r === ar && c === ac + 1) partCounts["blue-h-r"]++;
          } else if (bluePiece.orientation === "v") {
            if (r === ar && c === ac) partCounts["blue-v-t"]++;
            else if (r === ar + 1 && c === ac) partCounts["blue-v-b"]++;
          }
        }
      }
    }
  }

  const tiebreakOrder = isLevel3
    ? ["yellow-tl", "yellow-tr", "yellow-ml", "yellow-mr", "yellow-bl", "yellow-br", "blue", "green", "miss"]
    : [
        "purple-tl",
        "purple-tr",
        "purple-bl",
        "purple-br",
        "blue-h-l",
        "blue-h-r",
        "blue-v-t",
        "blue-v-b",
        "green",
        "miss",
      ];

  const ranked = Object.keys(partCounts)
    .filter((part) => partCounts[part] > 0)
    .sort((a, b) => {
      if (partCounts[b] !== partCounts[a]) return partCounts[b] - partCounts[a];
      return tiebreakOrder.indexOf(a) - tiebreakOrder.indexOf(b);
    });

  states.push(...ranked);

  return states;
}

function labelFor(cellState) {
  if (cellState === "miss") return "X";
  if (cellState === "green") return "";
  if (cellState === "purple-any") return "";
  if (cellState === "purple-tl") return "";
  if (cellState === "purple-tr") return "";
  if (cellState === "purple-bl") return "";
  if (cellState === "purple-br") return "";
  if (cellState === "blue-h-l") return "";
  if (cellState === "blue-h-r") return "";
  if (cellState === "blue-h-m") return "";
  if (cellState === "blue-h-m2") return "";
  if (cellState === "blue-h-m3") return "";
  if (cellState === "blue-v-t") return "";
  if (cellState === "blue-v-b") return "";
  if (cellState === "blue-v-m") return "";
  if (cellState === "blue-v-m2") return "";
  if (cellState === "blue-v-m3") return "";
  if (cellState === "blue") return "";
  if (cellState === "yellow-tl") return "";
  if (cellState === "yellow-tr") return "";
  if (cellState === "yellow-ml") return "";
  if (cellState === "yellow-mr") return "";
  if (cellState === "yellow-bl") return "";
  if (cellState === "yellow-br") return "";
  if (cellState === "yellow") return "";
  if (cellState === "red-tl") return "";
  if (cellState === "red-tc") return "";
  if (cellState === "red-tr") return "";
  if (cellState === "red-ml") return "";
  if (cellState === "red-mc") return "";
  if (cellState === "red-mr") return "";
  if (cellState === "red-bl") return "";
  if (cellState === "red-bc") return "";
  if (cellState === "red-br") return "";
  return "";
}

function enumerateConsistentBoards(observedGrid) {
  const config = getLevelConfig();
  const { rows, cols, pieces } = config;
  const boards = [];

  if (state.level === 3) {
    return sampleConsistentBoardsLevel3(observedGrid, config);
  }

  // Find purple piece configuration (always first piece type in our levels)
  const purplePiece = pieces.find((p) => p.type === "purple");
  if (!purplePiece) return boards;

  // Enumerate all purple anchor positions
  for (let pr = 0; pr <= rows - 2; pr++) {
    for (let pc = 0; pc <= cols - 2; pc++) {
      const purpleSet = new Set([
        key(pr, pc),
        key(pr, pc + 1),
        key(pr + 1, pc),
        key(pr + 1, pc + 1),
      ]);

      // Get cells available for other pieces
      const availableCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!purpleSet.has(key(r, c))) {
            availableCells.push([r, c]);
          }
        }
      }

      // Place remaining pieces based on level
      if (state.level === 1) {
        // Level 1: 4 green 1×1 singles
        const greenCombs = chooseK(availableCells, 4);
        for (const greens of greenCombs) {
          const greenSet = new Set(greens.map(([r, c]) => key(r, c)));
          const board = {
            purpleAnchor: [pr, pc],
            purpleSet,
            greenSet,
            blueSet: new Set(),
            bluePieces: [],
            yellowSet: new Set(),
          };
          if (isBoardConsistent(board, observedGrid)) {
            boards.push(board);
          }
        }
      } else if (state.level === 2) {
        // Level 2: 4 blue 1×2 pieces (can be horizontal or vertical)
        const bluePlacements = enumerateBluePlacements(availableCells, purpleSet, rows, cols);
        for (const placement of bluePlacements) {
          const blueSet = new Set();
          placement.forEach((piece) => {
            piece.cells.forEach((cell) => blueSet.add(cell));
          });
          const board = {
            purpleAnchor: [pr, pc],
            purpleSet,
            greenSet: new Set(),
            blueSet,
            bluePieces: placement,
            yellowSet: new Set(),
          };
          if (isBoardConsistent(board, observedGrid)) {
            boards.push(board);
          }
        }
      }
    }
  }

  return boards;
}

function enumerateBluePlacements(availableCells, purpleSet, rows, cols) {
  // Generate all possible blue 1×2 pieces (horizontal and vertical) from available cells
  const allBluePieces = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Try horizontal (1 row, 2 cols)
      if (c <= cols - 2) {
        const k1 = key(r, c);
        const k2 = key(r, c + 1);
        if (!purpleSet.has(k1) && !purpleSet.has(k2)) {
          allBluePieces.push({
            anchor: [r, c],
            orientation: "h",
            cells: [k1, k2],
          });
        }
      }
      
      // Try vertical (2 rows, 1 col)
      if (r <= rows - 2) {
        const k1 = key(r, c);
        const k2 = key(r + 1, c);
        if (!purpleSet.has(k1) && !purpleSet.has(k2)) {
          allBluePieces.push({
            anchor: [r, c],
            orientation: "v",
            cells: [k1, k2],
          });
        }
      }
    }
  }

  // Choose 4 non-overlapping blue pieces
  const result = [];
  
  function backtrack(idx, chosen, usedCells) {
    if (chosen.length === 4) {
      result.push(chosen.slice());
      return;
    }
    if (idx >= allBluePieces.length) return;
    
    // Try taking current piece
    const piece = allBluePieces[idx];
    const overlaps = piece.cells.some((cell) => usedCells.has(cell));
    if (!overlaps) {
      const newUsed = new Set(usedCells);
      piece.cells.forEach((cell) => newUsed.add(cell));
      chosen.push(piece);
      backtrack(idx + 1, chosen, newUsed);
      chosen.pop();
    }
    
    // Try skipping current piece
    backtrack(idx + 1, chosen, usedCells);
  }
  
  backtrack(0, [], new Set());
  return result;
}

function sampleConsistentBoardsLevel3(observedGrid, config) {
  const { rows, cols, pieces } = config;
  const boards = [];
  const pieceInstances = expandPieceInstances(pieces);

  const pieceWithPlacements = pieceInstances.map((piece) => {
    const placements = generatePlacements(piece, rows, cols).filter((p) => placementIsCompatible(p, piece, observedGrid));
    return { piece, placements };
  });

  // Most constrained pieces first for efficient sampling
  pieceWithPlacements.sort((a, b) => a.placements.length - b.placements.length);

  // If any piece has no valid placements, no boards are possible
  if (pieceWithPlacements.some((e) => e.placements.length === 0)) return [];

  const maxAttempts = LEVEL3_NUM_SAMPLES * 20;
  const deadline = Date.now() + LEVEL3_SAMPLE_TIME_LIMIT;
  let attempts = 0;

  while (boards.length < LEVEL3_NUM_SAMPLES && attempts < maxAttempts) {
    if (attempts % 500 === 0 && Date.now() > deadline) break;
    attempts++;
    let usedMask = 0n;
    const placed = [];
    let failed = false;

    for (const entry of pieceWithPlacements) {
      const valid = [];
      for (const p of entry.placements) {
        if ((p.mask & usedMask) === 0n) valid.push(p);
      }
      if (valid.length === 0) { failed = true; break; }
      const pick = valid[Math.floor(Math.random() * valid.length)];
      usedMask |= pick.mask;
      placed.push({ ...pick, type: entry.piece.type, size: entry.piece.size });
    }
    if (failed) continue;

    const board = buildBoardFromPlacements(placed);
    if (isBoardConsistent(board, observedGrid)) {
      boards.push(board);
    }
  }

  return boards;
}

function expandPieceInstances(pieces) {
  const out = [];
  for (const piece of pieces) {
    const count = piece.count || 1;
    for (let i = 0; i < count; i++) {
      const forceBlueRotatable = state.level === 3 && piece.type === "blue";
      out.push({
        type: piece.type,
        size: piece.size,
        rotatable: forceBlueRotatable || piece.rotatable === true,
      });
    }
  }
  return out;
}

function generatePlacements(piece, rows, cols) {
  const placements = [];
  const sizeOptions = [];
  const [baseRows, baseCols] = piece.size;
  sizeOptions.push({ rows: baseRows, cols: baseCols, orientation: "h" });
  if (piece.rotatable && baseRows !== baseCols) {
    sizeOptions.push({ rows: baseCols, cols: baseRows, orientation: "v" });
  }

  for (const size of sizeOptions) {
    for (let r = 0; r <= rows - size.rows; r++) {
      for (let c = 0; c <= cols - size.cols; c++) {
        const cells = [];
        for (let dr = 0; dr < size.rows; dr++) {
          for (let dc = 0; dc < size.cols; dc++) {
            cells.push(key(r + dr, c + dc));
          }
        }
        placements.push({
          anchor: [r, c],
          orientation: size.orientation,
          cells,
        });
      }
    }
  }

  for (const placement of placements) {
    placement.mask = cellsToMask(placement.cells);
  }

  return placements;
}

function pieceSignature(piece) {
  const [sr, sc] = piece.size;
  const a = Math.min(sr, sc);
  const b = Math.max(sr, sc);
  return `${piece.type}_${a}x${b}`;
}

function cellsToMask(cells) {
  let mask = 0n;
  for (const cell of cells) {
    const [rStr, cStr] = cell.split(",");
    const idx = Number(rStr) * 8 + Number(cStr);
    mask |= 1n << BigInt(idx);
  }
  return mask;
}

function placementIsCompatible(placement, piece, observedGrid) {
  for (const cell of placement.cells) {
    const [rStr, cStr] = cell.split(",");
    const r = Number(rStr);
    const c = Number(cStr);
    const observed = observedGrid[r][c];
    if (observed === "unknown") continue;
    if (observed === "miss") return false;
    if (observed === "green" && piece.type !== "green") return false;
    if (observed === "blue" && piece.type !== "blue") return false;
    if (observed === "yellow" && piece.type !== "yellow") return false;
    if (observed in YELLOW_OFFSETS) {
      if (piece.type !== "yellow") return false;
      const [expDr, expDc] = YELLOW_OFFSETS[observed];
      const [ar, ac] = placement.anchor;
      if (ar + expDr !== r || ac + expDc !== c) return false;
    }
    if (observed === "purple-any" && piece.type !== "purple") return false;
    if (observed in PURPLE_OFFSETS) {
      if (piece.type !== "purple") return false;
      const [expDr, expDc] = PURPLE_OFFSETS[observed];
      const [ar, ac] = placement.anchor;
      if (ar + expDr !== r || ac + expDc !== c) return false;
    }
    if (observed.startsWith("blue-") && piece.type !== "blue") return false;
  }
  return true;
}

function buildBoardFromPlacements(placements) {
  const purpleSet = new Set();
  const greenSet = new Set();
  const blueSet = new Set();
  const yellowSet = new Set();
  let purpleAnchor = null;
  let yellowAnchor = null;
  const bluePieces = [];

  for (const placement of placements) {
    if (placement.type === "purple") {
      placement.cells.forEach((cell) => purpleSet.add(cell));
      purpleAnchor = placement.anchor;
    } else if (placement.type === "green") {
      placement.cells.forEach((cell) => greenSet.add(cell));
    } else if (placement.type === "blue") {
      placement.cells.forEach((cell) => blueSet.add(cell));
      bluePieces.push({
        anchor: placement.anchor,
        orientation: placement.orientation,
        cells: placement.cells,
        size: placement.size,
      });
    } else if (placement.type === "yellow") {
      placement.cells.forEach((cell) => yellowSet.add(cell));
      yellowAnchor = placement.anchor;
    }
  }

  return {
    purpleAnchor,
    purpleSet,
    greenSet,
    blueSet,
    bluePieces,
    yellowSet,
    yellowAnchor,
  };
}

function isBoardConsistent(board, observedGrid) {
  const config = getLevelConfig();
  const { rows, cols } = config;
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const observed = observedGrid[r][c];
      const k = key(r, c);
      const isPurple = board.purpleSet.has(k);
      const isGreen = board.greenSet.has(k);
      const isBlue = board.blueSet.has(k);
      const isYellow = board.yellowSet.has(k);
      const isEmpty = !isPurple && !isGreen && !isBlue && !isYellow;

      if (observed === "unknown") continue;
      if (observed === "miss" && !isEmpty) return false;
      if (observed === "green" && !isGreen) return false;
      if (observed === "blue" && !isBlue) return false;
      if (observed === "yellow" && !isYellow) return false;
      if (observed === "purple-any" && !isPurple) return false;

      if (observed in YELLOW_OFFSETS) {
        if (!board.yellowAnchor) return false;
        if (!isYellow) return false;
        const [or, oc] = YELLOW_OFFSETS[observed];
        if (board.yellowAnchor[0] + or !== r || board.yellowAnchor[1] + oc !== c) return false;
      }

      if (observed in PURPLE_OFFSETS) {
        if (!board.purpleAnchor) return false;
        if (!isPurple) return false;
        const [or, oc] = PURPLE_OFFSETS[observed];
        if (board.purpleAnchor[0] + or !== r || board.purpleAnchor[1] + oc !== c) return false;
      }

      // Check blue piece consistency
      if (observed.startsWith("blue-")) {
        if (!isBlue) return false;
        
        // Find which blue piece this cell belongs to
        const bluePiece = board.bluePieces.find((p) => p.cells.includes(k));
        if (!bluePiece) return false;
        
        const [ar, ac] = bluePiece.anchor;
        
        const pieceLen = bluePiece.cells.length;
        if (observed === "blue-h-l") {
          if (bluePiece.orientation !== "h" || r !== ar || c !== ac) return false;
        } else if (observed === "blue-h-r") {
          if (bluePiece.orientation !== "h" || r !== ar || c !== ac + pieceLen - 1) return false;
        } else if (observed === "blue-h-m") {
          if (bluePiece.orientation !== "h" || pieceLen !== 3 || r !== ar || c !== ac + 1) return false;
        } else if (observed === "blue-v-t") {
          if (bluePiece.orientation !== "v" || r !== ar || c !== ac) return false;
        } else if (observed === "blue-v-b") {
          if (bluePiece.orientation !== "v" || r !== ar + pieceLen - 1 || c !== ac) return false;
        } else if (observed === "blue-v-m") {
          if (bluePiece.orientation !== "v" || pieceLen !== 3 || r !== ar + 1 || c !== ac) return false;
        }
      }
    }
  }
  return true;
}

function scoreCellsFromBoards(boards, observedGrid, optimizer) {
  const config = getLevelConfig();
  const { rows, cols } = config;
  
  const allUnknown = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (observedGrid[r][c] === "unknown") allUnknown.push([r, c]);
    }
  }

  if (allUnknown.length === 0 || boards.length === 0) {
    return { bestCells: [], topCells: [], forcedGuaranteed: false };
  }

  const scored = allUnknown.map(([r, c]) => {
    const k = key(r, c);
    let purpleCount = 0;
    let greenCount = 0;
    let blueCount = 0;
    let yellowCount = 0;
    
    for (const b of boards) {
      if (b.purpleSet.has(k)) purpleCount++;
      else if (b.greenSet.has(k)) greenCount++;
      else if (b.blueSet.has(k)) blueCount++;
      else if (b.yellowSet.has(k)) yellowCount++;
    }

    const purpleP = purpleCount / boards.length;
    const greenP = greenCount / boards.length;
    const blueP = blueCount / boards.length;
    const yellowP = yellowCount / boards.length;
    const anyP = purpleP + greenP + blueP + yellowP;
    const checkerBonus = ((r + c) % 2 === 0) ? 0.01 : 0;

    let score = anyP;
    if (optimizer === "rare-focus") {
      score = state.level === 3 ? yellowP : purpleP;
    } else if (optimizer === "common-focus") {
      score = state.level === 3 ? greenP + blueP : greenP + blueP;
    } else if (optimizer === "checkerboard") {
      score = anyP + checkerBonus;
    }

    return { r, c, score, anyP, purpleP, greenP, blueP, yellowP };
  });

  const maxAnyP = scored.reduce((m, x) => Math.max(m, x.anyP), 0);
  if (maxAnyP <= 1e-12) {
    return { bestCells: [], topCells: [], forcedGuaranteed: false };
  }

  // Mandatory policy: if a hit is guaranteed, reveal guaranteed hits first.
  const guaranteed = scored.filter((x) => Math.abs(x.anyP - 1) < 1e-12);
  if (guaranteed.length > 0) {
    const guaranteedSorted = guaranteed.slice().sort((a, b) => {
      if (state.level === 3) {
        if (Math.abs(b.yellowP - a.yellowP) > 1e-12) return b.yellowP - a.yellowP;
        if (Math.abs(b.blueP - a.blueP) > 1e-12) return b.blueP - a.blueP;
      } else if (Math.abs(b.purpleP - a.purpleP) > 1e-12) {
        return b.purpleP - a.purpleP;
      }
      if (a.r !== b.r) return a.r - b.r;
      return a.c - b.c;
    });

    return {
      bestCells: guaranteedSorted.map((x) => [x.r, x.c]),
      topCells: guaranteedSorted.slice(0, 10),
      forcedGuaranteed: true,
    };
  }

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const bestCells = scored.filter((x) => Math.abs(x.score - bestScore) < 1e-12).map((x) => [x.r, x.c]);
  return { bestCells, topCells: scored.slice(0, 10), forcedGuaranteed: false };
}

function renderRecommendations(bestCells, topCells, boardCount, forcedGuaranteed, expectedHammers, approximate) {
  const t = document.getElementById("recommendationText");
  const stats = document.getElementById("statsText");
  const list = document.getElementById("topCells");

  if (!topCells.length) {
    if (boardCount > 0) {
      t.textContent = "All parts already revealed. No more hammers needed.";
      stats.textContent = `Consistent board states: ${boardCount} | Expected hammers to finish: 0.0`;
    } else {
      t.textContent = "No recommendation available for current state.";
      stats.textContent = "";
    }
    list.innerHTML = "";
    return;
  }

  if (forcedGuaranteed) {
    t.textContent = `Guaranteed hit available: reveal highlighted cell(s) first (${bestCells.length}).`;
  } else {
    const approxNote = approximate ? " (approximate)" : "";
    t.textContent = `Best next click candidates: ${bestCells.length}${approxNote}`;
  }
  const hammersText = expectedHammers !== null ? ` | Expected hammers to finish: ${expectedHammers.toFixed(1)}` : "";
  const boardLabel = approximate ? "Sampled boards" : "Consistent board states";
  const prefix = approximate ? "~" : "";
  stats.textContent = `${boardLabel}: ${prefix}${boardCount}${hammersText}`;
  
  // Format percentages based on level
  const listItems = topCells.map((x) => {
    let details;
    if (state.level === 1) {
      details = `hit ${(x.anyP * 100).toFixed(1)}% | purple ${(x.purpleP * 100).toFixed(1)}% | green ${(x.greenP * 100).toFixed(1)}%`;
    } else if (state.level === 2) {
      details = `hit ${(x.anyP * 100).toFixed(1)}% | purple ${(x.purpleP * 100).toFixed(1)}% | blue ${(x.blueP * 100).toFixed(1)}%`;
    } else if (state.level === 3) {
      details = `hit ${(x.anyP * 100).toFixed(1)}% | blue ${(x.blueP * 100).toFixed(1)}% | yellow ${(x.yellowP * 100).toFixed(1)}% | green ${(x.greenP * 100).toFixed(1)}%`;
    } else if (state.level === 4) {
      details = `hit ${(x.anyP * 100).toFixed(1)}% | red ${((x.redP ?? 0) * 100).toFixed(1)}% | blue ${(x.blueP * 100).toFixed(1)}%`;
    } else {
      details = `hit ${(x.anyP * 100).toFixed(1)}% | purple ${(x.purpleP * 100).toFixed(1)}%`;
    }
    return `<li>R${x.r + 1}C${x.c + 1} | ${details}</li>`;
  });
  
  list.innerHTML = `<ol>${listItems.join("")}</ol>`;
}

function highlightBest(bestCells) {
  clearHighlights();
  bestCells.forEach(([r, c]) => {
    const el = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (el) el.classList.add("best");
  });
}

function clearHighlights() {
  document.querySelectorAll(".cell.best").forEach((el) => el.classList.remove("best"));
}

function calculateExpectedHammers(boards, observedGrid) {
  if (boards.length === 0) return null;

  const config = getLevelConfig();
  const { rows, cols } = config;

  // Count guaranteed hits (always 1 click each)
  let guaranteedHits = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (observedGrid[r][c] !== "unknown") continue;
      const k = key(r, c);
      let hitCount = 0;
      for (const b of boards) {
        if (b.purpleSet.has(k) || b.greenSet.has(k) || b.blueSet.has(k) || b.yellowSet.has(k)) hitCount++;
      }
      const p = hitCount / boards.length;
      if (Math.abs(p - 1) < 1e-12) guaranteedHits++;
    }
  }

  // Simulate greedy play following recommendation strategy on each true board
  let totalHammers = 0;
  for (const trueBoard of boards) {
    let simGrid = observedGrid.map((row) => row.slice());
    let hammers = 0;
    const maxSteps = rows * cols * 2;

    for (let step = 0; step < maxSteps; step++) {
      // Check if all piece cells are revealed
      const allRevealed = areAllPiecesRevealed(simGrid, trueBoard);
      if (allRevealed) break;

      // Score unknown cells by hit probability in current state
      const simBoards = enumerateConsistentBoards(simGrid);
      if (!simBoards.length) break;

      let bestCell = null;
      let bestScore = -1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (simGrid[r][c] !== "unknown") continue;
          const k = key(r, c);
          let hitCount = 0;
          for (const b of simBoards) {
            if (b.purpleSet.has(k) || b.greenSet.has(k) || b.blueSet.has(k) || b.yellowSet.has(k)) hitCount++;
          }
          const score = hitCount / simBoards.length;
          if (score > bestScore) {
            bestScore = score;
            bestCell = [r, c];
          }
        }
      }

      if (!bestCell) break;

      // Reveal the best cell with its true state
      const [r, c] = bestCell;
      simGrid[r][c] = trueLabelForCell(trueBoard, r, c);
      hammers++;
    }

    totalHammers += hammers;
  }

  // Average across all boards
  const avgNonGuaranteed = totalHammers / boards.length;
  return Math.max(guaranteedHits, avgNonGuaranteed);
}

function areAllPiecesRevealed(grid, board) {
  const pieceCells = new Set([...board.purpleSet, ...board.greenSet, ...board.blueSet, ...board.yellowSet]);
  for (const k of pieceCells) {
    const [rStr, cStr] = k.split(",");
    const r = Number(rStr);
    const c = Number(cStr);
    if (grid[r][c] === "unknown") return false;
  }
  return true;
}

function trueLabelForCell(board, r, c) {
  const k = key(r, c);

  if (board.purpleSet.has(k) && board.purpleAnchor) {
    const dr = r - board.purpleAnchor[0];
    const dc = c - board.purpleAnchor[1];
    if (dr === 0 && dc === 0) return "purple-tl";
    if (dr === 0 && dc === 1) return "purple-tr";
    if (dr === 1 && dc === 0) return "purple-bl";
    return "purple-br";
  }

  if (board.greenSet.has(k)) return "green";
  if (board.yellowSet.has(k) && board.yellowAnchor) {
    const dr = r - board.yellowAnchor[0];
    const dc = c - board.yellowAnchor[1];
    if (dr === 0 && dc === 0) return "yellow-tl";
    if (dr === 0 && dc === 1) return "yellow-tr";
    if (dr === 1 && dc === 0) return "yellow-ml";
    if (dr === 1 && dc === 1) return "yellow-mr";
    if (dr === 2 && dc === 0) return "yellow-bl";
    if (dr === 2 && dc === 1) return "yellow-br";
    return "yellow";
  }

  if (board.blueSet.has(k)) {
    if (state.level === 3) return "blue";
    const bluePiece = board.bluePieces.find((p) => p.cells.includes(k));
    if (!bluePiece) return "miss";
    const [ar, ac] = bluePiece.anchor;
    if (bluePiece.orientation === "h") return c === ac ? "blue-h-l" : "blue-h-r";
    return r === ar ? "blue-v-t" : "blue-v-b";
  }

  return "miss";
}

function key(r, c) {
  return `${r},${c}`;
}

function chooseK(arr, k) {
  const out = [];
  const cur = [];

  function dfs(idx, left) {
    if (left === 0) {
      out.push(cur.slice());
      return;
    }
    if (idx >= arr.length) return;
    if (arr.length - idx < left) return;

    cur.push(arr[idx]);
    dfs(idx + 1, left - 1);
    cur.pop();
    dfs(idx + 1, left);
  }

  dfs(0, k);
  return out;
}

document.addEventListener("DOMContentLoaded", init);
