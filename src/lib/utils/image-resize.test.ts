import {
  fitWithin,
  validateAttachmentBudget,
  validateImageFile,
  MAX_IMAGE_EDGE,
  MAX_IMAGES_PER_MESSAGE,
  MAX_TOTAL_BASE64_BYTES,
} from '@/lib/utils/image-resize';

describe('fitWithin', () => {
  it('should scale a landscape image by its width', () => {
    // Arrange / Act
    const result = fitWithin(5000, 2500, 2576);

    // Assert
    expect(result.width).toBe(2576);
    expect(result.height).toBe(1288);
  });

  it('should scale a portrait image by its height', () => {
    // Arrange / Act — a phone photo held upright
    const result = fitWithin(3024, 4032, 2576);

    // Assert
    expect(result.height).toBe(2576);
    expect(result.width).toBe(1932);
  });

  it('should scale a square image on both edges equally', () => {
    expect(fitWithin(4000, 4000, 2576)).toEqual({ width: 2576, height: 2576 });
  });

  it('should leave an already-small image untouched', () => {
    // Upscaling would add bytes and invent detail that isn't in the original
    expect(fitWithin(800, 600, 2576)).toEqual({ width: 800, height: 600 });
  });

  it('should leave an image exactly at the limit untouched', () => {
    expect(fitWithin(2576, 1200, 2576)).toEqual({ width: 2576, height: 1200 });
  });

  it('should never produce a zero-width canvas from an extreme aspect ratio', () => {
    // Arrange / Act — a 10000x3 strip would round the short edge to 0
    const result = fitWithin(10000, 3, 2576);

    // Assert
    expect(result.width).toBe(2576);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('should default to the API maximum edge', () => {
    expect(fitWithin(5000, 5000).width).toBe(MAX_IMAGE_EDGE);
  });
});

describe('validateAttachmentBudget', () => {
  function imageOfBytes(bytes: number) {
    return { base64: 'x'.repeat(bytes) };
  }

  it('should accept an empty attachment list', () => {
    // Arrange / Act
    const result = validateAttachmentBudget([]);

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.totalBytes).toBe(0);
  });

  it('should accept a set within both caps', () => {
    // Arrange / Act
    const result = validateAttachmentBudget([imageOfBytes(1000), imageOfBytes(2000)]);

    // Assert
    expect(result.isValid).toBe(true);
    expect(result.totalBytes).toBe(3000);
  });

  it('should accept a total sitting exactly on the size cap', () => {
    // Arrange / Act
    const result = validateAttachmentBudget([imageOfBytes(MAX_TOTAL_BASE64_BYTES)]);

    // Assert
    expect(result.isValid).toBe(true);
  });

  it('should reject more images than allowed', () => {
    // Arrange
    const tooMany = Array.from({ length: MAX_IMAGES_PER_MESSAGE + 1 }, () => imageOfBytes(10));

    // Act
    const result = validateAttachmentBudget(tooMany);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(String(MAX_IMAGES_PER_MESSAGE));
  });

  it('should reject a total over the size cap', () => {
    // Arrange / Act
    const result = validateAttachmentBudget([imageOfBytes(MAX_TOTAL_BASE64_BYTES + 1)]);

    // Assert
    expect(result.isValid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('validateImageFile', () => {
  function fileOfType(type: string): File {
    return { type } as File;
  }

  it.each(['image/jpeg', 'image/png', 'image/webp'])('should accept %s', (type) => {
    expect(validateImageFile(fileOfType(type))).toBeNull();
  });

  it('should reject HEIC, which the API rejects and Chrome cannot decode', () => {
    // Arrange / Act
    const error = validateImageFile(fileOfType('image/heic'));

    // Assert
    expect(error).toContain('JPG');
  });

  it('should reject a file with no detected type', () => {
    expect(validateImageFile(fileOfType(''))).toContain('sconosciuto');
  });
});
