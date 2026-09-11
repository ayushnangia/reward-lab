#!/bin/zsh
cd -- "${0:A:h}"
python3 server.py --port 8766 --open-browser
