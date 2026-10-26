/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("module");
const path = require("path");

const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "next/headers") {
    return path.join(__dirname, "fake-next-headers.cjs");
  }
  return original.call(this, request, parent, isMain, options);
};
