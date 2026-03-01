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

describe("basic motions", () => {
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

  it("h moves cursor left", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 3,
      lineText: "hello",
      count: 1,
    };
    commands.normal["h"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 2]);
  });

  it("h with count moves left multiple times", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 4,
      lineText: "hello",
      count: 3,
    };
    commands.normal["h"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 1]);
  });

  it("l moves cursor right", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "hello",
      count: 1,
    };
    commands.normal["l"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 3]);
  });

  it("l with count moves right multiple times", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 2,
    };
    commands.normal["l"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 2]);
  });

  it("0 moves to line start", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 3,
      lineText: "hello",
      count: 1,
    };
    commands.normal["0"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 0]);
  });

  it("$ moves to line end", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["$"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 4]);
  });

  it("^ moves to first non-blank", () => {
    const rep = makeRep(["  hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "  hello",
      count: 1,
    };
    commands.normal["^"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 2]);
  });
});

describe("marks", () => {
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

  it("m sets a mark", () => {
    const ctx = { rep: makeRep([]), line: 5, char: 10 };

    parameterized["m"]("a", ctx);

    assert.deepEqual(state.marks["a"], [5, 10]);
  });

  it("' jumps to mark (line start)", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.marks["a"] = [1, 3];

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 1,
    };
    parameterized["'"]("a", ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [1, 0]);
  });

  it("` jumps to mark (exact position)", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.marks["b"] = [1, 3];

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 1,
    };
    parameterized["`"]("b", ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [1, 3]);
  });

  it("' does nothing with nonexistent mark", () => {
    const rep = makeRep(["line0"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.marks = {};

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 1,
    };
    parameterized["'"]("z", ctx);

    assert.equal(calls.length, 0);
  });
});

describe("line navigation", () => {
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

  it("j moves down one line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "line0",
      count: 1,
    };
    commands.normal["j"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [1, 2]);
  });

  it("j with count moves down multiple lines", () => {
    const rep = makeRep(["line0", "line1", "line2", "line3"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "line0",
      count: 2,
    };
    commands.normal["j"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [2, 1]);
  });

  it("k moves up one line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 2,
      char: 2,
      lineText: "line2",
      count: 1,
    };
    commands.normal["k"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [1, 2]);
  });

  it("gg goes to first line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 2,
      char: 3,
      lineText: "line2",
      count: 1,
      hasCount: false,
    };
    commands.normal["gg"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 0]);
  });

  it("G goes to last line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "line0",
      count: 1,
      hasCount: false,
    };
    commands.normal["G"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [2, 0]);
  });

  it("G with count goes to specific line", () => {
    const rep = makeRep(["line0", "line1", "line2", "line3"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 3,
      hasCount: true,
    };
    commands.normal["G"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [2, 0]);
  });
});

describe("word motions", () => {
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

  it("w moves to next word", () => {
    const rep = makeRep(["hello world foo"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world foo",
      count: 1,
    };
    commands.normal["w"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 6]);
  });

  it("w with count moves multiple words", () => {
    const rep = makeRep(["hello world foo"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world foo",
      count: 2,
    };
    commands.normal["w"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 12]);
  });

  it("b moves to previous word", () => {
    const rep = makeRep(["hello world foo"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 12,
      lineText: "hello world foo",
      count: 1,
    };
    commands.normal["b"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 6]);
  });

  it("e moves to end of word", () => {
    const rep = makeRep(["hello world foo"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world foo",
      count: 1,
    };
    commands.normal["e"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 4]);
  });
});

describe("char motions (f/F/t/T)", () => {
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

  it("f enters pending mode for char search", () => {
    const ctx = { rep: makeRep([]), line: 0, char: 0, lineText: "" };
    commands.normal["f"](ctx);

    assert.equal(state.pendingKey, "f");
  });

  it("t enters pending mode for till search", () => {
    const ctx = { rep: makeRep([]), line: 0, char: 0, lineText: "" };
    commands.normal["t"](ctx);

    assert.equal(state.pendingKey, "t");
  });

  it("F enters pending mode for backward char search", () => {
    const ctx = { rep: makeRep([]), line: 0, char: 0, lineText: "" };
    commands.normal["F"](ctx);

    assert.equal(state.pendingKey, "F");
  });

  it("T enters pending mode for backward till search", () => {
    const ctx = { rep: makeRep([]), line: 0, char: 0, lineText: "" };
    commands.normal["T"](ctx);

    assert.equal(state.pendingKey, "T");
  });
});

