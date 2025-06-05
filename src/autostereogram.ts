import { Bitmap, padBitmap } from "./bitmap";

export function autostereogram(dm: Bitmap, colorTile: Bitmap) {
  // pad one tile width on the left because we need an extra tile when overlapping
  let depthMap = padBitmap(dm, colorTile.width, 0, 0, 0, 0);
  let result: number[] = [];

  for (let y = 0; y < depthMap.height; y++) {
    let row: number[] = Array(depthMap.width).fill(0);
    for (let x = 0; x < depthMap.width; x++) {
      // depth at (x,y) specifies the offset we'll add to the current x
      let depthOffset = depthMap.data[x + y * depthMap.width];

      if (x < colorTile.width) {
        // Use the color tile value if we're still less than a tile in
        let tileX = (x + depthOffset) % colorTile.width;
        let tileY = y % colorTile.height;
        row[x] = colorTile.data[tileX + tileY * colorTile.width];
      } else {
        // Otherwise, look back one tile in the current row result
        const sourceX = x + depthOffset - colorTile.width;
        if (sourceX >= 0 && sourceX < row.length) {
          row[x] = row[sourceX];
        }
      }
    }
    result.push(...row);
  }

  return {
    width: depthMap.width,
    height: depthMap.height,
    data: result,
    palette: colorTile.palette,
  };
}
