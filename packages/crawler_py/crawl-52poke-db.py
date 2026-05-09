#!/usr/bin/env python3
from pathlib import Path
import sys


# 将当前目录加入 sys.path，以便导入 localdex_crawler 包
CRAWLER_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CRAWLER_DIR))

from localdex_crawler.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
