"""把一张方图转成 DSH 插件图标（256x256 PNG）。

用法：
    python scripts/make-icon.py <源图路径> [--full]

默认会做一次"头部构图"裁剪（保留上方主体、水平居中），这样在插件列表里
缩到 32px 左右仍然看得清；加 --full 则整图等比缩放不裁剪。
"""
import os
import sys

from PIL import Image

SIZE = 256
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icon.png")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    full = "--full" in sys.argv
    if not args:
        raise SystemExit("用法：python scripts/make-icon.py <源图路径> [--full]")
    src = args[0]
    if not os.path.exists(src):
        raise SystemExit(f"找不到源图：{src}")

    img = Image.open(src).convert("RGB")
    w, h = img.size

    if not full:
        # 头部构图：取上方 76% 高度，再水平居中裁成正方形
        side = min(w, round(h * 0.76))
        left = (w - side) // 2
        img = img.crop((left, 0, left + side, side))

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(OUT)
    print(f"已生成：{OUT}（源图 {w}x{h} → {SIZE}x{SIZE}{'' if full else '，头部构图'}）")


if __name__ == "__main__":
    main()
