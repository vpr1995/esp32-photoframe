<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useAppStore } from "../stores";

const props = defineProps({
  imageFile: {
    type: File,
    required: true,
  },
});

const emit = defineEmits(["crop-confirmed", "skip", "cancel"]);

const appStore = useAppStore();

const canvasRef = ref(null);
const isLoading = ref(true);

// Loaded HTMLImageElement
let img = null;

// Scale factor from image pixel coordinates to canvas pixel coordinates
let imgScale = 1;

// Crop region in image pixel coordinates
const cropX = ref(0);
const cropY = ref(0);
const cropW = ref(0);
const cropH = ref(0);

// Drag state
let dragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se' | null
let dragStartMX = 0;
let dragStartMY = 0;
let dragStartCrop = null;

const displayWidth = computed(() => appStore.systemInfo.width || 800);
const displayHeight = computed(() => appStore.systemInfo.height || 600);

/**
 * The aspect ratio (cropW / cropH) of the crop box in source-image coordinates.
 *
 * When source and display have the same orientation (both portrait or both
 * landscape) no rotation is applied by processImage, so the crop box must
 * match displayWidth / displayHeight.
 *
 * When orientations differ, processImage rotates the source 90° before
 * resizing, so the correct crop aspect ratio in source-image coordinates is
 * the inverse: displayHeight / displayWidth.
 */
const cropAspectRatio = computed(() => {
  if (!img) return displayWidth.value / displayHeight.value;
  const isSourcePortrait = img.height > img.width;
  const isDisplayPortrait = displayHeight.value > displayWidth.value;
  return isSourcePortrait === isDisplayPortrait
    ? displayWidth.value / displayHeight.value
    : displayHeight.value / displayWidth.value;
});

function loadImage() {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(props.imageFile);
  });
}

/**
 * Initialise the crop box to the largest centered rectangle that fits
 * entirely within the image while maintaining cropAspectRatio.
 * This mirrors the default behaviour of resizeImageCover so the default
 * crop matches what the library would choose automatically.
 */
function initDefaultCrop() {
  if (!img) return;
  const ar = cropAspectRatio.value;
  const imgW = img.width;
  const imgH = img.height;

  let w = imgW;
  let h = w / ar;
  if (h > imgH) {
    h = imgH;
    w = h * ar;
  }

  cropX.value = (imgW - w) / 2;
  cropY.value = (imgH - h) / 2;
  cropW.value = w;
  cropH.value = h;
}

function updateCanvasSize() {
  if (!canvasRef.value || !img) return;

  const container = canvasRef.value.parentElement;
  const maxW = container ? container.clientWidth : 800;
  const maxH = Math.min(window.innerHeight * 0.6, 600);

  const sx = maxW / img.width;
  const sy = maxH / img.height;
  imgScale = Math.min(sx, sy, 1);

  canvasRef.value.width = Math.round(img.width * imgScale);
  canvasRef.value.height = Math.round(img.height * imgScale);

  redraw();
}

function redraw() {
  if (!canvasRef.value || !img) return;

  const canvas = canvasRef.value;
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;

  // Draw full image
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);

  // Convert crop region to canvas coordinates
  const cx = Math.round(cropX.value * imgScale);
  const cy = Math.round(cropY.value * imgScale);
  const cwc = Math.round(cropW.value * imgScale);
  const chc = Math.round(cropH.value * imgScale);

  // Semi-transparent overlay outside the crop area
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, cw, ch);

  // Reveal the crop area (draw image pixels through the overlay)
  ctx.clearRect(cx, cy, cwc, chc);
  ctx.drawImage(img, cropX.value, cropY.value, cropW.value, cropH.value, cx, cy, cwc, chc);

  // Crop border
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cwc, chc);

  // Rule-of-thirds grid
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(cx + (cwc * i) / 3, cy);
    ctx.lineTo(cx + (cwc * i) / 3, cy + chc);
    ctx.moveTo(cx, cy + (chc * i) / 3);
    ctx.lineTo(cx + cwc, cy + (chc * i) / 3);
  }
  ctx.stroke();

  // Corner handles
  const hs = 10;
  ctx.fillStyle = "white";
  [
    [cx, cy],
    [cx + cwc - hs, cy],
    [cx, cy + chc - hs],
    [cx + cwc - hs, cy + chc - hs],
  ].forEach(([hx, hy]) => {
    ctx.fillRect(hx, hy, hs, hs);
  });
}

