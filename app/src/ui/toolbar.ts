export type ToolName =
  | 'deadHex'
  | 'erase'
  | 'clear'
  | 'autoSolve'
  | 'validate'
  | 'continueSolve';

export interface ToolbarCallbacks {
  onRadiusChange: (r: number) => void;
  onTool: (name: ToolName) => void;
}

interface ButtonDef {
  name: ToolName;
  label: string;
  /** If true, this is an action (no active state toggle). */
  action?: boolean;
}

const BUTTONS: ButtonDef[] = [
  { name: 'autoSolve',     label: 'Auto Solve', action: true },
  { name: 'validate',      label: 'Validate', action: true },
  { name: 'continueSolve', label: 'Continue Solve', action: true },
];

export class Toolbar {
  private radiusSelect!: HTMLSelectElement;
  private toolBtns = new Map<ToolName, HTMLButtonElement>();
  private autoSolveWarning!: HTMLElement;
  private activeToolName: ToolName | null = null;

  constructor(
    private container: HTMLElement,
    private callbacks: ToolbarCallbacks,
  ) {
    this.container.classList.add('toolbar');
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Radius selector
    const radiusGroup = document.createElement('div');
    radiusGroup.className = 'toolbar__group';

    const radiusLabel = document.createElement('label');
    radiusLabel.textContent = 'Radius:';
    radiusLabel.className = 'toolbar__label';
    radiusLabel.htmlFor = 'toolbar-radius';

    this.radiusSelect = document.createElement('select');
    this.radiusSelect.id = 'toolbar-radius';
    this.radiusSelect.className = 'toolbar__radius-select';
    for (let r = 2; r <= 5; r++) {
      const opt = document.createElement('option');
      opt.value = String(r);
      opt.textContent = String(r);
      if (r === 3) opt.selected = true;
      this.radiusSelect.appendChild(opt);
    }
    this.radiusSelect.addEventListener('change', () => {
      const r = parseInt(this.radiusSelect.value, 10);
      if (r >= 2 && r <= 5) this.callbacks.onRadiusChange(r);
    });

    radiusGroup.appendChild(radiusLabel);
    radiusGroup.appendChild(this.radiusSelect);
    this.container.appendChild(radiusGroup);

    // Tool buttons
    const toolGroup = document.createElement('div');
    toolGroup.className = 'toolbar__group';

    for (const def of BUTTONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toolbar__btn';
      btn.textContent = def.label;
      btn.setAttribute('data-tool', def.name);

      btn.addEventListener('click', () => {
        if (!def.action) {
          // Toggle-mode tools track active state
          this.setActiveTool(def.name);
        }
        this.callbacks.onTool(def.name);
      });

      this.toolBtns.set(def.name, btn);
      toolGroup.appendChild(btn);
    }

    // Auto-solve warning (hidden by default)
    this.autoSolveWarning = document.createElement('span');
    this.autoSolveWarning.className = 'toolbar__warning';
    this.autoSolveWarning.style.display = 'none';
    this.autoSolveWarning.textContent = 'Too many anchors (>8)';
    toolGroup.appendChild(this.autoSolveWarning);

    this.container.appendChild(toolGroup);
  }

  // --- public API ---

  /** Get currently selected radius (2..5). */
  getRadius(): number {
    return parseInt(this.radiusSelect.value, 10);
  }

  /** Set the active toggle-tool button (does NOT fire onTool). */
  setActiveTool(name: ToolName | null): void {
    if (this.activeToolName !== null) {
      const prev = this.toolBtns.get(this.activeToolName);
      if (prev) prev.classList.remove('toolbar__btn--active');
    }
    this.activeToolName = name;
    if (name !== null) {
      const el = this.toolBtns.get(name);
      if (el) el.classList.add('toolbar__btn--active');
    }
  }

  /** Disable Auto Solve button and show the anchor-cap warning. */
  disableAutoSolve(disabled: boolean): void {
    const btn = this.toolBtns.get('autoSolve');
    if (btn) btn.disabled = disabled;
    this.autoSolveWarning.style.display = disabled ? 'inline' : 'none';
  }
}
