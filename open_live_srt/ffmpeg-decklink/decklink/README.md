# Blackmagic DeckLink SDK headers

The files in this directory (the `DeckLinkAPI*.h`, `DeckLinkAPI*.cpp`, `LinuxCOM.h` and
related files) are the **`/Linux/Include`** headers from the Blackmagic Design
Desktop Video SDK.

## Redistribution

Per the Blackmagic EULA (`BLACKMAGIC_EULA.txt`):

- **Clause 0.1** — clauses 1, 4.3, 4.4, 5, 7 and 8 of the EULA **do not apply** to the
  `/Linux/Include` files, so they may be copied, modified and redistributed.
- **Clause 1.4** — the SDK generally may be sub-licensed/distributed to third parties
  "in full (including all header, source and documentation files)".

These files are provided so the `srt-gateway-ffmpeg` image (see `../Dockerfile`) can be
rebuilt from source.

## Not included

**`libDeckLinkAPI.so` is NOT included in this repository.** It is Blackmagic's
proprietary runtime library and is obtained from the Desktop Video driver install
(and is also present on the host at `/usr/lib/libDeckLinkAPI.so`). Place it in this
directory before building the image (it is gitignored):

```bash
cp /usr/lib/libDeckLinkAPI.so open_live_srt/ffmpeg-decklink/decklink/
```

## Source

Obtained from the Blackmagic Design Desktop Video SDK
(https://www.blackmagicdesign.com/desktopvideo_sdk), `/Linux/Include` folder.
Copyright and all intellectual property rights vest in Blackmagic Design Pty. Ltd.
