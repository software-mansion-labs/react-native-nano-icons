import { PlatformColor } from 'react-native';
import { validateLayerColor } from '../src/utils/validateLayerColor';

describe('validateLayerColor', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('passes valid color strings through', () => {
    expect(validateLayerColor('#ff0036', 'star', 0)).toBe('#ff0036');
    expect(validateLayerColor('rgba(0,0,0,0.3)', 'star', 1)).toBe(
      'rgba(0,0,0,0.3)'
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('maps currentColor and a missing color to black without reporting', () => {
    expect(validateLayerColor('currentColor', 'star', 0)).toBe('black');
    expect(validateLayerColor(undefined, 'star', 0)).toBe('black');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('passes platform color objects through untouched', () => {
    const platform = PlatformColor('label');
    expect(validateLayerColor(platform, 'star', 0)).toBe(platform);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('falls back to black and names the icon for an invalid string', () => {
    expect(validateLayerColor('nope', 'star', 1)).toBe('black');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain(
      'Invalid color "nope" for icon "star" (layer 1)'
    );
  });

  it('reports each icon and value pair once', () => {
    validateLayerColor('nope', 'star', 0);
    validateLayerColor('nope', 'star', 0);
    validateLayerColor('nope', 'heart', 0);
    validateLayerColor('alsonope', 'star', 0);
    expect(errorSpy.mock.calls.map((c) => c[0])).toEqual([
      expect.stringContaining('for icon "heart"'),
      expect.stringContaining('Invalid color "alsonope" for icon "star"'),
    ]);
  });
});
