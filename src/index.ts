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
          console.log(
            'jupyterlab_run_and_reload settings loaded:',
            settings.composite
          );
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab_run_and_reload.',
            reason
          );
        });
    }

    const { shell, commands } = app;

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
