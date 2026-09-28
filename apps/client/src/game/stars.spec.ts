/**
 * Stars formula tests - F-02
 */

import { describe, it, expect } from 'vitest';
import { calculateStars } from './stars.js';

describe('calculateStars', () => {
  describe('3 stars', () => {
    it('returns 3 stars when time ≤ par AND gems ≥ 3', () => {
      expect(calculateStars(180000, 180000, 3)).toBe(3);
      expect(calculateStars(150000, 180000, 4)).toBe(3);
      expect(calculateStars(100000, 180000, 5)).toBe(3);
    });

    it('returns 3 stars when time exactly equals par AND gems exactly 3', () => {
      expect(calculateStars(180000, 180000, 3)).toBe(3);
    });
  });

  describe('2 stars', () => {
    it('returns 2 stars when time ≤ par but gems < 3', () => {
      expect(calculateStars(180000, 180000, 2)).toBe(2);
      expect(calculateStars(150000, 180000, 1)).toBe(2);
      expect(calculateStars(100000, 180000, 0)).toBe(2);
    });

    it('returns 2 stars when gems ≥ 3 but time > par', () => {
      expect(calculateStars(200000, 180000, 3)).toBe(2);
      expect(calculateStars(250000, 180000, 4)).toBe(2);
      expect(calculateStars(300000, 180000, 5)).toBe(2);
    });
  });

  describe('1 star', () => {
    it('returns 1 star when time > par AND gems < 3', () => {
      expect(calculateStars(200000, 180000, 2)).toBe(1);
      expect(calculateStars(250000, 180000, 1)).toBe(1);
      expect(calculateStars(300000, 180000, 0)).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles zero par time', () => {
      expect(calculateStars(0, 0, 3)).toBe(3);
      expect(calculateStars(1, 0, 3)).toBe(2);
    });

    it('handles zero completion time', () => {
      expect(calculateStars(0, 180000, 3)).toBe(3);
      expect(calculateStars(0, 180000, 2)).toBe(2);
    });

    it('handles zero gems', () => {
      expect(calculateStars(180000, 180000, 0)).toBe(2);
      expect(calculateStars(200000, 180000, 0)).toBe(1);
    });

    it('handles large gem counts', () => {
      expect(calculateStars(180000, 180000, 10)).toBe(3);
      expect(calculateStars(200000, 180000, 10)).toBe(2);
    });
  });
});
