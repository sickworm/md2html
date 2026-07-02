import type { PlatformId } from "../types.js";
import type { PlatformAdapter } from "./types.js";
import { genericAdapter } from "./generic.js";
import { kmAdapter } from "./km.js";
import { lexiangAdapter } from "./lexiang.js";
import { wechatAdapter } from "./wechat.js";

const adapters: Record<PlatformId, PlatformAdapter> = {
  generic: genericAdapter,
  wechat: wechatAdapter,
  km: kmAdapter,
  lexiang: lexiangAdapter
};

export function getPlatformAdapter(platform: PlatformId = "generic"): PlatformAdapter {
  return adapters[platform];
}

export type { PlatformAdapter, PlatformCapabilities } from "./types.js";
