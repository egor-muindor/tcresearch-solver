import './ui/app.css';

import { buildAspectData } from './data/aspects';
import type { Aspect } from './data/aspects';
import {
  createBoard,
  setState,
  getState,
  serializeBoard,
  deserializeBoard,
  validate,
  anchorCells,
  filledCells,
} from './core/board';
import type { Board, ValidationError } from './core/board';
import type { Hex } from './core/hex';
import { MAX_ANCHORS, budgetForRadius } from './core/solver';
import type { Progress } from './core/solver';
import type { AllocationResult } from './core/inventory';
import type { SerializableResult } from './worker/protocol';
import { SolverClient } from './worker/solverClient';
import { saveState, loadState } from './state/persistence';
import type { AppState } from './state/persistence';
import { BoardView } from './ui/boardView';
import { AspectPalette } from './ui/aspectPalette';
import { InventoryPanel } from './ui/inventoryPanel';
import { Toolbar } from './ui/toolbar';
import type { ToolName } from './ui/toolbar';
import { statusLabel, costLabel } from './ui/format';
import { startTour } from './ui/tour';
import type { TourStep } from './ui/tour';

// --- constants ---
const DEFAULT_RADIUS = 2;
const DEFAULT_THRESHOLD = 50;
const DEFAULT_ADDONS: readonly string[] = ['fm', 'mb', 'gt'];

// --- build aspect data ---
const data = buildAspectData({ addons: [...DEFAULT_ADDONS] });

// --- app state ---
let board: Board = createBoard(DEFAULT_RADIUS);
let supply = new Map<Aspect, number>();
let threshold = DEFAULT_THRESHOLD;
let addons: string[] = [...DEFAULT_ADDONS];
let activeTool: ToolName | null = null;
let activeBrush: Aspect | null = null;
let lastAllocation: AllocationResult | null = null;
let solverClient: SolverClient | null = null;

// mode: 'anchor' (clicks place ANCHORs) vs 'manual' (clicks place PLACED{locked:true})
let placeMode: 'anchor' | 'manual' = 'anchor';
let accountSupply = false;

// --- build the shell DOM ---
const appRoot = document.getElementById('app')!;
appRoot.innerHTML = '';

// Header / toolbar
const headerEl = document.createElement('header');
headerEl.className = 'app-header';
appRoot.appendChild(headerEl);

const toolbarContainer = document.createElement('div');
toolbarContainer.className = 'toolbar-container';
headerEl.appendChild(toolbarContainer);

// Progress bar row (hidden by default)
const progressRow = document.createElement('div');
progressRow.className = 'progress-row';
progressRow.style.display = 'none';
headerEl.appendChild(progressRow);

const progressBar = document.createElement('progress');
progressBar.className = 'progress-bar';
progressBar.removeAttribute('value'); // indeterminate
progressRow.appendChild(progressBar);

const progressLabel = document.createElement('span');
progressLabel.className = 'progress-label';
progressLabel.textContent = '';
progressRow.appendChild(progressLabel);

const cancelBtn = document.createElement('button');
cancelBtn.type = 'button';
cancelBtn.className = 'cancel-btn';
cancelBtn.textContent = 'Cancel';
cancelBtn.addEventListener('click', () => {
  solverClient?.cancel();
});
progressRow.appendChild(cancelBtn);

// Status bar
const statusBar = document.createElement('div');
statusBar.className = 'status-bar';
statusBar.style.display = 'none';
headerEl.appendChild(statusBar);

// Main 3-column layout
const mainEl = document.createElement('main');
mainEl.className = 'app-main';
appRoot.appendChild(mainEl);

const paletteContainer = document.createElement('div');
paletteContainer.className = 'col-palette';
mainEl.appendChild(paletteContainer);

// mode-toggle for anchor vs manual
const modeSwitchRow = document.createElement('div');
modeSwitchRow.className = 'mode-switch-row';
paletteContainer.appendChild(modeSwitchRow);

const modeSwitchLabel = document.createElement('span');
modeSwitchLabel.textContent = 'Mode:';
modeSwitchLabel.className = 'mode-switch-label';
modeSwitchRow.appendChild(modeSwitchLabel);

