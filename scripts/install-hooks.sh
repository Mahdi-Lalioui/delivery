#!/bin/sh
set -eu

git -C "$(dirname "$0")/.." config --local core.hooksPath .githooks
printf '%s\n' 'Installed the staged formatting, linting and gitleaks pre-commit checks.'
