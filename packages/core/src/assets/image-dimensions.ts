import { imageSize } from "image-size";

export interface ImageDimensions {
  width?: number;
  height?: number;
}

export async function readImageDimensions(file: string): Promise<ImageDimensions> {
  try {
    const size = imageSize(file);
    return {
      width: size.width,
      height: size.height
    };
  } catch {
    return {};
  }
}
