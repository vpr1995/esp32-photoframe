#!/usr/bin/env python3
"""
PhotoFrame Image Processor CLI
Replicates the exact same image processing pipeline as the ESP32 firmware.
"""

import sys
import argparse
from pathlib import Path
from PIL import Image
import numpy as np

# Display dimensions
DISPLAY_WIDTH = 800
DISPLAY_HEIGHT = 480

# 7-color e-paper palette (same as ESP32)
PALETTE = np.array([
    [0, 0, 0],       # Black
    [255, 255, 255], # White
    [255, 255, 0],   # Yellow
    [255, 0, 0],     # Red
    [0, 0, 0],       # Reserved (not used)
    [0, 0, 255],     # Blue
    [0, 255, 0]      # Green
], dtype=np.uint8)

def find_closest_color(r, g, b):
    """Find closest color in palette (same algorithm as ESP32)"""
    min_dist = float('inf')
    closest = 1
    
    for i in range(7):
        if i == 4:  # Skip reserved color
            continue
        
        dr = int(r) - int(PALETTE[i][0])
        dg = int(g) - int(PALETTE[i][1])
        db = int(b) - int(PALETTE[i][2])
        dist = dr*dr + dg*dg + db*db
        
        if dist < min_dist:
            min_dist = dist
            closest = i
    
    return closest

def apply_floyd_steinberg_dither(image):
    """
    Apply Floyd-Steinberg dithering (same algorithm as ESP32)
    Input: RGB image as numpy array (height, width, 3)
    Output: Dithered image
    """
    height, width = image.shape[:2]
    errors = np.zeros((height, width, 3), dtype=np.int32)
    output = image.copy().astype(np.int32)
    
    for y in range(height):
        for x in range(width):
            # Get old pixel with accumulated error
            old_r = output[y, x, 0] + errors[y, x, 0]
            old_g = output[y, x, 1] + errors[y, x, 1]
            old_b = output[y, x, 2] + errors[y, x, 2]
            
            # Clamp to valid range
            old_r = max(0, min(255, old_r))
            old_g = max(0, min(255, old_g))
            old_b = max(0, min(255, old_b))
            
            # Find closest palette color
            color_idx = find_closest_color(old_r, old_g, old_b)
            
            # Set new pixel value
            output[y, x] = PALETTE[color_idx]
            
            # Calculate error
            err_r = old_r - PALETTE[color_idx][0]
            err_g = old_g - PALETTE[color_idx][1]
            err_b = old_b - PALETTE[color_idx][2]
            
            # Distribute error to neighboring pixels (Floyd-Steinberg)
            if x + 1 < width:
                errors[y, x + 1, 0] += err_r * 7 // 16
                errors[y, x + 1, 1] += err_g * 7 // 16
                errors[y, x + 1, 2] += err_b * 7 // 16
            
            if y + 1 < height:
                if x > 0:
                    errors[y + 1, x - 1, 0] += err_r * 3 // 16
                    errors[y + 1, x - 1, 1] += err_g * 3 // 16
                    errors[y + 1, x - 1, 2] += err_b * 3 // 16
                
                errors[y + 1, x, 0] += err_r * 5 // 16
                errors[y + 1, x, 1] += err_g * 5 // 16
                errors[y + 1, x, 2] += err_b * 5 // 16
                
                if x + 1 < width:
                    errors[y + 1, x + 1, 0] += err_r * 1 // 16
                    errors[y + 1, x + 1, 1] += err_g * 1 // 16
                    errors[y + 1, x + 1, 2] += err_b * 1 // 16
    
    return output.astype(np.uint8)

def rotate_90_clockwise(image):
    """Rotate image 90 degrees clockwise (same as ESP32)"""
    return np.rot90(image, k=-1)

def resize_image_cover(image, target_width, target_height):
    """
    Resize image to COVER (fill) target dimensions with center crop
    Same algorithm as frontend webapp resizeImage()
    """
    img = Image.fromarray(image)
    orig_width = img.width
    orig_height = img.height
    
    # Calculate scale to COVER (fill) - use max instead of min
    scale_x = target_width / orig_width
    scale_y = target_height / orig_height
    scale = max(scale_x, scale_y)
    
    scaled_width = round(orig_width * scale)
    scaled_height = round(orig_height * scale)
    
    # Resize with high-quality resampling
    resized = img.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)
    
    # Create canvas at exact target size
    canvas = Image.new('RGB', (target_width, target_height), (0, 0, 0))
    
    # Center and crop
    offset_x = (target_width - scaled_width) // 2
    offset_y = (target_height - scaled_height) // 2
    
    # Paste the scaled image (will be cropped if larger than canvas)
    canvas.paste(resized, (offset_x, offset_y))
    
    return np.array(canvas)

