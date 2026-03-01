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

describe("missing feature: zz center screen", () => {
  beforeEach(resetState);

  it("zz does nothing when editorDoc is null", () => {
    state.editorDoc = null;
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

    assert.doesNotThrow(() => commands.normal["zz"](ctx));
  });
});

describe("zt and zb scroll commands", () => {
  beforeEach(resetState);

  it("zt does nothing when editorDoc is null", () => {
    state.editorDoc = null;
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
    assert.doesNotThrow(() => commands.normal["zt"](ctx));
  });

  it("zb does nothing when editorDoc is null", () => {
    state.editorDoc = null;
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
    assert.doesNotThrow(() => commands.normal["zb"](ctx));
  });

  it("zt calls scrollIntoView with block: start", () => {
    const scrollCalls = [];
    const mockLineDiv = {
      scrollIntoView: (opts) => scrollCalls.push(opts),
    };
    state.editorDoc = {
      body: {
        querySelectorAll: () => [mockLineDiv],
      },
    };
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
    commands.normal["zt"](ctx);
    assert.equal(scrollCalls.length, 1);
    assert.deepEqual(scrollCalls[0], { block: "start" });
  });

  it("zb calls scrollIntoView with block: end", () => {
    const scrollCalls = [];
    const mockLineDiv = {
      scrollIntoView: (opts) => scrollCalls.push(opts),
    };
    state.editorDoc = {
      body: {
        querySelectorAll: () => [mockLineDiv],
      },
    };
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
    commands.normal["zb"](ctx);
    assert.equal(scrollCalls.length, 1);
    assert.deepEqual(scrollCalls[0], { block: "end" });
  });
});

describe("Ctrl+f and Ctrl+b page scroll", () => {
  beforeEach(() => {
    resetState();
    setVimEnabled(true);
    setUseCtrlKeys(true);
  });

  const makeCtrlEvt = (key) => ({
    type: "keydown",
    key,
    ctrlKey: true,
    metaKey: false,
    target: { ownerDocument: null },
    preventDefault: () => {},
  });

  it("Ctrl+f moves forward one full page", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
    const rep = makeRep(lines);
    rep.selStart = [0, 0];
    const { editorInfo, calls } = makeMockEditorInfo();
    aceKeyEvent("aceKeyEvent", {
      evt: makeCtrlEvt("f"),
      rep,
      editorInfo,
    });
    const selectCall = calls.find((c) => c.type === "select");
    assert.ok(selectCall, "expected a select call");
    assert.equal(selectCall.start[0], 30);
  });

  it("Ctrl+b moves backward one full page", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
    const rep = makeRep(lines);
    rep.selStart = [40, 0];
    state.mode = "normal";
    const { editorInfo, calls } = makeMockEditorInfo();
    aceKeyEvent("aceKeyEvent", {
      evt: makeCtrlEvt("b"),
      rep,
      editorInfo,
    });
    const selectCall = calls.find((c) => c.type === "select");
    assert.ok(selectCall, "expected a select call");
    assert.equal(selectCall.start[0], 10);
  });

  it("Ctrl+f clamps at end of document", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const rep = makeRep(lines);
    rep.selStart = [5, 0];
    const { editorInfo, calls } = makeMockEditorInfo();
    aceKeyEvent("aceKeyEvent", {
      evt: makeCtrlEvt("f"),
      rep,
      editorInfo,
    });
    const selectCall = calls.find((c) => c.type === "select");
    assert.ok(selectCall, "expected a select call");
    assert.equal(selectCall.start[0], 9);
  });

  it("Ctrl+b clamps at start of document", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`);
    const rep = makeRep(lines);
    rep.selStart = [3, 0];
    const { editorInfo, calls } = makeMockEditorInfo();
    aceKeyEvent("aceKeyEvent", {
      evt: makeCtrlEvt("b"),
      rep,
      editorInfo,
    });
    const selectCall = calls.find((c) => c.type === "select");
    assert.ok(selectCall, "expected a select call");
    assert.equal(selectCall.start[0], 0);
  });
});
