import { Bitmap } from "./bitmap";

export function getRandomColor() {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
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

export function getPointerCellInBitmapCanvas(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
  bitmap: Bitmap
) {
  const bounds = canvas.getBoundingClientRect();
  const xPx = e.clientX - bounds.x;
  const yPx = e.clientY - bounds.y;

  const cellWidth = bounds.width / bitmap.width;
  const cellHeight = bounds.height / bitmap.height;

  let xCell = Math.floor(xPx / cellWidth);
  let yCell = Math.floor(yPx / cellHeight);

  if (xCell < 0) xCell = 0;
  if (yCell < 0) yCell = 0;
  if (xCell >= bitmap.width) xCell = bitmap.width - 1;
  if (yCell >= bitmap.height) yCell = bitmap.height - 1;

  return [xCell, yCell];
}

function download(dataStr: string, downloadName: string) {
  const downloadAnchorNode = document.createElement("a");

  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", downloadName);
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export function downloadPNG(canvas: HTMLCanvasElement) {
  download(canvas.toDataURL("image/png"), "autostereogram.png");
}
