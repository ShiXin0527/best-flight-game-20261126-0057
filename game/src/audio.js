// Sound, synthesised in the browser with WebAudio — no audio files, no network.
// An engine drone that follows the throttle, a wind rush that follows speed, a
// two-note chime for a ring and a low thud for a crash. Everything starts on the
// first user gesture, so a silent page load never needs permission.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(context.destination);
      engineOsc.start();
      // Wind: a looped noise buffer through a band-pass filter.
      const length = context.sampleRate;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = context.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = context.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter).connect(windGain).connect(context.destination);
      noise.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(frequency, startAt, duration, volume, type = 'sine') {
    if (!context || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, context.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(volume, context.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + startAt + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(context.currentTime + startAt);
    osc.stop(context.currentTime + startAt + duration + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    /** Called every frame with the plane's state; silent while muted or locked. */
    update(throttle, speedKt, flying) {
      if (!context || muted) return;
      const target = flying ? 0.028 + throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.15);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 55, context.currentTime, 0.15);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.06, speedKt * 0.00028) : 0, context.currentTime, 0.2);
    },
    ring(centre) {
      if (!ensure() || muted) return;
      tone(880, 0, 0.22, 0.16);
      tone(centre ? 1318 : 1108, 0.09, 0.3, 0.14);
    },
    crash() {
      if (!ensure() || muted) return;
      tone(70, 0, 0.5, 0.3, 'triangle');
      tone(45, 0.05, 0.6, 0.25, 'sine');
    },
    toggleMute() {
      muted = !muted;
      if (context) {
        if (engineGain) engineGain.gain.value = 0;
        if (windGain) windGain.gain.value = 0;
      }
      return muted;
    },
  };
}
