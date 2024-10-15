import { Cue, TextSTyle as TextStyle } from "./types";
import { formatTime } from "./util";

export const renderBasics = (parent: Element) => {
  parent.innerHTML = `
    <div class="margin-content row subtitle-head">
      <div class="col-md-12">
        <div id="subtitle-languages" class="action-bubble"></div>
        <div class="action-bubble">
          <select id="subtitle-add-language-list"></select>
          <button id="subtitle-add-translate" class="btn btn-primary"> Translate </button>
        </div>
        <div class="action-bubble">
          <button id="subtitle-delete" class="btn btn-danger">Delete</button>
          <button id="subtitle-save" class="btn btn-success">Save</button>
        </div>
      </div>
    </div>
    <div class="margin-content row subtitle-main">
      <div class="col-md-6">
        <table class="subtitle-cues">
          <thead>
            <tr><th>ID</th><th>Start time</th><th>End time</th><th>Text</th></tr>
          </thead>
          <tbody id="subtitle-cues"></tbody>
        </table>
      </div>
      <div class="col-md-6">
        <div class="subtitle-editor">
          <div class="subtitle-editor-overflow">
            <div id="subtitle-video-viewer"></div>
            <div id="subtitle-preview"></div>
            <div class="my-2">
              <span id="subtitle-timestamp">00:00:00.000</span>
              <button id="subtitle-set-start" class="btn btn-secondary">Set start</button>
              <button id="subtitle-set-end" class="btn btn-secondary">Set end</button>
              <div class="btn-group">
                <button id="subtitle-cue-style-italic" type="button" class="btn btn-secondary subtitle-cue-italic">Italic</button>
                <button id="subtitle-cue-style-bold" type="button" class="btn btn-secondary subtitle-cue-bold">Bold</button>
                <button id="subtitle-cue-style-underline" type="button" class="btn btn-secondary subtitle-cue-underline">Underline</button>
              </div>
              <button id="subtitle-delete-cue" class="btn btn-warning">Delete</button>
            </div>
            <textarea id="subtitle-cue-input" class="form-control"></textarea>
          </div>
        </div>
      </div>
    </div>
    <div id="bottom-controls">
      <div class="margin-content row">
        <div class="md-12">
          <div id="subtitle-video-controls">
            <p>
              <label><input id="subtitle-pad-cues" type="checkbox">Pad cues</label>
              <button id="subtitle-visualize-audio" class="btn btn-info">Visualize audio (<span id="subtitle-visualize-audio-size">0 mb.</span>)</button>

              <button id="subtitle-seek-minus-1" class="btn btn-dark">-1s</button>
              <button id="subtitle-pause-play" class="btn btn-dark">Pause/play</button>
              <button id="subtitle-seek-plus-1" class="btn btn-dark">+1s</button>
              
              <button id="subtitle-select-current" class="btn btn-secondary">Select here</button>
              <button id="subtitle-insert-new" class="btn btn-primary">Insert here</button>
              <button id="subtitle-insert-new-after" class="btn btn-primary">Insert after here</button>
              <button id="subtitle-insert-new-selected" class="btn btn-primary">Insert after selected</button>
            </p>
          </div>
          <canvas id="subtitle-timeline" />
          <pre id="subtitle-vtt-result"></pre>
        </div>
      </div>
    </div>
    <div id="transcription-popup" class="popup">
      <div class="popup-content">
        <h2>No Available Transcription</h2>
        <p>There is currently no transcription available for this video.</p>
        <button class="btn btn-primary" id="generate-transcription">Generate Transcription </button>
      </div>
    </div>

    <div id="translation-ready-popup" class="popup">
      <div class="popup-content">
        <h2>Your subtitle translation is available</h2>
        <p id="translation-ready-popup-text"></p>
        <button class="btn btn-primary" id="translation-ready-save"> Save </button>
        <button class="btn btn-danger" id="translation-ready-discard"> Discard </button>
      </div>
    </div>

  `;
};

export const renderLanguageSelector = (
  element: HTMLDivElement,
  languages: { id: string, label: string, changed: boolean }[],
  currentLangId: string,
  onSelected: (id: string) => any,
) => {
  element.innerHTML = "";

  languages.forEach((lang) => {
    if(lang.id!="11"){
      const btn = document.createElement("button");
      btn.classList.add("btn");
      btn.classList.add((lang.id == currentLangId) ? "btn-dark" : "btn-light");
      btn.innerText = lang.label;
      if (lang.changed) {
        btn.innerText += " (unsaved)";
      }
      btn.onclick = () => onSelected(lang.id);
      element.appendChild(btn);
      element.appendChild(document.createTextNode(" "));
    }else{
      // pending subtitle, not available for selection
      const btn = document.createElement("button");
      const loader = document.createElement("span");
      loader.classList.add("loader");
      btn.classList.add("btn");
      btn.classList.add("btn-light");

      btn.innerText = lang.label;
      btn.disabled = true;
      btn.appendChild(loader);
      element.appendChild(btn);
      element.appendChild(document.createTextNode(" "));
    }
  });
};

