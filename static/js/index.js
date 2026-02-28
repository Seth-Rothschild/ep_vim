"use strict";

const {
  clampLine,
  clampChar,
  getLineText,
  firstNonBlank,
  wordForward,
  wordBackward,
  wordEnd,
  charSearchPos,
  charMotionRange,
  paragraphForward,
  paragraphBackward,
  matchingBracketPos,
  textWordRange,
  textQuoteRange,
  textBracketRange,
  getTextInRange,
  getVisualSelection,
  paragraphTextRange,
  sentenceTextRange,
  searchForward,
  searchBackward,
} = require("./vim-core");

// --- State ---

let vimEnabled =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("ep_vimEnabled") === "true";

let useSystemClipboard = true;
let useCtrlKeys = true;

const state = {
  mode: "normal",
  pendingKey: null,
  pendingCount: null,
  countBuffer: "",
  register: null,
  namedRegisters: {},
  pendingRegister: null,
  awaitingRegister: false,
  marks: {},
  lastCharSearch: null,
  visualAnchor: null,
  visualCursor: null,
  editorDoc: null,
  currentRep: null,
  desiredColumn: null,
  lastCommand: null,
  searchMode: false,
  searchBuffer: "",
  searchDirection: null,
  lastSearch: null,
  lastVisualSelection: null,
};

// --- Editor operations ---

const setRegister = (value) => {
  if (state.pendingRegister === "_") {
    return;
  }
  if (state.pendingRegister && /^[a-zA-Z]$/.test(state.pendingRegister)) {
    const name = state.pendingRegister.toLowerCase();
    state.namedRegisters[name] = value;
    return;
  }
  state.register = value;
  const text = Array.isArray(value) ? value.join("\n") + "\n" : value;
  if (useSystemClipboard && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
};

const getActiveRegister = () => {
  if (state.pendingRegister === "_") {
    return null;
  }
  if (state.pendingRegister && /^[a-zA-Z]$/.test(state.pendingRegister)) {
    const name = state.pendingRegister.toLowerCase();
    return state.namedRegisters[name] !== undefined
      ? state.namedRegisters[name]
      : null;
  }
  return state.register;
};

const moveCursor = (editorInfo, line, char) => {
  const pos = [line, char];
  editorInfo.ace_inCallStackIfNecessary("vim-move", () => {
    editorInfo.ace_performSelectionChange(pos, pos, false);
    editorInfo.ace_updateBrowserSelectionFromRep();
  });
};

const replaceRange = (editorInfo, start, end, text) => {
  editorInfo.ace_inCallStackIfNecessary("vim-edit", () => {
    editorInfo.ace_performDocumentReplaceRange(start, end, text);
  });
};

const selectRange = (editorInfo, start, end) => {
  editorInfo.ace_inCallStackIfNecessary("vim-select", () => {
    editorInfo.ace_performSelectionChange(start, end, false);
    editorInfo.ace_updateBrowserSelectionFromRep();
  });
};

const updateVisualSelection = (editorInfo, rep) => {
  const vMode = state.mode === "visual-line" ? "line" : "char";
  const [start, end] = getVisualSelection(
    vMode,
    state.visualAnchor,
    state.visualCursor,
    rep,
  );
  if (vMode === "char") {
    selectRange(editorInfo, start, [end[0], end[1] + 1]);
  } else {
    selectRange(editorInfo, start, end);
  }
};

const clearEmptyLineCursor = () => {
  if (!state.editorDoc) return;
  const old = state.editorDoc.querySelector(".vim-empty-line-cursor");
  if (old) old.classList.remove("vim-empty-line-cursor");
};

const scrollLineIntoView = (line) => {
  if (!state.editorDoc) return;
  const lineDiv = state.editorDoc.body.querySelectorAll("div")[line];
  if (lineDiv) lineDiv.scrollIntoView({ block: "nearest" });
};

const moveBlockCursor = (editorInfo, line, char) => {
  clearEmptyLineCursor();
  const lineText = state.currentRep ? getLineText(state.currentRep, line) : "";
  if (lineText.length === 0 && state.editorDoc) {
    const lineDiv = state.editorDoc.body.querySelectorAll("div")[line];
    if (lineDiv) lineDiv.classList.add("vim-empty-line-cursor");
    selectRange(editorInfo, [line, 0], [line, 0]);
  } else {
    selectRange(editorInfo, [line, char], [line, char + 1]);
  }
  scrollLineIntoView(line);
};

const moveVisualCursor = (editorInfo, rep, line, char) => {
  state.visualCursor = [line, char];
  updateVisualSelection(editorInfo, rep);
  scrollLineIntoView(line);
};

// --- Line helpers ---

const deleteLines = (editorInfo, rep, topLine, bottomLine) => {
  const totalLines = rep.lines.length();
  if (bottomLine === totalLines - 1 && topLine > 0) {
    const prevLineLen = getLineText(rep, topLine - 1).length;
    replaceRange(
      editorInfo,
      [topLine - 1, prevLineLen],
      [bottomLine, getLineText(rep, bottomLine).length],
      "",
    );
    return topLine - 1;
  }
  if (bottomLine < totalLines - 1) {
    replaceRange(editorInfo, [topLine, 0], [bottomLine + 1, 0], "");
    return topLine;
  }
  replaceRange(
    editorInfo,
    [0, 0],
    [bottomLine, getLineText(rep, bottomLine).length],
    "",
  );
  return 0;
};

const applyLineOperator = (op, topLine, bottomLine, ctx) => {
  const { editorInfo, rep, char } = ctx;
  const lines = [];
  for (let i = topLine; i <= bottomLine; i++) lines.push(getLineText(rep, i));
  setRegister(lines);
  if (op === "y") {
    moveBlockCursor(editorInfo, topLine, 0);
    return;
  }
  if (op === "c") {
    if (bottomLine > topLine) {
      deleteLines(editorInfo, rep, topLine + 1, bottomLine);
    }
    const text = getLineText(rep, topLine);
    replaceRange(editorInfo, [topLine, 0], [topLine, text.length], "");
    moveCursor(editorInfo, topLine, 0);
    state.mode = "insert";
    return;
  }
  const cursorLine = deleteLines(editorInfo, rep, topLine, bottomLine);
  const newLineText = getLineText(rep, cursorLine);
  moveBlockCursor(editorInfo, cursorLine, clampChar(char, newLineText));
};

// --- Operator helper ---

const applyOperator = (op, start, end, ctx) => {
  const { editorInfo, rep } = ctx;
  const before =
    start[0] < end[0] || (start[0] === end[0] && start[1] <= end[1]);
  const [s, e] = before ? [start, end] : [end, start];
  setRegister(getTextInRange(rep, s, e));
  if (op === "y") {
    moveBlockCursor(editorInfo, s[0], s[1]);
    return;
  }
  replaceRange(editorInfo, s, e, "");
  if (op === "c") {
    moveCursor(editorInfo, s[0], s[1]);
    state.mode = "insert";
  } else {
    moveBlockCursor(editorInfo, s[0], s[1]);
  }
};

// --- Command tables ---
const commands = {
  normal: {},
  "visual-char": {},
  "visual-line": {},
};

// --- Registration helpers ---
const OPERATORS = ["d", "c", "y"];

const resolveTextObject = (key, type, line, lineText, char, rep) => {
  if (key === "p") {
    return paragraphTextRange(rep, line, type);
  }
  if (key === "s") {
    const r = sentenceTextRange(lineText, char, type);
    if (!r) return null;
    return {
      startLine: line,
      startChar: r.start,
      endLine: line,
      endChar: r.end,
    };
  }
  const r =
    key === "w"
      ? textWordRange(lineText, char, type)
      : ["(", ")", "{", "}", "[", "]"].includes(key)
        ? textBracketRange(lineText, char, key, type)
        : ['"', "'", "`"].includes(key)
          ? textQuoteRange(lineText, char, key, type)
          : null;
  if (!r) return null;
  return { startLine: line, startChar: r.start, endLine: line, endChar: r.end };
};

const recordCommand = (key, count, param = null) => {
  state.lastCommand = { key, count, param };
};

const registerMotion = (
  key,
  getEndPos,
  inclusive = false,
  keepDesiredColumn = false,
) => {
  commands.normal[key] = (ctx) => {
    if (!keepDesiredColumn) state.desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) {
      const lineText = getLineText(ctx.rep, pos.line);
      moveBlockCursor(ctx.editorInfo, pos.line, clampChar(pos.char, lineText));
    }
  };
  commands["visual-char"][key] = (ctx) => {
    if (!keepDesiredColumn) state.desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) moveVisualCursor(ctx.editorInfo, ctx.rep, pos.line, pos.char);
  };
  commands["visual-line"][key] = (ctx) => {
    if (!keepDesiredColumn) state.desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) moveVisualCursor(ctx.editorInfo, ctx.rep, pos.line, pos.char);
  };
  for (const op of OPERATORS) {
    commands.normal[op + key] = (ctx) => {
      state.desiredColumn = null;
      const pos = getEndPos(ctx);
      if (pos) {
        const endChar = inclusive ? pos.char + 1 : pos.char;
        applyOperator(op, [ctx.line, ctx.char], [pos.line, endChar], ctx);
        recordCommand(op + key, ctx.count);
      }
    };
  }
};

