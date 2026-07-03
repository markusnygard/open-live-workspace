# Builder stage: compile fixed strom binary
FROM eyevinntechnology/strom:dev-70d0ad4 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    build-essential pkg-config \
    libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    libglib2.0-dev libgudev-1.0-dev \
    libssl-dev libsoup-3.0-dev libjavascriptcoregtk-6.0-dev \
    libx11-dev libxcb1-dev libdrm-dev libegl-dev libgles-dev libgbm-dev \
    && rm -rf /var/lib/apt/lists/* \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /src
COPY . .
RUN cargo build --release -p strom

# Final: our image with fixed binary
FROM open-live-strom-ndi:0.6.6
COPY --from=builder /src/target/release/strom /app/strom
