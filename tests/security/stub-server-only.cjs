/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("module");
const path = require("path");

const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "empty-module.cjs");
  }
  return original.call(this, request, parent, isMain, options);
};
