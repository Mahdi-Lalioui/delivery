#!/bin/sh
set -eu

# The production adapter starts the decoder with an empty environment.
decoder_home=~
decoder_docker="$decoder_home/.docker/bin/docker"
if [ ! -x "$decoder_docker" ]; then decoder_docker=/usr/bin/docker; fi

exec "$decoder_docker" --config "$decoder_home/.docker" run \
  --rm --platform linux/amd64 --network none --read-only \
  --user "$(id -u):$(id -g)" --memory 384m --pids-limit 32 \
  --mount "type=bind,source=$1,target=/input.heic,readonly" \
  zaafran-media-heic /input.heic
