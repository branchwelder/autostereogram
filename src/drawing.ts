import { Bitmap } from "./bitmap";

export function drawBitmapToCanvas(
  canvasElement: HTMLCanvasElement,
  bitmap: Bitmap
) {
  canvasElement.width = bitmap.width;
  canvasElement.height = bitmap.height;

  const ctx = canvasElement.getContext("2d");
  if (!ctx) {
    console.error("Failed to get canvas context");
    return;
  }

  const imageData = ctx.createImageData(bitmap.width, bitmap.height);
  for (let i = 0; i < bitmap.data.length; i++) {
    const color = bitmap.palette[bitmap.data[i]];
    imageData.data[i * 4] = color[0];
    imageData.data[i * 4 + 1] = color[1];
    imageData.data[i * 4 + 2] = color[2];
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

export function fitCanvasToParent(
  canvas: HTMLCanvasElement,
  aspectRatio: number = canvas.width / canvas.height,
  padding: number = 10
) {
  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const parentWidth = parent.clientWidth - padding * 2;
  const parentHeight = parent.clientHeight - padding * 2;

  if (parentWidth / parentHeight > aspectRatio) {
    // Parent is wider than needed - fit to height
    canvas.style.height = `${parentHeight}px`;
    canvas.style.width = `${parentHeight * aspectRatio}px`;
  } else {
    // Parent is taller than needed - fit to width
    canvas.style.width = `${parentWidth}px`;
    canvas.style.height = `${parentWidth / aspectRatio}px`;
  }
}
