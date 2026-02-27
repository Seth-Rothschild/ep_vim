"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  _state: state,
  _handleKey: handleKey,
  _commands: commands,
} = require("./index.js");

const makeRep = (lines) => ({
  lines: {
    length: () => lines.length,
    atIndex: (n) => ({ text: lines[n] }),
  },
});

const makeMockEditorInfo = () => {
  const calls = [];
  return {
    editorInfo: {
      ace_inCallStackIfNecessary: (_name, fn) => fn(),
      ace_performSelectionChange: (start, end, _flag) => {
        calls.push({ type: "select", start, end });
      },
      ace_updateBrowserSelectionFromRep: () => {},
    },
    calls,
  };
};

describe("char search repeat (semicolon)", () => {
  beforeEach(() => {
    // Reset state before each test
    state.mode = "normal";
    state.pendingKey = null;
    state.pendingCount = null;
    state.countBuffer = "";
    state.register = null;
    state.marks = {};
    state.lastCharSearch = null;
    state.visualAnchor = null;
    state.visualCursor = null;
    state.editorDoc = null;
    state.currentRep = null;
    state.desiredColumn = null;
    state.lastCommand = null;
    state.searchMode = false;
    state.searchBuffer = "";
    state.searchDirection = null;
    state.lastSearch = null;
  });

  it("repeats forward char search with ; in normal mode", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    // Set up a prior 'f' search for 'o' at position 0
    state.lastCharSearch = { direction: "f", target: "o" };

    // Call ; to repeat the search
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
    };
    commands.normal[";"](ctx);

    // Should have moved to first 'o' at position 4
    assert.equal(
      calls.length,
      1,
      `Expected 1 call, got ${calls.length}. Calls: ${JSON.stringify(calls)}`,
    );
    assert.deepEqual(calls[0].start, [0, 4]);
  });

  it("does nothing when no prior char search", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = null;

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello world" };
    commands.normal[";"](ctx);

    // Should not move cursor
    assert.equal(calls.length, 0);
  });

  it("repeats t search (till char) with ;", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = { direction: "t", target: "o" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
    };
    commands.normal[";"](ctx);

    // 't' finds 'o' at position 4, but lands one before (position 3)
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 3]);
  });

  it("repeats with count", () => {
    const rep = makeRep(["abacada"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = { direction: "f", target: "a" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "abacada",
      count: 2,
    };
    commands.normal[";"](ctx);

    // With count 2, should find the 2nd 'a' after position 0, which is at position 4
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 4]);
  });
});

describe("char search reverse (comma)", () => {
  beforeEach(() => {
    state.mode = "normal";
    state.pendingKey = null;
    state.pendingCount = null;
    state.countBuffer = "";
    state.register = null;
    state.marks = {};
    state.lastCharSearch = null;
    state.visualAnchor = null;
    state.visualCursor = null;
    state.editorDoc = null;
    state.currentRep = null;
    state.desiredColumn = null;
    state.lastCommand = null;
    state.searchMode = false;
    state.searchBuffer = "";
    state.searchDirection = null;
    state.lastSearch = null;
  });

  it("reverses f search to F with ,", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = { direction: "f", target: "o" };

    // Start at position 7 and search backward
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: "hello world",
      count: 1,
    };
    commands.normal[","](ctx);

    // 'F' search from position 7 finds 'o' at position 4 (going backward)
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 4]);
  });

  it("reverses t search to T with ,", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = { direction: "t", target: "o" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: "hello world",
      count: 1,
    };
    commands.normal[","](ctx);

    // 'T' finds 'o' at position 4, then lands one after (position 5)
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 5]);
  });

  it("does nothing when no prior char search", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCharSearch = null;

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: "hello world",
      count: 1,
    };
    commands.normal[","](ctx);

    assert.equal(calls.length, 0);
  });
});
