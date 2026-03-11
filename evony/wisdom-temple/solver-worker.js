const LEVELS = {
  1: {
    rows: 4,
    cols: 4,
    pieces: [
      { type: "purple", size: [2, 2], count: 1 },
      { type: "green", size: [1, 1], count: 4 },
    ],
  },
  2: {
    rows: 5,
    cols: 5,
    pieces: [
      { type: "purple", size: [2, 2], count: 1 },
      { type: "blue", size: [1, 2], count: 4 },
    ],
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

const PURPLE_OFFSETS = {
  "purple-tl": [0, 0],
  "purple-tr": [0, 1],
  "purple-bl": [1, 0],
  "purple-br": [1, 1],
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

const allBoardsByLevel = new Map();
const consistentBoardsCache = new Map();
const LEVEL3_NUM_SAMPLES = 10000;
const LEVEL3_SAMPLE_TIME_LIMIT = 2000;

// Level 3 exact enumeration (no-green boards)
let _l3p32 = null, _l3p12 = null, _l3p13 = null;
let _l3AllBoards = null;

// Level 4 Monte Carlo sampling - placements pre-built on first use
let _l4p33 = null, _l4p14 = null, _l4p12 = null;

self.onmessage = (event) => {
  const { id, type, payload } = event.data || {};
  try {
    if (type === "warm") {
      const boards = getAllBoardsForLevel(payload.level);
      postOk(id, { count: boards.length });
      return;
    }

    if (type === "recalc") {
      const { level, grid, optimizer } = payload;
      if (level === 3) {
        const result = recalcLevel3(grid, optimizer);
        postOk(id, {
          boardsCount: result.totalWeight,
          bestCells: result.bestCells,
          topCells: result.topCells,
          allCells: result.allCells,
          forcedGuaranteed: result.forcedGuaranteed,
          approximate: false,
        });
        return;
      }
      if (level === 4) {
        const result = recalcLevel4(grid, optimizer);
        postOk(id, {
          boardsCount: result.totalBoards,
          bestCells: result.bestCells,
          topCells: result.topCells,
          allCells: result.allCells,
          forcedGuaranteed: result.forcedGuaranteed,
          approximate: false,
        });
        return;
      }
      const boards = getConsistentBoards(level, grid);
      const result = scoreCellsFromBoards(level, boards, grid, optimizer);
      postOk(id, {
        boardsCount: boards.length,
        bestCells: result.bestCells,
        topCells: result.topCells,
        forcedGuaranteed: result.forcedGuaranteed,
        approximate: false,
      });
      return;
    }

    if (type === "feasible") {
      const { level, grid, r, c } = payload;
      const states = feasibleStatesForCell(level, grid, r, c);
      postOk(id, states);
      return;
    }

    throw new Error(`Unknown worker message type: ${type}`);
  } catch (err) {
    postError(id, err);
  }
};

function postOk(id, data) {
  self.postMessage({ id, ok: true, data });
}

function postError(id, err) {
  const message = err && err.message ? err.message : String(err);
  self.postMessage({ id, ok: false, error: message });
}

function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => "unknown"));
}

function key(r, c) {
  return `${r},${c}`;
}

function gridKeyFor(level, grid) {
  return `${level}_${JSON.stringify(grid)}`;
}

function getAllBoardsForLevel(level) {
  if (level === 3) {
    enumerateAllL3NoGreenBoards();
    return _l3AllBoards;
  }
  if (level === 4) {
    // Level 4 uses Monte Carlo sampling; no pre-enumerated board list.
    return [];
  }
  if (allBoardsByLevel.has(level)) return allBoardsByLevel.get(level);
  const config = LEVELS[level];
  const unknownGrid = makeGrid(config.rows, config.cols);
  const boards = enumerateConsistentBoards(level, unknownGrid);
  allBoardsByLevel.set(level, boards);
  return boards;
}

function getConsistentBoards(level, grid) {
  const cacheKey = gridKeyFor(level, grid);
  if (consistentBoardsCache.has(cacheKey)) return consistentBoardsCache.get(cacheKey);
  let boards;
  if (level === 3) {
    boards = sampleConsistentBoardsLevel3(level, grid, LEVELS[level]);
  } else {
    const allBoards = getAllBoardsForLevel(level);
    boards = allBoards.filter((board) => isBoardConsistent(level, board, grid));
  }
  consistentBoardsCache.set(cacheKey, boards);
  return boards;
}