def apply_contrast(image, contrast):
    """
    Apply contrast adjustment (same formula as ESP32)
    Formula: output = ((input - 128) * contrast) + 128
    """
    image_float = image.astype(np.float32)
    adjusted = ((image_float - 128.0) * contrast) + 128.0
    adjusted = np.clip(adjusted, 0, 255)
    return adjusted.astype(np.uint8)

def apply_brightness_fstop(image, fstop):
    """
    Apply brightness adjustment in f-stops (same as ESP32)
    Formula: multiplier = 2^fstop
    """
    multiplier = 2.0 ** fstop
    image_float = image.astype(np.float32)
    brightened = image_float * multiplier
    brightened = np.clip(brightened, 0, 255)
    return brightened.astype(np.uint8)

def process_image(input_path, output_bmp, output_thumb, brightness_fstop=0.3, contrast=1.3):
    """
    Process image using the exact same pipeline as ESP32
    
    Pipeline:
    1. Load JPEG
    2. Rotate if portrait (90° clockwise)
    3. Resize if needed (to 800x480)
    4. Apply contrast adjustment
    5. Apply brightness adjustment (f-stop)
    6. Apply Floyd-Steinberg dithering
    7. Save as BMP
    8. Save thumbnail
    """
    print(f"Processing: {input_path}")
    
    # 1. Load JPEG
    img = Image.open(input_path)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    image = np.array(img)
    
    print(f"  Original size: {image.shape[1]}x{image.shape[0]}")
    
    # 2. Check if portrait and rotate
    is_portrait = image.shape[0] > image.shape[1]
    if is_portrait:
        print(f"  Portrait detected, rotating 90° clockwise")
        image = rotate_90_clockwise(image)
        print(f"  After rotation: {image.shape[1]}x{image.shape[0]}")
    
    # 3. Resize with cover (fill and crop) - same as frontend
    if image.shape[1] != DISPLAY_WIDTH or image.shape[0] != DISPLAY_HEIGHT:
        print(f"  Resizing to {DISPLAY_WIDTH}x{DISPLAY_HEIGHT} (cover mode: scale and crop)")
        image = resize_image_cover(image, DISPLAY_WIDTH, DISPLAY_HEIGHT)
    
    # 4. Apply contrast adjustment
    print(f"  Applying contrast: {contrast}")
    image = apply_contrast(image, contrast)
    
    # 5. Apply brightness adjustment (f-stop)
    print(f"  Applying brightness: {brightness_fstop} f-stop (multiplier: {2**brightness_fstop:.2f})")
    image = apply_brightness_fstop(image, brightness_fstop)
    
    # 6. Apply Floyd-Steinberg dithering
    print(f"  Applying Floyd-Steinberg dithering")
    dithered = apply_floyd_steinberg_dither(image)
    
    # 7. Save BMP
    print(f"  Saving BMP: {output_bmp}")
    Image.fromarray(dithered).save(output_bmp, 'BMP')
    
    # 8. Save thumbnail (from original, before dithering)
    print(f"  Saving thumbnail: {output_thumb}")
    # Reload original for thumbnail
    thumb_img = Image.open(input_path)
    if thumb_img.mode != 'RGB':
        thumb_img = thumb_img.convert('RGB')
    
    # Thumbnail is portrait orientation (480x800)
    thumb_img.thumbnail((480, 800), Image.Resampling.LANCZOS)
    thumb_img.save(output_thumb, 'JPEG', quality=85)
    
    print(f"  Done!")

def main():
    parser = argparse.ArgumentParser(
        description='PhotoFrame Image Processor - Replicates ESP32 image processing pipeline'
    )
    parser.add_argument('input', help='Input JPEG image')
    parser.add_argument('-o', '--output-dir', default='.', help='Output directory (default: current directory)')
    parser.add_argument('-b', '--brightness', type=float, default=0.3, help='Brightness f-stop (default: 0.3)')
    parser.add_argument('-c', '--contrast', type=float, default=1.3, help='Contrast multiplier (default: 1.3)')
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate output filenames
    base_name = input_path.stem
    output_bmp = output_dir / f"{base_name}.bmp"
    output_thumb = output_dir / f"{base_name}.jpg"
    
    try:
        process_image(
            input_path,
            output_bmp,
            output_thumb,
            brightness_fstop=args.brightness,
            contrast=args.contrast
        )
        return 0
    except Exception as e:
        print(f"Error processing image: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
