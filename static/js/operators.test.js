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