function feasibleStatesForCell(level, grid, r, c) {
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
    : ["purple-tl", "purple-tr", "purple-bl", "purple-br", "blue-h-l", "blue-h-r", "blue-v-t", "blue-v-b", "green", "miss"];

  const ranked = Object.keys(partCounts)
    .filter((part) => partCounts[part] > 0)
    .sort((a, b) => {
      if (partCounts[b] !== partCounts[a]) return partCounts[b] - partCounts[a];
      return tiebreakOrder.indexOf(a) - tiebreakOrder.indexOf(b);
    });

  states.push(...ranked);
  return states;
}

function scoreCellsFromBoards(level, boards, observedGrid, optimizer) {
  const config = LEVELS[level];
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
    const checkerBonus = (r + c) % 2 === 0 ? 0.01 : 0;

    let score = anyP;
    if (optimizer === "rare-focus") {
      score = level === 3 ? yellowP : purpleP;
    } else if (optimizer === "common-focus") {
      score = greenP + blueP;
    } else if (optimizer === "checkerboard") {
      score = anyP + checkerBonus;
    }

    return { r, c, score, anyP, purpleP, greenP, blueP, yellowP };
  });

  const maxAnyP = scored.reduce((m, x) => Math.max(m, x.anyP), 0);
  if (maxAnyP <= 1e-12) {
    return { bestCells: [], topCells: [], forcedGuaranteed: false };
  }

  const guaranteed = scored.filter((x) => Math.abs(x.anyP - 1) < 1e-12);
  if (guaranteed.length > 0) {
    const guaranteedSorted = guaranteed.slice().sort((a, b) => {
      if (level === 3) {
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

function enumerateConsistentBoards(level, observedGrid) {
  const config = LEVELS[level];
  const { rows, cols, pieces } = config;
  const boards = [];

  if (level === 3) {
    return sampleConsistentBoardsLevel3(level, observedGrid, config);
  }

  const purplePiece = pieces.find((p) => p.type === "purple");
  if (!purplePiece) return boards;

  for (let pr = 0; pr <= rows - 2; pr++) {
    for (let pc = 0; pc <= cols - 2; pc++) {
      const purpleSet = new Set([key(pr, pc), key(pr, pc + 1), key(pr + 1, pc), key(pr + 1, pc + 1)]);

      const availableCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!purpleSet.has(key(r, c))) availableCells.push([r, c]);
        }
      }

      if (level === 1) {
        const greenCombs = chooseK(availableCells, 4);
        for (const greens of greenCombs) {
          const board = {
            purpleAnchor: [pr, pc],
            purpleSet,
            greenSet: new Set(greens.map(([r, c]) => key(r, c))),
            blueSet: new Set(),
            bluePieces: [],
            yellowSet: new Set(),
          };
          if (isBoardConsistent(level, board, observedGrid)) boards.push(board);
        }
      } else if (level === 2) {
        const bluePlacements = enumerateBluePlacements(purpleSet, rows, cols);
        for (const placement of bluePlacements) {
          const blueSet = new Set();
          placement.forEach((piece) => piece.cells.forEach((cell) => blueSet.add(cell)));
          const board = {
            purpleAnchor: [pr, pc],
            purpleSet,
            greenSet: new Set(),
            blueSet,
            bluePieces: placement,
            yellowSet: new Set(),
          };
          if (isBoardConsistent(level, board, observedGrid)) boards.push(board);
        }
      }
    }
  }

  return boards;
}

function enumerateBluePlacements(purpleSet, rows, cols) {
  const allBluePieces = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c <= cols - 2) {
        const k1 = key(r, c);
        const k2 = key(r, c + 1);
        if (!purpleSet.has(k1) && !purpleSet.has(k2)) {
          allBluePieces.push({ anchor: [r, c], orientation: "h", cells: [k1, k2] });
        }
      }

      if (r <= rows - 2) {
        const k1 = key(r, c);
        const k2 = key(r + 1, c);
        if (!purpleSet.has(k1) && !purpleSet.has(k2)) {
          allBluePieces.push({ anchor: [r, c], orientation: "v", cells: [k1, k2] });
        }
      }
    }
  }

  const result = [];
  function backtrack(idx, chosen, usedCells) {
    if (chosen.length === 4) {
      result.push(chosen.slice());
      return;
    }
    if (idx >= allBluePieces.length) return;

    const piece = allBluePieces[idx];
    const overlaps = piece.cells.some((cell) => usedCells.has(cell));
    if (!overlaps) {
      const newUsed = new Set(usedCells);
      piece.cells.forEach((cell) => newUsed.add(cell));
      chosen.push(piece);
      backtrack(idx + 1, chosen, newUsed);
      chosen.pop();
    }

    backtrack(idx + 1, chosen, usedCells);
  }

  backtrack(0, [], new Set());
  return result;
}