const parameterized = {};

const registerParamMotion = (key, getEndChar) => {
  commands.normal[key] = () => {
    state.pendingKey = key;
  };
  commands["visual-char"][key] = () => {
    state.pendingKey = key;
  };
  commands["visual-line"][key] = () => {
    state.pendingKey = key;
  };
  parameterized[key] = (argKey, ctx) => {
    state.lastCharSearch = { direction: key, target: argKey };
    const pos = getEndChar(argKey, ctx);
    if (pos !== null) {
      if (state.mode.startsWith("visual")) {
        moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
      } else {
        moveBlockCursor(ctx.editorInfo, ctx.line, pos);
      }
      recordCommand(key, ctx.count, argKey);
    }
  };
  for (const op of OPERATORS) {
    const combo = op + key;
    commands.normal[combo] = () => {
      state.pendingKey = combo;
    };
    parameterized[combo] = (argKey, ctx) => {
      state.lastCharSearch = { direction: key, target: argKey };
      const pos = getEndChar(argKey, ctx);
      if (pos !== null) {
        const range = charMotionRange(key, ctx.char, pos);
        if (range)
          applyOperator(
            op,
            [ctx.line, range.start],
            [ctx.line, range.end],
            ctx,
          );
        recordCommand(combo, ctx.count, argKey);
      }
    };
  }
};

const registerTextObject = (obj, getRange) => {
  for (const op of OPERATORS) {
    for (const type of ["i", "a"]) {
      commands.normal[`${op}${type}${obj}`] = (ctx) => {
        const range = getRange(ctx, type);
        if (range) applyOperator(op, range.start, range.end, ctx);
      };
    }
  }
};

