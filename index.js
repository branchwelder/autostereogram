import { Bimp } from "./Bimp.js";
import { bmp_lib } from "./bmp.js";
import { html, render } from "lit-html";

let scale, tileScale, asgCanvas, dmCanvas, tileCanvas, asgCtx, dmCtx, tileCtx;

let colors = ["#fdee19", "#e77b5a"];
let depths = [
  "#000",
  "#111",
  "#222",
  "#333",
  "#444",
  "#555",
  "#666",
  "#777",
  "#888",
  "#999",
  "#aaa",
  "#bbb",
  "#ccc",
  "#ddd",
  "#eee",
  "#fff",
];
let activeTool = "brush";
let activeDepth = 6;
let activeColor = 0;

let depthMap = Bimp.empty(200, 100, 0);
depthMap = depthMap.rect({ x: 20, y: 20 }, { x: 50, y: 40 }, 5);
depthMap = depthMap.rect({ x: 40, y: 30 }, { x: 70, y: 5 }, 9);
depthMap = depthMap.rect({ x: 45, y: 25 }, { x: 80, y: 45 }, 15);

let tile = new Bimp(
  12,
  3,
  [
    0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1,
  ]
);

const iconMap = {
  flood: "fa-fill-drip fa-flip-horizontal",
  brush: "fa-paintbrush",
  rect: "fa-vector-square",
  line: "fa-minus",
  shift: "fa-up-down-left-right",
};

const tools = {
  brush,
  flood,
  rect,
  line,
  shift,
};

function brush(bitmap, startPos, value) {
  function onMove(newPos) {
    bitmap = bitmap.line(
      { x: startPos.x, y: startPos.y },
      { x: newPos.x, y: newPos.y },
      value
    );

    startPos = newPos;
    return bitmap;
  }

  return onMove;
}

function flood(bitmap, startPos, value) {
  function onMove(newPos) {
    bitmap = bitmap.flood(newPos, value);
    startPos = newPos;
    return bitmap;
  }

  return onMove;
}

function rect(bitmap, startPos, value) {
  function onMove(newPos) {
    return bitmap.rect(
      { x: startPos.x, y: startPos.y },
      { x: newPos.x, y: newPos.y },
      value
    );
  }
  return onMove;
}

function line(bitmap, startPos, value) {
  function onMove(newPos) {
    return bitmap.line(
      { x: startPos.x, y: startPos.y },
      { x: newPos.x, y: newPos.y },
      value
    );
  }
  return onMove;
}

function shift(bitmap, startPos, value) {
  function onMove(newPos) {
    return bitmap.shift(startPos.x - newPos.x, startPos.y - newPos.y);
  }
  return onMove;
}

function autostereogram(depthMap, baseTile, colors) {
  let pixels = [];
  let tile = baseTile.make2d();

  for (let y = 0; y < depthMap.height; y++) {
    let currentDepth = depthMap.at(0, y);
    let currentPattern = [...tile[y % baseTile.height]];
    let patternLength = baseTile.width;
    let position = 0; // Position in the base pattern

    for (let x = 0; x < depthMap.width; x++) {
      let nextDepth = depthMap.at(x, y);
      if (nextDepth < currentDepth) {
        // remove a pixel from the current pattern if the next pixel is at a lower depth
        // Like looking down a staircase
        currentPattern.splice(position, 1);
        patternLength--;
        if (position == patternLength) position = 0; // Restart if we hit the end of the base pattern
      }
      if (nextDepth > currentDepth) {
        // add a random pixel to the current pattern if the next pixel is at a higher depth
        // Like looking up a staircase
        currentPattern.splice(
          position,
          0,
          Math.floor(Math.random() * colors.length)
        );
        patternLength++;
      }
      currentDepth = nextDepth;
      pixels.push(currentPattern[position]);
      position++;
      if (position == patternLength) position = 0;
    }
  }

  return new Bimp(depthMap.width, depthMap.height, pixels);
}

function drawBimp(ctx, scale, bitmap, colorTable) {
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      let colorIndex = bitmap.at(x, y);
      ctx.fillStyle = colorTable[colorIndex];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

function eventPos(e, scale) {
  const bounds = e.target.getBoundingClientRect();

  return {
    x: Math.floor((e.clientX - bounds.x) / scale),
    y: Math.floor((e.clientY - bounds.y) / scale),
  };
}

function editDepthMap(e) {
  let pos = eventPos(e, scale);
  let tool = tools[activeTool];
  if (!tool) return;
  let onMove = tool(depthMap, pos, activeDepth);

  if (!onMove) return;
  depthMap = onMove(pos);
  redraw();
  function move(moveEvent) {
    if (moveEvent.buttons == 0) {
      end();
    } else {
      let newPos = eventPos(moveEvent, scale);
      if (newPos.x == pos.x && newPos.y == pos.y) return;
      depthMap = onMove(newPos);
      redraw();
      pos = newPos;
    }
  }

  function end() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointerleave", end);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointerleave", end);
}

