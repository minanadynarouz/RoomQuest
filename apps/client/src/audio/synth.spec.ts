import { afterEach, describe, expect, it } from 'vitest';
import { SOUND_MANIFEST } from './manifest.js';
import {
  playSynth,
  resetSynthRandom,
  setSynthRandom,
  type SynthContext,
} from './synth.js';

interface OscRec {
  type: string;
  hz: number;
}

function makeSynth() {
  const oscillators: OscRec[] = [];
  const filters: { type: string; hz: number }[] = [];
  const buffers: Float32Array[] = [];
  const dest = { connect: () => dest };

  const ctx: SynthContext = {
    currentTime: 0,
    sampleRate: 22050,
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => dest,
    }),
    createOscillator: () => {
      const rec: OscRec = { type: 'sine', hz: 0 };
      const osc = {
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime: (value: number) => {
            rec.hz = value;
            osc.frequency.value = value;
          },
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => dest,
        start: () => {
          rec.type = osc.type;
          oscillators.push(rec);
        },
        stop: () => undefined,
      };
      return osc;
    },
    createBiquadFilter: () => {
      const rec = { type: 'lowpass', hz: 0 };
      const filter = {
        get type() {
          return rec.type;
        },
        set type(value: string) {
          rec.type = value;
        },
        frequency: {
          value: 0,
          setValueAtTime: (value: number) => {
            rec.hz = value;
          },
        },
        Q: { value: 1 },
        connect: () => dest,
      };
      filters.push(rec);
      return filter;
    },
    createBuffer: (_c: number, length: number) => {
      const data = new Float32Array(length);
      buffers.push(data);
      return { getChannelData: () => data };
    },
    createBufferSource: () => ({
      buffer: null,
      connect: () => dest,
      start: () => undefined,
      stop: () => undefined,
    }),
  };

  return { ctx, oscillators, filters, buffers };
}

describe('toy-box synth', () => {
  afterEach(() => {
    resetSynthRandom();
  });

  it('makes a wood click from filtered noise, not a buzzer', () => {
    const { ctx, oscillators, filters, buffers } = makeSynth();
    playSynth(ctx, SOUND_MANIFEST.pieceBuilt, {});
    expect(buffers.length).toBeGreaterThan(0);
    expect(filters.some((f) => f.type === 'bandpass')).toBe(true);
    expect(oscillators.every((o) => o.type !== 'sawtooth' && o.type !== 'square')).toBe(
      true
    );
  });

  it('uses decaying triangles for success marimba', () => {
    const { ctx, oscillators } = makeSynth();
    playSynth(ctx, SOUND_MANIFEST.gemCollected, {});
    expect(oscillators.length).toBeGreaterThanOrEqual(2);
    expect(oscillators.every((o) => o.type === 'triangle')).toBe(true);
    const first = oscillators[0]?.hz ?? 0;
    const second = oscillators[1]?.hz ?? 0;
    expect(second).toBeGreaterThan(first);
  });

  it('uses a low-passed sine for invalid-place thud', () => {
    const { ctx, oscillators, filters } = makeSynth();
    playSynth(ctx, SOUND_MANIFEST.invalidPlace, {});
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]?.type).toBe('sine');
    expect(filters.some((f) => f.type === 'lowpass')).toBe(true);
  });

  it('randomises chirp pitch between plays', () => {
    const first = makeSynth();
    setSynthRandom(() => 0);
    playSynth(first.ctx, SOUND_MANIFEST.explorerOutOfView, {});
    const low = first.oscillators[0]?.hz ?? 0;

    const second = makeSynth();
    setSynthRandom(() => 1);
    playSynth(second.ctx, SOUND_MANIFEST.explorerOutOfView, {});
    const high = second.oscillators[0]?.hz ?? 0;

    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
    expect(first.oscillators.every((o) => o.type === 'sine')).toBe(true);
  });

  it('plays win as stacked sine chime partials', () => {
    const { ctx, oscillators } = makeSynth();
    playSynth(ctx, SOUND_MANIFEST.won, {});
    expect(oscillators).toHaveLength(3);
    expect(oscillators.every((o) => o.type === 'sine')).toBe(true);
  });
});
