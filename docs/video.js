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
  const audioTiming = typeof RhoAudio === "undefined" ? require("./audio.js") : RhoAudio;
  function timing(horizon, limit, pace, withSound = true) {
    if (!Number.isInteger(horizon) || horizon < 1 || ![15, 30, 60, "full"].includes(limit) ||
        ![4800, 2400, 1200, 600, 400, 300].includes(pace))
      throw Error("Choose a valid run, clip limit, and playback speed.");
    const audio = audioTiming.playbackTiming(pace);
    const phase = pace / 3000, transition = Math.min(.4, phase);
    // Match advance(): sample, weight, update, then wait for the whole sound scan.
    const interval = 2 * phase + Math.max(phase, withSound ? audio.listenTime : 0);
    const steps = limit === "full" ? horizon : Math.min(horizon, Math.floor(limit / interval));
    return { ...audio, phase, transition, interval, steps, duration: steps * interval, withSound };
  }
  function frameAt(plan, elapsed) {
    const { steps, duration, interval, transition, phase, lead, scanTime, slot, withSound } = plan;
    if (elapsed >= duration) return { from: steps, to: steps, shown: steps, mix: 0, bin: -1, stage: "Complete" };
    const to = Math.min(steps, Math.floor(Math.max(0, elapsed) / interval) + 1);
    const local = Math.max(0, elapsed) - (to - 1) * interval;
    const updating = local >= 2 * phase;
    const x = Math.max(0, Math.min(1, (local - 2 * phase) / transition));
    const scanElapsed = local - 2 * phase - lead;
    return { from: to - 1, to, shown: updating ? to : to - 1, mix: x * x * (3 - 2 * x),
      stage: local < phase ? "Sample" : updating ? "Update" : "Weight",
      bin: withSound && scanElapsed >= 0 && scanElapsed < scanTime ? Math.min(20, Math.floor(scanElapsed / slot)) : -1 };
  }
  function probabilities(history, method, frame) {
    return history[frame.from].methods[method].p.map((p, i) =>
      p + (history[frame.to].methods[method].p[i] - p) * frame.mix);
  }
  function draw(canvas, run, setup, palette, elapsed, plan, withSound) {
    const c = canvas.getContext("2d"), f = frameAt(plan, elapsed), duration = plan.duration;
    const text = (s, x, y, size = 28, color = palette.ink, face = "Arial") => {
      c.fillStyle = color; c.font = `${size}px ${face}`; c.fillText(s, x, y);
    };
    c.fillStyle = palette.paper; c.fillRect(0, 0, width, height);
    text("ρ · Policy updates", 64, 90, 58, palette.ink, "Georgia");
    text(RewardLab.presets[run.cfg.preset], 64, 146, 30);
    const map = run.cfg.transform === "identity" ? "Original reward (no change)" : LabContent.transforms[run.cfg.transform];
    text(map, 64, 191, 30);
    text(`${LabContent.judges[run.cfg.judge]} · ${run.cfg.n} samples/update · seed ${run.cfg.seed} · learning rate ${run.cfg.lr}`, 64, 235, 26, palette.muted);
    text(`Update ${f.shown} / ${setup.horizon}`, 1510, 92, 32);
    text("Gray: start · Color: current", 1390, 145, 26, palette.muted);
    text(`${1200 / setup.pace}× playback · ${f.stage}`, 1390, 191, 26, palette.muted);
    const gap = 26, cardWidth = (1792 - gap * (setup.methods.length - 1)) / setup.methods.length;
    for (const [j, method] of setup.methods.entries()) {
      const x = 64 + j * (cardWidth + gap), color = palette[method];
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
      const p = probabilities(run.history, method, f), pitch = plotWidth / 21;
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
    }
    text(withSound ? `${LabContent.names[setup.focus]} sound · higher bars → higher, louder notes` : "Sound off", 64, 922, 27, palette.muted);
    c.fillStyle = palette.initial; c.fillRect(64, 959, 1792, 5);
    c.fillStyle = palette.ink; c.fillRect(64, 959, 1792 * Math.min(1, elapsed / duration), 5);
    text("ayushnangia.github.io/reward-lab", 64, 1017, 27);
    text("Toy categorical policies · smooth replay · not an algorithm ranking", 925, 1017, 24, palette.muted);
  }
  async function record({ canvas, setup, limit, withSound, volume, palette, signal, onProgress }) {
    const chosen = format();
    if (!chosen || typeof canvas.captureStream !== "function") throw Error("Video export is not supported in this browser. Try a current Chrome, Edge, or Safari.");
    const config = LabConfig.validate(setup.cfg);
    if (![25, 100, 300].includes(setup.horizon) || !Array.isArray(setup.methods) ||
        !setup.methods.length || setup.methods.length > 3 || new Set(setup.methods).size !== setup.methods.length ||
        setup.methods.some(m => !RewardLab.methods.includes(m)) || !setup.methods.includes(setup.focus) ||
        !Number.isFinite(volume) || volume < 0 || volume > 1) throw Error("Invalid export settings.");
    const times = timing(setup.horizon, limit, setup.pace, withSound), duration = times.duration;
    let audio, stream, recorder, raf, watchdog, hidden;
    const chunks = [];
    try {
      if (withSound) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        await audio.resume();
        if (audio.state !== "running") throw Error("Audio could not start. Try again or turn export sound off.");
      }
      const run = RewardLab.create(config);
      // Yield during preparation so Cancel still works for long runs.
      while (run.step < times.steps) {
        signal.throwIfAborted();
        RewardLab.step(run);
        if (run.step % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
      signal.throwIfAborted();
      if (document.hidden) throw Error("Keep this tab visible while exporting.");
      canvas.width = width; canvas.height = height;
      draw(canvas, run, setup, palette, 0, times, withSound);
      stream = canvas.captureStream(fps);
      let destination, gain;
      if (audio) {
        destination = audio.createMediaStreamDestination();
        gain = audio.createGain(); gain.gain.value = volume; gain.connect(destination);
        // Keep the audio clock active through silent intro/outro and zero-support bins.
        // Otherwise some recorders drop leading silence and shift the soundtrack.
        const silence = audio.createConstantSource();
        silence.offset.value = 0; silence.connect(destination); silence.start();
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      }
      recorder = new MediaRecorder(stream, { mimeType: chosen[0], videoBitsPerSecond: 10000000, audioBitsPerSecond: 192000 });
      const stopped = new Promise((resolve, reject) => {
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = resolve;
        recorder.onerror = event => reject(event.error || Error("Video encoding failed."));
      });
      // Handle recorder errors immediately, including while waiting for start.
      stopped.catch(() => {});
      await new Promise((resolve, reject) => {
        recorder.onstart = resolve;
        recorder.addEventListener("error", () => reject(Error("Video encoding could not start.")), {once:true});
        recorder.start(1000);
      });
      const start = (audio ? audio.currentTime : performance.now() / 1000) + .1;
      if (audio) {
        for (let step = 1; step <= run.step; step++) {
          RhoAudio.schedule(audio, run.history[step].methods[setup.focus].p,
            start + (step - 1) * times.interval + 2 * times.phase + times.lead, gain, times.rate);
        }
      }
      await Promise.race([stopped.then(() => { throw Error("Video encoding stopped early."); }), new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason || new DOMException("Export cancelled.", "AbortError"));
        signal.addEventListener("abort", abort, {once:true});
        hidden = () => { if (document.hidden) reject(Error("Export stopped because the tab was hidden. Keep it visible and try again.")); };
        document.addEventListener("visibilitychange", hidden);
        watchdog = setTimeout(() => reject(Error("Export timed out. Keep this tab visible and try again.")), (duration + 15) * 1000);
        function tick() {
          try {
          if (signal.aborted) { abort(); return; }
          const elapsed = Math.max(0, (audio ? audio.currentTime : performance.now() / 1000) - start);
          draw(canvas, run, setup, palette, elapsed, times, withSound);
          onProgress(Math.min(1, elapsed / duration));
          if (elapsed >= duration) { signal.removeEventListener("abort", abort); resolve(); }
          else raf = requestAnimationFrame(tick);
          } catch (error) { reject(error); }
        }
        tick();
      })]);
      recorder.stop();
      await stopped;
      signal.throwIfAborted();
      const blob = new Blob(chunks, {type: recorder.mimeType});
      if (!blob.size) throw Error("The browser produced an empty video.");
      return { blob, extension: chosen[1] };
    } finally {
      cancelAnimationFrame(raf); clearTimeout(watchdog);
      if (hidden) document.removeEventListener("visibilitychange", hidden);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      if (audio && audio.state !== "closed") await audio.close();
    }
  }
  return { format, timing, frameAt, probabilities, record };
})();
if (typeof module !== "undefined") module.exports = RhoVideo;
