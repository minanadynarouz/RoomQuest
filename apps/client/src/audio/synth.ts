/**
 * Procedural toy-box voices. Parameters come from the sound manifest.
 * No music bed. Fail silently if a node type is missing.
 */

import type { SoundEntry } from './manifest.js';

interface ParamLike {
  value: number;
  setValueAtTime?: (value: number, time: number) => void;
  exponentialRampToValueAtTime?: (value: number, time: number) => void;
}

interface Connectable {
  connect: (node: unknown) => unknown;
}

interface OscLike extends Connectable {
  type: string;
  frequency: ParamLike;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

interface FilterLike extends Connectable {
  type: string;
  frequency: ParamLike;
  Q: ParamLike;
}

interface BufferLike {
  getChannelData: (channel: number) => Float32Array;
}

interface BufferSourceLike extends Connectable {
  buffer: unknown;
  start: (when?: number) => void;
  stop?: (when?: number) => void;
}

interface GainLike extends Connectable {
  gain: ParamLike;
}

export interface SynthContext {
  currentTime: number;
  sampleRate: number;
  createGain: () => GainLike;
  createOscillator: () => OscLike;
  createBiquadFilter: () => FilterLike;
  createBuffer: (
    channels: number,
    length: number,
    sampleRate: number
  ) => BufferLike;
  createBufferSource: () => BufferSourceLike;
}

const EPS = 0.0008;
let randomFn = Math.random;

export function setSynthRandom(fn: () => number): void {
  randomFn = fn;
}

export function resetSynthRandom(): void {
  randomFn = Math.random;
}

function setAt(param: ParamLike, value: number, time: number): void {
  if (param.setValueAtTime) {
    param.setValueAtTime(value, time);
    return;
  }
  param.value = value;
}

function ramp(param: ParamLike, value: number, time: number): void {
  const v = value < EPS ? EPS : value;
  if (param.exponentialRampToValueAtTime) {
    param.exponentialRampToValueAtTime(v, time);
    return;
  }
  param.value = v;
}

function pluck(param: ParamLike, t0: number, peak: number, dur: number): void {
  setAt(param, EPS, t0);
  ramp(param, peak, t0 + Math.min(0.008, dur * 0.12));
  ramp(param, EPS, t0 + dur);
}

function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}

function detunedHz(baseHz: number, randomCents: number): number {
  if (randomCents <= 0) return baseHz;
  const offset = (randomFn() * 2 - 1) * randomCents;
  return baseHz * centsToRatio(offset);
}

function startOsc(
  audio: SynthContext,
  dest: unknown,
  type: string,
  hz: number,
  t0: number,
  dur: number,
  peak: number
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  setAt(osc.frequency, hz, t0);
  pluck(gain.gain, t0, peak, dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function playWoodClick(
  audio: SynthContext,
  dest: unknown,
  entry: SoundEntry,
  t0: number
): void {
  const dur = entry.duration ?? 0.05;
  const hz = entry.pitchHz ?? 1500;
  const length = Math.max(32, Math.floor(audio.sampleRate * dur));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = randomFn() * 2 - 1;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  setAt(filter.frequency, hz, t0);
  filter.Q.value = 1.6;
  const gain = audio.createGain();
  pluck(gain.gain, t0, 1, dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  source.start(t0);
  source.stop?.(t0 + dur + 0.02);
}

function playMarimba(
  audio: SynthContext,
  dest: unknown,
  entry: SoundEntry,
  t0: number
): void {
  const root = entry.pitchHz ?? 523.25;
  const dur = entry.duration ?? 0.2;
  const steps = entry.intervals ?? [0, 5];
  const stagger = Math.min(0.045, dur * 0.22);
  for (let i = 0; i < steps.length; i += 1) {
    const hz = root * centsToRatio((steps[i] ?? 0) * 100);
    const peak = i === 0 ? 0.9 : 0.7;
    startOsc(audio, dest, 'triangle', hz, t0 + i * stagger, dur - i * stagger, peak);
  }
}

function playThud(
  audio: SynthContext,
  dest: unknown,
  entry: SoundEntry,
  t0: number
): void {
  const hz = entry.pitchHz ?? 90;
  const dur = entry.duration ?? 0.12;
  const osc = audio.createOscillator();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  osc.type = 'sine';
  setAt(osc.frequency, hz, t0);
  filter.type = 'lowpass';
  setAt(filter.frequency, 240, t0);
  filter.Q.value = 0.7;
  pluck(gain.gain, t0, 1, dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function playVoiceBlip(
  audio: SynthContext,
  dest: unknown,
  entry: SoundEntry,
  t0: number
): void {
  const dur = entry.duration ?? 0.075;
  const f0 = detunedHz(entry.pitchHz ?? 490, entry.randomPitchCents ?? 0);
  startOsc(audio, dest, 'sine', f0, t0, dur, 0.9);
  startOsc(audio, dest, 'sine', f0 * 2.15, t0, dur * 0.85, 0.28);
}

function playChime(
  audio: SynthContext,
  dest: unknown,
  entry: SoundEntry,
  t0: number
): void {
  const f0 = entry.pitchHz ?? 1046.5;
  const dur = entry.duration ?? 0.45;
  startOsc(audio, dest, 'sine', f0, t0, dur, 0.95);
  startOsc(audio, dest, 'sine', f0 * 2.003, t0, dur * 0.85, 0.35);
  startOsc(audio, dest, 'sine', f0 * 3.01, t0, dur * 0.55, 0.12);
}

export function playSynth(
  audio: SynthContext,
  entry: SoundEntry,
  dest: unknown
): void {
  const t0 = audio.currentTime;
  switch (entry.synth) {
    case 'woodClick':
      playWoodClick(audio, dest, entry, t0);
      return;
    case 'marimbaRise':
      playMarimba(audio, dest, entry, t0);
      return;
    case 'mutedThud':
      playThud(audio, dest, entry, t0);
      return;
    case 'voiceBlip':
      playVoiceBlip(audio, dest, entry, t0);
      return;
    case 'chimeSting':
      playChime(audio, dest, entry, t0);
      return;
  }
}
