import { Bimp } from "./Bimp.js";
import { bmp_lib } from "./bmp.js";
import { html, render } from "lit-html";

let scale, tileScale, asgCanvas, dmCanvas, tileCanvas, asgCtx, dmCtx, tileCtx;

let colors = [
  "#7597d1",
  "#324679",
  "#fffbbc",
  "#ffcbe8",
  "#7e0cc1",
  "#177d3d",
  "#cf2929",
  "#232021",
  "#d174a3",
  "#ff5900",
];
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

let depthMap = Bimp.empty(100, 100, 0);
for (let i = 1; i < 16; i++) {
  let offset = i * 3;
  depthMap = depthMap.rect(
    { x: offset, y: offset },
    { x: 100 - offset - 1, y: 100 - offset - 1 },
    i
  );
}

let tile = new Bimp(
  24,
  8,
  Array.from({ length: 24 * 8 }, () => Math.floor(Math.random() * 2))
);

function processFileUpload(e) {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    const img = new Image();
    img.src = e.target.result;

    img.onload = function () {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Get the pixel data of the grayscale image
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixels = imageData.data; // Pixel data in RGBA format

      // Convert RGBA to grayscale values and store them in a 2D array
      const grayArray = [];
      const grayValuesSet = new Set();

      for (let y = 0; y < img.height; y++) {
        const row = [];
        for (let x = 0; x < img.width; x++) {
          const index = (y * img.width + x) * 4;
          const r = pixels[index]; // Red channel
          const g = pixels[index + 1]; // Green channel
          const b = pixels[index + 2]; // Blue channel

          // Calculate the grayscale value (simple average)
          const gray = Math.round((r + g + b) / 3);
          row.push(gray);
          grayValuesSet.add(gray);
        }
        grayArray.push(row);
      }

      console.log(grayArray);

      // Convert set of unique gray values to an array and sort it
      const uniqueGrays = Array.from(grayValuesSet).sort((a, b) => a - b);

      // Create a map from gray values to index
      const grayToIndexMap = {};
      uniqueGrays.forEach((gray, idx) => {
        grayToIndexMap[gray] = idx;
      });

      // Convert the grayscale array to an indexed array with the remapped indices
      const indexedArray = grayArray.map((row) =>
        row.map((value) => grayToIndexMap[value])
      );

      resizeDepthMap(indexedArray[0].length, indexedArray.length);
      depthMap = new Bimp(
        indexedArray[0].length,
        indexedArray.length,
        indexedArray.flat()
      );
      redraw();

      //    // Output the results
      //    const output = document.getElementById("output");
      //    output.innerHTML = `
      //                   <p>Unique gray colors: ${uniqueGrays.join(", ")}</p>
      //                   <p>Number of unique gray colors: ${
      //                     uniqueGrays.length
      //                   }</p>
      //                   <p>Indexed 2D array (first 10x10 portion):</p>
      //                   <pre>${indexedArray
      //                     .slice(0, 10)
      //                     .map((row) => row.slice(0, 10))
      //                     .map((row) => row.join(", "))
      //                     .join("\n")}</pre>
      //               `;
      //  };
    };
  };
  reader.readAsDataURL(file);
}

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

function autostereogram(dm, colorTile) {
  // pad one tile width on the left because we need an extra tile when overlapping
  let depthMap = dm.pad(colorTile.width, 0, 0, 0, 0);
  let result = [];

  for (let y = 0; y < depthMap.height; y++) {
    let row = Array(depthMap.width);
    for (let x = 0; x < depthMap.width; x++) {
      // depth at (x,y) specifies the offset we'll add to the current x
      let depthOffset = depthMap.at(x, y);

      if (x < colorTile.width) {
        // Use the color tile value if we're still less than a tile in
        let tileX = (x + depthOffset) % colorTile.width;
        let tileY = y % colorTile.height;
        row[x] = colorTile.at(tileX, tileY);
      } else {
        // Otherwise, look back one tile in the current row result
        row[x] = row.at(x + depthOffset - colorTile.width);
      }
    }
    result.push(...row);
  }

  return new Bimp(depthMap.width, depthMap.height, result);
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

  asgCanvas.width = (depthMap.width + tile.width) * scale;
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

function downloadBMP(bimp, palette, fileName) {
  // let asg = autostereogram(depthMap, tile, colors);

  const bmp2d = bimp.make2d();
  const rgbPalette = palette.map((hex) => hexToRgb(hex));
  const im = document.createElement("img");

  bmp_lib.render(im, bmp2d, rgbPalette);

  download(im.src, fileName);
}

function view() {
  return html`<div class="site">
    <input
      type="file"
      id="imageInput"
      accept="image/png"
      @change=${(e) => processFileUpload(e)} />
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
        <span>${depthMap.width + tile.width} x ${depthMap.height}</span>
        <button @click=${() => downloadPNG()}>Download PNG</button>
        <button
          @click=${() =>
            downloadBMP(
              autostereogram(depthMap, tile, colors),
              colors,
              "autostereogram.bmp"
            )}>
          Download BMP
        </button>
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
