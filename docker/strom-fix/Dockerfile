# Builder stage: compile fixed strom binary
FROM eyevinntechnology/strom:dev-70d0ad4 AS builder
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
COPY . .
# Verify our changes are present
RUN grep -q "cfilter_video" backend/src/blocks/builtin/mediaplayer/builder.rs || (echo "FATAL: builder.rs does not contain capsfilter fix" && false)
RUN grep -q "upcast_ref" backend/src/blocks/builtin/mediaplayer/state.rs || (echo "FATAL: state.rs does not contain upcast_ref fix" && false)
RUN cargo build --release --package strom --features no-gui,efp

# Final: our image with fixed binary
FROM eyevinntechnology/strom-full:0.6.6
COPY --from=builder /src/target/release/strom /app/strom
