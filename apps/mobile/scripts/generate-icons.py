from PIL import Image
from pathlib import Path

src = Image.open(r"c:\DEV\Guardian\warden_icon.png").convert("RGBA")
res = Path(r"c:\DEV\Guardian\apps\mobile\android\app\src\main\res")

px = None
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = src.getpixel((x, y))
        if a > 200:
            px = (r, g, b, a)
            break
    if px:
        break
if px is None:
    px = (26, 36, 32, 255)
bg_hex = "#{:02x}{:02x}{:02x}".format(px[0], px[1], px[2])
print("bg_sample", px, bg_hex)

legacy = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
foreground = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def resize(img, size):
    return img.resize((size, size), Image.Resampling.LANCZOS)


for folder, size in legacy.items():
    out_dir = res / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    icon = resize(src, size)
    icon.save(out_dir / "ic_launcher.png", optimize=True)
    icon.save(out_dir / "ic_launcher_round.png", optimize=True)

for folder, size in foreground.items():
    out_dir = res / folder
    out_dir.mkdir(parents=True, exist_ok=True)
    resize(src, size).save(out_dir / "ic_launcher_foreground.png", optimize=True)

assets = Path(r"c:\DEV\Guardian\apps\mobile\assets")
assets.mkdir(parents=True, exist_ok=True)
src.save(assets / "warden_icon.png")

(res / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    "<resources>\n"
    f'    <color name="ic_launcher_background">{bg_hex}</color>\n'
    "</resources>\n",
    encoding="utf-8",
)
print("done")
