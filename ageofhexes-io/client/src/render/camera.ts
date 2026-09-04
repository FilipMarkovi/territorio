export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const camera: Camera = {
  x: 0,
  y: 0,
  zoom: 1
};

export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 4.0;

// World-space bounding box of all tiles in the current map, used to center
// the camera on load and to keep panning from going too far off-map.
export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export let mapBounds: MapBounds | null = null;

export function setMapBounds(bounds: MapBounds) {
  mapBounds = bounds;
}

// How far past the map edge the camera is allowed to pan, in world units.
const CAMERA_PAN_MARGIN = 300;

export function clampCamera() {
  if (!mapBounds) return;

  camera.x = Math.min(Math.max(camera.x, mapBounds.minX - CAMERA_PAN_MARGIN), mapBounds.maxX + CAMERA_PAN_MARGIN);
  camera.y = Math.min(Math.max(camera.y, mapBounds.minY - CAMERA_PAN_MARGIN), mapBounds.maxY + CAMERA_PAN_MARGIN);
}
