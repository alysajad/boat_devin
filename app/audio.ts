/** Synthesized locally: no audio downloads and no autoplay requirement. */
export function createRaceAudio(initiallyMuted: boolean) {
  let muted = initiallyMuted, context: AudioContext | undefined;
  let water: GainNode | undefined, noise: AudioBuffer | undefined;
  function unlock() {
    if (muted) return;
    try {
      if (!context) {
        context = new AudioContext();
        noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource(), filter = context.createBiquadFilter();
        source.buffer = noise; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 550;
        water = context.createGain(); water.gain.value = 0;
        source.connect(filter); filter.connect(water); water.connect(context.destination); source.start();
      }
      void context.resume().catch(() => {});
    } catch { /* Audio remains optional on unsupported or restricted browsers. */ }
  }
  function tone(freq = 300, duration = .09) {
    if (muted || !context || context.state !== 'running') return;
    const o = context.createOscillator(), gain = context.createGain();
    o.connect(gain); gain.connect(context.destination); o.type = 'sine';
    o.frequency.setValueAtTime(freq, context.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .5, context.currentTime + duration);
    gain.gain.setValueAtTime(.07, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    o.onended = () => { o.disconnect(); gain.disconnect(); }; o.start(); o.stop(context.currentTime + duration);
  }
  function splash(collision = false) {
    if (muted || !context || !noise || context.state !== 'running') return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise; filter.type = 'lowpass'; filter.frequency.value = collision ? 220 : 1600;
    const duration = collision ? .28 : .16;
    gain.gain.setValueAtTime(collision ? .23 : .12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(); source.stop(context.currentTime + duration);
  }
  function quiet() { if (water && context) water.gain.setTargetAtTime(0, context.currentTime, .05); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) quiet(); });
  window.addEventListener('blur', quiet);
  return {
    unlock, tone, splash,
    setMuted(value: boolean) { muted = value; if (muted) quiet(); else unlock(); },
    update(active: boolean, speed: number) {
      if (water && context) water.gain.setTargetAtTime(!muted && active && !document.hidden ? Math.min(.065, Math.max(0, speed) * .008) : 0, context.currentTime, .15);
    }
  };
}