const getVisibleLineRange = (rep) => {
  const totalLines = rep.lines.length();
  if (!state.editorDoc) {
    const mid = Math.floor((totalLines - 1) / 2);
    return { top: 0, mid, bottom: totalLines - 1 };
  }
  const lineDivs = state.editorDoc.body.querySelectorAll("div");
  const lineCount = Math.min(lineDivs.length, totalLines);
  const frameEl = state.editorDoc.defaultView.frameElement;
  const iframeTop = frameEl ? frameEl.getBoundingClientRect().top : 0;
  const outerViewportHeight = window.parent ? window.parent.innerHeight : 600;
  let top = 0;
  let bottom = lineCount - 1;
  for (let i = 0; i < lineCount; i++) {
    const rect = lineDivs[i].getBoundingClientRect();
    if (iframeTop + rect.bottom > 0) {
      top = i;
      break;
    }
  }
  for (let i = lineCount - 1; i >= 0; i--) {
    const rect = lineDivs[i].getBoundingClientRect();
    if (iframeTop + rect.top < outerViewportHeight) {
      bottom = i;
      break;
    }
  }
  const visibleTop = iframeTop + lineDivs[top].getBoundingClientRect().top;
  const visibleBottom =
    iframeTop + lineDivs[bottom].getBoundingClientRect().bottom;
  const pixelMidpoint = (visibleTop + visibleBottom) / 2;
  let mid = top;
  for (let i = top; i <= bottom; i++) {
    const rect = lineDivs[i].getBoundingClientRect();
    if (iframeTop + (rect.top + rect.bottom) / 2 >= pixelMidpoint) {
      mid = i;
      break;
    }
  }
  return { top, mid, bottom };
};

// --- Motions ---
registerMotion("h", (ctx) => ({
  line: ctx.line,
  char: Math.max(0, ctx.char - ctx.count),
}));

registerMotion("l", (ctx) => ({
  line: ctx.line,
  char: clampChar(ctx.char + ctx.count, ctx.lineText),
}));

registerMotion(
  "j",
  (ctx) => {
    if (state.desiredColumn === null) state.desiredColumn = ctx.char;
    const newLine = clampLine(ctx.line + ctx.count, ctx.rep);
    const newLineText = getLineText(ctx.rep, newLine);
    return {
      line: newLine,
      char: clampChar(state.desiredColumn, newLineText),
    };
  },
  false,
  true,
);

registerMotion(
  "k",
  (ctx) => {
    if (state.desiredColumn === null) state.desiredColumn = ctx.char;
    const newLine = clampLine(ctx.line - ctx.count, ctx.rep);
    const newLineText = getLineText(ctx.rep, newLine);
    return {
      line: newLine,
      char: clampChar(state.desiredColumn, newLineText),
    };
  },
  false,
  true,
);

registerMotion("w", (ctx) => {
  let pos = ctx.char;
  for (let i = 0; i < ctx.count; i++) pos = wordForward(ctx.lineText, pos);
  return { line: ctx.line, char: pos };
});

registerMotion("b", (ctx) => {
  let pos = ctx.char;
  for (let i = 0; i < ctx.count; i++) pos = wordBackward(ctx.lineText, pos);
  return { line: ctx.line, char: pos };
});

registerMotion(
  "e",
  (ctx) => {
    let pos = ctx.char;
    for (let i = 0; i < ctx.count; i++) pos = wordEnd(ctx.lineText, pos);
    return { line: ctx.line, char: clampChar(pos, ctx.lineText) };
  },
  true,
);

registerMotion("0", (_ctx) => ({ line: _ctx.line, char: 0 }));

registerMotion(
  "$",
  (ctx) => ({
    line: ctx.line,
    char: clampChar(ctx.lineText.length - 1, ctx.lineText),
  }),
  true,
);

registerMotion("^", (ctx) => ({
  line: ctx.line,
  char: firstNonBlank(ctx.lineText),
}));

registerMotion("gg", (ctx) => ({
  line: ctx.hasCount ? clampLine(ctx.count - 1, ctx.rep) : 0,
  char: 0,
}));

registerMotion("G", (ctx) => ({
  line: ctx.hasCount
    ? clampLine(ctx.count - 1, ctx.rep)
    : ctx.rep.lines.length() - 1,
  char: 0,
}));

registerMotion("{", (ctx) => ({
  line: paragraphBackward(ctx.rep, ctx.line, ctx.count),
  char: 0,
}));

registerMotion("}", (ctx) => ({
  line: paragraphForward(ctx.rep, ctx.line, ctx.count),
  char: 0,
}));

registerMotion(
  "%",
  (ctx) => {
    const pos = matchingBracketPos(ctx.rep, ctx.line, ctx.char);
    return pos || { line: ctx.line, char: ctx.char };
  },
  true,
);

registerMotion("H", (ctx) => {
  const { top } = getVisibleLineRange(ctx.rep);
  const targetLine = clampLine(top + ctx.count - 1, ctx.rep);
  return {
    line: targetLine,
    char: firstNonBlank(getLineText(ctx.rep, targetLine)),
  };
});

registerMotion("M", (ctx) => {
  const { mid } = getVisibleLineRange(ctx.rep);
  return {
    line: mid,
    char: firstNonBlank(getLineText(ctx.rep, mid)),
  };
});

registerMotion("L", (ctx) => {
  const { bottom } = getVisibleLineRange(ctx.rep);
  const targetLine = clampLine(bottom - ctx.count + 1, ctx.rep);
  return {
    line: targetLine,
    char: firstNonBlank(getLineText(ctx.rep, targetLine)),
  };
});

