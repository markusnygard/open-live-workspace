# Builds ffmpeg with DeckLink input/output support for the SRT gateway.
# The decklink/ dir contains the BMD Desktop Video SDK /Linux/Include headers
# (see decklink/README.md + BLACKMAGIC_EULA.txt). libDeckLinkAPI.so is NOT in git;
# copy it into decklink/ before building:
#   cp /usr/lib/libDeckLinkAPI.so open_live_srt/ffmpeg-decklink/decklink/
FROM debian:bookworm-slim AS build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git ca-certificates yasm nasm pkg-config \
    libx264-dev libsrt-gnutls-dev libssl-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY decklink/ /src/decklink/
RUN git clone --depth 1 --branch n7.1 https://github.com/FFmpeg/FFmpeg.git ffmpeg \
    && cd ffmpeg \
    && ./configure --prefix=/usr \
       --enable-gpl --enable-nonfree --enable-libx264 --enable-libsrt --enable-decklink \
       --extra-cflags="-I/src/decklink" \
       --extra-ldflags="-L/src/decklink" \
    && make -j"$(nproc)" && make install

FROM debian:bookworm-slim
COPY --from=build /usr/bin/ffmpeg /usr/bin/ffmpeg
COPY --from=build /usr/bin/ffprobe /usr/bin/ffprobe
COPY decklink/libDeckLinkAPI.so /usr/lib/libDeckLinkAPI.so
RUN apt-get update && apt-get install -y --no-install-recommends \
    libx264-164 libsrt1.5-gnutls libssl3 libgnutls30 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ldconfig
