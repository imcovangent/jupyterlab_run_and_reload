import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ICommandPalette } from '@jupyterlab/apputils';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { toArray } from '@lumino/algorithm';

import { NotebookActions, NotebookPanel } from '@jupyterlab/notebook';

import { Widget } from '@lumino/widgets';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { LabIcon } from '@jupyterlab/ui-components';

import playInFileIconStr from '../style/play-in-file.svg';

namespace CommandIDs {
  export const runAndReloadAll = 'run-and-reload:run-all-cells-and-reload';
}

// TODO: Change category to run items
const PALETTE_CATEGORY = 'Run and reload extension';

// Default settings, kept in sync with schema/plugin.json.
const DEFAULT_AUTO_RELOAD_ENABLED = true;
const DEFAULT_AUTO_RELOAD_INTERVAL_MS = 1500;
const MIN_AUTO_RELOAD_INTERVAL_MS = 250;
const DEFAULT_WATCHED_EXTENSIONS = ['.pdf'];

/**
 * Watches every open viewer whose file has a watched extension (PDFs by
 * default; configurable via the `watchedFileExtensions` setting) and reverts it
 * whenever its file changes on disk, no matter what caused the change (this
 * extension's own command, an MCP / coding agent running the notebook
 * headlessly, a terminal, cron, ...).
 *
 * The extension command reaches into the browser to reload files, but a
 * headless MCP run of the notebook has no browser handle and cannot do that.
 * Detecting the change on disk instead keeps the reload decoupled from whatever
 * triggered the regeneration, so both paths (and any other) work with no
 * coupling.
 *
 * Detection is a periodic poll of each open file's `last_modified` via the
 * contents API rather than the context's `fileChanged` signal: a file that is
 * only being viewed (not edited) does not otherwise poll itself, so the signal
 * would not fire on an out-of-band regeneration.
 *
 * After reverting, the tab is activated. A hidden tab does not re-render on
 * revert while it is not the visible tab, so activating it both surfaces the
 * updated document and forces the render. Widgets (not just contexts) are
 * tracked so each open tab has a handle to activate.
 */
class PdfAutoReloader {
  constructor(shell: JupyterFrontEnd.IShell, manager: IDocumentManager) {
    this._shell = shell;
    this._manager = manager;
  }

  /** Apply settings; (re)starts or stops the poll loop as needed. */
  configure(enabled: boolean, intervalMs: number, extensions: string[]): void {
    this._enabled = enabled;
    this._intervalMs = Math.max(MIN_AUTO_RELOAD_INTERVAL_MS, intervalMs);
    this._extensions = PdfAutoReloader.normalizeExtensions(extensions);
    this._stopTimer();
    if (this._enabled) {
      this._timer = window.setInterval(() => {
        void this._tick();
      }, this._intervalMs);
    }
  }

  /** Lower-case each extension and ensure a leading dot; drop blanks. */
  private static normalizeExtensions(extensions: string[]): string[] {
    const normalized: string[] = [];
    for (const raw of extensions) {
      const ext = raw.trim().toLowerCase();
      if (ext) {
        normalized.push(ext.startsWith('.') ? ext : `.${ext}`);
      }
    }
    return normalized;
  }

  private _isWatched(path: string): boolean {
    const lower = path.toLowerCase();
    return this._extensions.some(ext => lower.endsWith(ext));
  }

