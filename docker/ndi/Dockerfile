# Stage 1 — Build gst-plugin-ndi from source
FROM rust:1-slim-bookworm AS builder

# Need NDI SDK for linking
COPY ndi-libs/libndi.so* /usr/lib/x86_64-linux-gnu/
RUN cd /usr/lib/x86_64-linux-gnu && \
    ln -sf libndi.so.* libndi.so 2>/dev/null && \
    ldconfig

RUN apt-get update && apt-get install -y \
    git pkg-config \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/teltek/gst-plugin-ndi.git /src
WORKDIR /src
RUN cargo build --release

# Stage 2 — Strom with NDI baked in
FROM eyevinntechnology/strom-full:0.6.6

COPY ndi-libs/libndi.so* /usr/lib/x86_64-linux-gnu/
RUN cd /usr/lib/x86_64-linux-gnu && \
    ln -sf libndi.so.6.* libndi.so.6 2>/dev/null && \
    ln -sf libndi.so.6 libndi.so 2>/dev/null && \
    ldconfig

COPY --from=builder /src/target/release/libgstndi.so /usr/lib/x86_64-linux-gnu/gstreamer-1.0/

RUN apt-get update && apt-get install -y \
    libavahi-common3 libavahi-client3 \
    && rm -rf /var/lib/apt/lists/*
