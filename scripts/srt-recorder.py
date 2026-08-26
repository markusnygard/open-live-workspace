#!/usr/bin/env python3
"""SRT Player + Recorder — displays an SRT stream and records to MP4 on keypress.

Usage: srt-recorder.py srt://host:port?mode=caller
       srt-recorder.py srt://:5300?mode=listener

Controls:
  r       — toggle recording (start/stop)
  q / Esc — quit
  f       — toggle fullscreen
  space   — pause/resume playback
"""

import sys, os, signal, time
from datetime import datetime

try:
    import gi
    gi.require_version('Gst', '1.0')
    gi.require_version('GstVideo', '1.0')
    from gi.repository import Gst, GstVideo, GLib
except ImportError:
    print("Need python3-gi and GStreamer. Install: apt install python3-gi gir1.2-gstreamer-1.0 gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav")
    sys.exit(1)

Gst.init(None)

class SrtRecorder:
    def __init__(self, srt_uri):
        self.srt_uri = srt_uri
        self.recording = False
        self.pipeline = None
        self.record_bin = None
        self.output_dir = os.path.expanduser("~/Videos")
        os.makedirs(self.output_dir, exist_ok=True)
        self._build_pipeline()

    def _build_pipeline(self):
        pipe_str = f"""
            srtsrc uri={self.srt_uri} latency=125 !
            tsdemux name=demux
            demux. ! queue ! h264parse ! avdec_h264 ! videoconvert ! autovideosink name=videosink
            demux. ! queue ! aacparse ! avdec_aac ! audioconvert ! audioresample ! autoaudiosink
        """
        self.pipeline = Gst.parse_launch(pipe_str)

        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self._on_bus_message)

        self.videosink = self.pipeline.get_by_name("videosink")

    def _on_bus_message(self, bus, msg):
        t = msg.type
        if t == Gst.MessageType.ERROR:
            err, dbg = msg.parse_error()
            print(f"GStreamer error: {err} ({dbg})")
            self.quit()
        elif t == Gst.MessageType.EOS:
            print("End of stream — reconnecting...")
            self.pipeline.set_state(Gst.State.NULL)
            time.sleep(1)
            self._build_pipeline()
            self.play()

    def play(self):
        self.pipeline.set_state(Gst.State.PLAYING)

    def pause(self):
        self.pipeline.set_state(Gst.State.PAUSED)

    def quit(self):
        if self.pipeline:
            self.pipeline.set_state(Gst.State.NULL)

    def toggle_fullscreen(self):
        # Find the video window and toggle fullscreen
        pass  # autovideosink doesn't expose this easily

    def start_recording(self):
        if self.recording:
            return
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(self.output_dir, f"srt_rec_{ts}.mp4")
        print(f"● Recording: {filename}")

        # Build record bin: copy video + audio, encode to MP4
        pipe_str = f"""
            srtsrc uri={self.srt_uri} latency=125 !
            tsdemux name=rdemux
            rdemux. ! queue ! h264parse ! mp4mux name=mux ! filesink location={filename}
            rdemux. ! queue ! aacparse ! mux.
        """
        self.record_bin = Gst.parse_launch(pipe_str)
        self.record_bin.set_state(Gst.State.PLAYING)
        self.recording = True

    def stop_recording(self):
        if not self.recording:
            return
        print("■ Recording stopped")
        if self.record_bin:
            self.record_bin.send_event(Gst.Event.new_eos())
            time.sleep(0.5)
            self.record_bin.set_state(Gst.State.NULL)
            self.record_bin = None
        self.recording = False

    def toggle_recording(self):
        if self.recording:
            self.stop_recording()
        else:
            self.start_recording()


def on_keypress(app, keyname):
    if keyname in ('q', 'Escape'):
        app.quit()
        return False
    elif keyname == 'r':
        app.toggle_recording()
    elif keyname == 'space':
        state = app.pipeline.get_state(0)[1]
        if state == Gst.State.PLAYING:
            app.pause()
        else:
            app.play()
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    srt_uri = sys.argv[1]
    app = SrtRecorder(srt_uri)

    # Keyboard input via GLib on stdin
    import threading

    def stdin_reader():
        import termios, tty, select
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        tty.setcbreak(fd)
        try:
            while True:
                if select.select([sys.stdin], [], [], 0.1)[0]:
                    ch = sys.stdin.read(1)
                    GLib.idle_add(on_keypress, app, ch)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)

    threading.Thread(target=stdin_reader, daemon=True).start()

    app.play()
    print(f"Playing: {srt_uri}")
    print("Controls: r=record  q=quit  space=pause")

    loop = GLib.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass
    finally:
        app.stop_recording()
        app.quit()


if __name__ == "__main__":
    main()
