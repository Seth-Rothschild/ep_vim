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
    assert.deepEqual(state.visualAnchor, [0, 2]);
    assert.deepEqual(state.visualCursor, [0, 2]);
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

describe("gv reselect last visual", () => {
  beforeEach(resetState);

  it("does nothing when lastVisualSelection is null", () => {
    state.lastVisualSelection = null;
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
      hasCount: false,
    };
    commands.normal["gv"](ctx);
    assert.equal(calls.length, 0);
    assert.equal(state.mode, "normal");
  });

  it("restores visual-char selection", () => {
    state.lastVisualSelection = {
      anchor: [0, 2],
      cursor: [0, 5],
      mode: "visual-char",
    };
    const rep = makeRep(["hello world"]);
    const { editorInfo, calls } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "hello world",
      count: 1,
      hasCount: false,
    };
    commands.normal["gv"](ctx);
    assert.equal(state.mode, "visual-char");
    assert.deepEqual(state.visualAnchor, [0, 2]);
    assert.deepEqual(state.visualCursor, [0, 5]);
    assert.ok(calls.length > 0, "expected a selection call");
  });

  it("restores visual-line selection", () => {
    state.lastVisualSelection = {
      anchor: [1, 0],
      cursor: [2, 0],
      mode: "visual-line",
    };
    const rep = makeRep(["aaa", "bbb", "ccc"]);
    const { editorInfo } = makeMockEditorInfo();
    const ctx = {
      rep,
      editorInfo,
      line: 0,
      char: 0,
      lineText: "aaa",
      count: 1,
      hasCount: false,
    };
    commands.normal["gv"](ctx);
    assert.equal(state.mode, "visual-line");
    assert.deepEqual(state.visualAnchor, [1, 0]);
    assert.deepEqual(state.visualCursor, [2, 0]);
  });

  it("escape from visual-char saves lastVisualSelection", () => {
    state.mode = "visual-char";
    state.visualAnchor = [0, 1];
    state.visualCursor = [0, 4];
    state.editorDoc = null;
    const rep = makeRep(["hello world"]);
    rep.selStart = [0, 4];
    const { editorInfo } = makeMockEditorInfo();
    const mockEvt = {
      type: "keydown",
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      target: { ownerDocument: null },
      preventDefault: () => {},
    };
    setVimEnabled(true);
    aceKeyEvent("aceKeyEvent", { evt: mockEvt, rep, editorInfo });
    setVimEnabled(false);
    assert.deepEqual(state.lastVisualSelection, {
      anchor: [0, 1],
      cursor: [0, 4],
      mode: "visual-char",
    });
  });

  it("escape from visual-line saves lastVisualSelection", () => {
    state.mode = "visual-line";
    state.visualAnchor = [0, 0];
    state.visualCursor = [2, 0];
    state.editorDoc = null;
    const rep = makeRep(["aaa", "bbb", "ccc"]);
    rep.selStart = [2, 0];
    const { editorInfo } = makeMockEditorInfo();
    const mockEvt = {
      type: "keydown",
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      target: { ownerDocument: null },
      preventDefault: () => {},
    };
    setVimEnabled(true);
    aceKeyEvent("aceKeyEvent", { evt: mockEvt, rep, editorInfo });
    setVimEnabled(false);
    assert.deepEqual(state.lastVisualSelection, {
      anchor: [0, 0],
      cursor: [2, 0],
      mode: "visual-line",
    });
  });
});
