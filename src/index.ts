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

import { Widget } from '@lumino/widgets';

namespace CommandIDs {
  export const reloadAll = 'run-and-reload:run-all-cells-and-reload';
}

// TODO: Change category to run items
const PALETTE_CATEGORY = 'Run and reload extension';

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

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('jupyterlab_run_and_reload settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for jupyterlab_run_and_reload.', reason);
        });
    }

    const { shell, commands } = app;

    commands.addCommand(CommandIDs.reloadAll, {
      label: 'Run All Cells and Reload PDFs',
      caption:
        'Reload all static files after your notebook is finished running all cells.',
      isEnabled: () => shell.currentWidget instanceof NotebookPanel,
      execute: async () => {
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
          // TODO: Add check on result + notification if notebook run was not successfull
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
