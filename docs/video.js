/* Local video export: the same policies and RhoAudio synthesis as the visualizer. */
"use strict";
const RhoVideo = (() => {
  const width = 1920, height = 1080, fps = 60;
  function format(Recorder = globalThis.MediaRecorder) {
    return [
      ["video/mp4;codecs=avc1.42002a,mp4a.40.2", "mp4"],
      ["video/mp4", "mp4"],
      ["video/webm;codecs=vp9,opus", "webm"],
      ["video/webm;codecs=vp8,opus", "webm"],
    ].find(([mime]) => Recorder?.isTypeSupported(mime));
  }
  function dimensions(count) {
    const rows = Math.ceil(count / 3), fullHeight = height + (rows - 1) * 616 + 360;
    const scale = Math.min(1, 1920 / fullHeight);
    return {width: Math.floor(width * scale / 2) * 2, height: Math.floor(fullHeight * scale / 2) * 2, fullHeight};
  }
  function draw(canvas, state, palette) {
    const {run, methods, focus, shown, horizon, pace, phase, sounding, bin} = state;
    const setup = {methods, focus, horizon, pace};
    const c = canvas.getContext("2d"), f = {shown, stage: phase || "Paused", bin};
    const withSound = sounding;
    const fullHeight = dimensions(methods.length).fullHeight;
    c.fillStyle = palette.paper; c.fillRect(0, 0, canvas.width, canvas.height);
    c.save();
    const scale = Math.min(canvas.width / width, canvas.height / fullHeight);
    c.scale(scale, scale);
    const text = (s, x, y, size = 28, color = palette.ink, face = "Arial") => {
      c.fillStyle = color; c.font = `${size}px ${face}`; c.fillText(s, x, y);
    };
    c.fillStyle = palette.paper; c.fillRect(0, 0, width, fullHeight);
    text("ρ · Policy updates", 64, 90, 58, palette.ink, "Georgia");
    text(RewardLab.presets[run.cfg.preset], 64, 146, 30);
    const map = run.cfg.transform === "identity" ? "Original reward (no change)" : LabContent.transforms[run.cfg.transform];
    text(map, 64, 191, 30);
    text(`${LabContent.judges[run.cfg.judge]} · ${run.cfg.n} samples/update · seed ${run.cfg.seed} · learning rate ${run.cfg.lr}`, 64, 235, 26, palette.muted);
    text(`Update ${f.shown} / ${setup.horizon}`, 1510, 92, 32);
    text("Gray: start · Color: current", 1390, 145, 26, palette.muted);
    text(`${1200 / setup.pace}× playback · ${f.stage}`, 1390, 191, 26, palette.muted);
    const gap = 26, columns = Math.min(3, methods.length), cardWidth = (1792 - gap * (columns - 1)) / columns;
    for (const [j, method] of setup.methods.entries()) {
      c.save(); c.translate(0, Math.floor(j / columns) * 616);
      const x = 64 + (j % columns) * (cardWidth + gap), color = palette[method];
      c.fillStyle = palette.surface; c.fillRect(x, 282, cardWidth, 590);
      text(LabContent.names[method], x + 26, 336, 40, color, "Georgia");
      text("Probability", x + 26, 380, 23, palette.muted);
      const left = x + 64, plotWidth = cardWidth - 94, bottom = 658, plotHeight = 245;
      c.lineWidth = 1;
      for (const v of [0, 0.5, 1]) {
        const y = bottom - v * plotHeight;
        c.strokeStyle = palette.grid; c.beginPath(); c.moveTo(left, y); c.lineTo(left + plotWidth, y); c.stroke();
        text(`${v * 100}%`, x + 10, y + 7, 19, palette.muted);
      }
      const p = run.history[shown].methods[method].p, pitch = plotWidth / 21;
      for (let i = 0; i < 21; i++) {
        const bx = left + i * pitch;
        c.fillStyle = palette.initial; c.fillRect(bx, bottom - run.base[i] * plotHeight, pitch - 2, run.base[i] * plotHeight);
        c.fillStyle = color; c.fillRect(bx + 2, bottom - p[i] * plotHeight, pitch - 6, p[i] * plotHeight);
        if (withSound && method === setup.focus && i === f.bin) {
          c.strokeStyle = color; c.lineWidth = 2;
          c.strokeRect(bx, bottom - plotHeight, pitch - 2, plotHeight);
        }
      }
      for (const v of [0, .5, 1]) text(String(v), left + v * (plotWidth - 16), 690, 22, palette.muted);
      text("Original reward →", left, 729, 24, palette.muted);
      const metrics = RewardLab.metrics(p, run.rewards, run.cfg.evalK);
      text(`Mean reward  ${metrics.mean.toFixed(3)}`, x + 26, 782, 28);
      const high = metrics.high > 0 && metrics.high < .001 ? "<0.1%" : `${(metrics.high * 100).toFixed(1)}%`;
      text(`P(reward ≥ 0.9)  ${high}`, x + 26, 824, 25, palette.muted);
      c.restore();
    }
    c.translate(0, fullHeight - height - 360);
    const plot = RhoCurves.data(run.history, methods, state.metric || "mean", shown, horizon);
    text(`Learning curves · ${plot.label}`, 64, 924, 28);
    const curveX = step => 110 + step / horizon * 1710, curveY = value => 1175 - value / plot.max * 210;
    for (const t of [0, .5, 1]) {
      const y = curveY(t * plot.max);
      c.strokeStyle = palette.grid; c.beginPath(); c.moveTo(110,y); c.lineTo(1820,y); c.stroke();
      text((t * plot.max).toFixed(2),64,y+6,18,palette.muted);
      text(String(t*horizon),curveX(t*horizon),1205,18,palette.muted);
    }
    for (const s of plot.series) {
      c.strokeStyle = palette[s.id]; c.lineWidth = 3; c.beginPath();
      s.points.forEach((p,i) => { if(i) c.lineTo(curveX(p.step),curveY(p.value)); else c.moveTo(curveX(p.step),curveY(p.value)); }); c.stroke();
      const last = s.points.at(-1); c.fillStyle = palette[s.id]; c.fillRect(curveX(last.step)-3,curveY(last.value)-3,6,6);
    }
    text("Training update",850,1240,22,palette.muted);
    c.translate(0,360);
    text(withSound ? `${LabContent.names[setup.focus]} sound · higher bars → higher, louder notes` : "Sound off", 64, 922, 27, palette.muted);
    c.fillStyle = palette.initial; c.fillRect(64, 959, 1792, 5);
    c.fillStyle = palette.ink; c.fillRect(64, 959, 1792 * Math.min(1, shown / horizon), 5);
    text("ayushnangia.github.io/reward-lab", 64, 1017, 27);
    text("Toy categorical policies · live recording", 925, 1017, 24, palette.muted);
    c.restore();
  }
  async function record({canvas, getState, palette, audio, master, signal, onStart}) {
    const chosen = format();
    if (!chosen || typeof canvas.captureStream !== "function") throw Error("Video recording is unavailable in this browser.");
    let stream, recorder, raf, destination, silent, hidden, finish;
    const chunks = [];
    try {
      const size = dimensions(getState().methods.length);
      canvas.width = size.width; canvas.height = size.height;
      draw(canvas, getState(), palette);
      stream = canvas.captureStream(fps);
      destination = audio.createMediaStreamDestination();
      // Tap the live output after volume; never synthesize a second soundtrack.
      master.connect(destination);
      silent = audio.createConstantSource();
      silent.offset.value = 0; silent.connect(destination); silent.start();
      destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      recorder = new MediaRecorder(stream, {mimeType: chosen[0], videoBitsPerSecond: 10000000, audioBitsPerSecond: 192000});
      await new Promise((resolve, reject) => {
        finish = () => { if (recorder.state !== "inactive") recorder.stop(); };
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.error || Error("Video encoding failed."));
        hidden = () => { if (document.hidden) { finish(); reject(Error("Recording interrupted: keep this tab visible.")); } };
        document.addEventListener("visibilitychange", hidden);
        signal.addEventListener("abort", finish, {once:true});
        recorder.onstart = () => {
          if (signal.aborted) { finish(); return; }
          onStart();
          function tick() {
            try {
              draw(canvas, getState(), palette);
              raf = requestAnimationFrame(tick);
            } catch (error) { finish(); reject(error); }
          }
          tick();
        };
        recorder.start(1000);
      });
      const blob = new Blob(chunks, {type: recorder.mimeType});
      if (!blob.size) throw Error("The browser produced an empty video.");
      return {blob, extension: chosen[1]};
    } finally {
      cancelAnimationFrame(raf);
      signal.removeEventListener("abort", finish);
      if (hidden) document.removeEventListener("visibilitychange", hidden);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      if (destination) master.disconnect(destination);
      silent?.stop(); silent?.disconnect();
      stream?.getTracks().forEach(track => track.stop());
    }
  }
  return {format, dimensions, draw, record};
})();
if (typeof module !== "undefined") module.exports = RhoVideo;
