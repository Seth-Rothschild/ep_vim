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

describe("delete operations", () => {
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

  it("x deletes character at cursor", () => {
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
    commands.normal["x"](ctx);

    assert.equal(state.register, "e");
  });

  it("x with count deletes multiple characters", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
      count: 3,
    };
    commands.normal["x"](ctx);

    assert.equal(state.register, "ell");
  });

  it("dd deletes entire line", () => {
    const rep = makeRep(["line1", "line2", "line3"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "line2",
      count: 1,
    };
    commands.normal["dd"](ctx);

    assert.deepEqual(state.register, ["line2"]);
  });

  it("yy yanks entire line to register", () => {
    const rep = makeRep(["line1", "line2", "line3"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "line2",
      count: 1,
    };
    commands.normal["yy"](ctx);

    assert.equal(state.register.length, 1);
    assert.equal(state.register[0], "line2");
  });

  it("cc changes entire line (deletes and enters insert)", () => {
    const rep = makeRep(["line1", "line2", "line3"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "line2",
      count: 1,
    };
    commands.normal["cc"](ctx);

    assert.equal(state.mode, "insert");
  });

  it("D deletes from cursor to end of line", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 6,
      lineText: "hello world",
    };
    commands.normal["D"](ctx);

    assert.equal(state.register, "world");
  });

  it("J joins lines", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["J"](ctx);

    assert.equal(state.mode, "normal");
  });
});

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

describe("replace command", () => {
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

  it("r enters pending mode for replace", () => {
    const ctx = { rep: makeRep([]), line: 0, char: 0, lineText: "" };
    commands.normal["r"](ctx);

    assert.equal(state.pendingKey, "r");
  });

  it("r replaces single character", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
      count: 1,
    };
    parameterized["r"]("x", ctx);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      type: "replace",
      start: [0, 1],
      end: [0, 2],
      newText: "x",
    });
  });

  it("r with count replaces multiple characters", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
      count: 3,
    };
    parameterized["r"]("x", ctx);

    assert.equal(calls.length, 2);
  });
});

describe("paste commands", () => {
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

  it("p pastes string register after cursor", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    state.register = "x";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["p"](ctx);

    assert.equal(state.mode, "normal");
  });

  it("p pastes with count repeats content", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    state.register = "a";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 2,
    };
    commands.normal["p"](ctx);

    assert.equal(state.mode, "normal");
  });

  it("p pastes line register on new line", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo } = makeMockEditorInfo();

    state.register = ["inserted"];
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["p"](ctx);

    assert.equal(state.mode, "normal");
  });

  it("P pastes string register before cursor", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    state.register = "x";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "hello",
      count: 1,
    };
    commands.normal["P"](ctx);

    assert.equal(state.mode, "normal");
  });

  it("P pastes line register on new line above", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo } = makeMockEditorInfo();

    state.register = ["inserted"];
    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "world",
      count: 1,
    };
    commands.normal["P"](ctx);

    assert.equal(state.mode, "normal");
  });
});

describe("case toggle", () => {
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

  it("~ toggles case of character", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["~"](ctx);

    assert.equal(state.mode, "normal");
  });

  it("~ with count toggles multiple characters", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 3,
    };
    commands.normal["~"](ctx);

    assert.equal(state.mode, "normal");
  });
});

describe("undo command", () => {
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

  it("u calls undo", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo: baseEditorInfo } = makeMockEditorInfo();

    const editorInfo = {
      ...baseEditorInfo,
      ace_doUndoRedo: () => {},
    };

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello" };
    commands.normal["u"](ctx);
  });
});

describe("repeat command", () => {
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

  it(". repeats last command", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCommand = { key: "h", count: 1, param: null };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 3,
      lineText: "hello",
    };
    commands.normal["."](ctx);

    assert.equal(calls.length, 1);
  });

  it(". does nothing with no last command", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.lastCommand = null;

    const ctx = { rep, editorInfo, line: 0, char: 0, lineText: "hello" };
    commands.normal["."](ctx);

    assert.equal(calls.length, 0);
  });

  it(". repeats parameterized command", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    state.lastCommand = { key: "m", count: 1, param: "a" };

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "hello world",
    };
    commands.normal["."](ctx);

    assert.deepEqual(state.marks["a"], [0, 2]);
  });
});

