import { describe, expect, it } from 'vitest';
import { layoutFor } from './layout';

describe('layout', () => {
  it('treats a phone as a phone in either orientation', () => {
    expect(layoutFor(393, 851).isTablet).toBe(false);
    expect(layoutFor(851, 393).isTablet).toBe(false);
    expect(layoutFor(851, 393).rail).toBe(true); // the rail is about width, not device class — but a phone's content stays full-width
    expect(layoutFor(851, 393).maxContent).toBe(851 - 92);
  });
  it('treats a tablet as a tablet, with a rail only when wide', () => {
    const portrait = layoutFor(800, 1280); const landscape = layoutFor(1280, 800);
    expect(portrait.isTablet).toBe(true); expect(portrait.rail).toBe(false); expect(portrait.maxContent).toBe(720);
    expect(landscape.rail).toBe(true); expect(landscape.contentWidth).toBe(1280 - 92); expect(landscape.maxContent).toBe(1040);
  });
  it('fits more covers on bigger screens', () => {
    expect(layoutFor(393, 851).columns(160)).toBe(2);
    expect(layoutFor(1280, 800).columns(160)).toBeGreaterThanOrEqual(5);
    expect(layoutFor(800, 1280).columns(160)).toBeGreaterThanOrEqual(3);
  });
});
