# Icon Generation

The app needs these icons:

- `icon-192.png` (192x192)
- `icon-512.png` (512x512)
- `icon-maskable.png` (512x512 with safe zone)
- `apple-touch-icon.png` (180x180)

## Quick Generation

Use [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator) or:

```bash
# If you have ImageMagick installed:
# The icon is a white cross on forest green background

convert -size 512x512 xc:'#2D5016' \
  -fill white \
  -draw "roundrectangle 226,50 286,462 10,10" \
  -draw "roundrectangle 50,206 462,266 10,10" \
  icon-512.png

convert -resize 192x192 icon-512.png icon-192.png
convert -resize 180x180 icon-512.png apple-touch-icon.png
cp icon-512.png icon-maskable.png
```

## Alternative: Use the SVG

The cross icon used in the loading screen can be exported as PNG at the needed sizes.

Design: White cross on #2D5016 (forest green) background, with rounded corners.
Safe area for maskable icon: keep the cross within the inner 80% of the canvas.