/** Convert a pointer/touch event to canvas pixel coordinates. */
function getCanvasCoords(event) {
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const clientY = event.touches ? event.touches[0].clientY : event.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

/**
 * Determine which zone of the crop box was hit.
 * Returns 'move', 'nw', 'ne', 'sw', 'se', or null.
 */
function getHitZone(mx, my) {
  const cx = cropX.value * imgScale;
  const cy = cropY.value * imgScale;
  const cwc = cropW.value * imgScale;
  const chc = cropH.value * imgScale;
  const t = 14; // tolerance in canvas pixels

  if (Math.abs(mx - cx) < t && Math.abs(my - cy) < t) return "nw";
  if (Math.abs(mx - (cx + cwc)) < t && Math.abs(my - cy) < t) return "ne";
  if (Math.abs(mx - cx) < t && Math.abs(my - (cy + chc)) < t) return "sw";
  if (Math.abs(mx - (cx + cwc)) < t && Math.abs(my - (cy + chc)) < t) return "se";
  if (mx > cx - t && mx < cx + cwc + t && my > cy - t && my < cy + chc + t) return "move";
  return null;
}

function onPointerDown(event) {
  const { x, y } = getCanvasCoords(event);
  dragMode = getHitZone(x, y);
  if (!dragMode) return;
  event.preventDefault();
  dragStartMX = x;
  dragStartMY = y;
  dragStartCrop = { x: cropX.value, y: cropY.value, w: cropW.value, h: cropH.value };
}

function onPointerMove(event) {
  if (!dragMode) {
    // Update cursor to indicate interactive zones
    const { x, y } = getCanvasCoords(event);
    const zone = getHitZone(x, y);
    const cursors = {
      move: "move",
      nw: "nw-resize",
      ne: "ne-resize",
      sw: "sw-resize",
      se: "se-resize",
    };
    canvasRef.value.style.cursor = cursors[zone] || "crosshair";
    return;
  }

  event.preventDefault();
  const { x, y } = getCanvasCoords(event);
  // Delta in image-pixel coordinates
  const dxImg = (x - dragStartMX) / imgScale;
  const dyImg = (y - dragStartMY) / imgScale;

  const ar = cropAspectRatio.value;
  const { x: sx, y: sy, w: sw, h: sh } = dragStartCrop;
  const minSize = 50;

  if (dragMode === "move") {
    cropX.value = Math.max(0, Math.min(img.width - cropW.value, sx + dxImg));
    cropY.value = Math.max(0, Math.min(img.height - cropH.value, sy + dyImg));
  } else {
    let nx = sx,
      ny = sy,
      nw = sw;

    if (dragMode === "se") {
      nw = Math.max(minSize, sw + dxImg);
    } else if (dragMode === "sw") {
      nw = Math.max(minSize, sw - dxImg);
      nx = sx + sw - nw;
    } else if (dragMode === "ne") {
      nw = Math.max(minSize, sw + dxImg);
      ny = sy + sh - nw / ar;
    } else if (dragMode === "nw") {
      nw = Math.max(minSize, sw - dxImg);
      nx = sx + sw - nw;
      ny = sy + sh - nw / ar;
    }

    const nh = nw / ar;

    // Clamp to image boundaries
    if (nx < 0) nx = 0;
    if (ny < 0) ny = 0;
    if (nx + nw > img.width) nw = img.width - nx;
    if (ny + nh > img.height) nw = (img.height - ny) * ar;

    cropX.value = nx;
    cropY.value = ny;
    cropW.value = nw;
    cropH.value = nw / ar;
  }

  redraw();
}

function onPointerUp() {
  dragMode = null;
}

/** Produce a cropped canvas and emit it. */
function applyCrop() {
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = Math.round(cropW.value);
  croppedCanvas.height = Math.round(cropH.value);
  croppedCanvas
    .getContext("2d")
    .drawImage(
      img,
      Math.round(cropX.value),
      Math.round(cropY.value),
      Math.round(cropW.value),
      Math.round(cropH.value),
      0,
      0,
      croppedCanvas.width,
      croppedCanvas.height
    );
  emit("crop-confirmed", croppedCanvas);
}

/** Reset crop box to the default centered cover-mode selection. */
function resetCrop() {
  initDefaultCrop();
  redraw();
}

onMounted(async () => {
  img = await loadImage();
  isLoading.value = false;
  initDefaultCrop();
  // Wait one tick for the DOM to render the canvas before measuring its parent
  await Promise.resolve();
  updateCanvasSize();

  window.addEventListener("resize", handleResize);
});

const handleResize = () => updateCanvasSize();
onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<template>
  <v-card>
    <v-card-text class="d-flex flex-column align-center">
      <p class="text-body-2 mb-3 text-center text-medium-emphasis">
        Drag the crop box to select which part of the image to display. The selection is locked to
        the display aspect ratio.
      </p>

      <div v-if="isLoading" class="d-flex justify-center pa-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <div v-else class="crop-canvas-wrapper">
        <canvas
          ref="canvasRef"
          style="display: block; max-width: 100%; border-radius: 4px"
          @mousedown="onPointerDown"
          @mousemove="onPointerMove"
          @mouseup="onPointerUp"
          @mouseleave="onPointerUp"
          @touchstart.prevent="onPointerDown"
          @touchmove.prevent="onPointerMove"
          @touchend="onPointerUp"
        />
      </div>
    </v-card-text>

    <v-card-actions class="px-4 pb-4">
      <v-btn variant="text" @click="$emit('cancel')">Cancel</v-btn>
      <v-spacer />
      <v-btn variant="outlined" size="small" class="mr-1" @click="resetCrop">Reset</v-btn>
      <v-btn variant="text" @click="$emit('skip')">Skip</v-btn>
      <v-btn color="primary" @click="applyCrop">Apply Crop</v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.crop-canvas-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