// ==================== LEVEL 3 EXACT ENUMERATION ====================

function buildL3Placements() {
  if (_l3p32) return;
  function genP(h, w, rotatable) {
    const list = [];
    for (let r = 0; r <= 6 - h; r++) {
      for (let c = 0; c <= 6 - w; c++) {
        const cells = [];
        let mask = 0n;
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            const k = key(r + dr, c + dc);
            cells.push(k);
            mask |= 1n << BigInt((r + dr) * 8 + (c + dc));
          }
        }
        list.push({ anchor: [r, c], orientation: "h", cells, mask, len: h * w });
      }
    }
    if (rotatable && h !== w) {
      for (let r = 0; r <= 6 - w; r++) {
        for (let c = 0; c <= 6 - h; c++) {
          const cells = [];
          let mask = 0n;
          for (let dr = 0; dr < w; dr++) {
            for (let dc = 0; dc < h; dc++) {
              const k = key(r + dr, c + dc);
              cells.push(k);
              mask |= 1n << BigInt((r + dr) * 8 + (c + dc));
            }
          }
          list.push({ anchor: [r, c], orientation: "v", cells, mask, len: h * w });
        }
      }
    }
    return list;
  }
  _l3p32 = genP(3, 2, false);
  _l3p12 = genP(1, 2, true);
  _l3p13 = genP(1, 3, true);
}

function enumerateAllL3NoGreenBoards() {
  if (_l3AllBoards) return;
  buildL3Placements();
  const boards = [];
  for (let yi = 0; yi < _l3p32.length; yi++) {
    const y = _l3p32[yi];
    for (let i = 0; i < _l3p12.length; i++) {
      const b1 = _l3p12[i];
      if ((b1.mask & y.mask) !== 0n) continue;
      for (let j = i + 1; j < _l3p12.length; j++) {
        const b2 = _l3p12[j];
        if ((b2.mask & y.mask) !== 0n) continue;
        if ((b1.mask & b2.mask) !== 0n) continue;
        const used12 = y.mask | b1.mask | b2.mask;
        for (let bi3 = 0; bi3 < _l3p13.length; bi3++) {
          const b3 = _l3p13[bi3];
          if ((b3.mask & used12) !== 0n) continue;
          boards.push({ yIdx: yi, b1Idx: i, b2Idx: j, b3Idx: bi3, mask: used12 | b3.mask });
        }
      }
    }
  }
  _l3AllBoards = boards;
}

function isL3BoardCompatible(board, observedGrid) {
  const y  = _l3p32[board.yIdx];
  const b1 = _l3p12[board.b1Idx];
  const b2 = _l3p12[board.b2Idx];
  const b3 = _l3p13[board.b3Idx];
  const blueMask = b1.mask | b2.mask | b3.mask;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const obs = observedGrid[r][c];
      if (obs === "unknown" || obs === "green") continue;
      const bit = 1n << BigInt(r * 8 + c);
      const inYellow = (y.mask & bit) !== 0n;
      const inBlue   = (blueMask & bit) !== 0n;
      if (obs === "miss" && (inYellow || inBlue)) return false;
      if (obs in YELLOW_OFFSETS) {
        if (!inYellow) return false;
        const [or, oc] = YELLOW_OFFSETS[obs];
        if (y.anchor[0] + or !== r || y.anchor[1] + oc !== c) return false;
      }
      if (obs.startsWith("blue-")) {
        if (!inBlue) return false;
        const bp = (b1.mask & bit) !== 0n ? b1 : (b2.mask & bit) !== 0n ? b2 : b3;
        const [ar, ac] = bp.anchor;
        const len = bp.len;
        const ori = bp.orientation;
        if (obs === "blue-h-l" && (ori !== "h" || r !== ar || c !== ac)) return false;
        if (obs === "blue-h-r" && (ori !== "h" || r !== ar || c !== ac + len - 1)) return false;
        if (obs === "blue-h-m" && (ori !== "h" || len !== 3 || r !== ar || c !== ac + 1)) return false;
        if (obs === "blue-v-t" && (ori !== "v" || r !== ar || c !== ac)) return false;
        if (obs === "blue-v-b" && (ori !== "v" || r !== ar + len - 1 || c !== ac)) return false;
        if (obs === "blue-v-m" && (ori !== "v" || len !== 3 || r !== ar + 1 || c !== ac)) return false;
      }
    }
  }
  return true;
}

