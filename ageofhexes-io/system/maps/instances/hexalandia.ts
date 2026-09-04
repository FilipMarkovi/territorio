import { asciiToGameMap } from "../asciiMap.js";

export const hexalandia = asciiToGameMap(
  "hexalandia",
  `
    . . . . . W . . W W W W W . . W . . . W . . W . . . . W W W . . . . . . . .
     . . . . W W W W W W G G W W W W W W W W W . W W W . W W . . . . . . . . .
    . . . . . . W W W W G G W W W W W W W W W W W W W W W W W W W . . . . . . .
     . . . . . W W G G G G W W W W D W W W G G G G G W W W W W W W . W . . . .
    . . . . . . W W G G G G W W D D W W G G G G G G G G G W W W W W W . . . . .
     . . . . . W W W G G G W W W D D W W W W G G M M M G G G W W W W W . . . .
    . . . . . . W W G M G G W W W D D W W W W G G G G M M G G W W W W W . . . .
     . . . . W W W G G M G G W W W W W W W W W W G G G G M G G W W W W . . . .
    . . . . . . W G G M M G G W W W W W W W W W W G G G G M G G W W W W . . . .
     . . . . W . W G G M G G W W W G G G G W W W W W G G G G G W W W . . . . .
    . . . . . W W G G G M G G W W W G G G G W W W W W W W G G G W W . W . . . .
     . . . . W . W G G G G G W W W W G G G G G W W W W W W W G G W W W . . . .
    . . . . . . . W G G G G W W W W W G G G G G G W W W W W W W G W W . . . . .
     . . . . . . W W W W W W W W W W G G G G G G G G W W W W W W G W W . . . .
    . . . . . . W W W W W W W W W G G G G M G G G G G G W W W W W W W . . . . .
     . . . . . . W W W W W W W G G G G G G M M G G G G G W W W W W W . . . . .
    . . . . . W W W D D W W W W G G G G G G M M M M G G G W W W W W W . . . . .
     . . . . . W W D D W W W W W G G G G M M M M G G G G G W W D W W . . . . .
    . . . . . . W W W D D W W W W W G G G G G M G G G G G W W D D W W . . . . .
     . . . . . W W W W D D W W W W W W G G G G M G G G W W W D W W W W . . . .
    . . . . . W W W W W W W W W W W W W G G G G G G G W W D D D W W W W . . . .
     . . . . W W . W W W W W W W W W W W G G G G G W W W W D W W W W W . . . .
    . . . . . W . W W W W W W W W W W W W W G G G W W W W W W W W . W W . . . .
     . . . . . . . W W W W W W W . W W W W W W W W W W W W W W W W . . . . . .
    . . . . . . W W W W W W W . W . W W W W W W W W W W W W W W . . . . . . . .
     . . . . . . W W . . W . W W . . . . W . . . W . . . . . . . . . . . . . .
  `,
  "Hexalandia",
  16
);