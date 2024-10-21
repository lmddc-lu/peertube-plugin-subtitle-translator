# Peertube plugin Subtitle Translator


This is is a fork of the [Subtitle Editor Plugin](https://codeberg.org/herover/peertube-plugin-subtitle-editor/) for Peertube. It adds the ability to automatically translate subtitles to a new language using the [Subtitle-Translator](https://github.com/tdhm/subtitles-translator/) project which uses OPUS-MT models to translate subtitles files.

## Quick start

This project is composed of two main projects: The peertube plugin and an API server that runs the subtitle translator. 

### API Server

For now the API server is not published, so you will have to build it yourself. You have the choice between two images that uses either the CPU or the GPU to run the translation. 

First, clone the repository and build the image:

```bash
git clone https://github.com/lmddc-lu/peertube-plugin-subtitle-translator --recurse-submodules
cd subtitle_translator_api
```

in the .env file, you can set the following variables:

- `USE_GPU` : Set to `true` if you want to use the GPU version of the image. Set to `false` if you want to use the CPU version.

For the GPU version, you will need to have a GPU with CUDA support. You can build the image with the following command:
Make sure you have the NVIDIA container toolkit installed on your machine. You can find the installation instructions [here](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

- `API_PORT` : The port on which the API will be available. Default is 5000.

You then need to build our fork of the subtitle-translator project.


Then, you can build the image with the following command:

```bash
make run
```

### Peertube Plugin

To get started, you can clone this repository in a directory accessible by your PeerTube instance. Then, you can install the dependencies and build the plugin with the following commands:

```bash
npm install
npm run build
```

Then, you can install it into your peertube instance using the peertube-cli:

```bash
peertube-cli plugins install --path /plugins/peertube-plugin-subtitle-translator
```

Where the path is the path on your server where the plugin is located.

