import { visit } from "unist-util-visit";
import type { ImageRef } from "../assets/image-manifest.js";
import type { ImageManifestItem } from "../types.js";

export function rehypeNormalizeImages(imageRefs: ImageRef[]) {
  return (tree: unknown) => {
    visit(tree as never, "element", (node: any) => {
      if (node.tagName !== "img") {
        return;
      }

      const src = String(node.properties?.src ?? "");
      if (!src) {
        return;
      }

      const ref: ImageRef = {
        source: src,
        alt: typeof node.properties?.alt === "string" ? node.properties.alt : undefined,
        width: parsePositiveInt(node.properties?.width)
      };
      imageRefs.push(ref);

      node.properties = {
        ...(node.properties ?? {}),
        "data-md2html-image-index": String(imageRefs.length - 1)
      };
    });
  };
}

export function rehypeApplyImageManifest(imageManifest: ImageManifestItem[]) {
  return (tree: unknown) => {
    visit(tree as never, "element", (node: any) => {
      if (node.tagName !== "img") {
        return;
      }

      const index = Number.parseInt(String(node.properties?.["data-md2html-image-index"] ?? ""), 10);
      if (!Number.isFinite(index)) {
        return;
      }

      const image = imageManifest[index];
      if (!image) {
        return;
      }

      node.properties = {
        ...node.properties,
        src: image.outputRelativePath,
        width: String(image.displayWidth),
        alt: image.alt ?? "",
        style: `max-width:100%;height:auto;width:${image.displayWidth}px;`
      };
      delete node.properties["data-md2html-image-index"];
    });
  };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
