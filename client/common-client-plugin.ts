import type { RegisterClientOptions } from '@peertube/peertube-types/client'
import { PeerTubePlayer } from '@peertube/embed-api'
import vtt from "vtt.js";
import { generateVTT, renderBasics, renderCueTable, renderLanguageList, renderLanguageSelector, renderPreview, renderTimeline, TimelineClickBox, timelineSecondLength } from './render';
import { formatTime } from './util';
import { VideoCaption, VideoDetails, VideoFile } from '@peertube/peertube-types/peertube-models';
import { Cue, TextSTyle } from './types';

const newCueLength = 3;
let captionList: Array<{
  id : string
  label: string
  changed: boolean
  cues: Cue[]
}> = [];
let languages: { [id: string]: string };
let languagePairs : string[][] = [];

async function register ({
  peertubeHelpers,
  registerHook,
  registerClientRoute,
}: RegisterClientOptions): Promise<void> {
  // const message = await peertubeHelpers.translate('Hello world')

  registerHook({
    target: 'action:video-edit.init',
    handler: async (data: any) => {
      // Required on all requests as videos might be private or otherwise limited to specific accounts
      const fetchCredentials: RequestInit = {
        credentials: 'include',
        headers: {
          "authorization": "Bearer " + localStorage.getItem("access_token") || "",
        },
      };

      const videoIdMatch = window.location.pathname.match(/(?!\/videos\/update\/)[\d\w\-]*$/);
      if (!videoIdMatch || videoIdMatch.length == 0) {
        alert("No id found")
        return;
      }
      let videoId = videoIdMatch[0];
      if (!videoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        // Prefer UUID format as lock mechanism doesn't work with short id
        const videoInfoReq = await fetch("/api/v1/videos/" + videoId, fetchCredentials);
        if (videoInfoReq.status != 200) {
          return;
        }
        const videoInfo = await videoInfoReq.json();
        videoId = videoInfo.uuid;
      }
      const link = document.createElement("a")
      link.innerText = 'Open subtitle editor'
      link.classList.add("nav-link")
      link.classList.add("nav-item")
      link.href = "/p/subtitles?id=" + videoId
      document.querySelector('.video-edit .nav-tabs')?.appendChild(link)
    }
  })

  registerClientRoute({
    route: 'subtitles',
    onMount: async ({ rootEl }: { rootEl: HTMLDivElement }) => {
      const main = document.createElement("div");
      main.setAttribute("class", "margin-content row");
      rootEl.appendChild(main);
      
      let videoPosition = 0;
      let videoDuration = 1;
      let videoIsPlaying = false;
      let currentCaptionLanguageId = "";
      // Contains current player status fn, must be kept around so we can remove it later
      let playerStatusCallback: any;
      let playerStatusChangeCallback: any;
      let audioBars: Float32Array;
      const audioBarsInterval = 0.01; // Seconds

      // Minimum number of seconds between a cue endTime and next cue startTime
      let cueMinSpace = 0.1; // TODO: make configureable

      // Required on all requests as videos might be private or otherwise limited to specific accounts
      const fetchCredentials: RequestInit = {
        credentials: 'include',
        headers: {
          "authorization": "Bearer " + localStorage.getItem("access_token") || "",
        },
      };

      const getVTTDataFromUrl = async (url: string) => {
        return await fetch(url, fetchCredentials).then(d => d.text()).then(data => {
          let cues: any[] = [];
          const vttParser = new vtt.WebVTT.Parser(window, vtt.WebVTT.StringDecoder());
          vttParser.oncue = (cue: any) => {
            cues.push(cue);
          };
          vttParser.parse(data);
          vttParser.flush();
      
          return { cues };
        });
      };

      renderBasics(rootEl);
      const cuesElement = rootEl.querySelector("#subtitle-cues");
      const videoViewerElement = rootEl.querySelector("#subtitle-video-viewer");
      const previewElement = rootEl.querySelector<HTMLDivElement>("#subtitle-preview");
      
      const cueInputElement = rootEl.querySelector<HTMLTextAreaElement>("#subtitle-cue-input");
      const cueSetStartElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-set-start")
      const cueSetEndElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-set-end")
      const cueInsertCueElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-insert-new")
      const cueInsertCueAfterElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-insert-new-after")
      const cueInsertCueAfterSelectedElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-insert-new-selected")
      const cueSelectCurrentCueElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-select-current")
      const languageListElement = rootEl.querySelector<HTMLDivElement>("#subtitle-languages")
      const seekPlusElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-seek-plus-1");
      const pausePlayElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-pause-play");
      const seekMinusElement = rootEl.querySelector<HTMLDivElement>("#subtitle-seek-minus-1");
      const addNewLanguageListElement = rootEl.querySelector<HTMLSelectElement>("#subtitle-add-language-list");
      const addTranslateLanguageElement = rootEl.querySelector<HTMLButtonElement>('#subtitle-add-translate')
      const saveCurrentLanguageElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-save");
      const deleteCurrentLanguageElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-delete");
      const timelineElement = rootEl.querySelector<HTMLCanvasElement>("#subtitle-timeline");
      const padCuesElement = rootEl.querySelector<HTMLInputElement>("#subtitle-pad-cues");
      const deleteCueElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-delete-cue");
      const visualizeAudioElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-visualize-audio");
      const visualizeAudioSizeElement = rootEl.querySelector<HTMLSpanElement>("#subtitle-visualize-audio-size");
      const cueStyleItalicElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-cue-style-italic");
      const cueStyleBoldElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-cue-style-bold");
      const cueStyleUnderlineElement = rootEl.querySelector<HTMLButtonElement>("#subtitle-cue-style-underline");
      
      const timestampElement = rootEl.querySelector<HTMLSpanElement>("#subtitle-timestamp");
      const vttResultElement = rootEl.querySelector<HTMLPreElement>("#subtitle-vtt-result");
      if (!cuesElement
        || !videoViewerElement
        || !previewElement
        || !seekPlusElement
        || !pausePlayElement
        || !seekMinusElement
        || !cueInputElement
        || !cueSetStartElement
        || !cueSetEndElement
        || !cueInsertCueElement
        || !cueInsertCueAfterElement
        || !cueInsertCueAfterSelectedElement
        || !cueSelectCurrentCueElement
        || !timestampElement
        || !languageListElement
        || !addNewLanguageListElement
        || !addTranslateLanguageElement
        || !saveCurrentLanguageElement
        || !deleteCurrentLanguageElement
        || !timelineElement
        || !padCuesElement
        || !deleteCueElement
        || !visualizeAudioElement
        || !visualizeAudioSizeElement
        || !cueStyleItalicElement
        || !cueStyleBoldElement
        || !cueStyleUnderlineElement
        || !vttResultElement) {
        console.warn("unable to render missing stuff");
        alert("Something didn't load properly");

        return;
      }

      const cssStyles = getComputedStyle(timelineElement);
      const styles = {
        text: cssStyles.getPropertyValue("--mainForegroundColor"),
        box: cssStyles.getPropertyValue("--greyBackgroundColor"),
        audioBars: cssStyles.getPropertyValue("--mainColorLighter"),
      }

      const [_, query] = location.href.split('?')
      if (query) {
        const parameters = query.split('&').map(p => p.split('=')).reduce((acc, [k, v]) => {
          acc[k] = v
          return acc
        }, {} as {[key: string]: string})

        if (parameters.id) {
          const originalHref = location.href;

          const lock = await (await fetch("/plugins/subtitle-translator/router/lock?id=" + parameters.id, fetchCredentials)).json();
          if (lock.locked && new Date().getTime() < new Date(lock.changed).getTime() + 60*1000) {
            alert("Someone might be editing! If this is not you, make sure to coordinate with the other person or risk loosing data");
          }
          let lockInterval: NodeJS.Timeout;
          const setLock = () => {
            if (originalHref != location.href) {
              clearInterval(lockInterval);
              return;
            }
            fetch(
              "/plugins/subtitle-translator/router/lock?id=" + parameters.id,
              {
                body: JSON.stringify({ locked: true }),
                method: 'PUT',
                ...fetchCredentials,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                  ...fetchCredentials.headers,
                },
              }
            );
          };
          lockInterval = setInterval(
            setLock,
            30*1000,
          );
          setLock();


          const [
            videoDataRequest,
            captionsRequest,
            languagesRequest,
            languagesPairRequest
          ] = await Promise.all([
            fetch(`/api/v1/videos/${parameters.id}`, fetchCredentials),
            fetch(`/api/v1/videos/${parameters.id}/captions`, fetchCredentials),
            fetch("/api/v1/videos/languages", fetchCredentials),
            fetch('/plugins/subtitle-translator/router/available-pairs', fetchCredentials)
          ]);

          if (captionsRequest.status !== 200 || videoDataRequest.status !== 200) {
            main.innerHTML = "can't find video with id " + parameters.id;
            return;
          }

          const captions: { data: VideoCaption[] } = await captionsRequest.json();
          languagePairs = await languagesPairRequest.json();
          languages = await languagesRequest.json();
          
          captionList = await Promise.all(captions.data.map(async c => ({
            id: c.language.id,
            label: c.language.label,
            changed: false,
            cues: (await getVTTDataFromUrl(c.captionPath)).cues.map<Cue>(c => {
              const text = getStyledText(c.text);
              return {
                id: c.id,
                startTime: c.startTime,
                endTime: c.endTime,
                text: text.text,
                align: c.align,
                style: text.style,
              };
            }),
          })));
          window.addEventListener("beforeunload", (e) => {
            const changedCaptions = captionList.find(c => c.changed);
            if (changedCaptions) {
              // Most browsers displays a default message instead of this
              const message = `Unsaved changes in ${changedCaptions.label}, leave now?`;
              e.returnValue = message;
              e.preventDefault();
              return message;
            }

            return;
          });

          
          
          const videoData: VideoDetails = await videoDataRequest.json();

          videoDuration = videoData.duration;

          const playerIframeEl = document.createElement("iframe");
          playerIframeEl.setAttribute("title", videoData.name);
          playerIframeEl.setAttribute("width", "100%");
          playerIframeEl.setAttribute("height", "100%");
          playerIframeEl.setAttribute("src", "/videos/embed/" + parameters.id + "?api=1");
          playerIframeEl.setAttribute("frameborder", "0");
          playerIframeEl.setAttribute("allowfullscreen", "");
          playerIframeEl.setAttribute("sandbox", "allow-same-origin allow-scripts allow-popups");
          videoViewerElement.appendChild(playerIframeEl);
          let player = new PeerTubePlayer(playerIframeEl);
          seekPlusElement.onclick = async () => player.seek(videoPosition + 1);
          pausePlayElement.onclick = async () => {
            videoIsPlaying ? player.pause() : player.play();
            videoIsPlaying = !videoIsPlaying;
          };
          seekMinusElement.onclick = async () => player.seek(videoPosition - 1);

          padCuesElement.checked = cueMinSpace == 0 ? false : true;
          padCuesElement.onclick = (e) => {
            cueMinSpace = (e.target as HTMLInputElement).checked ? 0.1 : 0;
          };

          let timelineContext = timelineElement.getContext("2d");
          window.onkeydown = (e) => {
            if (
              e.defaultPrevented ||
              e.target == cueInputElement ||
              (e.target && (
                (e.target as any).tagName == "BUTTON" || (e.target as any).tagName == "A" || (e.target as any).tagName == "INPUT")
              )
            ) return;
            if (e.key == " ") {
              e.preventDefault();
              if (videoIsPlaying) {
                player.pause();
              } else {
                player.play();
              }
            } else if (e.key == "ArrowLeft") {
              e.preventDefault();
              player.seek(videoPosition - 1);
            } else if (e.key == "ArrowRight") {
              e.preventDefault();
              player.seek(videoPosition + 1);
            }
          };

          const smalestVideoFile = videoData.streamingPlaylists.reduce((acc, l) => {
            // Assume all streamin playlists and files contain the same audio
            const smalestFile = l.files.reduce((acc, f) => {
              if (!acc) return f;
              if (f.size < acc.size) return f;
              return acc;
            });

            if (!acc) return smalestFile;
            if (smalestFile.size < acc.size) return smalestFile;
            return acc;
          }, undefined as undefined | VideoFile);
          visualizeAudioElement.onclick = async () => {
            if (!smalestVideoFile) {
              alert("Unable to find video file");
              return;
            }

            visualizeAudioElement.innerText = "Loading...";
            visualizeAudioElement.disabled = true;

            const audioData = await fetch(
              smalestVideoFile.fileUrl,
              smalestVideoFile.fileUrl.startsWith(location.origin) ? fetchCredentials : {},
            );
            const audioCtx = new AudioContext();
            const buffer = await audioCtx.decodeAudioData(await audioData.arrayBuffer());
            
            const data = buffer.getChannelData(0);
            const step = buffer.sampleRate * audioBarsInterval;
            audioBars = new Float32Array(buffer.length/step);
            let maxBar = 0;
            for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += step) {
              let v = 0;
              for (let i = sampleIndex; i < sampleIndex + step; i ++) {
                // v += data[i];
                v = Math.max(v, data[i]);
              }
              audioBars[sampleIndex/step] = v;
              maxBar = Math.max(maxBar, v || 0);
            }
            // Normalize
            audioBars = audioBars.map(v => v/maxBar);
            visualizeAudioElement.style.display = "none";
          };
          visualizeAudioSizeElement.innerText = smalestVideoFile ? Math.round(smalestVideoFile.size/1000000) + " mb." : "?";

          const selectLanguage = (languageId?: string) => {
            if (!languageId) {
              renderLanguageSelector(
                languageListElement,
                captionList,
                currentCaptionLanguageId,
                selectLanguage,
              );
              
              renderLanguageList(
                addNewLanguageListElement,
                Object.keys(languages)
                  .map(id => ({ id, label: languages[id], disabled: captionList.findIndex(c => c.id == id) != -1 }))
                  .sort((a, b) => a.label.localeCompare(b.label)),
                  currentCaptionLanguageId, 
                  languagePairs
              );

              renderCueTable(cuesElement, [], { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });

              return;
            }

            currentCaptionLanguageId = languageId;

            const captionData = captionList.find(e => e.id == currentCaptionLanguageId);
            if (!captionData) {
              alert("Could not find captions that was expected to be here: " + currentCaptionLanguageId);
              return;
            }

            cueInputElement.setAttribute("lang", languageId);

            renderLanguageSelector(
              languageListElement,
              captionList,
              currentCaptionLanguageId,
              selectLanguage,
            );

            console.log("rendering language list");
            console.log("captionList", captionList);
            console.log("languages", languages);
            console.log("currentCaptionLanguageId", currentCaptionLanguageId);
            console.log("languagePairs", languagePairs);

            renderLanguageList(
              addNewLanguageListElement,
              Object.keys(languages)
                .map(id => ({ id, label: languages[id], disabled: captionList.findIndex(c => c.id == id) != -1 }))
                .sort((a, b) => a.label.localeCompare(b.label)),
                currentCaptionLanguageId,
                languagePairs
            )
        

            cueSelectCurrentCueElement.onclick = () => {
              const cue = captionData.cues.find(c => c.startTime < videoPosition && videoPosition < c.endTime);
              if (cue) {
                selectCue(cue);
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
              }
            };
            cueInsertCueElement.onclick = () => {
              const cue = {
                id: "",
                text: "",
                startTime: videoPosition,
                endTime: videoPosition + newCueLength,
                style: TextSTyle.NONE,
                align: "",
              };
              captionData.cues.push(cue);
              captionData.cues.sort((a, b) => a.startTime - b.startTime);
              selectCue(cue);
              renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
            };
            cueInsertCueAfterElement.onclick = () => {
              const cueHere = captionData.cues.find(c => c.startTime <= videoPosition && videoPosition <= c.endTime);
              const t = cueHere ? cueHere.endTime + cueMinSpace : videoPosition;
              
              const cue = {
                id: "",
                text: "",
                startTime: t,
                endTime:  + newCueLength,
                style: TextSTyle.NONE,
                align: "",
              };
              captionData.cues.push(cue);
              captionData.cues.sort((a, b) => a.startTime - b.startTime);
              selectCue(cue);
              renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
            };


            const selectCue = (cue: Cue | null) => {
              if (cue == null) {
                cueInputElement.value = "";
                cueInputElement.disabled = true;
                cueSetStartElement.disabled = true;
                cueSetEndElement.disabled = true;
                deleteCueElement.disabled = true;
                cueStyleItalicElement.disabled = true;
                cueStyleBoldElement.disabled = true;
                cueStyleUnderlineElement.disabled = true;
                return;
              }
              cueInputElement.disabled = false;
              cueSetStartElement.disabled = false;
              cueSetEndElement.disabled = false;
              deleteCueElement.disabled = false;
              cueStyleItalicElement.disabled = false;
              cueStyleBoldElement.disabled = false;
              cueStyleUnderlineElement.disabled = false;

              cueInputElement.value = cue.text;
              cueInputElement.focus();

              cueInputElement.onkeyup = () => {
                cue.text = cueInputElement.value;
                captionData.changed = true;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                renderLanguageSelector(
                  languageListElement,
                  captionList,
                  currentCaptionLanguageId,
                  selectLanguage,
                );
                // vttResultElement.innerText = generateVTT(cues);
              };

              cueSetStartElement.onclick = () => {
                cue.startTime = videoPosition;
                captionData.changed = true;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                renderLanguageSelector(
                  languageListElement,
                  captionList,
                  currentCaptionLanguageId,
                  selectLanguage,
                );
                // vttResultElement.innerText = generateVTT(cues);
              };
              cueSetEndElement.onclick = () => {
                cue.endTime = videoPosition;
                captionData.changed = true;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                renderLanguageSelector(
                  languageListElement,
                  captionList,
                  currentCaptionLanguageId,
                  selectLanguage,
                );
                // vttResultElement.innerText = generateVTT(cues);
              };

              deleteCueElement.onclick = () => {
                captionData.cues = captionData.cues.filter(c => c != cue);
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                selectCue(null);
              }

              cueInsertCueAfterSelectedElement.onclick = () => {
                const cue2 = {
                  startTime: cue.endTime + cueMinSpace,
                  endTime: cue.endTime + cueMinSpace + newCueLength,
                  text: "",
                  id: "",
                  style: TextSTyle.NONE,
                  align: "",
                };
                captionData.cues.push(cue2);
                captionData.cues.sort((a, b) => a.startTime - b.startTime);
                selectCue(cue2);
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
              }

              cueStyleItalicElement.onclick = () => {
                cue.style = cue.style != TextSTyle.ITALIC ? TextSTyle.ITALIC : TextSTyle.NONE;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                currentCues = captionData.cues.filter(cue => cue.startTime < videoPosition && videoPosition < cue.endTime);
                renderPreview(previewElement, currentCues);
              };
              cueStyleBoldElement.onclick = () => {
                cue.style = cue.style != TextSTyle.BOLD ? TextSTyle.BOLD : TextSTyle.NONE;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                currentCues = captionData.cues.filter(cue => cue.startTime < videoPosition && videoPosition < cue.endTime);
                renderPreview(previewElement, currentCues);
                
              };
              cueStyleUnderlineElement.onclick = () => {
                cue.style = cue.style != TextSTyle.UNDERLINE ? TextSTyle.UNDERLINE : TextSTyle.NONE;
                renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
                currentCues = captionData.cues.filter(cue => cue.startTime < videoPosition && videoPosition < cue.endTime);
                renderPreview(previewElement, currentCues);
                
              };

              renderCueTable(cuesElement, captionData.cues, { time: videoPosition, onCueSelected: (cue => selectCue(cue)) });
            };
            selectCue(null);

            if (playerStatusCallback) {
              player.removeEventListener("playbackStatusUpdate", playerStatusCallback);
            }
            if (playerStatusChangeCallback) {
              player.removeEventListener("playbackStatusChange", playerStatusChangeCallback);
            }
            playerStatusCallback = ({ position, playbackState, duration }: { position: number, playbackState: string, duration: string }) => {
              if (position != videoPosition) {
                videoPosition = position;
                videoIsPlaying = playbackState == "playing";

                timestampElement.innerText = formatTime(position);

                renderCueTable(cuesElement, captionData.cues, { time: position, onCueSelected: (cue => selectCue(cue)) });
              }
            };
            playerStatusChangeCallback = (playbackState: string) => videoIsPlaying = playbackState == "playing"
            player.addEventListener(
              "playbackStatusUpdate",
              playerStatusCallback
            );
            player.addEventListener(
              "playbackStatusChange",
              playerStatusChangeCallback,
            )

            saveCurrentLanguageElement.onclick = async () => {
              if (currentCaptionLanguageId) {
                let formData = new FormData();
                formData.append('captionfile', new Blob(generateVTT(captionData.cues).split("")), currentCaptionLanguageId + ".vtt");
                const res = await fetch(
                  `/api/v1/videos/${parameters.id}/captions/${currentCaptionLanguageId}`,
                  {
                    method: "PUT",
                    body: formData,
                    ...fetchCredentials,
                  } as any,
                );
                if (res.status == 204) {
                  captionData.changed = false;
                  renderLanguageSelector(
                    languageListElement,
                    captionList,
                    currentCaptionLanguageId,
                    selectLanguage,
                  );
                }
                // /lazy-static/video-captions/8569c190-8405-4e0e-a89e-fec0c0377f75-da.vtt
              }
            };

            let mouseDown: { x: number, y: number, box?: TimelineClickBox } | null = null;
            let lastTimelineRender = 0;
            let lastTimelineVideoPosition = 0;
            let lastX: null | number = null;
            let currentCues: Cue[] = [];
            const updateTimeline = (t: number) => {
              if (videoIsPlaying) {
                videoPosition += (t-lastTimelineRender)/1000;
                timestampElement.innerText = formatTime(videoPosition);
              }
              if (videoPosition != lastTimelineVideoPosition) {
                currentCues = captionData.cues.filter(cue => cue.startTime < videoPosition && videoPosition < cue.endTime);
                renderPreview(previewElement, currentCues);
              }

              timelineContext = timelineElement.getContext("2d");
              const width = timelineElement.parentElement?.offsetWidth || 400;
              const height = 200;
              // Make it look good on retina displays, zoomed in browsers...
              const scale = window.devicePixelRatio;
              timelineElement.width = Math.floor(width * scale);
              timelineElement.height = Math.floor(height * scale);
              timelineElement.style.width = width + "px";
              timelineElement.style.height = height + "px";
              if (timelineContext) {
                timelineContext.scale(scale, scale);
                const boxes = renderTimeline(
                  timelineContext,
                  captionData.cues,
                  videoPosition,
                  videoDuration,
                  width,
                  height,
                  styles,
                  audioBarsInterval,
                  audioBars,
                );

                const getBoxAtPosition = (e: MouseEvent) => {
                  const rect = (e as any).target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  return boxes.find(box => {
                    if (box.x1 < x && x < box.x2 && box.y1 < y && y < box.y2) {
                      return true;
                    }
    
                    return false;
                  });
                }

                timelineElement.onmousemove = (e) => {
                  let deltaX = e.screenX - (lastX || e.screenX);
                  lastX = e.screenX;
                  const box = getBoxAtPosition(e);
                  if (box) {
                    if (box.type == 'cue') {
                      timelineElement.style.cursor = "pointer";
                      timelineElement.onclick = () => selectCue(box.cue);
                    }
                    if (box.type == "cueStart") {
                      timelineElement.style.cursor = "ew-resize";
                      timelineElement.onclick = () => {};
                      
                    }
                    if (box.type == "cueEnd") {
                      timelineElement.style.cursor = "ew-resize";
                      timelineElement.onclick = () => {};
                    }
                  } else {
                    timelineElement.style.cursor = "grab";
                    timelineElement.onclick = () => {};
                  }

                  if (mouseDown) {
                    if (mouseDown?.box?.type == "cueEnd") {
                      const newTime = mouseDown.box.cue.endTime + deltaX/timelineSecondLength;
                      if (
                        mouseDown.box.cue.startTime < newTime && 
                        (
                          cueMinSpace == 0 ||
                          !captionData.cues.find(other =>
                            other.startTime - cueMinSpace < newTime &&
                            other.startTime > newTime - cueMinSpace
                          )
                        )
                      ) {
                        mouseDown.box.cue.endTime = newTime;
                        if (!captionData.changed) {
                          captionData.changed = true;
                          renderLanguageSelector(
                            languageListElement,
                            captionList,
                            currentCaptionLanguageId,
                            selectLanguage,
                          );
                        }
                      }
                    } else if (mouseDown?.box?.type == "cueStart") {
                      const newTime = mouseDown.box.cue.startTime + deltaX/timelineSecondLength;
                      if (
                        newTime < mouseDown?.box?.cue.endTime &&
                        (
                          cueMinSpace == 0 ||
                          !captionData.cues.find(other =>
                            other.endTime - cueMinSpace < newTime &&
                            other.endTime > newTime - cueMinSpace
                          )
                        )
                      ) {
                        mouseDown.box.cue.startTime = newTime;
                        if (!captionData.changed) {
                          captionData.changed = true;
                          renderLanguageSelector(
                            languageListElement,
                            captionList,
                            currentCaptionLanguageId,
                            selectLanguage,
                          );
                        }
                      }
                    } else if(!mouseDown.box) {
                      videoPosition -= deltaX/timelineSecondLength;
                      player.seek(videoPosition);
                      timestampElement.innerText = formatTime(videoPosition);
                    }
                  }
                }
                timelineElement.onmousedown = (e) => {
                  const rect = (e as any).target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const box = getBoxAtPosition(e);
                  mouseDown = { x, y, box };
                };
                timelineElement.onmouseup = () => {
                  mouseDown = null;
                  lastX = null;
                };
              }
              lastTimelineRender = t;
              lastTimelineVideoPosition = videoPosition;

              if (currentCaptionLanguageId == languageId && originalHref == location.href) {
                requestAnimationFrame(updateTimeline);
              }
            };
            requestAnimationFrame(updateTimeline);

            renderCueTable(cuesElement, captionData.cues, { onCueSelected: (cue => selectCue(cue)) });
            // vttResultElement.innerText = generateVTT(cues);
          };

          if (!currentCaptionLanguageId && captions.data.length != 0) {
            currentCaptionLanguageId = captions.data[0].language.id;
            selectLanguage(currentCaptionLanguageId);
          }
          
          renderLanguageSelector(
            languageListElement,
            captionList,
            currentCaptionLanguageId,
            selectLanguage,
          );

          renderLanguageList(
            addNewLanguageListElement,
            Object.keys(languages)
              .map(id => ({ id, label: languages[id], disabled: captionList.findIndex(c => c.id == id) != -1 }))
              .sort((a, b) => a.label.localeCompare(b.label)),
              currentCaptionLanguageId, 
              languagePairs
          );


          addTranslateLanguageElement.onclick = async () => {
            const videoId = parameters.id;
            const originalLanguage = currentCaptionLanguageId;
            const targetLanguage = addNewLanguageListElement.value;

            console.log("Translate", originalLanguage, targetLanguage);

            if (originalLanguage == targetLanguage) {
              alert("Can't translate to the same language");
              return;
            }

            if(videoId && originalLanguage && targetLanguage) {


              console.log("Fetching captions");
              let response = await fetch(`/api/v1/videos/${parameters.id}/captions`, fetchCredentials);

              const captions : any = await response.json();

              console.log("Got captions" + JSON.stringify(captions));


              // Check if the video has the captions in the original language
              let path = "";
              let found = false;
              captions.data.forEach(
                (element: { language: { id: string }; captionPath: string }) => {
                  console.log("Checking language: " + element.language.id);
                  if (element.language.id === originalLanguage) {
                    path = element.captionPath;
                    found = true;
                  }
                }
              );

              if (!found) {
                alert("No captions in the original language found");
                return;
              }

              console.log("Fetching captions from " + path);

              let vttCaptions = await fetch(path, fetchCredentials);

              await vttCaptions.text().then(async (data) => {

                let subtitleTranslationRequest = await fetch(`/plugins/subtitle-translator/router/translate?id=${videoId}`, {
                  method: 'POST',
                  body: JSON.stringify({
                    originalLanguage: originalLanguage,
                    targetLanguage: targetLanguage,
                    captions: data,
                  }),
                  headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...fetchCredentials.headers,
                  },
                });

                let translatedCaptions = await subtitleTranslationRequest.json();

                console.log("Request done");
                console.log("Request Result : " + JSON.stringify(translatedCaptions));

                captionList.unshift({
                  id: '11',
                  label: 'Translation pending.',
                  changed: false,
                  cues: []
                });

                renderLanguageSelector(
                  languageListElement,
                  captionList,
                  currentCaptionLanguageId,
                  selectLanguage
                );
              });


            }

          }

          deleteCurrentLanguageElement.onclick = () => {
            if (currentCaptionLanguageId) {
              peertubeHelpers.showModal({
                title: "Delete?",
                content: `Confirm that you want to delete ${currentCaptionLanguageId}`,
                cancel: {
                  value: "Cancel",
                },
                confirm: {
                  value: "Delete",
                  action: async () => {
                    const res = await fetch(`/api/v1/videos/${parameters.id}/captions/${currentCaptionLanguageId}`, {
                      method: "DELETE",
                      ...fetchCredentials,
                    });
                    
                    if (res.status == 204) {
                      captionList = captionList.filter(e => e.id != currentCaptionLanguageId);
                      if (captionList.length != 0) {
                        selectLanguage(captionList[0].id);
                      } else {
                        selectLanguage();
                      }
                    } else {
                      alert("Could not delete");
                    }
                  },
                },
              });
            }
          };
        } else {
          main.innerHTML = 'no video id'
        }
      }
    }
  })
}

const getStyledText = (htmlText: string) => {
  let style: TextSTyle = TextSTyle.NONE;
  if (htmlText.startsWith("<b>") && htmlText.endsWith("</b>")) style = TextSTyle.BOLD;
  if (htmlText.startsWith("<i>") && htmlText.endsWith("</i>")) style = TextSTyle.ITALIC;
  if (htmlText.startsWith("<u>") && htmlText.endsWith("</u>")) style = TextSTyle.UNDERLINE;
  if (style != TextSTyle.NONE) {
    return { text: htmlText.slice(3, -4), style};
  }
  return { text: htmlText, style };
};

export {
  register
}
