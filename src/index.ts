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
import fastforwardInFileIconStr from '../style/fastforward-in-file.svg';

namespace CommandIDs {
  export const runAndReloadAll = 'run-and-reload:run-all-cells-and-reload';
  export const restartRunAndReloadAll =
    'run-and-reload:restart-run-all-cells-and-reload';
  // TODO: Import this from notebook extension
  export const restart = 'notebook:restart-kernel';
}

// TODO: Change category to run items
const PALETTE_CATEGORY = 'Run and reload extension';

// Default settings, kept in sync with schema/plugin.json.
const DEFAULT_AUTO_RELOAD_ENABLED = true;
const DEFAULT_AUTO_RELOAD_INTERVAL_MS = 1500;
const MIN_AUTO_RELOAD_INTERVAL_MS = 250;

/**
 * Watches every open PDF viewer and reverts it whenever its file changes on
 * disk, no matter what caused the change (this extension's own command, an
 * MCP / coding agent running the notebook headlessly, a terminal, cron, ...).
 *
 * The extension command reaches into the browser to reload PDFs, but a headless
 * MCP run of the notebook has no browser handle and cannot do that. Detecting
 * the change on disk instead keeps the reload decoupled from whatever triggered
 * the regeneration, so both paths (and any other) work with no coupling.
 *
 * Detection is a periodic poll of each open PDF's `last_modified` via the
 * contents API rather than the context's `fileChanged` signal: a PDF that is
 * only being viewed (not edited) does not otherwise poll itself, so the signal
 * would not fire on an out-of-band regeneration.
 */
class PdfAutoReloader {
  constructor(shell: JupyterFrontEnd.IShell, manager: IDocumentManager) {
    this._shell = shell;
    this._manager = manager;
  }

  /** Apply settings; (re)starts or stops the poll loop as needed. */
  configure(enabled: boolean, intervalMs: number): void {
    this._enabled = enabled;
    this._intervalMs = Math.max(MIN_AUTO_RELOAD_INTERVAL_MS, intervalMs);
    this._stopTimer();
    if (this._enabled) {
      this._timer = window.setInterval(() => {
        void this._tick();
      }, this._intervalMs);
    }
  }

  private _stopTimer(): void {
    if (this._timer !== null) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** One poll cycle: discover open PDFs, then reload any that changed. */
  private async _tick(): Promise<void> {
    // Discover currently open PDF contexts and record a baseline mtime for any
    // we have not seen before (without reloading on first sight).
    const openContexts = new Set<DocumentRegistry.Context>();
    for (const widget of toArray(this._shell.widgets())) {
      const context = this._manager.contextForWidget(widget);
      if (!context || !context.path.endsWith('.pdf')) {
        continue;
      }
      openContexts.add(context);
      if (!this._known.has(context)) {
        this._known.set(context, {
          lastModified: context.contentsModel?.last_modified ?? null,
          reverting: false
        });
      }
    }

    // Drop contexts whose widget is no longer open.
    for (const context of this._known.keys()) {
      if (!openContexts.has(context)) {
        this._known.delete(context);
      }
    }

    // Check each open PDF for an on-disk change and revert if needed.
    await Promise.all(
      Array.from(openContexts).map(context => this._maybeReload(context))
    );
  }

  private async _maybeReload(context: DocumentRegistry.Context): Promise<void> {
    const state = this._known.get(context);
    if (!state || state.reverting) {
      return;
    }
    let lastModified: string;
    try {
      const model = await this._manager.services.contents.get(context.path, {
        content: false
      });
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
        await context.revert();
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
  private _timer: number | null = null;
  private _known = new Map<
    DocumentRegistry.Context,
    { lastModified: string | null; reverting: boolean }
  >();
}

/**
 * Initialization data for the jupyterlab_run_and_reload extension.
 *
 * TODOs:
 * - Add setting: file extensions to reload
 * - Add setting: only reload visible widgets or not
 * - Add toolbar button in notebook panel with run and reload
 * - Also add "Restart kernel, run all cells and reload PDFs"
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
      DEFAULT_AUTO_RELOAD_INTERVAL_MS
    );

    if (settingRegistry) {
      const applySettings = (settings: ISettingRegistry.ISettings) => {
        const enabled = settings.get('autoReloadEnabled').composite as boolean;
        const intervalMs = settings.get('autoReloadIntervalMs')
          .composite as number;
        autoReloader.configure(
          enabled ?? DEFAULT_AUTO_RELOAD_ENABLED,
          intervalMs ?? DEFAULT_AUTO_RELOAD_INTERVAL_MS
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

    const icon2 = new LabIcon({
      name: 'run-and-reload:fastforward-in-file-icon',
      svgstr: fastforwardInFileIconStr
    });

    function commandExecutionFunction(withRestart: boolean) {
      async function executeCommand() {
        // Get currently selected widget
        const currentWidget = shell.currentWidget;

        // If current widget is a notebook then we can run all cells
        // If not, then this command does not make sense and should not be callable actually
        if (!(currentWidget instanceof NotebookPanel)) {
          return;
        }

        function widgetShouldReload(widget: Widget) {
          const context = manager.contextForWidget(widget);
          return context?.path.endsWith('.pdf');
        }

        // Get all attached widgets in the shell
        const currentWidgets = toArray(shell.widgets());

        // Obtain the list of widgets that might need to be reloaded after the notebook is finished
        const widgetsToReload = currentWidgets.filter(widgetShouldReload);
        const contextsToReload = widgetsToReload.map(widget =>
          manager.contextForWidget(widget)
        );

        // Connect the openOrReveal function to the fileChanged signal of the relevant widgets
        contextsToReload.forEach(context => {
          context?.fileChanged.connect((context, model) => {
            manager.openOrReveal(context.path);
          });
        });

        // If current widget is a notebook then we can run all cells
        if (currentWidget instanceof NotebookPanel) {
          let restarted: boolean;
          if (withRestart) {
            restarted = await commands.execute(CommandIDs.restart, {
              activate: false
            });
          } else {
            restarted = true;
          }
          // TODO: Add check on result + notification if notebook run was not successfull
          if (restarted) {
            await NotebookActions.runAll(
              currentWidget.content,
              currentWidget.sessionContext
            );
          }

          // Loop over all widgets in the shell and revert the relevant ones
          for (const context of contextsToReload) {
            context?.revert();
          }
        }
      }
      return executeCommand;
    }

    commands.addCommand(CommandIDs.runAndReloadAll, {
      label: 'Run All Cells and Reload PDFs',
      caption:
        'Run all the cells of the notebook and then reload static content that has changed (e.g. PDF).',
      icon: args => (args['ignoreIcon'] ? undefined : icon),
      isEnabled: () => shell.currentWidget instanceof NotebookPanel,
      execute: commandExecutionFunction(false)
    });

    commands.addCommand(CommandIDs.restartRunAndReloadAll, {
      label: 'Restart Kernel, Run All Cells and Reload PDFs',
      caption:
        'Restart the kernel, run all the cells of the notebook and then reload static content that has changed (e.g. PDF).',
      icon: args => (args['ignoreIcon'] ? undefined : icon2),
      isEnabled: () => shell.currentWidget instanceof NotebookPanel,
      execute: commandExecutionFunction(true)
    });

    // Add the command to the palette
    if (palette) {
      palette.addItem({
        command: CommandIDs.runAndReloadAll,
        args: { ignoreIcon: true },
        category: PALETTE_CATEGORY
      });

      palette.addItem({
        command: CommandIDs.restartRunAndReloadAll,
        args: { ignoreIcon: true },
        category: PALETTE_CATEGORY
      });
    }
  }
};

export default plugin;