function recalcLevel3(observedGrid, optimizer) {
  enumerateAllL3NoGreenBoards();
  const rows = 6, cols = 6;

  let revealedGreenCount = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (observedGrid[r][c] === "green") revealedGreenCount++;

  // BigInt masks for fast pre-filtering
  let forbiddenMask = 0n; // miss + green cells must NOT be covered by a piece
  let requiredMask  = 0n; // yellow-part + blue-part cells MUST be covered
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const obs = observedGrid[r][c];
      const bit = 1n << BigInt(r * 8 + c);
      if (obs === "miss" || obs === "green") forbiddenMask |= bit;
      if (obs in YELLOW_OFFSETS || obs.startsWith("blue-")) requiredMask |= bit;
    }
  }

  const allUnknown = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (observedGrid[r][c] === "unknown") allUnknown.push([r, c]);
  if (allUnknown.length === 0) return { bestCells: [], topCells: [], allCells: [], forcedGuaranteed: false, totalWeight: 0 };

  const unknownIndexByKey = new Map(allUnknown.map(([r, c], i) => [key(r, c), i]));
  const numUnknown = allUnknown.length;
  const yellowW  = new Float64Array(numUnknown);
  const blueW    = new Float64Array(numUnknown);
  const blueHlW  = new Float64Array(numUnknown);
  const blueHmW  = new Float64Array(numUnknown);
  const blueHrW  = new Float64Array(numUnknown);
  const blueVtW  = new Float64Array(numUnknown);
  const blueVmW  = new Float64Array(numUnknown);
  const blueVbW  = new Float64Array(numUnknown);
  const greenW   = new Float64Array(numUnknown);
  let totalWeight = 0;

  for (const board of _l3AllBoards) {
    if ((board.mask & forbiddenMask) !== 0n) continue;
    if ((board.mask & requiredMask) !== requiredMask) continue;
    if (!isL3BoardCompatible(board, observedGrid)) continue;

    const y  = _l3p32[board.yIdx];
    const b1 = _l3p12[board.b1Idx];
    const b2 = _l3p12[board.b2Idx];
    const b3 = _l3p13[board.b3Idx];

    // Count unknown cells covered by pieces (needed for weight calculation)
    let pieceCellsInUnknown = 0;
    for (const k of y.cells)  if (unknownIndexByKey.has(k)) pieceCellsInUnknown++;
    for (const k of b1.cells) if (unknownIndexByKey.has(k)) pieceCellsInUnknown++;
    for (const k of b2.cells) if (unknownIndexByKey.has(k)) pieceCellsInUnknown++;
    for (const k of b3.cells) if (unknownIndexByKey.has(k)) pieceCellsInUnknown++;

    const freeUnknownCount = numUnknown - pieceCellsInUnknown;
    const validGreenCount  = freeUnknownCount + revealedGreenCount;

    // weight = number of valid green placements for this board skeleton
    let weight, gc;
    if (revealedGreenCount === 0) {
      weight = validGreenCount * (validGreenCount - 1) / 2; // C(n,2)
      gc     = validGreenCount - 1;
    } else if (revealedGreenCount === 1) {
      weight = freeUnknownCount; // pair revealed green with each unknown free cell
      gc     = 1;
    } else {
      weight = 1; // both greens fixed
      gc     = 0;
    }
    if (weight <= 0) continue;
    totalWeight += weight;

    // Accumulate yellow weighted counts
    for (const k of y.cells) { const i = unknownIndexByKey.get(k); if (i !== undefined) yellowW[i] += weight; }

    // Accumulate per-label blue weighted counts (b1, b2 are 1×2; b3 is 1×3)
    for (const [bp, isThree] of [[b1, false], [b2, false], [b3, true]]) {
      const isH = bp.orientation === 'h';
      for (let ci = 0; ci < bp.cells.length; ci++) {
        const ii = unknownIndexByKey.get(bp.cells[ci]);
        if (ii === undefined) continue;
        blueW[ii] += weight;
        if (isH) {
          if (ci === 0)                     blueHlW[ii] += weight;
          else if (ci === 1 && isThree)     blueHmW[ii] += weight;
          else                              blueHrW[ii] += weight;
        } else {
          if (ci === 0)                     blueVtW[ii] += weight;
          else if (ci === 1 && isThree)     blueVmW[ii] += weight;
          else                              blueVbW[ii] += weight;
        }
      }
    }

    // Green: add gc to all unknown cells, then subtract for piece cells
    if (gc > 0) {
      for (let i = 0; i < numUnknown; i++) greenW[i] += gc;
      for (const k of y.cells)  { const i = unknownIndexByKey.get(k); if (i !== undefined) greenW[i] -= gc; }
      for (const k of b1.cells) { const i = unknownIndexByKey.get(k); if (i !== undefined) greenW[i] -= gc; }
      for (const k of b2.cells) { const i = unknownIndexByKey.get(k); if (i !== undefined) greenW[i] -= gc; }
      for (const k of b3.cells) { const i = unknownIndexByKey.get(k); if (i !== undefined) greenW[i] -= gc; }
    }
  }

  if (totalWeight === 0) return { bestCells: [], topCells: [], allCells: [], forcedGuaranteed: false, totalWeight: 0 };

  const scored = allUnknown.map(([r, c], i) => {
    const yellowP = yellowW[i] / totalWeight;
    const blueP   = blueW[i]   / totalWeight;
    const greenP  = greenW[i]  / totalWeight;
    const anyP    = yellowP + blueP + greenP;
    const checkerBonus = (r + c) % 2 === 0 ? 0.01 : 0;
    let score = anyP;
    if (optimizer === "rare-focus")   score = yellowP;
    else if (optimizer === "common-focus")  score = greenP + blueP;
    else if (optimizer === "checkerboard") score = anyP + checkerBonus;
    return { r, c, score, anyP, purpleP: 0, greenP, blueP, yellowP,
      blueLabelP: {
        'blue-h-l': blueHlW[i] / totalWeight,
        'blue-h-m': blueHmW[i] / totalWeight,
        'blue-h-r': blueHrW[i] / totalWeight,
        'blue-v-t': blueVtW[i] / totalWeight,
        'blue-v-m': blueVmW[i] / totalWeight,
        'blue-v-b': blueVbW[i] / totalWeight,
      }
    };
  });

  const maxAnyP = scored.reduce((m, x) => Math.max(m, x.anyP), 0);
  if (maxAnyP <= 1e-12) return { bestCells: [], topCells: [], allCells: scored, forcedGuaranteed: false, totalWeight };

  const guaranteed = scored.filter(x => Math.abs(x.anyP - 1) < 1e-12);
  if (guaranteed.length > 0) {
    const gs = guaranteed.slice().sort((a, b) => {
      if (Math.abs(b.yellowP - a.yellowP) > 1e-12) return b.yellowP - a.yellowP;
      if (Math.abs(b.blueP   - a.blueP)   > 1e-12) return b.blueP   - a.blueP;
      return a.r !== b.r ? a.r - b.r : a.c - b.c;
    });
    return { bestCells: gs.map(x => [x.r, x.c]), topCells: gs.slice(0, 10), allCells: scored, forcedGuaranteed: true, totalWeight };
  }

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const bestCells = scored.filter(x => Math.abs(x.score - bestScore) < 1e-12).map(x => [x.r, x.c]);
  return { bestCells, topCells: scored.slice(0, 10), allCells: scored, forcedGuaranteed: false, totalWeight };
}