const anchorModeBtn = document.createElement('button');
anchorModeBtn.type = 'button';
anchorModeBtn.textContent = 'Anchor';
anchorModeBtn.className = 'mode-btn mode-btn--active';
anchorModeBtn.addEventListener('click', () => {
  placeMode = 'anchor';
  anchorModeBtn.classList.add('mode-btn--active');
  manualModeBtn.classList.remove('mode-btn--active');
});
modeSwitchRow.appendChild(anchorModeBtn);

const manualModeBtn = document.createElement('button');
manualModeBtn.type = 'button';
manualModeBtn.textContent = 'Manual';
manualModeBtn.className = 'mode-btn';
manualModeBtn.addEventListener('click', () => {
  placeMode = 'manual';
  manualModeBtn.classList.add('mode-btn--active');
  anchorModeBtn.classList.remove('mode-btn--active');
});
modeSwitchRow.appendChild(manualModeBtn);

const boardContainer = document.createElement('div');
boardContainer.className = 'col-board';
mainEl.appendChild(boardContainer);

const inventoryContainer = document.createElement('div');
inventoryContainer.className = 'col-inventory';
mainEl.appendChild(inventoryContainer);

// Footer attribution (spec §8)
const footerEl = document.createElement('footer');
footerEl.className = 'app-footer';
footerEl.innerHTML =
  'Aspect data &amp; icons &copy; original authors, ' +
  '<a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC-BY-4.0</a>. ' +
  'Original sources: <a href="https://github.com/ythri/tcresearch" target="_blank" rel="noopener noreferrer">ythri/tcresearch</a> ' +
  '&middot; <a href="http://ythri.github.io/tcresearch/" target="_blank" rel="noopener noreferrer">ythri.github.io/tcresearch</a>';
appRoot.appendChild(footerEl);

// --- persistence helpers ---
function currentAppState(): AppState {
  return {
    schemaVersion: 1,
    radius: board.radius,
    addons: [...addons],
    threshold,
    supply: [...supply.entries()].filter(([, n]) => n > 0),
    board: serializeBoard(board),
    accountSupply,
  };
}

function persist(): void {
  saveState(currentAppState());
}

// --- solver helpers ---
function getSupplyArray(): Array<[string, number]> {
  return [...supply.entries()].filter(([, n]) => n > 0);
}

function updateAnchorCap(): void {
  const count = anchorCells(board).length;
  toolbar.disableAutoSolve(count > MAX_ANCHORS);
}

function showStatus(msg: string): void {
  statusBar.textContent = msg;
  statusBar.style.display = msg ? 'block' : 'none';
}

function showProgress(visible: boolean): void {
  progressRow.style.display = visible ? 'flex' : 'none';
}

function onProgress(p: Progress): void {
  // Progress.best is Cost | null; costLabel accepts Cost | undefined — coerce null -> undefined
  progressLabel.textContent =
    'nodes: ' + p.nodes + ' - ' + costLabel(p.best ?? undefined) + ' - ' + Math.round(p.timeMs) + 'ms - ' + p.status;
}

function applyResult(result: SerializableResult): void {
  showProgress(false);
  solverClient = null;

  showStatus(statusLabel(result.status));

  if (result.board) {
    try {
      board = deserializeBoard(data, result.board);
    } catch {
      showStatus('Board deserialization error');
    }
  }

  const errors: ValidationError[] = result.errors
    ? result.errors.map((e) => ({
        type: e.type as ValidationError['type'],
        cells: e.cells.map((c) => ({ q: c.q, r: c.r })),
      }))
    : [];

  boardView.render(board, errors);
  updateAnchorCap();

  // Store allocation for Subtract used
  if (result.allocation) {
    lastAllocation = {
      feasible: result.allocation.feasible,
      scarcityCost: result.allocation.scarcityCost,
      craftOps: result.allocation.craftOps,
      leafConsumption: new Map(result.allocation.leafConsumption),
    };
    inventoryPanel.setAllocation(lastAllocation);
  } else {
    lastAllocation = null;
    inventoryPanel.clearAllocation();
  }

  persist();
}

