"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Mock navigator for clipboard operations
global.navigator = {
  clipboard: {
    writeText: () => Promise.resolve(),
  },
};

const {
  _state: state,
  _handleKey: handleKey,
  _commands: commands,
  _parameterized: parameterized,
  _setVimEnabled: setVimEnabled,
  _setUseCtrlKeys: setUseCtrlKeys,
  aceKeyEvent,
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
      ace_performDocumentReplaceRange: (start, end, newText) => {
        calls.push({ type: "replace", start, end, newText });
      },
    },
    calls,
  };
};

// ---------------------------------------------------------------------------

const resetState = () => {
  state.mode = "normal";
  state.pendingKey = null;
  state.pendingCount = null;
  state.countBuffer = "";
  state.register = null;
  state.namedRegisters = {};
  state.pendingRegister = null;
  state.awaitingRegister = false;
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
  state.lastVisualSelection = null;
};

describe("insert mode commands", () => {
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

  it("i enters insert mode at cursor", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "hello" };
    commands.normal["i"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("a enters insert mode after cursor", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "hello" };
    commands.normal["a"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("A enters insert mode at end of line", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "hello" };
    commands.normal["A"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("I enters insert mode at first non-blank", () => {
    const rep = makeRep(["  hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "  hello" };
    commands.normal["I"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("o opens line below", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello" };
    commands.normal["o"](ctx);

    assert.equal(state.mode, "insert");
    assert.equal(calls.length, 2);
  });

  it("O opens line above", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello" };
    commands.normal["O"](ctx);

    assert.equal(state.mode, "insert");
    assert.equal(calls.length, 2);
  });

  it("s replaces character and enters insert", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
      count: 1,
    };
    commands.normal["s"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("S replaces entire line and enters insert", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "hello" };
    commands.normal["S"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("C changes to end of line and enters insert", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 6,
      lineText: "hello world",
    };
    commands.normal["C"](ctx);

    assert.equal(state.mode, "insert");
  });
});
