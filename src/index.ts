import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ICommandPalette } from '@jupyterlab/apputils';

import { IDocumentManager } from '@jupyterlab/docmanager';
import { toArray } from '@lumino/algorithm';

import {
  NotebookActions,
  NotebookPanel
  // INotebookModel
} from '@jupyterlab/notebook';

namespace CommandIDs {
  export const reloadAll = 'run-and-reload:run-all-cells-and-reload';
}

// TODO: Change category to run items
const PALETTE_CATEGORY = 'Run and reload extension';

/**
 * Initialization data for the run_and_reload extension.
 *
 * TODOs:
 * - Add setting: file extensions to reload
 * - Add setting: only reload visible widgets or not
 * - Add toolbar button in notebook panel with run and reload
 * - Also add "Restart kernel, run all cells and reload PDFs"
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'run_and_reload:plugin',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [ISettingRegistry, ICommandPalette],
  activate: (
    app: JupyterFrontEnd,
    manager: IDocumentManager,
    settingRegistry: ISettingRegistry | null,
    palette: ICommandPalette | null
  ) => {
    console.log('JupyterLab extension run_and_reload is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('run_and_reload settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for run_and_reload.', reason);
        });
    }

    const { shell, commands } = app;

    commands.addCommand(CommandIDs.reloadAll, {
      label: 'Run All Cells and Reload PDFs',
      caption: 'Reload all static files',
      isEnabled: () => shell.currentWidget instanceof NotebookPanel,
      execute: async () => {
        // Get currently selected widget
        const currentWidget = shell.currentWidget;

        // If current widget is a notebook then we can run all cells
        if (currentWidget instanceof NotebookPanel) {
          // TODO: Add check on result + notification if notebook run was not successfull
          await NotebookActions.runAll(
            currentWidget.content,
            currentWidget.sessionContext
          );
        } else {
          return;
        }

        // Loop over all widgets in the shell and reload the one that are PDFs
        for (const widget of toArray(shell.widgets())) {
          if (widget !== undefined) {
            const context = manager.contextForWidget(widget);
            if (context?.path.endsWith('.pdf')) {
              context.revert();
            }
          }
        }
      }
    });

    // Add the command to the palette
    if (palette) {
      palette.addItem({
        command: CommandIDs.reloadAll,
        args: { isPalette: true },
        category: PALETTE_CATEGORY
      });
    }
  }
};

export default plugin;
