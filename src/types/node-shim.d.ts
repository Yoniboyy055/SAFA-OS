declare function require(moduleName: string): any;
declare const __dirname: string;
declare module "node:fs" {
  const fs: any;
  export = fs;
}
declare module "node:path" {
  const path: any;
  export = path;
}
declare module "node:child_process" {
  const childProcess: any;
  export = childProcess;
}
declare module "node:crypto" {
  const crypto: any;
  export = crypto;
}
declare const process: {
  argv: string[];
  cwd(): string;
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
};
