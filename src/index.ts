import { html, render } from "lit-html";
import Split from "split.js";
import { createEmptyBitmap, bitmapEditingTools } from "./bitmap.js";
import { drawBitmapToCanvas, fitCanvasToParent } from "./drawing.js";
import { autostereogram } from "./autostereogram.js";
import {
  getRandomColor,
  getPointerCellInBitmapCanvas,
  downloadPNG,
} from "./utils.js";

let activeTool = "brush";
let activeDepth = 6;
let activeColor = 0;
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

// Convert hex colors to RGB for Bitmap palette
const rgbColors: [number, number, number][] = colors.map((hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? ([
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ] as [number, number, number])
    : ([0, 0, 0] as [number, number, number]);
});

let depths = [
  "#000000",
  "#111111",
  "#222222",
  "#333333",
  "#444444",
  "#555555",
  "#666666",
  "#777777",
  "#888888",
  "#999999",
  "#aaaaaa",
  "#bbbbbb",
  "#cccccc",
  "#dddddd",
  "#eeeeee",
  "#ffffff",
];

// Convert hex depths to RGB for Bitmap palette
const rgbDepths: [number, number, number][] = depths.map((hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? ([
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ] as [number, number, number])
    : ([0, 0, 0] as [number, number, number]);
});

// Initialize depth map with Bitmap
let depthMap = createEmptyBitmap(100, 100, rgbDepths[0], rgbDepths);
for (let i = 1; i < 16; i++) {
  let offset = i * 3;
  const onMove = bitmapEditingTools.rect(depthMap, [offset, offset], i);
  const changes = onMove([100 - offset - 1, 100 - offset - 1]);
  depthMap = {
    ...depthMap,
    data: depthMap.data.map((val, idx) => {
      const change = changes.find(([x, y]) => x + y * depthMap.width === idx);
      return change ? change[2] : val;
    }),
  };
}

// Initialize tile with Bitmap
let tile = createEmptyBitmap(24, 8, rgbColors[0], rgbColors);
const randomData = Array.from({ length: 24 * 8 }, () =>
  Math.floor(Math.random() * 2)
);
tile = {
  ...tile,
  data: randomData,
};

function processFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e: ProgressEvent<FileReader>) {
    const img = new Image();
    img.src = e.target?.result as string;

    img.onload = function () {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the image on the canvas
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Get the pixel data of the grayscale image
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixels = imageData.data; // Pixel data in RGBA format

      // Convert RGBA to grayscale values and store them in a 2D array
      const grayArray: number[][] = [];
      const grayValuesSet = new Set<number>();

      for (let y = 0; y < img.height; y++) {
        const row: number[] = [];
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

      // Convert set of unique gray values to an array and sort it
      const uniqueGrays = Array.from(grayValuesSet).sort((a, b) => a - b);

      // Create a map from gray values to index
      const grayToIndexMap: { [key: number]: number } = {};
      uniqueGrays.forEach((gray, idx) => {
        grayToIndexMap[gray] = idx;
      });

      // Convert the grayscale array to an indexed array with the remapped indices
      const indexedArray = grayArray.map((row) =>
        row.map((value) => grayToIndexMap[value])
      );

      resizeDepthMap(indexedArray[0].length, indexedArray.length);
      depthMap = {
        width: indexedArray[0].length,
        height: indexedArray.length,
        data: indexedArray.flat(),
        palette: rgbDepths,
      };
      redraw();
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

function editDepthMap(e: PointerEvent) {
  const canvasElement = document.getElementById(
    "depthmap"
  ) as HTMLCanvasElement;

  let [xPos, yPos] = getPointerCellInBitmapCanvas(e, canvasElement, depthMap);

  let tool = bitmapEditingTools[activeTool as keyof typeof bitmapEditingTools];
  if (!tool) return;

  let onMove = tool(depthMap, [xPos, yPos], activeDepth);

  if (!onMove) return;
  const changes = onMove([xPos, yPos]);
  depthMap = {
    ...depthMap,
    data: depthMap.data.map((val, idx) => {
      const change = changes.find(([x, y]) => x + y * depthMap.width === idx);
      return change ? change[2] : val;
    }),
  };
  redraw();

  function move(moveEvent: PointerEvent) {
    if (moveEvent.buttons == 0) {
      end();
    } else {
      let [newX, newY] = getPointerCellInBitmapCanvas(
        moveEvent,
        canvasElement,
        depthMap
      );
      if (newX == xPos && newY == yPos) return;
      const changes = onMove([newX, newY]);
      depthMap = {
        ...depthMap,
        data: depthMap.data.map((val, idx) => {
          const change = changes.find(
            ([x, y]) => x + y * depthMap.width === idx
          );
          return change ? change[2] : val;
        }),
      };
      redraw();
      xPos = newX;
      yPos = newY;
    }
  }

  function end() {
    const target = e.target as HTMLElement;
    if (target) {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", end as EventListener);
      target.removeEventListener("pointerleave", end as EventListener);
    }
  }

  const target = e.target as HTMLElement;
  if (target) {
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", end as EventListener);
    target.addEventListener("pointerleave", end as EventListener);
  }
}

function editTile(e: PointerEvent) {
  const canvasElement = document.getElementById("tile") as HTMLCanvasElement;
  let [xPos, yPos] = getPointerCellInBitmapCanvas(e, canvasElement, tile);
  let tool = bitmapEditingTools[activeTool as keyof typeof bitmapEditingTools];
  if (!tool) return;
  let onMove = tool(tile, [xPos, yPos], activeColor);

  if (!onMove) return;
  const changes = onMove([xPos, yPos]);
  tile = {
    ...tile,
    data: tile.data.map((val, idx) => {
      const change = changes.find(([x, y]) => x + y * tile.width === idx);
      return change ? change[2] : val;
    }),
  };
  redraw();

  function move(moveEvent: PointerEvent) {
    if (moveEvent.buttons == 0) {
      end();
    } else {
      let [newX, newY] = getPointerCellInBitmapCanvas(
        moveEvent,
        canvasElement,
        tile
      );
      if (newX == xPos && newY == yPos) return;
      const changes = onMove([newX, newY]);
      tile = {
        ...tile,
        data: tile.data.map((val, idx) => {
          const change = changes.find(([x, y]) => x + y * tile.width === idx);
          return change ? change[2] : val;
        }),
      };
      redraw();
      xPos = newX;
      yPos = newY;
    }
  }

  function end() {
    const target = e.target as HTMLElement;
    if (target) {
      target.removeEventListener("pointermove", move as EventListener);
      target.removeEventListener("pointerup", end as EventListener);
      target.removeEventListener("pointerleave", end as EventListener);
    }
  }

  const target = e.target as HTMLElement;
  if (target) {
    target.addEventListener("pointermove", move as EventListener);
    target.addEventListener("pointerup", end as EventListener);
    target.addEventListener("pointerleave", end as EventListener);
  }
}

function resizeTile(width: number, height: number) {
  const newData = Array(width * height).fill(0);
  for (let y = 0; y < Math.min(height, tile.height); y++) {
    for (let x = 0; x < Math.min(width, tile.width); x++) {
      newData[x + y * width] = tile.data[x + y * tile.width];
    }
  }
  tile = {
    width,
    height,
    data: newData,
    palette: tile.palette,
  };
  redraw();
}

function resizeDepthMap(width: number, height: number) {
  const newData = Array(width * height).fill(0);
  for (let y = 0; y < Math.min(height, depthMap.height); y++) {
    for (let x = 0; x < Math.min(width, depthMap.width); x++) {
      newData[x + y * width] = depthMap.data[x + y * depthMap.width];
    }
  }
  depthMap = {
    width,
    height,
    data: newData,
    palette: depthMap.palette,
  };
  redraw();
}

function toolbar() {
  return html` <div class="flex items-center gap-4 bg-gray-900 p-2 text-white">
    <span class="font-bold">Autostereogram</span>
    <div class="flex justify-center gap-1">
      ${Object.keys(iconMap).map(
        (tool) =>
          html`<button
            class="border-0 outline-0 cursor-pointer h-8 w-8 rounded-lg hover:bg-gray-600 
            ${activeTool == tool ? "bg-gray-500" : "bg-gray-700"}"
            @click=${() => (activeTool = tool)}>
            <i class="fa-solid ${iconMap[tool]}"></i>
          </button>`
      )}
    </div>
  </div>`;
}

function previewPanel() {
  return html`
    <div class="flex items-center gap-1 p-2 bg-gray-800">
      <span class="text-sm text-gray-300 font-bold">Preview</span>
      <div class="flex-1"></div>
      <span class="text-sm text-gray-300 font-mono">
        ${depthMap.width + tile.width} × ${depthMap.height}
      </span>
      <button
        class="h-7 w-7 rounded-lg bg-gray-700 text-white hover:bg-gray-600 cursor-pointer"
        @click=${() =>
          downloadPNG(
            document.getElementById("autostereogram") as HTMLCanvasElement
          )}>
        <i class="fa-solid fa-download"></i>
      </button>
    </div>
    <div class="flex-1 flex inset-shadow-sm items-center justify-center">
      <canvas id="autostereogram" class="border-1 border-black"></canvas>
    </div>
  `;
}

function depthMapPanel() {
  return html`
    <div id="depth-map-panel" class="flex flex-col w-full">
      <div class="flex items-center gap-2 p-2 bg-gray-800">
        <span class="text-sm text-gray-300 font-bold">Depth Map</span>
        <div class="flex-1"></div>
        <input
          type="file"
          id="imageInput"
          accept="image/png"
          class="text-sm text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 cursor-pointer"
          @change=${(e: Event) => processFileUpload(e)} />
        <button
          class="h-7 w-7 rounded-lg bg-gray-700 text-white hover:bg-gray-600 cursor-pointer"
          @click=${() =>
            downloadPNG(
              document.getElementById("depthmap") as HTMLCanvasElement
            )}>
          <i class="fa-solid fa-download"></i>
        </button>
        <div class="flex items-center gap-1">
          <input
            min="1"
            step="1"
            type="number"
            class="w-16 px-2 py-1 text-sm rounded bg-gray-700 text-white"
            .value=${String(depthMap.width)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              resizeDepthMap(Number(target.value), depthMap.height);
            }} />
          <span class="text-sm text-gray-300">×</span>
          <input
            min="1"
            step="1"
            type="number"
            class="w-16 px-2 py-1 text-sm rounded bg-gray-700 text-white"
            .value=${String(depthMap.height)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              resizeDepthMap(depthMap.width, Number(target.value));
            }} />
        </div>
      </div>

      <div class="flex-1 flex overflow-hidden">
        <div
          class="flex flex-col items-center gap-1 p-1 bg-gray-800 overflow-y-auto flex-shrink-0">
          ${depths.map(
            (depth, index) =>
              html`<button
                class="border-0 outline-0 cursor-pointer h-6 w-6 rounded flex-shrink-0 ${activeDepth ==
                index
                  ? "outline outline-1 outline-white"
                  : ""}"
                style="background-color: ${depth};"
                @click=${() => (activeDepth = index)}></button>`
          )}
        </div>
        <div class="flex-1 flex inset-shadow-sm items-center justify-center">
          <canvas
            id="depthmap"
            class="border-1 border-black"
            @pointerdown=${(e: PointerEvent) => editDepthMap(e)}></canvas>
        </div>
      </div>
    </div>
  `;
}

function tilePanel() {
  return html`
    <div id="tile-panel" class="flex flex-col w-full">
      <div class="flex items-center gap-2 p-2 bg-gray-800">
        <span class="text-sm text-gray-300 font-bold">Base Tile</span>
        <div class="flex-1"></div>
        <button
          class="h-7 w-7 rounded-lg bg-gray-700 text-white hover:bg-gray-600 cursor-pointer"
          @click=${() =>
            downloadPNG(document.getElementById("tile") as HTMLCanvasElement)}>
          <i class="fa-solid fa-download"></i>
        </button>
        <div class="flex items-center gap-1">
          <input
            min="1"
            step="1"
            type="number"
            class="w-16 px-2 py-1 text-sm rounded bg-gray-700 text-white"
            .value=${String(tile.width)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              resizeTile(Number(target.value), tile.height);
            }} />
          <span class="text-sm text-gray-300">×</span>
          <input
            min="1"
            step="1"
            type="number"
            class="w-16 px-2 py-1 text-sm rounded bg-gray-700 text-white"
            .value=${String(tile.height)}
            @change=${(e: Event) => {
              const target = e.target as HTMLInputElement;
              resizeTile(tile.width, Number(target.value));
            }} />
        </div>
      </div>
      <div class="flex flex-1 overflow-hidden">
        <div
          class="flex flex-col items-center gap-1 p-1 bg-gray-800 overflow-y-auto flex-shrink-0">
          <button
            class="border-0 outline-0 cursor-pointer h-6 w-6 rounded bg-gray-500 text-inherit"
            @click=${() => colors.push(getRandomColor())}>
            <i class="fa-solid fa-plus"></i>
          </button>
          ${colors.map(
            (color, index) =>
              html`<button
                class="flex-shrink-0 border-0 outline-0 cursor-pointer h-6 w-6 rounded ${activeColor ==
                index
                  ? "outline outline-1 outline-white"
                  : ""}"
                style="background-color: ${color};"
                @click=${() => (activeColor = index)}></button>`
          )}
        </div>
        <div class="flex-1 flex inset-shadow-sm items-center justify-center">
          <canvas
            id="tile"
            class="border-1 border-black"
            @pointerdown=${(e: PointerEvent) => editTile(e)}></canvas>
        </div>
      </div>
    </div>
  `;
}

function view() {
  return html` <div class="flex flex-col h-screen overflow-hidden bg-gray-700">
    ${toolbar()}
    <div class="flex flex-1 h-full overflow-hidden">
      <div id="design-panel" class="flex flex-col">
        ${depthMapPanel()} ${tilePanel()}
      </div>
      <div id="preview-panel" class="flex flex-col">${previewPanel()}</div>
    </div>
  </div>`;
}

function r() {
  render(view(), document.body);
  window.requestAnimationFrame(r);
}

function redraw() {
  let asg = autostereogram(depthMap, tile);

  const autostereogramCanvas = document.getElementById(
    "autostereogram"
  ) as HTMLCanvasElement;
  const depthmapCanvas = document.getElementById(
    "depthmap"
  ) as HTMLCanvasElement;
  const tileCanvas = document.getElementById("tile") as HTMLCanvasElement;

  drawBitmapToCanvas(autostereogramCanvas, asg);
  drawBitmapToCanvas(depthmapCanvas, depthMap);
  drawBitmapToCanvas(tileCanvas, tile);

  fitCanvasToParent(autostereogramCanvas);
  fitCanvasToParent(depthmapCanvas);
  fitCanvasToParent(tileCanvas);
}

function init() {
  render(view(), document.body);

  Split(["#design-panel", "#preview-panel"], {
    sizes: [60, 40],
    direction: "horizontal",
    onDrag: () => {
      redraw();
    },
  });

  Split(["#depth-map-panel", "#tile-panel"], {
    sizes: [50, 50],
    direction: "vertical",
    onDrag: () => {
      redraw();
    },
  });

  redraw();
  r();
}

window.addEventListener("resize", () => {
  redraw();
});

window.onload = init;
