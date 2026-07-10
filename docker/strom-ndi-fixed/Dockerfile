# Stage 1 — Build gst-plugin-ndi from source
FROM rust:1-slim-bookworm AS ndi-builder
COPY ndi-libs/libndi.so* /usr/lib/x86_64-linux-gnu/
RUN cd /usr/lib/x86_64-linux-gnu && \
    cp libndi.so.* libndi.so 2>/dev/null; \
    ldconfig || true
RUN apt-get update && apt-get install -y \
    git pkg-config \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/teltek/gst-plugin-ndi.git /src
WORKDIR /src
RUN cargo build --release

# Stage 2 — Build fixed Strom binary with media player fixes
FROM eyevinntechnology/strom:dev-70d0ad4 AS strom-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    build-essential pkg-config curl \
    libssl-dev libcairo2-dev \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    libclang-dev cmake \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /src
COPY strom-source/ .
RUN grep -q "cfilter_video" backend/src/blocks/builtin/mediaplayer/builder.rs || (echo "FATAL: builder.rs missing mediaplayer fix" && false)
RUN grep -q "upcast_ref" backend/src/blocks/builtin/mediaplayer/state.rs || (echo "FATAL: state.rs missing upcast_ref fix" && false)
RUN cargo build --release --package strom --features no-gui,efp

# Stage 3 — Final image with working Strom + NDI plugin
FROM eyevinntechnology/strom-full:0.6.6

# NDI SDK libraries
COPY ndi-libs/libndi.so* /usr/lib/x86_64-linux-gnu/
RUN cd /usr/lib/x86_64-linux-gnu && \
    cp libndi.so.* libndi.so 2>/dev/null; \
    ldconfig || true

# NDI GStreamer plugin
COPY --from=ndi-builder /src/target/release/libgstndi.so /usr/lib/x86_64-linux-gnu/gstreamer-1.0/

# Fixed Strom binary with media player fixes
COPY --from=strom-builder /src/target/release/strom /app/strom

RUN apt-get update && apt-get install -y \
    libavahi-common3 libavahi-client3 \
    && rm -rf /var/lib/apt/lists/*