// --- Char search motions ---

registerParamMotion("f", (key, ctx) => {
  const pos = charSearchPos("f", ctx.lineText, ctx.char, key, ctx.count);
  return pos !== -1 ? pos : null;
});

registerParamMotion("F", (key, ctx) => {
  const pos = charSearchPos("F", ctx.lineText, ctx.char, key, ctx.count);
  return pos !== -1 ? pos : null;
});

registerParamMotion("t", (key, ctx) => {
  const pos = charSearchPos("t", ctx.lineText, ctx.char, key, ctx.count);
  return pos !== -1 ? pos : null;
});

registerParamMotion("T", (key, ctx) => {
  const pos = charSearchPos("T", ctx.lineText, ctx.char, key, ctx.count);
  return pos !== -1 ? pos : null;
});

const registerCharRepeat = (key, getDirection) => {
  const handler = (ctx) => {
    if (!state.lastCharSearch) return;
    const dir = getDirection(state.lastCharSearch.direction);
    const pos = charSearchPos(
      dir,
      ctx.lineText,
      ctx.char,
      state.lastCharSearch.target,
      ctx.count,
    );
    if (pos === -1) return;
    if (state.mode.startsWith("visual")) {
      moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
    } else {
      moveBlockCursor(ctx.editorInfo, ctx.line, pos);
    }
  };
  commands.normal[key] = handler;
  commands["visual-char"][key] = handler;
  commands["visual-line"][key] = handler;
};

const sameDirection = (dir) => dir;
const oppositeDirection = {
  f: "F",
  F: "f",
  t: "T",
  T: "t",
};
const reverseDirection = (dir) => oppositeDirection[dir];

registerCharRepeat(";", sameDirection);
registerCharRepeat(",", reverseDirection);

// --- Marks ---

commands.normal["m"] = () => {
  state.pendingKey = "m";
};
parameterized["m"] = (key, ctx) => {
  if (key >= "a" && key <= "z") state.marks[key] = [ctx.line, ctx.char];
};

commands.normal["'"] = () => {
  state.pendingKey = "'";
};
commands["visual-char"]["'"] = () => {
  state.pendingKey = "'";
};
commands["visual-line"]["'"] = () => {
  state.pendingKey = "'";
};
parameterized["'"] = (key, ctx) => {
  if (!state.marks[key]) return;
  const [markLine] = state.marks[key];
  const targetText = getLineText(ctx.rep, markLine);
  const targetChar = firstNonBlank(targetText);
  if (state.mode.startsWith("visual")) {
    moveVisualCursor(ctx.editorInfo, ctx.rep, markLine, targetChar);
  } else {
    moveBlockCursor(ctx.editorInfo, markLine, targetChar);
  }
};

commands.normal["`"] = () => {
  state.pendingKey = "`";
};
commands["visual-char"]["`"] = () => {
  state.pendingKey = "`";
};
commands["visual-line"]["`"] = () => {
  state.pendingKey = "`";
};
parameterized["`"] = (key, ctx) => {
  if (!state.marks[key]) return;
  const [markLine, markChar] = state.marks[key];
  if (state.mode.startsWith("visual")) {
    moveVisualCursor(ctx.editorInfo, ctx.rep, markLine, markChar);
  } else {
    moveBlockCursor(ctx.editorInfo, markLine, markChar);
  }
};

// --- Text objects ---

registerTextObject("w", (ctx, type) => {
  const r = textWordRange(ctx.lineText, ctx.char, type);
  if (!r) return null;
  return { start: [ctx.line, r.start], end: [ctx.line, r.end] };
});

for (const q of ['"', "'", "`"]) {
  registerTextObject(q, (ctx, type) => {
    const r = textQuoteRange(ctx.lineText, ctx.char, q, type);
    if (!r) return null;
    return { start: [ctx.line, r.start], end: [ctx.line, r.end] };
  });
}

for (const bracket of ["(", ")", "{", "}", "[", "]"]) {
  registerTextObject(bracket, (ctx, type) => {
    const r = textBracketRange(ctx.lineText, ctx.char, bracket, type);
    if (!r) return null;
    return { start: [ctx.line, r.start], end: [ctx.line, r.end] };
  });
}

registerTextObject("p", (ctx, type) => {
  const r = paragraphTextRange(ctx.rep, ctx.line, type);
  if (!r) return null;
  return {
    start: [r.startLine, r.startChar],
    end: [r.endLine, r.endChar],
  };
});

registerTextObject("s", (ctx, type) => {
  const r = sentenceTextRange(ctx.lineText, ctx.char, type);
  if (!r) return null;
  return { start: [ctx.line, r.start], end: [ctx.line, r.end] };
});

// --- Line operators ---

for (const op of OPERATORS) {
  commands.normal[op + op] = (ctx) => {
    const bottomLine = clampLine(ctx.line + ctx.count - 1, ctx.rep);
    applyLineOperator(op, ctx.line, bottomLine, ctx);
    recordCommand(op + op, ctx.count);
  };
}

// --- Visual modes ---

commands.normal["v"] = ({ editorInfo, rep, line, char }) => {
  state.visualAnchor = [line, char];
  state.visualCursor = [line, char];
  state.mode = "visual-char";
  updateVisualSelection(editorInfo, rep);
};

commands.normal["V"] = ({ editorInfo, rep, line }) => {
  state.visualAnchor = [line, 0];
  state.visualCursor = [line, 0];
  state.mode = "visual-line";
  updateVisualSelection(editorInfo, rep);
};

