# Builder stage: compile fixed strom binary (patches mediaplayer is_live)
FROM eyevinntechnology/strom:dev-70d0ad4 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    build-essential pkg-config curl \
    libssl-dev libcairo2-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    libclang-dev cmake \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /src
COPY . .
RUN cargo build --release --package strom --features no-gui,efp

# Final: our image with fixed binary
FROM open-live-strom-ndi:0.6.6
COPY --from=builder /src/target/release/strom /app/strom
