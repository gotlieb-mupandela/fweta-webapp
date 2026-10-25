import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardError from "@/app/dashboard/error";
import RootError from "@/app/error";
import { EmptyState } from "@/components/ui/card";

const probe = Object.assign(new Error("probe"), { digest: "abc" });

function renderError(Component: typeof RootError): string {
  return renderToStaticMarkup(createElement(Component, { error: probe, reset: () => undefined }));
}

test("route error page renders the fweta mark and recovery actions", () => {
  const html = renderError(RootError);
  assert.match(html, /This page did not load/);
  assert.match(html, /Something went wrong on fweta\. Try again, or go back home\./);
  assert.match(html, /Try again/);
  assert.match(html, /Back home/);
  assert.match(html, /fweta-mark\.png/);
  assert.doesNotMatch(html, /Supabase|system-ui/);
  assert.doesNotMatch(html, /\u2014/);
});

test("dashboard error page renders the fweta mark and recovery actions", () => {
  const html = renderError(DashboardError);
  assert.match(html, /This page did not load/);
  assert.match(html, /fweta could not open this part of your workspace\. Try again, or go back home\./);
  assert.match(html, /Try again/);
  assert.match(html, /Back home/);
  assert.match(html, /fweta-mark\.png/);
  assert.doesNotMatch(html, /Supabase|system-ui/);
  assert.doesNotMatch(html, /\u2014/);
});

test("empty state renders the fweta mark", () => {
  const html = renderToStaticMarkup(
    createElement(EmptyState, {
      title: "No campaigns yet",
      description: "Create your first campaign to start receiving clip submissions.",
    }),
  );
  assert.match(html, /<h3[^>]*>No campaigns yet<\/h3>/);
  assert.match(html, /Create your first campaign to start receiving clip submissions\./);
  assert.match(html, /fweta-mark\.png/);
  assert.doesNotMatch(html, /\u2014/);
});
