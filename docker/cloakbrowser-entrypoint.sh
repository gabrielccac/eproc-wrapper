#!/bin/bash
set -euo pipefail

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
sleep 1

exec "$@"
