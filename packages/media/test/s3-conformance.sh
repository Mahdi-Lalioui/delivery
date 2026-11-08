#!/bin/sh
set -eu

package_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
workspace_dir=$(CDPATH='' cd -- "$package_dir/../.." && pwd)
seaweed_image='chrislusf/seaweedfs:4.52@sha256:57877e32bb90073b37dc109b438ba66e84fd5ed9ced5f5c04f56444ef243ce59'
node_image='node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072'

server=$(docker run --detach --network none \
  -e AWS_ACCESS_KEY_ID=synthetic-media-id -e AWS_SECRET_ACCESS_KEY=synthetic-media-secret \
  "$seaweed_image" mini -dir=/data -ip=127.0.0.1 -ip.bind=127.0.0.1 -bucket=zaafran-media-test)
trap 'docker rm -fv "$server" >/dev/null' EXIT

docker run --rm --network "container:$server" \
  --mount "type=bind,source=$workspace_dir/node_modules,target=/repo/node_modules,readonly" \
  --mount "type=bind,source=$package_dir,target=/repo/packages/media,readonly" \
  --workdir /repo/packages/media "$node_image" node --test test/s3-conformance.mjs