describe("visual mode", () => {
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

  it("v enters visual-char mode and shows character highlighted", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 1, lineText: "abcdef" };
    commands.normal["v"](ctx);

    assert.equal(state.mode, "visual-char");
    assert.deepEqual(state.visualAnchor, [0, 1]);
    assert.deepEqual(state.visualCursor, [0, 1]);
    // Should call selectRange with [0,1] and [0,2] to show char at position 1 highlighted
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 1]);
    assert.deepEqual(calls[0].end, [0, 2]);
  });

  it("l in visual-char mode extends selection correctly", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.mode = "visual-char";
    state.visualAnchor = [0, 1];
    state.visualCursor = [0, 1];

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "abcdef",
      count: 1,
    };
    commands["visual-char"]["l"](ctx);

    // After moving right once, cursor should be at position 2
    assert.deepEqual(state.visualCursor, [0, 2]);
    // Should select from 1 to 3 (positions 1 and 2)
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 1]);
    assert.deepEqual(calls[0].end, [0, 3]);
  });

  it("ll in visual-char mode extends selection to include cursor position", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.mode = "visual-char";
    state.visualAnchor = [0, 1];
    state.visualCursor = [0, 1];

    // Press l twice to move from pos 1 to pos 3
    const ctx1 = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "abcdef",
      count: 2,
    };
    commands["visual-char"]["l"](ctx1);

    // After moving right twice, cursor should be at position 3
    assert.deepEqual(state.visualCursor, [0, 3]);
    // Should select positions 1, 2, 3 -> range [1, 4)
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].start, [0, 1]);
    assert.deepEqual(calls[0].end, [0, 4]);
  });

  it("d in visual-char deletes all selected characters including cursor", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.mode = "visual-char";
    state.visualAnchor = [0, 1];
    state.visualCursor = [0, 3];

    const ctx = { rep, editorInfo, line: 0, char: 3, lineText: "abcdef" };
    commands["visual-char"]["d"](ctx);

    // Should delete positions 1, 2, 3 -> "bcd"
    assert.equal(state.mode, "normal");
    assert.equal(state.register, "bcd");
  });

  it("V enters visual-line mode", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = { rep, editorInfo, line: 0, char: 2, lineText: "hello" };
    commands.normal["V"](ctx);

    assert.equal(state.mode, "visual-line");
    assert.deepEqual(state.visualAnchor, [0, 0]);
    assert.deepEqual(state.visualCursor, [0, 0]);
  });

  it("y in visual-line yanks lines", () => {
    const rep = makeRep(["line1", "line2", "line3"]);
    const { editorInfo } = makeMockEditorInfo();

    state.mode = "visual-line";
    state.visualAnchor = [0, 0];
    state.visualCursor = [1, 0];

    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "line2",
    };
    commands["visual-line"]["y"](ctx);

    assert.equal(state.mode, "normal");
    assert.equal(state.register.length, 2);
  });

  it("~ toggles case in visual-char", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    state.mode = "visual-char";
    state.visualAnchor = [0, 0];
    state.visualCursor = [0, 5];

    const ctx = { rep, editorInfo, line: 0, char: 5, lineText: "hello world" };
    commands["visual-char"]["~"](ctx);

    assert.equal(state.mode, "normal");
  });
});

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

describe("text objects", () => {
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

  it("diw deletes inner word", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
    };
    commands.normal["diw"](ctx);
  });

  it("daw deletes a word", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
    };
    commands.normal["daw"](ctx);
  });

  it("yiw yanks inner word", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
    };
    commands.normal["yiw"](ctx);

    assert.equal(typeof state.register, "string");
  });

  it("ci( changes inner parentheses", () => {
    const rep = makeRep(["func(arg)"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 5,
      lineText: "func(arg)",
    };
    commands.normal["ci("](ctx);

    assert.equal(state.mode, "insert");
  });

  it("ca[ changes around brackets", () => {
    const rep = makeRep(["array[1]"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 5,
      lineText: "array[1]",
    };
    commands.normal["ca["](ctx);

    assert.equal(state.mode, "insert");
  });

  it('di" deletes inner quotes', () => {
    const rep = makeRep(['text "hello world" here']);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: 'text "hello world" here',
    };
    commands.normal['di"'](ctx);
  });
});

