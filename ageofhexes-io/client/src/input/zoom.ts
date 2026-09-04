import { camera, clampCamera, MIN_ZOOM, MAX_ZOOM } from "../render/camera.js";

export function initZoom(canvas: HTMLCanvasElement) {
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const zoomFactor = 1.1;
    const oldZoom = camera.zoom;

    if (e.deltaY < 0) {
      camera.zoom *= zoomFactor;
    } else {
      camera.zoom /= zoomFactor;
    }

    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom));

    // zoom towards cursor
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - canvas.width / 2;
    const my = e.clientY - rect.top - canvas.height / 2;

    camera.x += mx / oldZoom - mx / camera.zoom;
    camera.y += my / oldZoom - my / camera.zoom;
    clampCamera();
  }, { passive: false });
}