for (const op of OPERATORS) {
  commands["visual-line"][op] = (ctx) => {
    const topLine = Math.min(state.visualAnchor[0], state.visualCursor[0]);
    const bottomLine = Math.max(state.visualAnchor[0], state.visualCursor[0]);
    state.mode = "normal";
    applyLineOperator(op, topLine, bottomLine, ctx);
  };
}

for (const op of OPERATORS) {
  commands["visual-char"][op] = (ctx) => {
    const [start, end] = getVisualSelection(
      "char",
      state.visualAnchor,
      state.visualCursor,
      ctx.rep,
    );
    state.mode = "normal";
    applyOperator(op, start, [end[0], end[1] + 1], ctx);
  };
}

commands["visual-char"]["~"] = (ctx) => {
  const [start, end] = getVisualSelection(
    "char",
    state.visualAnchor,
    state.visualCursor,
    ctx.rep,
  );
  const adjustedEnd = [end[0], end[1] + 1];
  const text = getTextInRange(ctx.rep, start, adjustedEnd);
  let toggled = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    toggled += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  replaceRange(ctx.editorInfo, start, adjustedEnd, toggled);
  state.mode = "normal";
  moveBlockCursor(ctx.editorInfo, start[0], start[1]);
};

commands["visual-line"]["~"] = (ctx) => {
  const [start, end] = getVisualSelection(
    "line",
    state.visualAnchor,
    state.visualCursor,
    ctx.rep,
  );
  const text = getTextInRange(ctx.rep, start, end);
  let toggled = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    toggled += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  replaceRange(ctx.editorInfo, start, end, toggled);
  state.mode = "normal";
  moveBlockCursor(ctx.editorInfo, start[0], start[1]);
};

commands["visual-char"]["i"] = () => {
  state.pendingKey = "i";
};

commands["visual-char"]["a"] = () => {
  state.pendingKey = "a";
};

commands["visual-line"]["i"] = () => {
  state.pendingKey = "i";
};

commands["visual-line"]["a"] = () => {
  state.pendingKey = "a";
};

commands.normal["gv"] = ({ editorInfo, rep }) => {
  if (!state.lastVisualSelection) return;
  const { anchor, cursor, mode } = state.lastVisualSelection;
  state.visualAnchor = anchor;
  state.visualCursor = cursor;
  state.mode = mode;
  updateVisualSelection(editorInfo, rep);
};

// --- Insert mode entry ---

commands.normal["i"] = ({ editorInfo, line, char }) => {
  clearEmptyLineCursor();
  moveCursor(editorInfo, line, char);
  state.mode = "insert";
};

commands.normal["a"] = ({ editorInfo, line, char, lineText }) => {
  clearEmptyLineCursor();
  moveCursor(editorInfo, line, Math.min(char + 1, lineText.length));
  state.mode = "insert";
};

commands.normal["A"] = ({ editorInfo, line, lineText }) => {
  clearEmptyLineCursor();
  moveCursor(editorInfo, line, lineText.length);
  state.mode = "insert";
};

commands.normal["I"] = ({ editorInfo, line, lineText }) => {
  clearEmptyLineCursor();
  moveCursor(editorInfo, line, firstNonBlank(lineText));
  state.mode = "insert";
};

commands.normal["o"] = ({ editorInfo, line, lineText }) => {
  clearEmptyLineCursor();
  replaceRange(
    editorInfo,
    [line, lineText.length],
    [line, lineText.length],
    "\n",
  );
  moveCursor(editorInfo, line + 1, 0);
  state.mode = "insert";
};

commands.normal["O"] = ({ editorInfo, line }) => {
  clearEmptyLineCursor();
  replaceRange(editorInfo, [line, 0], [line, 0], "\n");
  moveCursor(editorInfo, line, 0);
  state.mode = "insert";
};

// --- Editing commands ---

commands.normal["r"] = () => {
  state.pendingKey = "r";
};
parameterized["r"] = (key, { editorInfo, line, char, lineText, count }) => {
  if (lineText.length > 0) {
    replaceRange(editorInfo, [line, char], [line, char + 1], key);
    moveBlockCursor(editorInfo, line, char);
    recordCommand("r", count, key);
  }
};

commands.normal["Y"] = ({ rep, line }) => {
  setRegister([getLineText(rep, line)]);
  recordCommand("Y", 1);
};

commands.normal["x"] = ({ editorInfo, rep, line, char, lineText, count }) => {
  if (lineText.length > 0) {
    const deleteCount = Math.min(count, lineText.length - char);
    setRegister(lineText.slice(char, char + deleteCount));
    replaceRange(editorInfo, [line, char], [line, char + deleteCount], "");
    const newLineText = getLineText(rep, line);
    moveBlockCursor(editorInfo, line, clampChar(char, newLineText));
    recordCommand("x", count);
  }
};

commands.normal["p"] = ({ editorInfo, line, char, lineText, count }) => {
  const reg = getActiveRegister();
  if (reg !== null) {
    if (typeof reg === "string") {
      const insertPos = Math.min(char + 1, lineText.length);
      const repeated = reg.repeat(count);
      replaceRange(editorInfo, [line, insertPos], [line, insertPos], repeated);
      moveBlockCursor(editorInfo, line, insertPos + repeated.length - 1);
    } else {
      const block = reg.join("\n");
      const parts = [];
      for (let i = 0; i < count; i++) parts.push(block);
      const insertText = "\n" + parts.join("\n");
      replaceRange(
        editorInfo,
        [line, lineText.length],
        [line, lineText.length],
        insertText,
      );
      moveBlockCursor(editorInfo, line + 1, firstNonBlank(reg[0]));
    }
    recordCommand("p", count);
  }
};

