# PeerTube Subtitle Editor & Translator

This is is a fork of the [Subtitle Editor Plugin](https://codeberg.org/herover/peertube-plugin-subtitle-editor/) for Peertube. It adds the ability to translate subtitles to a new language using the [Subtitle-Translator](https://github.com/tdhm/subtitles-translator/) project which uses OPUS-MT models to translate subtitles files.

Edit captions directly in PeerTube! Installing this plugin will add a button to your PeerTube instances video settings (the page you see when you publish or update a video) that will take you to the following screen:

![Screenshot showing a video being edited in English.](/screenshot-1.png "Editor")

Adding captions to your videos allows deaf viewers and people unable to play your video with sound on to get a understanding of what's being said. It also allows PeerTube to include your content when someone searches for a language that you have captions for, even if the spoken language is something else.

However, it can be a struggle to write captions if you first have to find, install and learn new software. The goal if this project is to remove at least the first two hurdles, and hopefully simplify the last.

The project is still fairly new, not tested by many, and lacks features found in many dedicated apps for writing subtitles. Please report bugs and send feature requests to the [Codeberg repository](https://codeberg.org/herover/peertube-plugin-subtitle-editor/issues) or alternatively to [GitHub](https://github.com/Herover/peertube-plugin-subtitle-editor). General feedback is also welcome through Mastodon.

## For caption writers

Some general tips for using the editor:

* It's tested on Firefox and Chrome. If you encounter problems take extra care to include what browser you are using in the bug report and consider testing in another browser.

* Peertube only allows captions to be centered at the bottom of the screen.

* The black area bellow the video player is for your edited captions, the captions inside the player is the live captions. You can turn them off using the player.

* At the time of writing, there's no easy way to style text (italics, bold, underline), but you can write the html tags directly in the input field and the video player will display them correctly. Ex. `<i>Hi</i>` will result in "Hi" being displayed with italics.

* If you reload the editor or open it in multiple browser windows you might see a warning. This is intended to make sure multiple people don't edit the same file at the same time, which might result in lost data.

* The "Visualize audio" button might load a lot of information into your computers memory if the highest resolution is high and the video is very long. This can take some time and cause a bit of lag while it crunches data.

* Play around! The only potentially destructive buttons are the save and delete buttons. You can safely experiment with the rest without messing with your video.

## For server operators

* The editor will mostly use built in Peertube APIs and their security features.

* It creates the endpoint `/plugins/subtitle-editor/router/lock` which is used for clients to indicate that someone is editing captions for a video.

* It will load most colors from CSS variables, meaning if you have a custom theme that changes bootstrap colors or `--mainForegroundColor, --greyBackgroundColor, --mainColorLighter`, the editor should be able to adapt.

* If a user wants to visualize audio it will download the lowest quality version of the video. If you want to save bandwidth, and help users with low spec computers, transcoding videos to a low quality can help.

# PeerTube plugin Quickstart Typescript

This is a fork of [peertube-plugin-quickstart](https://framagit.org/framasoft/peertube/peertube-plugin-quickstart)
(See [the Peertube documentation](https://docs.joinpeertube.org/#/contribute-plugins?id=write-a-plugintheme)).

Differences are:

* both backend and frontend code are in Typescript
* backend code is in a subdirectory, so it can easily be separated in multiple module files
* classic CSS are replaced by [SCSS](https://fr.wikipedia.org/wiki/Sass_(langage))
* there are linting rules to ensure code quality

## Compilation

To compile your plugin, first install dependencies with `npm install` (you only
have to do this the first time), then just run: `npm run build`.

For more information, you can refer to the documentation for the
[official quickstart plugin](https://docs.joinpeertube.org/#/contribute-plugins?id=write-a-plugintheme).

You can run `npm run clean` to empty the `dist` folder (where goes all compiled code).

You can only rebuild part of the plugin by running one of the script defined in
`package.json`. For example, to only rebuild backend code: `npm run build:server`.

To install the plugin to your test server, you have to use the
[Peertube CLI](https://docs.joinpeertube.org/contribute-plugins?id=test-your-plugintheme).

Note: when installing multiple times the plugin, be aware that the `~/.cache/yarn`
folder of your test server will grow... a lot. It can really fast grow to dozens
of GB. And millions of files, filling the inode table of your disk.
You can safely delete this folder.

## Peertube version

Peertube types definitions comme from the official package `@types/peertube-types`.
To avoid problems, use same versions for `@types/peertube-types` as the supported
peertube engine in your `package.json`.
So, for example, if you plan to support Peertube v4.2.0 and above, use v4.2.0 for
`@types/peertube-types` and `engine.peertube`.

Note: the first stable version of `@types-peertube-types` is v4.2.0, that is why
this quickstart plugin requires Peertube v4.2.0, althought it could work with
older versions.

## Linting

To check linting, just run `npm run test`.

This package comes with a `.vscode` folder that contains settings for
Visual Studio Code. These settings ensure your Visual Studio Code uses linting
rules. If you don't want this, you can add `.vscode` to the `.gitignore` file.

Check the `.eslintrc.json` for special linting rules that I recommand
(for example `"@typescript-eslint/no-unused-vars": [2, {"argsIgnorePattern": "^_"}]`
that allow you to prefix unused arguments with `_`).

Note: there is linting for both Typescript and SCSS files.

## ESBuild vs Typescript

The official `peertube-plugin-quickstart` uses ESbuild for frontend code generation.
ESBuild can handle Typescript, but does not check types 
(see [ESBuild documentation](https://esbuild.github.io/content-types/#typescript)).
That's why we first comple typescript with the `-noEmit` option, just to check types.
Then, if everything is okay, we run ESBuild to generate the compiled javascript.

## Typescript version

To be sure to use the right version of Typescript, Typescript is a dev dependency
of this plugin. That's why we use `npx tsc` to compile typescript: it ensure
your are using the version that is indicated in the `package.json` file.
