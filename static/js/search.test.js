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

describe("search commands", () => {
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

  it("/ enters search mode forward", () => {
    commands.normal["/"](state);

    assert.equal(state.searchMode, true);
    assert.equal(state.searchDirection, "/");
  });

  it("? enters search mode backward", () => {
    commands.normal["?"](state);

    assert.equal(state.searchMode, true);
    assert.equal(state.searchDirection, "?");
  });

  it("n searches next match", () => {
    const rep = makeRep(["hello world hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastSearch = { pattern: "hello", direction: "/" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world hello",
    };
    commands.normal["n"](ctx);

    assert.equal(calls.length, 1);
  });

  it("N searches previous match", () => {
    const rep = makeRep(["hello world hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastSearch = { pattern: "hello", direction: "/" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 12,
      lineText: "hello world hello",
    };
    commands.normal["N"](ctx);

    assert.equal(calls.length, 1);
  });

  it("n does nothing with no last search", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastSearch = null;

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello world" };
    commands.normal["n"](ctx);

    assert.equal(calls.length, 0);
  });
});

describe("missing feature: * and # word search", () => {
  beforeEach(resetState);

  it("* searches forward for word under cursor", () => {
    const rep = makeRep(["hello world hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world hello",
      count: 1,
      hasCount: false,
    };

    commands.normal["*"](ctx);

    assert.equal(calls.length, 1, "should move cursor to next match");
    assert.deepEqual(state.lastSearch, { pattern: "hello", direction: "/" });
  });

  it("* on non-word char does nothing", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 5,
      lineText: "hello world",
      count: 1,
      hasCount: false,
    };

    commands.normal["*"](ctx);

    assert.equal(calls.length, 0, "should not move cursor");
    assert.equal(state.lastSearch, null);
  });

  it("# searches backward for word under cursor", () => {
    const rep = makeRep(["hello world hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 12,
      lineText: "hello world hello",
      count: 1,
      hasCount: false,
    };

    commands.normal["#"](ctx);

    assert.equal(calls.length, 1, "should move cursor to previous match");
    assert.deepEqual(state.lastSearch, { pattern: "hello", direction: "?" });
  });

  it("* sets lastSearch so n repeats the search", () => {
    const rep = makeRep(["foo bar foo bar"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "foo bar foo bar",
      count: 1,
      hasCount: false,
    };

    commands.normal["*"](ctx);

    assert.deepEqual(state.lastSearch, { pattern: "foo", direction: "/" });
  });
});
