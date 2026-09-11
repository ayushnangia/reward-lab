"use strict";
const RhoAudio = (() => {
  const slot = 0.1,
    duration = 0.085;
  // Fixed scales: time/pan = reward; pitch and level = sqrt(probability).
  // A quiet floor keeps positive rare bins audible; exact zeros remain silent.
  const notes = (probabilities) =>
    probabilities.flatMap((p, i) =>
      p > 0
        ? [
            {
              bin: i,
              at: i * slot,
              frequency: 130.81278265 * 2 ** (3 * Math.sqrt(p)),
              peakGain: 0.02 + 0.14 * Math.sqrt(p),
              pan: (i / 20 - 0.5) * 1.4,
            },
          ]
        : [],
    );
  function schedule(context, probabilities, start, destination, rate = 1) {
    const wave = context.createPeriodicWave(
      new Float32Array(5),
      new Float32Array([0, 1, 0.22, 0.08, 0.025]),
    );
    return notes(probabilities).map((note) => {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        pan = context.createStereoPanner();
      const at = start + note.at / rate;
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.value = note.frequency;
      pan.pan.value = note.pan;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(note.peakGain, at + 0.012 / rate);
      gain.gain.exponentialRampToValueAtTime(
        note.peakGain / 160,
        at + (duration - 0.01) / rate,
      );
      gain.gain.linearRampToValueAtTime(0, at + duration / rate);
      oscillator.connect(gain).connect(pan).connect(destination);
      oscillator.start(at);
      oscillator.stop(at + duration / rate);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        pan.disconnect();
      };
      return { oscillator, gain };
    });
  }
  return { notes, schedule, slot, duration };
})();
if (typeof module !== "undefined") module.exports = RhoAudio;
