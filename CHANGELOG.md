# Changelog

v4.1.1

- Fixed the "Run All Cells and Reload Files" toolbar button staying greyed out
  after a workspace restore. The command itself was always available from the
  keyboard shortcut; only the button's cached enabled state was stale.

v4.1.0

- Open files are now reloaded automatically when they change on disk, including
  tabs that are not currently visible. Watched extensions are configurable and
  default to `.pdf`.
- Note that reloading a watched file discards unsaved edits to it.
- "Run All Cells and Reload Files" now only runs the cells; reloading is handled
  by the watcher.
- Removed the "Restart Kernel, Run All Cells and Reload PDFs" command, which the
  watcher makes redundant.
- Running all cells no longer scrolls the notebook to the last cell.
- Added a conda-build recipe, which takes its name and version from
  `package.json`.

v4.0.0

- Added support for JupyterLab 4

v0.3.0 - Carmela

- Added extra command that also restarts the kernel first
- Added notebook toolbar buttons
- Fixed (and updated) example GIF for README (so it also works on PyPI)

v0.2.0 - Tony

- Rename first version with package name: jupyterlab_run_and_reload

v0.1.0 - Anthony

- First version under old package name: run_and_reload