export const renderPreview = (element: HTMLDivElement, cues: Cue[]) => {
  element.innerHTML = "";
  cues.forEach(cue => {
    const span = document.createElement("span");
    span.innerText = cue.text;
    if (cue.style == TextStyle.BOLD) {
      span.setAttribute("class", "subtitle-cue-bold")
    } else if (cue.style == TextStyle.ITALIC) {
      span.setAttribute("class", "subtitle-cue-italic")
    } else if (cue.style == TextStyle.UNDERLINE) {
      span.setAttribute("class", "subtitle-cue-underline")
    }
    element.appendChild(span);
  });
}

export const renderLanguageList = (element: HTMLSelectElement, languages: { id: string, label: string, disabled: boolean }[], currentCaptionLanguageId: string, languagesPair : string[][]) => {
  element.innerHTML = "";
  let count = 0;
  if(currentCaptionLanguageId) {
    // console.log("currentCaptionLanguageId: " + currentCaptionLanguageId);
    languagesPair.forEach(pair => {
      // console.log("pair[0]: " + pair[0] + " pair[1]: " + pair[1]);
        languages.forEach(lang => {
          if(pair[0] == currentCaptionLanguageId && pair[1] == lang.id) {
            const opt = document.createElement("option");
            opt.innerText = lang.label;
            opt.value = lang.id;
            if (lang.disabled) {
              opt.setAttribute("disabled", "disabled");
            } else {
              count += 1;
            }
            element.appendChild(opt);
          }
        });
    });

    if(count == 0){

      let actionzone = element.parentElement;
      if(actionzone){
        actionzone.style.display = 'none';
      }
    } else {

      let actionzone = element.parentElement;
      if(actionzone){
        actionzone.style.display = 'block';
      }
    }

  }

}

interface RenderTableOpts {
  time?: number;
  onCueSelected?: (cue: Cue, i: number) => any;
};

export const renderCueTable = (table: Element, cues: Cue[], opts: RenderTableOpts) => {
  table.innerHTML = "";

  cues.map(e => e)
    .sort((a, b) => a.startTime - b.startTime)
    .forEach((cue, i) => {
      let isViewed = false;
      if (typeof opts.time == "number") {
        if (cue.startTime < opts.time && opts.time < cue.endTime) {
          isViewed = true;
        }
      }

      const row = document.createElement("tr")
      if (isViewed) {
        row.setAttribute("class", "subtitle-cue-highlight");
      }
      const onCueSelected = opts.onCueSelected;
      if (typeof onCueSelected == "function") {
        row.addEventListener("click", () => onCueSelected(cue, i));
      }

      let e = document.createElement("td");
      e.innerText = cue.id;
      row.appendChild(e);

      e = document.createElement("td");
      e.innerText = formatTime(cue.startTime);
      row.appendChild(e);

      e = document.createElement("td");
      e.innerText = formatTime(cue.endTime);
      row.appendChild(e);

      e = document.createElement("td");
      let text = document.createElement("span")
      text.innerText = cue.text;
      e.appendChild(text);
      row.appendChild(e);
      if (cue.style == TextStyle.BOLD) {
        text.setAttribute("class", "subtitle-cue-bold")
      } else if (cue.style == TextStyle.ITALIC) {
        text.setAttribute("class", "subtitle-cue-italic")
      } else if (cue.style == TextStyle.UNDERLINE) {
        text.setAttribute("class", "subtitle-cue-underline")
      }

      table.appendChild(row);
    });

  return table;
};

export const generateVTT = (cues: Cue[]) => {
  let result = "WEBVTT FILE\r\n\r\n";

  cues.forEach(cue => {
    if (cue.id) {
      result += cue.id + "\r\n";
    }

    result += `${formatTime(cue.startTime)} --> ${formatTime(cue.endTime)}`;
    if (cue.align != "center") {
      result += " align:" + cue.align;
    }
    result += "\r\n";

    if (cue.style !== TextStyle.NONE) {
      result += "<" + cue.style + ">"
    }
    result += cue.text;
    if (cue.style !== TextStyle.NONE) {
      result += "</" + cue.style + ">"
    }
    result += "\r\n\r\n";
  });

  return result;
};

