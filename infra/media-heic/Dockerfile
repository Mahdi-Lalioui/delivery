FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS base

FROM base AS build
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends cmake ninja-build g++ pkg-config \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/codec
ADD --checksum=sha256:554228bd17788c99a7e63b37ab5634722190e6e2bf60c1dcb01cef328e133905 \
    https://github.com/strukturag/libde265/releases/download/v1.1.3/libde265-1.1.3.tar.gz ./
ADD --checksum=sha256:f7483e818503ea6224c8863e4a56ac02c7089021a98472c811c12aa19faf2475 \
    https://github.com/strukturag/libheif/releases/download/v1.23.7/libheif-1.23.7.tar.gz ./
RUN tar -xzf libde265-1.1.3.tar.gz && tar -xzf libheif-1.23.7.tar.gz

# ENABLE_DECODER controls the dec265 executable. The library always builds the decoder.
RUN cmake -G Ninja -S libde265-1.1.3 -B build-de265 \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/codec -DCMAKE_INSTALL_LIBDIR=lib \
    -DENABLE_SDL=OFF -DENABLE_DECODER=OFF -DENABLE_ENCODER=OFF \
 && cmake --build build-de265 --parallel 4 \
 && cmake --install build-de265

RUN cmake -G Ninja -S libheif-1.23.7 -B build-heif \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/codec -DCMAKE_INSTALL_LIBDIR=lib \
    -DCMAKE_PREFIX_PATH=/opt/codec -DCMAKE_INSTALL_RPATH='$ORIGIN' \
    -DENABLE_PLUGIN_LOADING=OFF -DENABLE_PARALLEL_TILE_DECODING=OFF -DWITH_LIBDE265=ON \
    -DWITH_X265=OFF -DWITH_X264=OFF -DWITH_OpenH264_DECODER=OFF \
    -DWITH_AOM_DECODER=OFF -DWITH_AOM_ENCODER=OFF -DWITH_UNCOMPRESSED_CODEC=OFF \
    -DWITH_LIBSHARPYUV=OFF -DBUILD_TESTING=OFF -DBUILD_DOCUMENTATION=OFF \
    -DWITH_EXAMPLES=OFF -DWITH_GDK_PIXBUF=OFF \
 && cmake --build build-heif --parallel 4 \
 && cmake --install build-heif

COPY decode.cc ./
RUN mkdir -p /out/usr/local/bin /out/usr/local/lib/zaafran-heic /out/usr/local/share/zaafran-heic \
 && g++ -std=c++17 -O2 -Wall -Wextra -Werror -D_FORTIFY_SOURCE=3 -fstack-protector-strong \
    -I/opt/codec/include -L/opt/codec/lib decode.cc -lheif -Wl,-rpath-link,/opt/codec/lib \
    -Wl,-rpath,'$ORIGIN/../lib/zaafran-heic' -Wl,-z,relro,-z,now \
    -o /out/usr/local/bin/zaafran-heic-decode \
 && cp -L /opt/codec/lib/libheif.so.1 /opt/codec/lib/libde265.so.0 /out/usr/local/lib/zaafran-heic/ \
 && cp libheif-1.23.7/COPYING /out/usr/local/share/zaafran-heic/libheif.COPYING \
 && cp libde265-1.1.3/COPYING /out/usr/local/share/zaafran-heic/libde265.COPYING

FROM base AS runtime
COPY --from=build /out/ /
USER node
ENTRYPOINT ["/usr/local/bin/zaafran-heic-decode"]
