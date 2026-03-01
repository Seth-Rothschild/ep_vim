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