describe("miscellaneous commands", () => {
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

  it("Y yanks line", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
    };
    commands.normal["Y"](ctx);

    assert.deepEqual(state.register, ["hello world"]);
  });

  it("operator with motion works (dh)", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "hello",
    };
    commands.normal["dh"](ctx);

    assert.equal(typeof state.register, "string");
    assert(state.register.length > 0);
  });

  it("yy with count yanks multiple lines", () => {
    const rep = makeRep(["line1", "line2", "line3"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line1",
      count: 2,
    };
    commands.normal["yy"](ctx);

    assert.equal(state.register.length, 2);
    assert.deepEqual(state.register, ["line1", "line2"]);
  });

  it("dd with count deletes multiple lines", () => {
    const rep = makeRep(["line1", "line2", "line3", "line4"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line1",
      count: 2,
    };
    commands.normal["dd"](ctx);

    assert.equal(state.register.length, 2);
    assert.deepEqual(state.register, ["line1", "line2"]);
  });

  it("w motion moves to next word", () => {
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
    commands.normal["w"](ctx);

    // w should move to position 6 (start of "world")
    assert(calls.length > 0, "w should generate a motion call");
    const moveCall = calls[calls.length - 1];
    assert.equal(moveCall.start[1], 6, "w should move to position 6");
  });

  it("dw deletes from cursor to start of next word", () => {
    const rep = makeRep(["hello world more"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world more",
    };
    commands.normal["dw"](ctx);

    // dw should generate replace call(s) for deletion
    const replaceCalls = calls.filter((c) => c.type === "replace");
    assert(replaceCalls.length > 0, "dw should perform deletion");
  });

  it("ye yanks to end of word", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
    };
    commands.normal["ye"](ctx);

    assert.equal(typeof state.register, "string");
  });

  it("cl changes one character", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
    };
    commands.normal["cl"](ctx);

    assert.equal(state.mode, "insert");
  });
});

// ---------------------------------------------------------------------------
// Edge-case tests for vim motions and commands
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
};