commands.normal["P"] = ({ editorInfo, line, char, count }) => {
  const reg = getActiveRegister();
  if (reg !== null) {
    if (typeof reg === "string") {
      const repeated = reg.repeat(count);
      replaceRange(editorInfo, [line, char], [line, char], repeated);
      moveBlockCursor(editorInfo, line, char + repeated.length - 1);
    } else {
      const block = reg.join("\n");
      const parts = [];
      for (let i = 0; i < count; i++) parts.push(block);
      const insertText = parts.join("\n") + "\n";
      replaceRange(editorInfo, [line, 0], [line, 0], insertText);
      moveBlockCursor(editorInfo, line, firstNonBlank(reg[0]));
    }
    recordCommand("P", count);
  }
};

commands.normal["J"] = ({ editorInfo, rep, line, lineText, count }) => {
  const lineCount = rep.lines.length();
  const joins = Math.min(count, lineCount - 1 - line);
  let cursorChar = lineText.length;
  for (let i = 0; i < joins; i++) {
    const curLineText = getLineText(rep, line);
    const nextLineText = getLineText(rep, line + 1);
    const trimmedNext = nextLineText.replace(/^\s+/, "");
    const separator = curLineText.length === 0 ? "" : " ";
    if (i === 0) cursorChar = curLineText.length;
    replaceRange(
      editorInfo,
      [line, curLineText.length],
      [line + 1, nextLineText.length],
      separator + trimmedNext,
    );
  }
  moveBlockCursor(editorInfo, line, cursorChar);
  recordCommand("J", count);
};

commands.normal["~"] = ({ editorInfo, rep, line, char, lineText, count }) => {
  if (lineText.length > 0) {
    const toggleCount = Math.min(count, lineText.length - char);
    const slice = lineText.slice(char, char + toggleCount);
    let toggled = "";
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      toggled += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
    }
    replaceRange(editorInfo, [line, char], [line, char + toggleCount], toggled);
    const newChar = Math.min(char + toggleCount, lineText.length - 1);
    moveBlockCursor(editorInfo, line, newChar);
    recordCommand("~", count);
  }
};

commands.normal["D"] = ({ editorInfo, rep, line, char, lineText }) => {
  setRegister(lineText.slice(char));
  replaceRange(editorInfo, [line, char], [line, lineText.length], "");
  const newLineText = getLineText(rep, line);
  moveBlockCursor(editorInfo, line, clampChar(char, newLineText));
  recordCommand("D", 1);
};

commands.normal["C"] = ({ editorInfo, line, char, lineText }) => {
  clearEmptyLineCursor();
  setRegister(lineText.slice(char));
  replaceRange(editorInfo, [line, char], [line, lineText.length], "");
  moveCursor(editorInfo, line, char);
  state.mode = "insert";
  recordCommand("C", 1);
};

commands.normal["s"] = ({ editorInfo, rep, line, char, lineText, count }) => {
  clearEmptyLineCursor();
  setRegister(lineText.slice(char, Math.min(char + count, lineText.length)));
  replaceRange(
    editorInfo,
    [line, char],
    [line, Math.min(char + count, lineText.length)],
    "",
  );
  moveCursor(editorInfo, line, char);
  state.mode = "insert";
  recordCommand("s", count);
};

commands.normal["S"] = ({ editorInfo, line, lineText }) => {
  clearEmptyLineCursor();
  setRegister([lineText]);
  replaceRange(editorInfo, [line, 0], [line, lineText.length], "");
  moveCursor(editorInfo, line, 0);
  state.mode = "insert";
  recordCommand("S", 1);
};

// --- Undo, redo, repeat ---

commands.normal["u"] = ({ editorInfo }) => {
  editorInfo.ace_doUndoRedo("undo");
};

commands.normal["<C-r>"] = ({ editorInfo }) => {
  editorInfo.ace_doUndoRedo("redo");
};

commands.normal["."] = (ctx) => {
  if (!state.lastCommand) return;
  const { key, count, param } = state.lastCommand;
  if (param !== null && parameterized[key]) {
    parameterized[key](param, ctx);
  } else if (commands[state.mode] && commands[state.mode][key]) {
    const newCtx = { ...ctx, count };
    commands[state.mode][key](newCtx);
  }
};

// --- Search ---

commands.normal["/"] = () => {
  state.searchMode = true;
  state.searchBuffer = "";
  state.searchDirection = "/";
};

commands.normal["?"] = () => {
  state.searchMode = true;
  state.searchBuffer = "";
  state.searchDirection = "?";
};

commands.normal["n"] = (ctx) => {
  if (!state.lastSearch) return;
  const { pattern, direction } = state.lastSearch;
  const searchFunc = direction === "/" ? searchForward : searchBackward;
  const pos = searchFunc(ctx.rep, ctx.line, ctx.char + 1, pattern, ctx.count);
  if (pos) moveBlockCursor(ctx.editorInfo, pos[0], pos[1]);
};

commands.normal["N"] = (ctx) => {
  if (!state.lastSearch) return;
  const { pattern, direction } = state.lastSearch;
  const searchFunc = direction === "/" ? searchBackward : searchForward;
  const pos = searchFunc(ctx.rep, ctx.line, ctx.char, pattern, ctx.count);
  if (pos) moveBlockCursor(ctx.editorInfo, pos[0], pos[1]);
};