describe("paragraph motions", () => {
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

  it("{ moves to previous empty line", () => {
    const rep = makeRep(["text", "text", "", "text"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 3,
      char: 0,
      lineText: "text",
      count: 1,
    };
    commands.normal["{"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [2, 0]);
  });

  it("} moves to next empty line", () => {
    const rep = makeRep(["text", "", "text", "text"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "text",
      count: 1,
    };
    commands.normal["}"](ctx);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [1, 0]);
  });
});

describe("line reference motions", () => {
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

  it("H moves to top of visible area", () => {
    const rep = makeRep(["a", "b", "c", "d", "e"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 2,
      char: 0,
      lineText: "c",
      count: 1,
    };
    commands.normal["H"](ctx);

    // Should move to first non-blank of top line
    assert.equal(calls.length, 1);
  });

  it("L moves to bottom of visible area", () => {
    const rep = makeRep(["a", "b", "c", "d", "e"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "a",
      count: 1,
    };
    commands.normal["L"](ctx);

    assert.equal(calls.length, 1);
  });

  it("M moves to middle of visible area", () => {
    const rep = makeRep(["a", "b", "c", "d", "e"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "a",
      count: 1,
    };
    commands.normal["M"](ctx);

    assert.equal(calls.length, 1);
  });
});

describe("edge cases: motions on empty lines", () => {
  beforeEach(resetState);

  it("w on empty line stays on same position", () => {
    const rep = makeRep([""]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "",
      count: 1,
    };
    commands.normal["w"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0, "should produce a cursor move");
    assert.deepEqual(selects[0].start, [0, 0]);
  });

  it("$ on empty line does not produce negative char", () => {
    const rep = makeRep([""]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "",
      count: 1,
    };
    commands.normal["$"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    const charPos = selects[0].start[1];
    assert.ok(charPos >= 0, `$ on empty line gave char ${charPos}`);
  });

  it("x on empty line does nothing", () => {
    const rep = makeRep([""]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "",
      count: 1,
    };
    commands.normal["x"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.equal(replaces.length, 0, "x on empty line should not replace");
  });

  it("~ on empty line does nothing", () => {
    const rep = makeRep([""]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "",
      count: 1,
    };
    commands.normal["~"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.equal(replaces.length, 0, "~ on empty line should not replace");
  });
});

describe("edge cases: boundary motions", () => {
  beforeEach(resetState);

  it("h at column 0 stays at column 0", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["h"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.deepEqual(selects[0].start, [0, 0]);
  });

  it("l at last character stays at last character", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 4,
      lineText: "hello",
      count: 1,
    };
    commands.normal["l"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.deepEqual(
      selects[0].start,
      [0, 4],
      "l at last char should not go past it",
    );
  });

  it("j at last line stays at last line", () => {
    const rep = makeRep(["line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "line2",
      count: 1,
    };
    commands.normal["j"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(selects[0].start[0], 1, "j at last line should stay");
  });

  it("k at first line stays at first line", () => {
    const rep = makeRep(["line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line1",
      count: 1,
    };
    commands.normal["k"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(selects[0].start[0], 0, "k at first line should stay");
  });
});

describe("edge cases: t/f adjacent and edge positions", () => {
  beforeEach(resetState);

  it("t to adjacent char should not move (lands on self)", () => {
    const rep = makeRep(["ab"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "ab",
      count: 1,
    };
    parameterized["t"]("b", ctx);

    const selects = calls.filter((c) => c.type === "select");
    if (selects.length > 0) {
      assert.deepEqual(
        selects[0].start,
        [0, 0],
        "t to adjacent char should not move forward (would land on current pos)",
      );
    }
  });

  it("f at end of line should not find char", () => {
    const rep = makeRep(["abc"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "abc",
      count: 1,
    };
    parameterized["f"]("x", ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(selects.length, 0, "f for missing char should not move");
  });

  it("F at start of line should not find char", () => {
    const rep = makeRep(["abc"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "abc",
      count: 1,
    };
    parameterized["F"]("x", ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(selects.length, 0, "F for missing char should not move");
  });
});

describe("edge cases: w/b word motions", () => {
  beforeEach(resetState);

  it("w at last word on line clamps to end", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 6,
      lineText: "hello world",
      count: 1,
    };
    commands.normal["w"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    const endChar = selects[0].start[1];
    assert.ok(
      endChar <= 10,
      `w at last word should clamp to line end, got ${endChar}`,
    );
  });

  it("b at first word stays at position 0", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
    };
    commands.normal["b"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    assert.deepEqual(selects[0].start, [0, 0]);
  });

  it("w on line with only spaces", () => {
    const rep = makeRep(["   "]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "   ",
      count: 1,
    };
    commands.normal["w"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    assert.ok(
      selects[0].start[1] >= 0,
      "w on whitespace-only line should not crash",
    );
  });

  it("e on single character word", () => {
    const rep = makeRep(["a b c"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "a b c",
      count: 1,
    };
    commands.normal["e"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    assert.equal(
      selects[0].start[1],
      2,
      "e from 'a' should jump to 'b' (next word end)",
    );
  });
});

describe("edge cases: j/k desiredColumn stickiness", () => {
  beforeEach(resetState);

  it("j through short line preserves desired column", () => {
    const rep = makeRep(["long line here", "ab", "long line here"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx1 = {
      rep,
      editorInfo,
      line: 0,
      char: 10,
      lineText: "long line here",
      count: 1,
    };
    commands.normal["j"](ctx1);

    const select1 = calls.filter((c) => c.type === "select");
    assert.equal(select1[0].start[0], 1, "should be on line 1");
    assert.equal(
      select1[0].start[1],
      1,
      "should clamp to last char of short line",
    );

    const ctx2 = {
      rep,
      editorInfo,
      line: 1,
      char: 1,
      lineText: "ab",
      count: 1,
    };
    commands.normal["j"](ctx2);

    const select2 = calls.filter((c) => c.type === "select");
    const lastSelect = select2[select2.length - 1];
    assert.equal(lastSelect.start[0], 2);
    assert.equal(
      lastSelect.start[1],
      10,
      "j should restore desired column on longer line",
    );
  });

  it("h resets desired column", () => {
    const rep = makeRep(["long line here", "ab", "long line here"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx1 = {
      rep,
      editorInfo,
      line: 0,
      char: 10,
      lineText: "long line here",
      count: 1,
    };
    commands.normal["j"](ctx1);

    commands.normal["h"]({
      rep,
      editorInfo,
      line: 1,
      char: 1,
      lineText: "ab",
      count: 1,
    });

    commands.normal["j"]({
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "ab",
      count: 1,
    });

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.equal(lastSelect.start[0], 2);
    assert.equal(
      lastSelect.start[1],
      0,
      "h should reset desiredColumn so subsequent j uses actual column",
    );
  });
});

describe("edge cases: gg and G with count", () => {
  beforeEach(resetState);

  it("5gg goes to line 5 (0-indexed line 4)", () => {
    const rep = makeRep(Array.from({ length: 10 }, (_, i) => `line${i}`));
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 5,
      hasCount: true,
    };
    commands.normal["gg"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(
      selects[0].start[0],
      4,
      "5gg should go to line index 4 (line 5)",
    );
  });

  it("gg with count beyond document clamps to last line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 100,
      hasCount: true,
    };
    commands.normal["gg"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(
      selects[0].start[0],
      2,
      "gg with huge count should clamp to last line",
    );
  });

  it("G without count goes to last line", () => {
    const rep = makeRep(["line0", "line1", "line2"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
      count: 1,
      hasCount: false,
    };
    commands.normal["G"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.equal(selects[0].start[0], 2, "G should go to last line");
  });
});