// ==================== LEVEL 4 MONTE CARLO SAMPLING ====================
// Pieces: 1× red 3×3, 2× blue 1×4 (rotatable), 4× blue 1×2 (rotatable)
// Too many boards for full enumeration; use Monte Carlo sampling.

const LEVEL4_NUM_SAMPLES = 10000;
const LEVEL4_SAMPLE_TIME_LIMIT = 3000;

function buildL4Placements() {
  if (_l4p33) return;
  function genP(h, w, rotatable, rows, cols) {
    const list = [];
    for (let r = 0; r <= rows - h; r++) {
      for (let c = 0; c <= cols - w; c++) {
        const cells = [];
        let mask = 0n;
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            const k = key(r + dr, c + dc);
            cells.push(k);
            mask |= 1n << BigInt((r + dr) * 8 + (c + dc));
          }
        }
        list.push({ anchor: [r, c], orientation: "h", cells, mask, len: h * w });
      }
    }
    if (rotatable && h !== w) {
      for (let r = 0; r <= rows - w; r++) {
        for (let c = 0; c <= cols - h; c++) {
          const cells = [];
          let mask = 0n;
          for (let dr = 0; dr < w; dr++) {
            for (let dc = 0; dc < h; dc++) {
              const k = key(r + dr, c + dc);
              cells.push(k);
              mask |= 1n << BigInt((r + dr) * 8 + (c + dc));
            }
          }
          list.push({ anchor: [r, c], orientation: "v", cells, mask, len: h * w });
        }
      }
    }
    return list;
  }
  const ROWS = 7, COLS = 7;
  _l4p33 = genP(3, 3, false, ROWS, COLS);  // red 3×3
  _l4p14 = genP(1, 4, true,  ROWS, COLS);  // blue 1×4 (rotatable)
  _l4p12 = genP(1, 2, true,  ROWS, COLS);  // blue 1×2 (rotatable)
}