export interface TimelineClickBox {
  type: "cue" | "cueStart" | "cueEnd",
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cue: any,
};
export const timelineSecondLength = 100;
const timelineFont = "16px Arial";
export const renderTimeline = (
  ctx: CanvasRenderingContext2D,
  cues: any[],
  time: number,
  duration: number,
  width: number,
  height: number,
  styles: {
    text: string,
    box: string,
    audioBars: string,
  },
  barsInterval: number,
  bars?: Float32Array,
) => {
  const clickBoxes: TimelineClickBox[] = [];
  const dragRadius = 8;
  const cueY1 = 30;
  const cueY2 = 50;
  const cueBoxHeight = cueY2 - cueY1;
  // const cueHeight = 20;

  // TODO: only calculate when cues change
  let lanes: number[] = [];

  ctx.font = timelineFont;
  ctx.moveTo(0, 0);
  ctx.clearRect(0, 0, width, height);


  ctx.beginPath();
  ctx.strokeStyle = styles.text;
  ctx.fillStyle = styles.text;
  for (let i = 0; i < duration * 10; i += 1) {
    let t = i / 10;
    const p = Math.floor((t - time) * timelineSecondLength + (width / 2));
    if (p < width && 0 < p) {
      ctx.moveTo(p, 20);
      ctx.lineTo(p, t % 1 == 0 ? 30 : 24);
    }
  }
  ctx.stroke();

  for (let i = 0; i < duration; i++) {
    const p = Math.floor((i - time) * timelineSecondLength + (width / 2));
    if (p < width && 0 < p) {
      ctx.textAlign = "center";
      // ctx.moveTo(p, 0);
      ctx.fillText("" + i % 60, p, 18);
    }
  }

  if (bars) {
    const w = barsInterval * timelineSecondLength;
    ctx.beginPath();
    ctx.fillStyle = styles.audioBars;
    ctx.moveTo(0, height);
    bars.forEach((bar, i) => {
      const p1 = (i * barsInterval - time) * timelineSecondLength + (width / 2);
      if (-w < p1 && p1 < width) {
        const h = bar*height/2;
        ctx.lineTo(p1,height-h);
      }
    })
    ctx.lineTo(width, height);
    ctx.fill();
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const p1 = Math.floor((cue.startTime - time) * timelineSecondLength + (width / 2));
    const p2 = Math.floor((cue.endTime - time) * timelineSecondLength + (width / 2));

    let lane = lanes.findIndex(end => end < cue.startTime);
    if (lane == -1) {
      lane = lanes.length;
      lanes.push(cue.endTime);
    }
    lanes[lane] = cue.endTime;

    if ((p1 < width && 0 < p1) || (p2 < width && 0 < p2) || (p1 < width / 2 && width / 2 < p2)) {
      ctx.fillStyle = styles.box;
      const y = lane * (cueBoxHeight + 4) + cueY1
      ctx.fillRect(p1, y, p2 - p1, cueBoxHeight);
      // ctx.stroke();
      // ctx.fill();
      ctx.fillStyle = styles.text;
      ctx.textAlign = "left";
      if (cue.style == TextStyle.BOLD) {
        ctx.font = "bold " + timelineFont;
      } else if (cue.style == TextStyle.ITALIC) {
        ctx.font = "italic " + timelineFont;
      } else if (cue.style == TextStyle.UNDERLINE) {
        ctx.font = timelineFont;
        const textWidth = ctx.measureText(cue.text).width;
        ctx.beginPath();
        ctx.moveTo(p1, y + cueBoxHeight);
        ctx.lineTo(p1 + textWidth, y + cueBoxHeight);
        ctx.stroke();
      } else {
        ctx.font = timelineFont;
      }
      ctx.fillText(cue.text, p1, y + cueBoxHeight);

      clickBoxes.push({
        type: "cueStart",
        x1: p1 - dragRadius,
        y1: y,
        x2: p1 + dragRadius,
        y2: y + cueBoxHeight,
        cue,
      });
      clickBoxes.push({
        type: "cueEnd",
        x1: p2 - dragRadius,
        y1: y,
        x2: p2 + dragRadius,
        y2: y + cueBoxHeight,
        cue,
      });
      clickBoxes.push({
        type: "cue",
        x1: p1,
        y1: y,
        x2: p2,
        y2: y + cueBoxHeight,
        cue,
      });
    }
  }

  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  return clickBoxes;
};
