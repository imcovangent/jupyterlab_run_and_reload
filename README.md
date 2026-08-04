# jupyterlab_run_and_reload

[![Github Actions Status](https://github.com/imcovangent/jupyterlab_run_and_reload.git/workflows/Build/badge.svg)](https://github.com/imcovangent/jupyterlab_run_and_reload.git/actions/workflows/build.yml)
[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/imcovangent/jupyterlab_run_and_reload.git/main?urlpath=lab)

A JupyterLab extension that runs all notebook cells and automatically reloads open file viewers whenever their file changes on disk (`.pdf` by default; configurable).

This extension is motivated by the use of [pylatex](https://github.com/JelteF/PyLaTeX) in a notebook on Jupyter Lab. When you run a notebook that creates a PDF file, you normally have to manually reload the file if it is already open. With this extension the open PDF gets reloaded automatically. Like this:

![Demo run and reload GIF](https://github.com/imcovangent/jupyterlab_run_and_reload/blob/main/examples/demo_jupyterlab_run_and_reload.gif?raw=true)

## Automatic file reload

Any open file with a watched extension (`.pdf` by default) is reloaded automatically whenever its file changes on disk — regardless of what triggered the change: the command below, a headless notebook run (e.g. via the Jupyter MCP or a coding agent), a terminal, a cron job, etc. A file that changes is also brought to the front, so one open in a background tab is reloaded and activated.

This behaviour is controlled by three settings (Settings → Settings Editor → _jupyterlab_run_and_reload_):

- `autoReloadEnabled` (default `true`) — enable or disable the automatic reload.
- `autoReloadIntervalMs` (default `1500`) — how often, in milliseconds, open files are checked for on-disk changes.
- `watchedFileExtensions` (default `[".pdf"]`) — the file extensions to watch. Include the leading dot (e.g. `".pdf"`); matching is case-insensitive. Add more (e.g. `".png"`, `".svg"`) to auto-reload other viewers too.

  > ⚠️ Only add extensions for view-only or generated files. Reloading reverts the open document from disk, so any **unsaved edits** to a watched file would be discarded. This is why the default is `.pdf` (a generated, non-edited output).

## Command

The extension provides one command:

- **"Run All Cells and Reload Files"** — runs every cell of the active notebook, keeping your current selection and scroll position. Open files are then reloaded automatically as described above.

The command is available in a notebook in multiple places:

- In the notebook toolbar
- Under the Run menu
- Under the keyboard shortcut `Ctrl + Shift + D`
- In the command palette (`Ctrl + Shift + C`)

## Requirements

- JupyterLab >= 4.0.0

## Install

To install the extension, execute:

```bash
pip install jupyterlab_run_and_reload
```

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_run_and_reload
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab_run_and_reload directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
pip uninstall jupyterlab_run_and_reload
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyterlab_run_and_reload` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
