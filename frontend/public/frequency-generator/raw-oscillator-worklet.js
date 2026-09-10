// Raw oscillator AudioWorklet processor.
// Unlike OscillatorNode which clamps frequency to Nyquist, this generates
// raw samples using Math.sin/cos etc. Frequencies above Nyquist will alias
// back into the audible range — this is intentional and produces real
// audible tones (the low hum/buzz you hear from high frequencies on real
// frequency generators).

class RawOscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 440, minValue: 0.0001, maxValue: 10000000, automationRate: "k-rate" },
      { name: "waveform", defaultValue: 0, minValue: 0, maxValue: 3, automationRate: "k-rate" },
      { name: "gain", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this._phase = 0;
    this._inverseSampleRate = 1.0 / sampleRate;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const freq = parameters.frequency[0];
    const waveType = Math.round(parameters.waveform[0]);
    const gainVal = parameters.gain[0];
    const channelCount = output.length;

    // Phase increment per sample — NOT clamped to Nyquist
    const phaseInc = 2.0 * Math.PI * freq * this._inverseSampleRate;

    for (let i = 0; i < output[0].length; i++) {
      let sample;
      const p = this._phase;

      switch (waveType) {
        case 1: // square
          sample = Math.sin(p) >= 0 ? 1.0 : -1.0;
          break;
        case 2: // sawtooth
          sample = (2.0 * (p / (2.0 * Math.PI) - Math.floor(p / (2.0 * Math.PI) + 0.5)));
          break;
        case 3: // triangle
          const t = (p / (2.0 * Math.PI)) % 1.0;
          sample = t < 0.5 ? (4.0 * t - 1.0) : (3.0 - 4.0 * t);
          break;
        default: // sine
          sample = Math.sin(p);
      }

      sample *= gainVal;

      for (let ch = 0; ch < channelCount; ch++) {
        output[ch][i] = sample;
      }

      this._phase += phaseInc;
      // Keep phase from growing unbounded
      if (this._phase > 2.0 * Math.PI * 1000) {
        this._phase = this._phase % (2.0 * Math.PI);
      }
    }

    return true;
  }
}

registerProcessor("raw-oscillator", RawOscillatorProcessor);