// Check a sampled L4 board against observed grid.
function isL4SampleCompatible(red, b14a, b14b, b12arr, observedGrid) {
  const blueMask = b14a.mask | b14b.mask | b12arr[0].mask | b12arr[1].mask | b12arr[2].mask | b12arr[3].mask;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const obs = observedGrid[r][c];
      if (obs === "unknown") continue;
      const bit = 1n << BigInt(r * 8 + c);
      const inRed  = (red.mask  & bit) !== 0n;
      const inBlue = (blueMask  & bit) !== 0n;
      if (obs === "miss" && (inRed || inBlue)) return false;
      if (obs in RED_OFFSETS) {
        if (!inRed) return false;
        const [or, oc] = RED_OFFSETS[obs];
        if (red.anchor[0] + or !== r || red.anchor[1] + oc !== c) return false;
      }
      if (obs.startsWith("blue-")) {
        if (!inBlue) return false;
        let bp = null;
        if ((b14a.mask & bit) !== 0n) bp = b14a;
        else if ((b14b.mask & bit) !== 0n) bp = b14b;
        else for (const s of b12arr) if ((s.mask & bit) !== 0n) { bp = s; break; }
        if (!bp) return false;
        const [ar, ac] = bp.anchor;
        const len = bp.len;
        const ori = bp.orientation;
        if (obs === "blue-h-l"  && (ori !== "h" || r !== ar || c !== ac)) return false;
        if (obs === "blue-h-r"  && (ori !== "h" || r !== ar || c !== ac + len - 1)) return false;
        if (obs === "blue-h-m2" && (ori !== "h" || len !== 4 || r !== ar || c !== ac + 1)) return false;
        if (obs === "blue-h-m3" && (ori !== "h" || len !== 4 || r !== ar || c !== ac + 2)) return false;
        if (obs === "blue-v-t"  && (ori !== "v" || r !== ar || c !== ac)) return false;
        if (obs === "blue-v-b"  && (ori !== "v" || r !== ar + len - 1 || c !== ac)) return false;
        if (obs === "blue-v-m2" && (ori !== "v" || len !== 4 || r !== ar + 1 || c !== ac)) return false;
        if (obs === "blue-v-m3" && (ori !== "v" || len !== 4 || r !== ar + 2 || c !== ac)) return false;
      }
    }
  }
  return true;
}

