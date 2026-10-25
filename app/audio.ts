/** Optional, gesture-unlocked audio. The small licensed crew call is broadcast-only. */
export function createRaceAudio(initiallyMuted: boolean) {
  let muted = initiallyMuted, context: AudioContext | undefined;
  let water: GainNode | undefined, noise: AudioBuffer | undefined, master:GainNode|undefined;
  let chant:AudioBuffer|undefined,loading:Promise<void>|undefined,lastCall=-Infinity,calls=0;
  const voices=new Set<AudioBufferSourceNode>();
  function prepareCalls(){
    if(!context||chant||loading)return loading;
    const ctx=context;
    loading=fetch('/assets/audio/crew-hey.mp3').then(r=>{if(!r.ok)throw Error('Crew call unavailable');return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)).then(b=>{chant=b;}).catch(()=>{/* Splashes still work offline. */}).finally(()=>{loading=undefined;});
    return loading;
  }
  function unlock() {
    if (muted) return;
    try {
      if (!context) {
        context = new AudioContext({latencyHint:'interactive'});
        master=context.createGain();master.gain.value=1;const limiter=context.createDynamicsCompressor();limiter.threshold.value=-8;limiter.ratio.value=8;master.connect(limiter);limiter.connect(context.destination);
        noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource(), filter = context.createBiquadFilter();
        source.buffer = noise; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 550;
        water = context.createGain(); water.gain.value = 0;
        source.connect(filter); filter.connect(water); water.connect(master!); source.start();
      }
      void context.resume().catch(() => {});
    } catch { /* Audio remains optional on unsupported or restricted browsers. */ }
  }
  function tone(freq = 300, duration = .09) {
    if (muted || !context || context.state !== 'running') return;
    const o = context.createOscillator(), gain = context.createGain();
    o.connect(gain); gain.connect(master!); o.type = 'sine';
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
    source.connect(filter); filter.connect(gain); gain.connect(master!);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(); source.stop(context.currentTime + duration);
  }
  function row(sync=0){
    if(muted||document.hidden||!context||context.state!=='running')return;
    const now=context.currentTime;
    // A synchronized crew is one chorus. Drop excess calls, never queue them behind the race.
    if(now-lastCall<.32)return;
    lastCall=now;splash();
    if(!chant||voices.size>=3)return;
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=chant;
    source.playbackRate.value=1+(calls%3-1)*.025;
    const duration=Math.min(.65,chant.duration/source.playbackRate.value);
    gain.gain.setValueAtTime(.42+Math.max(0,Math.min(1,sync))*.13,now);gain.gain.setTargetAtTime(0,now+duration-.10,.03);
    source.connect(gain);gain.connect(master!);voices.add(source);calls++;
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};source.start();source.stop(now+duration);
  }
  function quiet() {for(const voice of voices){try{voice.stop();}catch{/* Already stopped. */}}voices.clear(); if (water && context) water.gain.setTargetAtTime(0, context.currentTime, .05); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) quiet(); });
  window.addEventListener('blur', quiet);
  return {
    unlock, tone, splash, row, prepareCalls,
    get status(){return {calls,voices:voices.size,ready:!!chant,muted};},
    setMuted(value: boolean) { muted = value;if(master&&context)master.gain.setTargetAtTime(value?0:1,context.currentTime,.01); if (muted) quiet(); else unlock(); },
    update(active: boolean, speed: number) {
      if (water && context) water.gain.setTargetAtTime(!muted && active && !document.hidden ? Math.min(.065, Math.max(0, speed) * .008) : 0, context.currentTime, .15);
    }
  };
}