  private _stopTimer(): void {
    if (this._timer !== null) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** One poll cycle: discover open watched tabs, then reload any that changed. */
  private async _tick(): Promise<void> {
    // Discover currently open watched tabs (including hidden ones) and record a
    // baseline mtime for any we have not seen before (no reload on first sight).
    const openWidgets = new Set<Widget>();
    for (const widget of toArray(this._shell.widgets())) {
      const context = this._manager.contextForWidget(widget);
      if (!context || !this._isWatched(context.path)) {
        continue;
      }
      openWidgets.add(widget);
      if (!this._known.has(widget)) {
        this._known.set(widget, {
          context,
          lastModified: context.contentsModel?.last_modified ?? null,
          reverting: false
        });
      }
    }

    // Drop tabs that are no longer open.
    for (const widget of this._known.keys()) {
      if (!openWidgets.has(widget)) {
        this._known.delete(widget);
      }
    }

    // Check each open watched file for an on-disk change and reload if needed.
    await Promise.all(
      Array.from(openWidgets).map(widget => this._maybeReload(widget))
    );
  }

  private async _maybeReload(widget: Widget): Promise<void> {
    const state = this._known.get(widget);
    if (!state || state.reverting) {
      return;
    }
    let lastModified: string;
    try {
      const model = await this._manager.services.contents.get(
        state.context.path,
        { content: false }
      );
      lastModified = model.last_modified;
    } catch {
      // File may have been deleted or is temporarily unreadable; skip this tick.
      return;
    }
    if (state.lastModified === null) {
      state.lastModified = lastModified;
      return;
    }
    if (lastModified !== state.lastModified) {
      state.lastModified = lastModified;
      state.reverting = true;
      try {
        await state.context.revert();
        // Activate the tab so a hidden file actually re-renders (and the view
        // switches to it). Activating the already-visible tab is a no-op.
        this._shell.activateById(widget.id);
      } catch {
        // Ignore; a later tick will retry if the file changes again.
      } finally {
        state.reverting = false;
      }
    }
  }

  private _shell: JupyterFrontEnd.IShell;
  private _manager: IDocumentManager;
  private _enabled = false;
  private _intervalMs = DEFAULT_AUTO_RELOAD_INTERVAL_MS;
  private _extensions = DEFAULT_WATCHED_EXTENSIONS;
  private _timer: number | null = null;
  private _known = new Map<
    Widget,
    {
      context: DocumentRegistry.Context;
      lastModified: string | null;
      reverting: boolean;
    }
  >();
}

/**
 * Initialization data for the jupyterlab_run_and_reload extension.
 *
 * TODOs:
 * - Add setting: only reload visible widgets or not
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_run_and_reload:plugin',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [ISettingRegistry, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    manager: IDocumentManager,
    settingRegistry: ISettingRegistry | null,
    palette: ICommandPalette | null
  ) => {
    console.log('JupyterLab extension jupyterlab_run_and_reload is activated!');

    const { shell, commands } = app;

    // Auto-reload open PDFs when their file changes on disk. This is what makes
    // headless notebook runs (e.g. via the Jupyter MCP / coding agents) refresh
    // open PDFs too, without any coupling to how the run was triggered.
    const autoReloader = new PdfAutoReloader(shell, manager);
    autoReloader.configure(
      DEFAULT_AUTO_RELOAD_ENABLED,
      DEFAULT_AUTO_RELOAD_INTERVAL_MS,
      DEFAULT_WATCHED_EXTENSIONS
    );

    if (settingRegistry) {
      const applySettings = (settings: ISettingRegistry.ISettings) => {
        const enabled = settings.get('autoReloadEnabled').composite as boolean;
        const intervalMs = settings.get('autoReloadIntervalMs')
          .composite as number;
        const extensions = settings.get('watchedFileExtensions')
          .composite as string[];
        autoReloader.configure(
          enabled ?? DEFAULT_AUTO_RELOAD_ENABLED,
          intervalMs ?? DEFAULT_AUTO_RELOAD_INTERVAL_MS,
          extensions ?? DEFAULT_WATCHED_EXTENSIONS
        );
      };
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log(
            'jupyterlab_run_and_reload settings loaded:',
            settings.composite
          );
          applySettings(settings);
          settings.changed.connect(applySettings);
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab_run_and_reload.',
            reason
          );
        });
    }

    const icon = new LabIcon({
      name: 'run-and-reload:play-in-file-icon',
      svgstr: playInFileIconStr
    });

    // Just run all cells: reloading of open PDFs is now handled automatically
    // by the PdfAutoReloader watcher when the files change on disk, so this
    // command no longer needs to find and revert PDF widgets itself.
    //
    // Use runCells rather than runAll: runAll moves the active cell to the last
    // cell and scrolls there, which is jarring. runCells runs every cell while
    // preserving the current selection and scroll position (cf. PR #15).
    async function runAllCells(): Promise<void> {
      const currentWidget = shell.currentWidget;
      if (!(currentWidget instanceof NotebookPanel)) {
        return;
      }
      await NotebookActions.runCells(
        currentWidget.content,
        currentWidget.content.widgets,
        currentWidget.sessionContext
      );
    }

    commands.addCommand(CommandIDs.runAndReloadAll, {
      label: 'Run All Cells and Reload PDFs',
      caption:
        'Run all the cells of the notebook. Open PDFs are reloaded automatically when they change on disk.',
      icon: args => (args['ignoreIcon'] ? undefined : icon),
      isEnabled: () => shell.currentWidget instanceof NotebookPanel,
      execute: runAllCells
    });

    // Add the command to the palette
    if (palette) {
      palette.addItem({
        command: CommandIDs.runAndReloadAll,
        args: { ignoreIcon: true },
        category: PALETTE_CATEGORY
      });
    }
  }
};

export default plugin;
