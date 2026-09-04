import { asciiToGameMap } from "../asciiMap.js";

export const hexagon = asciiToGameMap(
  "hexagon",
  `
    . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
     . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . G G G G G G G G . . . . . . . . . . . . . . . . . .
     . . . . . . . . . . . G G G G G G G G G . . . . . . . . . . . . . . . . .
    . . . . . . . . . . . G G G G G G G G G G . . . . . . . . . . . . . . . . .
     . . . . . . . . . . G G G D D D D D G G G . . . . . . . . . . . . . . . .
    . . . . . . . . . . G G G D D D D D D G G G . . . . . . . . . . . . . . . .
     . . . . . . . . . G G G D D M M M D D G G G . . . . . . . . . . . . . . .
    . . . . . . . . . G G G D D M W W M D D G G G . . . . . . . . . . . . . . .
     . . . . . . . . G G G D D M W W W M D D G G G . . . . . . . . . . . . . .
    . . . . . . . . . G G G D D M W W M D D G G G . . . . . . . . . . . . . . .
     . . . . . . . . . G G G D D M M M D D G G G . . . . . . . . . . . . . . .
    . . . . . . . . . . G G G D D D D D D G G G . . . . . . . . . . . . . . . .
     . . . . . . . . . . G G G D D D D D G G G . . . . . . . . . . . . . . . .
    . . . . . . . . . . . G G G G G G G G G G . . . . . . . . . . . . . . . . .
     . . . . . . . . . . . G G G G G G G G G . . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . G G G G G G G G . . . . . . . . . . . . . . . . . .
     . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .
  `,
  "The Hex",
  8
);