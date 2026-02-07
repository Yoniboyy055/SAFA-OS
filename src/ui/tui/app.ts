#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { TuiRoot } from "./shell";

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return undefined;
  }
  return args[index + 1];
}

const args = process.argv.slice(2);
const configPath = getFlagValue(args, "--config");
const actor = getFlagValue(args, "--actor") ?? "tui-user";
const noBoot = args.includes("--no-boot");

render(React.createElement(TuiRoot, { configPath, actor, noBoot }));