function recalcLevel4(observedGrid, optimizer) {
  buildL4Placements();
  const rows = 7, cols = 7;

  // Pre-filter placements by observed grid.
  function filterPlacements(list, pieceType) {
    return list.filter(p => {
      for (const k of p.cells) {
        const [rStr, cStr] = k.split(",");
        const r = Number(rStr), c = Number(cStr);
        const obs = observedGrid[r][c];
        if (obs === "miss") return false;
        if (obs === "unknown") continue;
        if (pieceType === "red" && !(obs in RED_OFFSETS)) return false;
        if (pieceType === "blue" && !obs.startsWith("blue-") && obs !== "unknown") return false;
        if (pieceType === "red" && obs in RED_OFFSETS) {
          const [or, oc] = RED_OFFSETS[obs];
          if (p.anchor[0] + or !== r || p.anchor[1] + oc !== c) return false;
        }
      }
      return true;
    });
  }

  const validReds = filterPlacements(_l4p33, "red");
  const validB14 = filterPlacements(_l4p14, "blue");
  const validB12 = filterPlacements(_l4p12, "blue");

  if (validReds.length === 0 || validB14.length < 2 || validB12.length < 4) {
    return { bestCells: [], topCells: [], allCells: [], forcedGuaranteed: false, totalBoards: 0 };
  }

  const allUnknown = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (observedGrid[r][c] === "unknown") allUnknown.push([r, c]);
  if (allUnknown.length === 0) return { bestCells: [], topCells: [], allCells: [], forcedGuaranteed: false, totalBoards: 0 };

  const unknownIndexByKey = new Map(allUnknown.map(([r, c], i) => [key(r, c), i]));
  const numUnknown = allUnknown.length;

  const redW    = new Float64Array(numUnknown);
  const blueW   = new Float64Array(numUnknown);
  const blueHlW  = new Float64Array(numUnknown);
  const blueHm2W = new Float64Array(numUnknown);
  const blueHm3W = new Float64Array(numUnknown);
  const blueHrW  = new Float64Array(numUnknown);
  const blueVtW  = new Float64Array(numUnknown);
  const blueVm2W = new Float64Array(numUnknown);
  const blueVm3W = new Float64Array(numUnknown);
  const blueVbW  = new Float64Array(numUnknown);
  let totalBoards = 0;

  const maxAttempts = LEVEL4_NUM_SAMPLES * 30;
  const deadline = Date.now() + LEVEL4_SAMPLE_TIME_LIMIT;
  let attempts = 0;

  while (totalBoards < LEVEL4_NUM_SAMPLES && attempts < maxAttempts) {
    if (attempts % 500 === 0 && Date.now() > deadline) break;
    attempts++;

    // Pick random red
    const red = validReds[Math.floor(Math.random() * validReds.length)];

    // Pick 2 non-overlapping b14 pieces
    const freeB14 = validB14.filter(p => (p.mask & red.mask) === 0n);
    if (freeB14.length < 2) continue;
    const b14aIdx = Math.floor(Math.random() * freeB14.length);
    const b14a = freeB14[b14aIdx];

    const freeB14b = freeB14.filter(p => (p.mask & b14a.mask) === 0n);
    if (freeB14b.length === 0) continue;
    const b14b = freeB14b[Math.floor(Math.random() * freeB14b.length)];

    const usedAfter14 = red.mask | b14a.mask | b14b.mask;

    // Pick 4 non-overlapping b12 pieces using random shuffle + greedy selection
    const freeB12 = validB12.filter(p => (p.mask & usedAfter14) === 0n);
    if (freeB12.length < 4) continue;

    // Fisher-Yates shuffle
    for (let i = freeB12.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = freeB12[i]; freeB12[i] = freeB12[j]; freeB12[j] = tmp;
    }
    const b12arr = [];
    let usedB12 = 0n;
    for (const p of freeB12) {
      if ((p.mask & usedB12) === 0n) {
        b12arr.push(p);
        usedB12 |= p.mask;
        if (b12arr.length === 4) break;
      }
    }
    if (b12arr.length < 4) continue;
    if (!isL4SampleCompatible(red, b14a, b14b, b12arr, observedGrid)) continue;
    totalBoards++;

    for (const k of red.cells) {
      const i = unknownIndexByKey.get(k);
      if (i !== undefined) redW[i]++;
    }

    for (const [bp, is4] of [[b14a, true], [b14b, true], [b12arr[0], false], [b12arr[1], false], [b12arr[2], false], [b12arr[3], false]]) {
      const isH = bp.orientation === 'h';
      for (let ci = 0; ci < bp.cells.length; ci++) {
        const ii = unknownIndexByKey.get(bp.cells[ci]);
        if (ii === undefined) continue;
        blueW[ii]++;
        if (isH) {
          if (ci === 0)              blueHlW[ii]++;
          else if (is4 && ci === 1)  blueHm2W[ii]++;
          else if (is4 && ci === 2)  blueHm3W[ii]++;
          else                       blueHrW[ii]++;
        } else {
          if (ci === 0)              blueVtW[ii]++;
          else if (is4 && ci === 1)  blueVm2W[ii]++;
          else if (is4 && ci === 2)  blueVm3W[ii]++;
          else                       blueVbW[ii]++;
        }
      }
    }
  }

  if (totalBoards === 0) return { bestCells: [], topCells: [], allCells: [], forcedGuaranteed: false, totalBoards: 0 };

  const scored = allUnknown.map(([r, c], i) => {
    const redP  = redW[i]  / totalBoards;
    const blueP = blueW[i] / totalBoards;
    const anyP  = redP + blueP;
    const checkerBonus = (r + c) % 2 === 0 ? 0.01 : 0;
    let score = anyP;
    if (optimizer === "rare-focus")         score = redP;
    else if (optimizer === "common-focus")  score = blueP;
    else if (optimizer === "checkerboard")  score = anyP + checkerBonus;
    return {
      r, c, score, anyP,
      purpleP: 0, greenP: 0, blueP, yellowP: 0, redP,
      blueLabelP: {
        'blue-h-l':  blueHlW[i]  / totalBoards,
        'blue-h-m2': blueHm2W[i] / totalBoards,
        'blue-h-m3': blueHm3W[i] / totalBoards,
        'blue-h-r':  blueHrW[i]  / totalBoards,
        'blue-v-t':  blueVtW[i]  / totalBoards,
        'blue-v-m2': blueVm2W[i] / totalBoards,
        'blue-v-m3': blueVm3W[i] / totalBoards,
        'blue-v-b':  blueVbW[i]  / totalBoards,
      },
    };
  });

  const maxAnyP = scored.reduce((m, x) => Math.max(m, x.anyP), 0);
  if (maxAnyP <= 1e-12) return { bestCells: [], topCells: [], allCells: scored, forcedGuaranteed: false, totalBoards };

  const guaranteed = scored.filter(x => Math.abs(x.anyP - 1) < 1e-12);
  if (guaranteed.length > 0) {
    const gs = guaranteed.slice().sort((a, b) => {
      if (Math.abs(b.redP  - a.redP)  > 1e-12) return b.redP  - a.redP;
      if (Math.abs(b.blueP - a.blueP) > 1e-12) return b.blueP - a.blueP;
      return a.r !== b.r ? a.r - b.r : a.c - b.c;
    });
    return { bestCells: gs.map(x => [x.r, x.c]), topCells: gs.slice(0, 10), allCells: scored, forcedGuaranteed: true, totalBoards };
  }

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const bestCells = scored.filter(x => Math.abs(x.score - bestScore) < 1e-12).map(x => [x.r, x.c]);
  return { bestCells, topCells: scored.slice(0, 10), allCells: scored, forcedGuaranteed: false, totalBoards };
}