async function runSolve(): Promise<void> {
  const anchorCount = anchorCells(board).length;
  if (anchorCount > MAX_ANCHORS) {
    showStatus('Too many anchors: ' + anchorCount + ' (max ' + MAX_ANCHORS + ')');
    return;
  }

  // Cancel any running solve first
  solverClient?.cancel();

  const client = new SolverClient();
  solverClient = client;

  const supplyReq = accountSupply
    ? getSupplyArray()
    : [...data.universe].map((a) => [a, 1_000_000] as [string, number]);
  const thresholdReq = accountSupply ? threshold : 1;

  const req = {
    version: '4.2.2.0' as const,
    addons: [...addons],
    board: serializeBoard(board),
    supply: supplyReq,
    threshold: thresholdReq,
    budget: budgetForRadius(board.radius),
  };

  showProgress(true);
  progressLabel.textContent = 'Running...';
  showStatus('');

  try {
    const result = await client.solve(req, onProgress);
    applyResult(result);
  } catch (err) {
    showProgress(false);
    solverClient = null;
    const message = err instanceof Error ? err.message : String(err);
    showStatus('Error: ' + message);
  }
}

// --- board-tools active-state management ---
let boardToolsBtns = new Map<ToolName, HTMLButtonElement>();

function setBoardToolActive(name: ToolName | null): void {
  for (const [toolName, btn] of boardToolsBtns) {
    if (toolName === name) {
      btn.classList.add('board-tools__btn--active');
    } else {
      btn.classList.remove('board-tools__btn--active');
    }
  }
}

// --- core tool handler (factored so toolbar + board-tools row both call it) ---
function handleTool(name: ToolName): void {
  activeTool = name;
  switch (name) {
    case 'deadHex':
    case 'erase':
      // toggle-mode tools: active until user picks another
      // highlight the board-tools button
      setBoardToolActive(name);
      toolbar.setActiveTool(null); // toolbar no longer has these
      break;
    case 'clear': {
      const ok = confirm('Clear all cells?');
      if (ok) {
        board = createBoard(board.radius);
        lastAllocation = null;
        inventoryPanel.clearAllocation();
        boardView.render(board);
        updateAnchorCap();
        persist();
      }
      // Clear is an action, reset active tool
      activeTool = null;
      toolbar.setActiveTool(null);
      setBoardToolActive(null);
      break;
    }
    case 'autoSolve':
      activeTool = null;
      toolbar.setActiveTool(null);
      setBoardToolActive(null);
      void runSolve();
      break;
    case 'validate': {
      const vr = validate(data, board);
      boardView.render(board, vr.errors);
      showStatus(vr.valid ? 'Board is valid' : ('Errors: ' + vr.errors.length));
      activeTool = null;
      toolbar.setActiveTool(null);
      setBoardToolActive(null);
      break;
    }
    case 'continueSolve': {
      // Mark all current manual PLACED as locked:true
      for (const cell of filledCells(board)) {
        if (!cell.isAnchor) {
          setState(board, cell.hex, { kind: 'PLACED', aspect: cell.aspect, locked: true });
        }
      }
      activeTool = null;
      toolbar.setActiveTool(null);
      setBoardToolActive(null);
      void runSolve();
      break;
    }
  }
}

// --- UI component callbacks ---

const toolbar = new Toolbar(toolbarContainer, {
  onRadiusChange: (r: number) => {
    const filled = filledCells(board);
    if (filled.length > 0) {
      const ok = confirm(
        'Changing the radius will reset the board (' + filled.length + ' filled cells). Continue?',
      );
      if (!ok) return;
    }
    board = createBoard(r);
    lastAllocation = null;
    inventoryPanel.clearAllocation();
    boardView.render(board);
    updateAnchorCap();
    persist();
  },
  onTool: (name: ToolName) => {
    handleTool(name);
  },
});

