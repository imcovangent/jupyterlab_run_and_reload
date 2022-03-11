# jupyterlab_run_and_reload

[![Github Actions Status](https://github.com/imcovangent/jupyterlab_run_and_reload/workflows/Build/badge.svg)](https://github.com/imcovangent/jupyterlab_run_and_reload/actions/workflows/build.yml)[![Binder](https://mybinder.org/badge_logo.svg)](https://mybinder.org/v2/gh/imcovangent/jupyterlab_run_and_reload/main?urlpath=lab)

A JupyterLab extension to run all notebook cells and reload static content (e.g. PDF).

This extension is motivated by the use of [pylatex](https://github.com/JelteF/PyLaTeX) in a notebook on Jupyter Lab. When you run a notebook that creates a PDF file, you normally have to manually reload the file if it is already open. With this extension you can simply run your notebook and the PDF file gets reloaded automatically. Like this:

![Demo run and reload GIF](examples/demo_jupyterlab_run_and_reload.gif)

The extension provides the command "Run all cells and reload PDFs". This command is available in a notebook in multiple places:

- Under the run menu
- Under the keyboard shortcut ctrl + shift + D
- In the command palette (ctrl + shift + C)

## Requirements

* JupyterLab >= 3.0

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
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm run build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm run watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm run build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

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
