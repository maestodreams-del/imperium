"""Copy the approved web bundle into the standalone desktop package."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
dest = root / 'desktop' / 'web'
dest.mkdir(exist_ok=True)
for name in ('index.html', 'app.js', 'styles.css', 'config.js', 'manifest.webmanifest', 'sw.js', 'invoice-format.js', 'pdf.min.mjs', 'pdf.worker.min.mjs', 'pdfjs-LICENSE.txt'):
    shutil.copy2(root / name, dest / name)
(dest / 'icons').mkdir(exist_ok=True)
shutil.copy2(root / 'icons' / 'icon.svg', dest / 'icons' / 'icon.svg')
(dest / 'sounds').mkdir(exist_ok=True)
shutil.copy2(root / 'android-wrapper' / 'app' / 'src' / 'main' / 'assets' / 'sounds' / 'imperium_notification.mp3', dest / 'sounds' / 'imperium_notification.mp3')
source = root / 'android-wrapper' / 'app' / 'src' / 'main' / 'res' / 'drawable' / 'imperium_icon.png'
shutil.copy2(source, root / 'desktop' / 'icon.png')
try:
    from PIL import Image
    with Image.open(source) as image:
        image.save(root / 'desktop' / 'icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
except ImportError as exc:
    raise SystemExit('Pillow is required: python -m pip install Pillow') from exc