// ==================== (legacy sampling, no longer used for level 3) ====================

function sampleConsistentBoardsLevel3(level, observedGrid, config) {
  const { rows, cols, pieces } = config;
  const boards = [];
  const pieceInstances = expandPieceInstances(level, pieces);

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
    if (isBoardConsistent(level, board, observedGrid)) {
      boards.push(board);
    }
  }

  return boards;
}

function expandPieceInstances(level, pieces) {
  const out = [];
  for (const piece of pieces) {
    const count = piece.count || 1;
    for (let i = 0; i < count; i++) {
      const forceBlueRotatable = level === 3 && piece.type === "blue";
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
  const [baseRows, baseCols] = piece.size;
  const sizeOptions = [{ rows: baseRows, cols: baseCols, orientation: "h" }];
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
        placements.push({ anchor: [r, c], orientation: size.orientation, cells });
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
      bluePieces.push({ anchor: placement.anchor, orientation: placement.orientation, cells: placement.cells, size: placement.size });
    } else if (placement.type === "yellow") {
      placement.cells.forEach((cell) => yellowSet.add(cell));
      yellowAnchor = placement.anchor;
    }
  }

  return { purpleAnchor, purpleSet, greenSet, blueSet, bluePieces, yellowSet, yellowAnchor };
}

function isBoardConsistent(level, board, observedGrid) {
  const config = LEVELS[level];
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

      if (observed.startsWith("blue-")) {
        if (!isBlue) return false;
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
