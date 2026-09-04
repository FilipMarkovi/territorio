import { asciiToGameMap } from "../asciiMap.js";

export const hexbay = asciiToGameMap(
  "hexbay",
  `
    . . . . W W . W W W W W W W W W W W . . . . . . . . . . . . . . . . . . . .
     . . . . W W W W G G G G G W G W W W W W . . . . . . . . . . . . . . . . .
    . . W W W W G G G D D D D G G G W W W . . . . . . . . . . . . . . . . . . .
     . W . W G G G D D M M M D D D G W W W W W . . . . . . . . . . . . . . . .
    . . . W G G G D M M M M D D D D G W W W W W W . W . . . W . . . . . . . . .
     . W W W D G D M M D D D G G D G W G G W W W . W W W . W . . . . . . . . .
    . . W W D D D M M D G G G G G G G G G W W W W W W W W W W . . . . . . . . .
     . W W W D M M M D G G G W W G G G G W W W W W W W W W W . . . . . . . . .
    . . W D D D M D D G G W W W W W W G G W W W W W W W W W W W . . . . . . . .
     W W W D M M M D G G W W W W W W G G G W W W W W G W W G W W . . . . . . .
    . W W D D D M D D G W W W W W W W W W W W W G G G W W W G W . . . . . . . .
     . . W D M M M D G G W W W W W W W W W W G G G G G W W G G W W . . . . . .
    . . W W D D M M D G G W W W W G G W W W W G G D D G W W G G W . . . . . . .
     . . W W G D M M D G G G G W G G W W W W G D D D D G G G G W W . . . . . .
    . . W W W G D D M D D G G G G G W W W W G D D D D D G G G W W . . . . . . .
     . . . W G G D D M M D D D G G G W W W G G D D D D G G W W W . . . . . . .
    . . . . W G G G D D M M D G G W W W W W G G D D D G G W W W . . . . . . . .
     . . . W W W G G D D D D G W W W W W W W G G G G G G W W W W W . . . . . .
    . . W W W W W W G G G G G W W W W W W W W G W W W G W W W W . . . . . . . .
     . . . . W W W W W G W G W W W W W W W W W W W W W W W W . . . . . . . . .
    . . W . . W W W W W W W W W . . W . W W . . W W W W W W W W . . . . . . . .
     . . W W W . W W . . W . . W . . . W W W . W . W . . W W W . . . . . . . .
  `,
  "Hex Bay",
  16
);