function editTile(e) {
  let pos = eventPos(e, tileScale);
  let tool = tools[activeTool];
  if (!tool) return;
  let onMove = tool(tile, pos, activeColor);

  if (!onMove) return;
  tile = onMove(pos);
  redraw();
  function move(moveEvent) {
    if (moveEvent.buttons == 0) {
      end();
    } else {
      let newPos = eventPos(moveEvent, tileScale);
      if (newPos.x == pos.x && newPos.y == pos.y) return;
      tile = onMove(newPos);
      redraw();
      pos = newPos;
    }
  }

  function end() {
    e.target.removeEventListener("pointermove", move);
    e.target.removeEventListener("pointerup", end);
    e.target.removeEventListener("pointerleave", end);
  }

  e.target.addEventListener("pointermove", move);
  e.target.addEventListener("pointerup", end);
  e.target.addEventListener("pointerleave", end);
}

function sizeCanvases() {
  let bbox = document
    .getElementById("depth-map-container")
    .getBoundingClientRect();
  scale = Math.min(bbox.width / depthMap.width, bbox.height / depthMap.height);

  let tilebbox = document
    .getElementById("tile-container")
    .getBoundingClientRect();
  tileScale = Math.min(
    tilebbox.width / tile.width,
    tilebbox.height / tile.height
  );

  asgCanvas.width = depthMap.width * scale;
  asgCanvas.height = depthMap.height * scale;

  dmCanvas.width = depthMap.width * scale;
  dmCanvas.height = depthMap.height * scale;

  tileCanvas.width = tile.width * tileScale;
  tileCanvas.height = tile.height * tileScale;
}

function resizeTile(width, height) {
  tile = tile.resize(width, height);
  sizeCanvases();
  redraw();
}

function resizeDepthMap(width, height) {
  depthMap = depthMap.resize(width, height);
  sizeCanvases();
  redraw();
}

function redraw() {
  let asg = autostereogram(depthMap, tile, colors);

  drawBimp(asgCtx, scale, asg, colors);
  drawBimp(dmCtx, scale, depthMap, depths);
  drawBimp(tileCtx, tileScale, tile, colors);
}

function download(dataStr, downloadName) {
  const downloadAnchorNode = document.createElement("a");

  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", downloadName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

function downloadPNG() {
  download(
    document.getElementById("autostereogram").toDataURL("image/png"),
    "autostereogram.png"
  );
}

function downloadBMP() {
  let asg = autostereogram(depthMap, tile, colors);

  const bmp2d = asg.make2d();
  const rgbPalette = colors.map((hex) => hexToRgb(hex));
  const im = document.createElement("img");

  bmp_lib.render(im, bmp2d, rgbPalette);

  download(im.src, "autostereogram.bmp");
}

function view() {
  return html`<div class="site">
    <div id="left">
      <div class="controls">
        <span>width</span>
        <input
          min="1"
          step="1"
          type="number"
          .value=${String(depthMap.width)}
          @change=${(e) =>
            resizeDepthMap(Number(e.target.value), depthMap.height)} />
        <span>height</span>
        <input
          min="1"
          step="1"
          type="number"
          .value=${String(depthMap.height)}
          @change=${(e) =>
            resizeDepthMap(depthMap.width, Number(e.target.value))} />
      </div>
      <div class="color-select-container">
        ${depths.map(
          (depth, index) =>
            html`<button
              class="color-select ${activeDepth == index ? "active" : ""}"
              style="--color: ${depth};"
              @click=${() => (activeDepth = index)}></button>`
        )}
      </div>
      <div id="depth-map-container">
        <canvas @pointerdown=${(e) => editDepthMap(e)} id="depthmap"></canvas>
      </div>

      <div class="tool-select">
        ${Object.keys(tools).map(
          (tool) =>
            html`<button
              class="icon-btn ${activeTool == tool ? "active" : ""}"
              @click=${() => (activeTool = tool)}>
              <i class="fa-solid ${iconMap[tool]}"></i>
            </button>`
        )}
      </div>
      <div class="controls">
        <span>width</span>
        <input
          min="1"
          step="1"
          type="number"
          .value=${String(tile.width)}
          @change=${(e) => resizeTile(Number(e.target.value), tile.height)} />
        <span>height</span>
        <input
          min="1"
          step="1"
          type="number"
          .value=${String(tile.height)}
          @change=${(e) => resizeTile(tile.width, Number(e.target.value))} />
      </div>
      <div class="color-select-container">
        ${colors.map(
          (color, index) =>
            html`<button
              class="color-select ${activeColor == index ? "active" : ""}"
              style="--color: ${color};"
              @click=${() => (activeColor = index)}></button>`
        )}
        <button class="add-color" @click=${() => colors.push(getRandomColor())}>
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      <div id="tile-container">
        <canvas @pointerdown=${(e) => editTile(e)} id="tile"></canvas>
      </div>
    </div>
    <div id="right">
      <canvas id="autostereogram"></canvas>
      <div class="controls">
        <button @click=${() => downloadPNG()}>Download PNG</button>
        <button @click=${() => downloadBMP()}>Download BMP</button>
      </div>
    </div>
  </div>`;
}

function r() {
  render(view(), document.body);
  window.requestAnimationFrame(r);
}

function init() {
  render(view(), document.body);
  asgCanvas = document.getElementById("autostereogram");
  dmCanvas = document.getElementById("depthmap");
  tileCanvas = document.getElementById("tile");
  asgCtx = asgCanvas.getContext("2d");
  dmCtx = dmCanvas.getContext("2d");
  tileCtx = tileCanvas.getContext("2d");

  sizeCanvases();
  redraw();
  r();
}

window.onload = init;