const getWordAt = (text, char) => {
  if (char >= text.length || !/\w/.test(text[char])) return null;
  let start = char;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  let end = char;
  while (end < text.length && /\w/.test(text[end])) end++;
  return text.slice(start, end);
};

commands.normal["*"] = (ctx) => {
  const word = getWordAt(ctx.lineText, ctx.char);
  if (!word) return;
  state.lastSearch = { pattern: word, direction: "/" };
  const pos = searchForward(ctx.rep, ctx.line, ctx.char + 1, word, ctx.count);
  if (pos) moveBlockCursor(ctx.editorInfo, pos[0], pos[1]);
};

commands.normal["#"] = (ctx) => {
  const word = getWordAt(ctx.lineText, ctx.char);
  if (!word) return;
  state.lastSearch = { pattern: word, direction: "?" };
  const pos = searchBackward(ctx.rep, ctx.line, ctx.char, word, ctx.count);
  if (pos) moveBlockCursor(ctx.editorInfo, pos[0], pos[1]);
};

// --- Scroll ---

commands.normal["zz"] = ({ line }) => {
  if (!state.editorDoc) return;
  const lineDiv = state.editorDoc.body.querySelectorAll("div")[line];
  if (lineDiv) lineDiv.scrollIntoView({ block: "center" });
};

commands.normal["zt"] = ({ line }) => {
  if (!state.editorDoc) return;
  const lineDiv = state.editorDoc.body.querySelectorAll("div")[line];
  if (lineDiv) lineDiv.scrollIntoView({ block: "start" });
};

commands.normal["zb"] = ({ line }) => {
  if (!state.editorDoc) return;
  const lineDiv = state.editorDoc.body.querySelectorAll("div")[line];
  if (lineDiv) lineDiv.scrollIntoView({ block: "end" });
};

const halfPage = 15;
const fullPage = halfPage * 2;

commands.normal["<C-d>"] = ({ editorInfo, rep, line, char, count }) => {
  const target = Math.min(line + halfPage * count, rep.lines.length() - 1);
  const targetLen = rep.lines.atIndex(target).text.length;
  moveBlockCursor(
    editorInfo,
    target,
    Math.min(char, Math.max(0, targetLen - 1)),
  );
};

commands.normal["<C-u>"] = ({ editorInfo, rep, line, char, count }) => {
  const target = Math.max(line - halfPage * count, 0);
  const targetLen = rep.lines.atIndex(target).text.length;
  moveBlockCursor(
    editorInfo,
    target,
    Math.min(char, Math.max(0, targetLen - 1)),
  );
};

commands.normal["<C-f>"] = ({ editorInfo, rep, line, char, count }) => {
  const target = Math.min(line + fullPage * count, rep.lines.length() - 1);
  const targetLen = rep.lines.atIndex(target).text.length;
  moveBlockCursor(
    editorInfo,
    target,
    Math.min(char, Math.max(0, targetLen - 1)),
  );
};

commands.normal["<C-b>"] = ({ editorInfo, rep, line, char, count }) => {
  const target = Math.max(line - fullPage * count, 0);
  const targetLen = rep.lines.atIndex(target).text.length;
  moveBlockCursor(
    editorInfo,
    target,
    Math.min(char, Math.max(0, targetLen - 1)),
  );
};

// --- Dispatch ---

const handleKey = (key, ctx) => {
  if (state.awaitingRegister) {
    state.pendingRegister = key;
    state.awaitingRegister = false;
    return true;
  }
  if (key === '"' && state.mode === "normal") {
    state.awaitingRegister = true;
    return true;
  }

  if (key >= "1" && key <= "9") {
    state.countBuffer += key;
    return true;
  }
  if (key === "0" && state.countBuffer !== "") {
    state.countBuffer += key;
    return true;
  }

  if (state.countBuffer !== "") {
    state.pendingCount = parseInt(state.countBuffer, 10);
    state.countBuffer = "";
  }
  ctx.count = state.pendingCount !== null ? state.pendingCount : 1;
  ctx.hasCount = state.pendingCount !== null;

  if (state.pendingKey !== null && parameterized[state.pendingKey]) {
    const handler = parameterized[state.pendingKey];
    state.pendingKey = null;
    handler(key, ctx);
    state.pendingCount = null;
    state.pendingRegister = null;
    return true;
  }

  const map = commands[state.mode];
  const seq = state.pendingKey !== null ? state.pendingKey + key : key;

  if (map[seq]) {
    state.pendingKey = null;
    map[seq](ctx);
    if (state.pendingKey === null) {
      state.pendingCount = null;
      state.pendingRegister = null;
    }
    return true;
  }

  const isPrefix = Object.keys(map).some(
    (k) => k.startsWith(seq) && k.length > seq.length,
  );
  if (isPrefix) {
    state.pendingKey = seq;
    return true;
  }

  if (
    state.pendingKey &&
    (key === "i" || key === "a") &&
    Object.keys(map).some((k) => k.startsWith(state.pendingKey + key))
  ) {
    state.pendingKey = state.pendingKey + key;
    return true;
  }

  if (
    (state.mode === "visual-char" || state.mode === "visual-line") &&
    (state.pendingKey === "i" || state.pendingKey === "a")
  ) {
    const type = state.pendingKey;
    state.pendingKey = null;
    const range = resolveTextObject(
      key,
      type,
      ctx.line,
      ctx.lineText,
      ctx.char,
      ctx.rep,
    );
    if (range) {
      state.visualAnchor = [range.startLine, range.startChar];
      state.visualCursor = [range.endLine, range.endChar];
      updateVisualSelection(ctx.editorInfo, ctx.rep);
    }
    return true;
  }

  state.pendingKey = null;
  state.pendingCount = null;
  state.pendingRegister = null;
  return true;
};

