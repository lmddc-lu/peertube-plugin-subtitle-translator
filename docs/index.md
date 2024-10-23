# Peertube plugin Subtitle Translator


This is is a fork of the [Subtitle Editor Plugin](https://codeberg.org/herover/peertube-plugin-subtitle-editor/) for Peertube. It adds the ability to automatically translate subtitles to a new language using the [Subtitle-Translator](https://github.com/tdhm/subtitles-translator/) project which uses OPUS-MT models to translate subtitles files.

## Quick start

This project is composed of two main projects: The peertube plugin and an API server that runs the subtitle translator. 

### API Server

For now the API server is not published, so you will have to build it yourself. You have the choice between two images that uses either the CPU or the GPU to run the translation. 

First, clone the repository and build the image:

```bash
git clone https://github.com/lmddc-lu/peertube-plugin-subtitle-translator-api.git --recurse-submodules
cd peertube-plugin-subtitle-translator-api/
```

in the .env file, you can set the following variables:

- `USE_GPU` : Set to `true` if you want to use the GPU version of the image. Set to `false` if you want to use the CPU version.

For the GPU version, you will need to have a GPU with CUDA support.
Make sure you have the NVIDIA container toolkit installed on your machine. You can find the installation instructions [here](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

- `API_PORT` : The port on which the API will be available. Default is 5000.

You then need to build our fork of the subtitle-translator project, which is a submodule of this repository.
Ensure you have python (>= 3.8, < 3.11) installed, and poetry installed.
You can build the submodule with the following command:
```bash
make build-subtitle-translator
```

This will create a .whl file in the `dist/` directory. This file will be used to install the subtitle-translator package in the API server.


Then, you can build and run the subtitle-translator-api image with the following command:

```bash
make run
```

### Peertube Plugin

To get started, you can clone this repository in a directory accessible by your PeerTube instance. Then, you can install the dependencies and build the plugin with the following commands:

```bash
git clone https://github.com/lmddc-lu/peertube-plugin-subtitle-translator.git
cd peertube-plugin-subtitle-translator/
npm install
npm run build
```

Then, you can install it into your peertube instance using the peertube-cli:

```bash
peertube-cli plugins install --path /plugins/peertube-plugin-subtitle-translator
```

Where the path is the path on your server where the plugin is located.

### Configuration

Once both the API server and the plugin are installed, you can configure the plugin in the PeerTube admin panel. 

The settings available are:

- `Subtitle translation API URL` : The URL of the API server. For example, if you are running the API server on the same machine as the PeerTube instance, you can set the URL to `http://localhost:5000`.

- `Subtitle translation timeout (in minutes)` : The maximum time the plugin will wait for the translation to be completed. If the translation takes longer than this time, it will be cancelled.

- `List of languages enabled for translation: ` : This is the list of languages that will be available for translation in the plugin. You can add or remove languages from this list. Leave empty to enable all available languages. For example, if you want to enable only translation to English, French and German, you can set this field to `en,fr,de`.

### Usage

Once the plugin is installed and configured, you can start translating subtitles in your PeerTube instance. When editing a video, you will see a new button called "Subtitle translator". Clicking on this button will open the subtitle translator interface.

If you have a transcription available for the video, you will see a dropdown button with the target languages available for translation.
Select the language you want to translate the subtitles to, and click on the "Translate" button. The plugin will then send the transcription to the API server, which will translate it to the target language. Once the translation is completed, you will see the translated subtitles in the editor.
