import sys
from PIL import Image

def get_pixel_color(image_path, x, y):
    try:
        img = Image.open(image_path)
        img = img.convert('RGB')
        pixel = img.getpixel((x, y))
        print(f"Color at ({x}, {y}): {pixel}")
    except Exception as e:
        print(f"Error: {e}")

get_pixel_color(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