describe("edge cases: cc with count", () => {
  beforeEach(resetState);

  it("2cc should delete extra lines and clear remaining line", () => {
    const rep = makeRep(["aaa", "bbb", "ccc"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "aaa",
      count: 2,
    };
    commands.normal["cc"](ctx);

    assert.equal(state.mode, "insert");

    const replaces = calls.filter((c) => c.type === "replace");
    const deletesLine = replaces.some(
      (r) =>
        r.start[0] !== r.end[0] ||
        (r.start[0] === r.end[0] && r.end[1] === 0 && r.start[1] === 0),
    );
    assert.ok(
      deletesLine || replaces.length === 1,
      "2cc should delete extra lines, not just clear text on each line separately",
    );
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

describe("edge cases: dd edge cases", () => {
  beforeEach(resetState);

  it("dd on single-line document leaves empty line", () => {
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
    commands.normal["dd"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.equal(
      replaces[0].newText,
      "",
      "dd on single line should clear content",
    );
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(replaces[0].end, [0, 5]);
  });

  it("3dd with only 2 lines remaining deletes to end", () => {
    const rep = makeRep(["aaa", "bbb"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "aaa",
      count: 3,
    };
    commands.normal["dd"](ctx);

    assert.ok(Array.isArray(state.register), "dd should yank lines as array");
    assert.equal(
      state.register.length,
      2,
      "3dd on 2-line doc should yank both lines",
    );
  });
});

describe("edge cases: J (join) edge cases", () => {
  beforeEach(resetState);

  it("J on last line does nothing", () => {
    const rep = makeRep(["only line"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "only line",
      count: 1,
    };
    commands.normal["J"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.equal(replaces.length, 0, "J on last line should not join");
  });

  it("J trims leading whitespace from joined line", () => {
    const rep = makeRep(["hello", "   world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["J"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.equal(
      replaces[0].newText,
      " world",
      "J should trim leading whitespace and add single space",
    );
  });
});

describe("edge cases: count handling", () => {
  beforeEach(resetState);

  it("count 0 after digits is part of count (e.g., 10j)", () => {
    const rep = makeRep(Array.from({ length: 20 }, (_, i) => `line${i}`));
    const { editorInfo, calls } = makeMockEditorInfo();

    const baseCtx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "line0",
    };

    handleKey("1", baseCtx);
    handleKey("0", baseCtx);
    handleKey("j", baseCtx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    assert.equal(
      selects[selects.length - 1].start[0],
      10,
      "10j should go to line 10",
    );
  });

  it("0 without prior digits is motion to column 0", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 5,
      lineText: "hello world",
    };

    handleKey("0", ctx);

    const selects = calls.filter((c) => c.type === "select");
    assert.ok(selects.length > 0);
    assert.deepEqual(selects[0].start, [0, 0]);
  });
});

describe("edge cases: dw at end of line", () => {
  beforeEach(resetState);

  it("dw at last word deletes to end of line", () => {
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
    commands.normal["dw"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    const deleted = ctx.lineText.slice(
      replaces[0].start[1],
      replaces[0].end[1],
    );
    assert.equal(
      deleted,
      "world",
      "dw at last word should delete to end of line",
    );
  });
});

describe("edge cases: d$ and D", () => {
  beforeEach(resetState);

  it("d$ at last char deletes that character", () => {
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
    commands.normal["d$"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 2]);
    assert.deepEqual(
      replaces[0].end,
      [0, 3],
      "d$ at last char should delete it (inclusive)",
    );
  });

  it("D at column 0 deletes entire line content", () => {
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
    commands.normal["D"](ctx);

    assert.equal(state.register, "hello");
    const replaces = calls.filter((c) => c.type === "replace");
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(replaces[0].end, [0, 5]);
  });
});

describe("edge cases: p (paste) edge cases", () => {
  beforeEach(resetState);

  it("p on empty line pastes at position 0 (not 1)", () => {
    const rep = makeRep([""]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = "text";

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "",
      count: 1,
    };
    commands.normal["p"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.equal(
      replaces[0].start[1],
      0,
      "p on empty line should paste at 0, not 1",
    );
  });

  it("P with nothing in register does nothing", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = null;

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["P"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.equal(replaces.length, 0);
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

describe("edge cases: visual mode text objects", () => {
  beforeEach(resetState);

  it("viw in visual mode selects inner word", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    state.mode = "visual-char";
    state.visualAnchor = [0, 3];
    state.visualCursor = [0, 3];

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 3,
      lineText: "hello world",
      count: 1,
    };

    handleKey("i", ctx);
    handleKey("w", ctx);

    assert.deepEqual(
      state.visualAnchor,
      [0, 0],
      "viw anchor should be word start",
    );
    assert.deepEqual(
      state.visualCursor,
      [0, 5],
      "viw cursor should be word end",
    );
  });
});

describe("edge cases: de vs dw", () => {
  beforeEach(resetState);

  it("de deletes to end of current word (inclusive)", () => {
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
    commands.normal["de"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(
      replaces[0].end,
      [0, 5],
      "de should delete 'hello' (inclusive of last char)",
    );
  });

  it("dw at start of word deletes word and trailing space", () => {
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
    commands.normal["dw"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(
      replaces[0].end,
      [0, 6],
      "dw should delete 'hello ' (word + trailing space)",
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

describe("edge cases: s with count", () => {
  beforeEach(resetState);

  it("3s at position 1 deletes 3 chars and enters insert", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "abcdef",
      count: 3,
    };
    commands.normal["s"](ctx);

    assert.equal(state.mode, "insert");
    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 1]);
    assert.deepEqual(replaces[0].end, [0, 4], "3s should delete 3 chars");
  });

  it("s with count exceeding line length clamps", () => {
    const rep = makeRep(["ab"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "ab",
      count: 10,
    };
    commands.normal["s"](ctx);

    assert.equal(state.mode, "insert");
    const replaces = calls.filter((c) => c.type === "replace");
    assert.deepEqual(
      replaces[0].end,
      [0, 2],
      "s with large count should clamp to line length",
    );
  });
});

describe("edge cases: x at end of line", () => {
  beforeEach(resetState);

  it("x at last character should delete it", () => {
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
    commands.normal["x"](ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.equal(state.register, "c");
  });

  it("3x with only 2 chars remaining deletes what's available", () => {
    const rep = makeRep(["abcd"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "abcd",
      count: 3,
    };
    commands.normal["x"](ctx);

    assert.equal(state.register, "cd", "3x with 2 remaining should delete 2");
  });
});

describe("edge cases: df and dt (operator + char motion)", () => {
  beforeEach(resetState);

  it("df deletes up to and including target char", () => {
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
    parameterized["df"]("o", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(
      replaces[0].end,
      [0, 5],
      "df o should delete 'hello' (inclusive of 'o' at position 4)",
    );
  });

  it("dt deletes up to but not including target char", () => {
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
    parameterized["dt"]("o", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(replaces[0].start, [0, 0]);
    assert.deepEqual(
      replaces[0].end,
      [0, 4],
      "dt o should delete 'hell' (up to but not including 'o')",
    );
  });

  it("dF deletes backward including target", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: "hello world",
      count: 1,
    };
    parameterized["dF"]("o", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(
      replaces[0].start,
      [0, 4],
      "dF o from pos 7 should start at 'o' (pos 4)",
    );
    assert.deepEqual(
      replaces[0].end,
      [0, 8],
      "dF o from pos 7 should delete up to and including cursor pos",
    );
  });

  it("dT deletes backward not including target", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 7,
      lineText: "hello world",
      count: 1,
    };
    parameterized["dT"]("o", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.deepEqual(
      replaces[0].start,
      [0, 5],
      "dT o from pos 7 should start after 'o' (pos 5)",
    );
    assert.deepEqual(
      replaces[0].end,
      [0, 7],
      "dT o from pos 7 should end before cursor",
    );
  });
});

// --- Register bugs ---

describe("register bug: s ignores count", () => {
  beforeEach(resetState);

  it("s with count=3 saves 3 chars to register", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "abcdef",
      count: 3,
    };
    commands.normal["s"](ctx);

    assert.equal(state.register, "bcd", "3s should save 3 chars, not 1");
  });

  it("s with count=1 saves 1 char to register", () => {
    const rep = makeRep(["abcdef"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "abcdef",
      count: 1,
    };
    commands.normal["s"](ctx);

    assert.equal(state.register, "c");
  });

  it("s with count exceeding line saves up to end of line", () => {
    const rep = makeRep(["abc"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "abc",
      count: 10,
    };
    commands.normal["s"](ctx);

    assert.equal(
      state.register,
      "bc",
      "s with large count should save remaining chars",
    );
  });
});

describe("register bug: S uses char-wise register instead of line-wise", () => {
  beforeEach(resetState);

  it("S saves register as array (line-wise)", () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
    };
    commands.normal["S"](ctx);

    assert.ok(
      Array.isArray(state.register),
      "S should store register as array (line-wise), not string",
    );
    assert.deepEqual(state.register, ["hello world"]);
  });

  it("S register is line-wise so p pastes on new line", () => {
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
    commands.normal["S"](ctx);

    assert.ok(
      Array.isArray(state.register),
      "register should be line-wise after S",
    );

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0);
    assert.equal(replaces[0].newText, "", "S should clear the line");
  });
});

describe("register bug: p cursor at start of paste instead of end", () => {
  beforeEach(resetState);

  it("p char-wise: cursor lands at last char of pasted text", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = "abc";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["p"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [0, 3],
      "cursor after p should be at last char of pasted text (insertPos + length - 1 = 1+3-1 = 3)",
    );
  });

  it("p char-wise with count: cursor lands at last char of all pasted text", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = "ab";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 3,
    };
    commands.normal["p"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [0, 6],
      "cursor after 3p 'ab': insertPos=1, repeated='ababab' length=6, cursor=1+6-1=6",
    );
  });
});

describe("register bug: P cursor at start of paste instead of end", () => {
  beforeEach(resetState);

  it("P char-wise: cursor lands at last char of pasted text", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = "abc";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 2,
      lineText: "hello",
      count: 1,
    };
    commands.normal["P"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [0, 4],
      "cursor after P should be at last char of pasted text (char + length - 1 = 2+3-1 = 4)",
    );
  });

  it("P char-wise with count: cursor lands at last char of all pasted text", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = "ab";
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 1,
      lineText: "hello",
      count: 2,
    };
    commands.normal["P"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [0, 4],
      "cursor after 2P 'ab' should be at char + 4 - 1 = 1+4-1 = 4",
    );
  });
});

describe("register bug: line-wise p cursor at col 0 instead of first non-blank", () => {
  beforeEach(resetState);

  it("p line-wise: cursor lands on first non-blank of pasted line", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = ["  indented"];
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["p"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [1, 2],
      "p line-wise cursor should be at first non-blank (col 2) of pasted line",
    );
  });

  it("p line-wise with unindented content: cursor at col 0", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = ["noindent"];
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["p"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(lastSelect.start, [1, 0]);
  });
});

describe("register bug: line-wise P cursor at col 0 instead of first non-blank", () => {
  beforeEach(resetState);

  it("P line-wise: cursor lands on first non-blank of pasted line", () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo, calls } = makeMockEditorInfo();

    state.register = ["  indented"];
    const ctx = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "world",
      count: 1,
    };
    commands.normal["P"](ctx);

    const selects = calls.filter((c) => c.type === "select");
    const lastSelect = selects[selects.length - 1];
    assert.deepEqual(
      lastSelect.start,
      [1, 2],
      "P line-wise cursor should be at first non-blank (col 2) of pasted line",
    );
  });
});

describe("register bug: Y missing recordCommand", () => {
  beforeEach(resetState);

  it("Y sets lastCommand so dot can repeat it", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["Y"](ctx);

    assert.notEqual(
      state.lastCommand,
      null,
      "Y should record command for dot-repeat",
    );
    assert.equal(state.lastCommand.key, "Y");
  });

  it("Y does not corrupt lastCommand of a prior operation", () => {
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();

    state.lastCommand = { key: "dd", count: 1, param: null };
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
    };
    commands.normal["Y"](ctx);

    assert.equal(
      state.lastCommand.key,
      "Y",
      "Y should overwrite lastCommand with its own entry",
    );
  });
});

describe("missing feature: named registers", () => {
  beforeEach(resetState);

  it('"ayy yanks into named register a', () => {
    // In vim, "a followed by yy copies the line into register 'a'.
    // This requires parsing the " prefix in handleKey and routing
    // setRegister calls to the named register slot.
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    // Simulate: " -> a -> yy
    handleKey('"', ctx);
    handleKey("a", ctx);
    handleKey("y", ctx);
    handleKey("y", ctx);

    assert.ok(
      state.namedRegisters && state.namedRegisters["a"],
      "register a should be set",
    );
    assert.deepEqual(state.namedRegisters["a"], ["hello"]);
  });

  it('"ap pastes from named register a', () => {
    state.namedRegisters = { a: ["yanked line"] };
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    // Simulate: " -> a -> p
    handleKey('"', ctx);
    handleKey("a", ctx);
    handleKey("p", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.ok(replaces.length > 0, "should paste from named register");
  });

  it('"add deletes line into named register a', () => {
    const rep = makeRep(["hello", "world"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    handleKey('"', ctx);
    handleKey("a", ctx);
    handleKey("d", ctx);
    handleKey("d", ctx);

    assert.ok(
      state.namedRegisters && state.namedRegisters["a"],
      "register a should be set after delete",
    );
    assert.deepEqual(state.namedRegisters["a"], ["hello"]);
    assert.equal(state.register, null, "anonymous register should not be set");
  });

  it('"ayw yanks word into named register a', () => {
    const rep = makeRep(["hello world"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
      hasCount: false,
    };

    handleKey('"', ctx);
    handleKey("a", ctx);
    handleKey("y", ctx);
    handleKey("w", ctx);

    assert.deepEqual(state.namedRegisters["a"], "hello ");
  });

  it("named registers are independent", () => {
    const rep = makeRep(["first", "second"]);
    const { editorInfo } = makeMockEditorInfo();

    const ctx0 = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "first",
      count: 1,
      hasCount: false,
    };
    handleKey('"', ctx0);
    handleKey("a", ctx0);
    handleKey("y", ctx0);
    handleKey("y", ctx0);

    const ctx1 = {
      rep,
      editorInfo,
      line: 1,
      char: 0,
      lineText: "second",
      count: 1,
      hasCount: false,
    };
    handleKey('"', ctx1);
    handleKey("b", ctx1);
    handleKey("y", ctx1);
    handleKey("y", ctx1);

    assert.deepEqual(state.namedRegisters["a"], ["first"]);
    assert.deepEqual(state.namedRegisters["b"], ["second"]);
  });

  it('"_yy yank to blackhole does not affect anonymous register', () => {
    state.register = "preserved";
    const rep = makeRep(["hello"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    handleKey('"', ctx);
    handleKey("_", ctx);
    handleKey("y", ctx);
    handleKey("y", ctx);

    assert.equal(state.register, "preserved", "anonymous register unchanged");
  });

  it('"_p pastes nothing from blackhole register', () => {
    state.register = "fallback";
    const rep = makeRep(["hello"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    handleKey('"', ctx);
    handleKey("_", ctx);
    handleKey("p", ctx);

    const replaces = calls.filter((c) => c.type === "replace");
    assert.equal(replaces.length, 0, "blackhole p should paste nothing");
  });

  it('"_dd deletes to blackhole register without overwriting anonymous', () => {
    state.register = "preserved";
    const rep = makeRep(["hello", "world"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello",
      count: 1,
      hasCount: false,
    };

    // Simulate: " -> _ -> dd
    handleKey('"', ctx);
    handleKey("_", ctx);
    handleKey("d", ctx);
    handleKey("d", ctx);

    assert.equal(
      state.register,
      "preserved",
      "blackhole register should not overwrite anonymous register",
    );
  });
});