// Set toolbar radius to match initial board radius
// (Toolbar defaults to 3, but we need to sync to 2 on fresh start)
// Access via the select — we'll trigger onRadiusChange only after the board is built
// Actually, we just need to reflect current radius to toolbar; the select is internal.
// We'll reset it via a direct select access after restore (below).

const boardView = new BoardView(boardContainer, data, (h) => {
  // Cell click handler
  const state = getState(board, h);

  if (activeTool === 'deadHex') {
    // Toggle DEAD
    if (state.kind === 'DEAD') {
      setState(board, h, { kind: 'EMPTY' });
    } else {
      setState(board, h, { kind: 'DEAD' });
    }
    boardView.render(board);
    updateAnchorCap();
    persist();
    return;
  }

  if (activeTool === 'erase') {
    setState(board, h, { kind: 'EMPTY' });
    boardView.render(board);
    updateAnchorCap();
    persist();
    return;
  }

  // Aspect brush
  if (activeBrush !== null) {
    if (placeMode === 'anchor') {
      // Toggle: if already ANCHOR with same aspect, erase
      if (state.kind === 'ANCHOR' && state.aspect === activeBrush) {
        setState(board, h, { kind: 'EMPTY' });
      } else {
        setState(board, h, { kind: 'ANCHOR', aspect: activeBrush });
      }
    } else {
      // manual mode: PLACED{locked:true}
      if (state.kind === 'PLACED' && state.aspect === activeBrush && state.locked) {
        setState(board, h, { kind: 'EMPTY' });
      } else {
        setState(board, h, { kind: 'PLACED', aspect: activeBrush, locked: true });
      }
    }
    boardView.render(board);
    updateAnchorCap();
    persist();
  }
});

const palette = new AspectPalette(paletteContainer, data, (aspect: Aspect) => {
  activeBrush = aspect;
  // Deactivate dead/erase mode when picking an aspect
  if (activeTool === 'deadHex' || activeTool === 'erase') {
    activeTool = null;
    toolbar.setActiveTool(null);
    setBoardToolActive(null);
  }
});

// Wire up drag-drop: treat drop as selecting that brush + clicking that cell.
boardView.setOnCellDrop((h: Hex, aspect: string) => {
  const resolvedAspect = aspect as Aspect;
  if (!data.universe.has(resolvedAspect)) return;

  // Select the brush in the palette
  activeBrush = resolvedAspect;
  palette.setActiveBrush(resolvedAspect);
  // Deactivate dead/erase mode
  if (activeTool === 'deadHex' || activeTool === 'erase') {
    activeTool = null;
    toolbar.setActiveTool(null);
    setBoardToolActive(null);
  }

  // Place following current placeMode
  if (placeMode === 'anchor') {
    setState(board, h, { kind: 'ANCHOR', aspect: resolvedAspect });
  } else {
    setState(board, h, { kind: 'PLACED', aspect: resolvedAspect, locked: true });
  }
  boardView.render(board);
  updateAnchorCap();
  persist();
});

const inventoryPanel = new InventoryPanel(inventoryContainer, data, {
  onSupplyChange: (aspect: Aspect, count: number) => {
    if (count > 0) {
      supply.set(aspect, count);
    } else {
      supply.delete(aspect);
    }
    persist();
  },
  onThresholdChange: (n: number) => {
    threshold = n;
    persist();
  },
  onSubtractUsed: () => {
    if (!lastAllocation) {
      showStatus('No usage data');
      return;
    }
    for (const [aspect, used] of lastAllocation.leafConsumption) {
      const current = supply.get(aspect) ?? 0;
      const next = Math.max(0, Math.floor(current - used));
      if (next > 0) {
        supply.set(aspect, next);
      } else {
        supply.delete(aspect);
      }
      inventoryPanel.setSupply(aspect, next);
    }
    persist();
    showStatus('Used aspects subtracted');
  },
  onAccountChange: (enabled: boolean) => {
    accountSupply = enabled;
    persist();
  },
});

// --- board-tools row (Dead Hex / Erase / Clear) below the board SVG ---
const boardToolsRow = document.createElement('div');
boardToolsRow.className = 'board-tools';

