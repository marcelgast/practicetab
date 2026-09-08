import { describe, expect, it } from 'vitest';
import {
  createPlayerModel,
  playerError,
  playerPause,
  playerPlay,
  playerReady,
  playerSetBaseBpm,
  playerSetBpm,
  playerSetTempo,
  playerStartLoading,
  playerStop,
  bpmDeltaFromKey,
  bpmToPercent,
} from '../domain/player';

describe('player model reducers', () => {
  it('starts in idle with default tempo', () => {
    const model = createPlayerModel();
    expect(model.status).toBe('idle');
    expect(model.playback).toBe('stopped');
    expect(model.tempoPercent).toBe(100);
    expect(model.baseBpm).toBeNull();
    expect(model.currentLibraryItemId).toBeNull();
    expect(model.errorMessage).toBeNull();
  });

  it('enters loading state with item id', () => {
    const model = playerStartLoading(createPlayerModel(), 'item-1');
    expect(model.status).toBe('loading');
    expect(model.currentLibraryItemId).toBe('item-1');
    expect(model.errorMessage).toBeNull();
  });

  it('sets ready state', () => {
    const model = playerReady(
      playerStartLoading(createPlayerModel(), 'item-1'),
    );
    expect(model.status).toBe('ready');
  });

  it('records errors and stops playback', () => {
    const model = playerError(playerPlay(createPlayerModel()), 'boom');
    expect(model.status).toBe('error');
    expect(model.playback).toBe('stopped');
    expect(model.errorMessage).toBe('boom');
  });

  it('clamps tempo percent', () => {
    const fast = playerSetTempo(createPlayerModel(), 500);
    const slow = playerSetTempo(createPlayerModel(), 10);
    expect(fast.tempoPercent).toBe(200);
    expect(slow.tempoPercent).toBe(25);
  });

  it('stores base bpm and computes current bpm', () => {
    const model = playerSetBaseBpm(createPlayerModel(), 120);
    expect(model.baseBpm).toBe(120);
    expect(model.currentBpm).toBe(120);
    expect(bpmToPercent(120, 120)).toBe(100);
    expect(bpmToPercent(120, 180)).toBe(150);
    expect(bpmToPercent(120, 999)).toBe(200);
    expect(bpmToPercent(120, 10)).toBe(25);
  });

  it('clamps bpm inputs for current bpm', () => {
    const model = playerSetBpm(createPlayerModel(), 5);
    expect(model.currentBpm).toBe(20);
  });

  it('derives bpm deltas from arrow keys', () => {
    expect(bpmDeltaFromKey('ArrowUp', false)).toBe(1);
    expect(bpmDeltaFromKey('ArrowDown', false)).toBe(-1);
    expect(bpmDeltaFromKey('ArrowUp', true)).toBe(10);
    expect(bpmDeltaFromKey('ArrowDown', true)).toBe(-10);
    expect(bpmDeltaFromKey('Enter', false)).toBeNull();
  });

  it('updates playback state', () => {
    const playing = playerPlay(createPlayerModel());
    const paused = playerPause(playing);
    const stopped = playerStop(paused);
    expect(playing.playback).toBe('playing');
    expect(paused.playback).toBe('paused');
    expect(stopped.playback).toBe('stopped');
  });
});