// --- Etherpad hooks ---

exports.aceEditorCSS = () => ["ep_vim/static/css/vim.css"];

exports.postToolbarInit = (_hookName, _args) => {
  const btn = document.getElementById("vim-toggle-btn");
  if (!btn) return;
  btn.classList.toggle("vim-enabled", vimEnabled);
  btn.addEventListener("click", () => {
    vimEnabled = !vimEnabled;
    localStorage.setItem("ep_vimEnabled", vimEnabled ? "true" : "false");
    btn.classList.toggle("vim-enabled", vimEnabled);
  });

  const clipboardCheckbox = document.getElementById(
    "options-vim-use-system-clipboard",
  );
  if (!clipboardCheckbox) return;
  useSystemClipboard = clipboardCheckbox.checked;
  clipboardCheckbox.addEventListener("change", () => {
    useSystemClipboard = clipboardCheckbox.checked;
  });

  const ctrlKeysCheckbox = document.getElementById("options-vim-use-ctrl-keys");
  if (!ctrlKeysCheckbox) return;
  useCtrlKeys = ctrlKeysCheckbox.checked;
  ctrlKeysCheckbox.addEventListener("change", () => {
    useCtrlKeys = ctrlKeysCheckbox.checked;
  });
};

exports.postAceInit = (_hookName, { ace }) => {
  if (!vimEnabled) return;
  ace.callWithAce((aceTop) => {
    const rep = aceTop.ace_getRep();
    if (rep && rep.selStart) {
      state.currentRep = rep;
      selectRange(aceTop, rep.selStart, [rep.selStart[0], rep.selStart[1] + 1]);
    }
  });
};

exports.aceKeyEvent = (_hookName, { evt, rep, editorInfo }) => {
  if (!vimEnabled) return false;
  if (evt.type !== "keydown") return false;

  const isBrowserShortcut =
    (evt.ctrlKey || evt.metaKey) &&
    (evt.key === "x" ||
      evt.key === "c" ||
      evt.key === "v" ||
      (evt.key === "r" && !useCtrlKeys));
  if (isBrowserShortcut) return false;

  state.currentRep = rep;
  if (!state.editorDoc) state.editorDoc = evt.target.ownerDocument;

  if (evt.key === "Escape") {
    state.desiredColumn = null;
    if (state.mode === "visual-line") {
      state.lastVisualSelection = {
        anchor: state.visualAnchor,
        cursor: state.visualCursor,
        mode: "visual-line",
      };
      const line = Math.min(state.visualAnchor[0], state.visualCursor[0]);
      state.mode = "normal";
      moveBlockCursor(editorInfo, line, 0);
    } else if (state.mode === "visual-char") {
      state.lastVisualSelection = {
        anchor: state.visualAnchor,
        cursor: state.visualCursor,
        mode: "visual-char",
      };
      const [vLine, vChar] = state.visualCursor;
      state.mode = "normal";
      moveBlockCursor(editorInfo, vLine, vChar);
    } else if (state.mode === "insert") {
      state.mode = "normal";
      const [curLine, curChar] = rep.selStart;
      moveBlockCursor(editorInfo, curLine, Math.max(0, curChar - 1));
    } else {
      state.mode = "normal";
      const [curLine, curChar] = rep.selStart;
      moveBlockCursor(editorInfo, curLine, curChar);
    }
    state.pendingKey = null;
    state.pendingCount = null;
    state.countBuffer = "";
    evt.preventDefault();
    return true;
  }

  if (state.mode === "insert") return false;

  if (state.searchMode) {
    if (evt.key === "Enter") {
      state.searchMode = false;
      const pattern = state.searchBuffer;
      state.lastSearch = { pattern, direction: state.searchDirection };
      const [curLine, curChar] = rep.selStart;
      const searchFunc =
        state.searchDirection === "/" ? searchForward : searchBackward;
      const pos = searchFunc(rep, curLine, curChar + 1, pattern);
      if (pos) moveBlockCursor(editorInfo, pos[0], pos[1]);
      state.searchBuffer = "";
      evt.preventDefault();
      return true;
    } else if (evt.key === "Escape") {
      state.searchMode = false;
      state.searchBuffer = "";
      evt.preventDefault();
      return true;
    } else if (evt.key.length === 1 && !evt.ctrlKey && !evt.metaKey) {
      state.searchBuffer += evt.key;
      evt.preventDefault();
      return true;
    }
    return false;
  }

  const [line, char] =
    state.mode === "visual-line" || state.mode === "visual-char"
      ? state.visualCursor
      : rep.selStart;
  const lineText = rep.lines.atIndex(line).text;
  const ctx = { rep, editorInfo, line, char, lineText };

  if (useCtrlKeys && evt.ctrlKey && state.mode === "normal") {
    const ctrlKey = "<C-" + evt.key + ">";
    if (commands.normal[ctrlKey]) {
      handleKey(ctrlKey, ctx);
      evt.preventDefault();
      return true;
    }
  }

  const handled = handleKey(evt.key, ctx);
  if (handled) evt.preventDefault();
  return handled;
};

// Exports for testing
exports._state = state;
exports._handleKey = handleKey;
exports._commands = commands;
exports._parameterized = parameterized;
exports._setVimEnabled = (v) => {
  vimEnabled = v;
};
exports._setUseCtrlKeys = (v) => {
  useCtrlKeys = v;
};