const BOARD_TOOL_DEFS: Array<{ name: ToolName; label: string; isToggle: boolean }> = [
  { name: 'deadHex', label: 'Dead Hex', isToggle: true },
  { name: 'erase',   label: 'Erase',    isToggle: true },
  { name: 'clear',   label: 'Clear',    isToggle: false },
];

for (const def of BOARD_TOOL_DEFS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'board-tools__btn';
  btn.textContent = def.label;
  btn.setAttribute('data-tool', def.name);

  btn.addEventListener('click', () => {
    if (def.isToggle) {
      // If already active, toggle off
      if (activeTool === def.name) {
        activeTool = null;
        setBoardToolActive(null);
      } else {
        handleTool(def.name);
      }
    } else {
      handleTool(def.name);
    }
  });

  boardToolsBtns.set(def.name, btn);
  boardToolsRow.appendChild(btn);
}

boardContainer.appendChild(boardToolsRow);

// --- restore persisted state or apply defaults ---
function restoreState(): void {
  const saved = loadState(data);
  if (saved) {
    board = deserializeBoard(data, saved.board);
    threshold = saved.threshold;
    addons = saved.addons;
    supply = new Map(saved.supply);
    accountSupply = saved.accountSupply;

    // Sync threshold to panel
    inventoryPanel['thresholdInput'].value = String(threshold);

    // Sync supply inputs
    for (const [aspect, count] of supply) {
      inventoryPanel.setSupply(aspect, count);
    }

    // Sync account toggle
    inventoryPanel.setAccountEnabled(accountSupply);

    // Sync toolbar radius: set the select value directly
    const radiusSelect = toolbarContainer.querySelector<HTMLSelectElement>('#toolbar-radius');
    if (radiusSelect) {
      radiusSelect.value = String(board.radius);
    }
  } else {
    // defaults: radius 2, empty board, threshold 50, empty supply
    board = createBoard(DEFAULT_RADIUS);
    threshold = DEFAULT_THRESHOLD;
    addons = [...DEFAULT_ADDONS];
    supply = new Map();
    accountSupply = false;
    inventoryPanel.setAccountEnabled(false);

    const radiusSelect = toolbarContainer.querySelector<HTMLSelectElement>('#toolbar-radius');
    if (radiusSelect) {
      radiusSelect.value = String(DEFAULT_RADIUS);
    }
  }
}

restoreState();
boardView.render(board);
updateAnchorCap();

// Suppress unused variable warning: palette is used for side effects (event handlers, DOM)
void palette;

// --- Help button + guided tour ---
const TOUR_STEPS: TourStep[] = [
  {
    selector: '.col-palette',
    title: 'Aspects',
    text: 'Pick an aspect: click to select it as a brush, or drag it straight onto a board cell.',
  },
  {
    selector: '.col-board',
    title: 'Board',
    text: 'Place anchors here. With an aspect selected, click an empty cell (Anchor mode) or drag an icon onto it.',
  },
  {
    selector: '.board-tools',
    title: 'Edit tools',
    text: 'Block a cell with Dead Hex, remove one with Erase, or reset everything with Clear.',
  },
  {
    selector: '.mode-switch-row',
    title: 'Mode',
    text: 'Switch between placing Anchors and Manual aspects.',
  },
  {
    selector: '.col-inventory',
    title: 'Inventory',
    text: 'Optionally enter your aspect counts. Account for inventory makes the solver respect scarcity; leave it off to just connect the anchors.',
  },
  {
    selector: '.toolbar',
    title: 'Solve',
    text: 'Auto Solve fills the board to connect all anchors. Validate checks a manual board; Continue Solve finishes a partial chain.',
  },
];

const helpBtn = document.createElement('button');
helpBtn.type = 'button';
helpBtn.className = 'help-btn';
helpBtn.textContent = '?';
helpBtn.setAttribute('aria-label', 'Help / guided tour');
helpBtn.addEventListener('click', () => {
  startTour(TOUR_STEPS);
});
document.body.appendChild(helpBtn);
