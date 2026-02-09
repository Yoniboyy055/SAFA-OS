interface NodeRequire {
  (moduleName: string): any;
  main?: unknown;
}
declare const require: NodeRequire;
declare const module: { exports: unknown };
declare const __dirname: string;
declare module "node:fs" {
  const fs: any;
  export = fs;
}
declare module "node:path" {
  const path: any;
  export = path;
}
declare module "node:crypto" {
  const crypto: any;
  export = crypto;
}
declare module "node:url" {
  const url: any;
  export = url;
}
declare module "node:buffer" {
  const buffer: any;
  export = buffer;
}
declare module "node:http" {
  const http: any;
  export = http;
}
declare const TextEncoder: {
  new (): { encode: (input: string) => Uint8Array };
};
declare const TextDecoder: {
  new (encoding?: string): { decode: (input: Uint8Array) => string };
};
declare function fetch(
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
  }
): Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<any>;
  body?: {
    getReader: () => {
      read: () => Promise<{ done: boolean; value?: Uint8Array }>;
      cancel: () => Promise<void>;
    };
  };
}>;

declare class AbortController {
  readonly signal: unknown;
  abort: () => void;
}
declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdin: {
    setEncoding: (encoding: string) => void;
    on: (event: string, handler: (chunk: string) => void) => void;
  };
};
declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};
