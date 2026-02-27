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
} = require("./vim-core");

// --- State ---

let vimEnabled = localStorage.getItem("ep_vimEnabled") === "true";
let mode = "normal";
let pendingKey = null;
let pendingCount = null;
let countBuffer = "";
let register = null;
let marks = {};
let lastCharSearch = null;
let visualAnchor = null;
let visualCursor = null;
let editorDoc = null;
let currentRep = null;
let desiredColumn = null;
let lastCommand = null;

// --- Editor operations ---

const setRegister = (value) => {
  register = value;
  const text = Array.isArray(value) ? value.join("\n") + "\n" : value;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
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
  const vMode = mode === "visual-line" ? "line" : "char";
  const [start, end] = getVisualSelection(
    vMode,
    visualAnchor,
    visualCursor,
    rep,
  );
  selectRange(editorInfo, start, end);
};

const clearEmptyLineCursor = () => {
  if (!editorDoc) return;
  const old = editorDoc.querySelector(".vim-empty-line-cursor");
  if (old) old.classList.remove("vim-empty-line-cursor");
};

const scrollLineIntoView = (line) => {
  if (!editorDoc) return;
  const lineDiv = editorDoc.body.querySelectorAll("div")[line];
  if (lineDiv) lineDiv.scrollIntoView({ block: "nearest" });
};

const moveBlockCursor = (editorInfo, line, char) => {
  clearEmptyLineCursor();
  const lineText = currentRep ? getLineText(currentRep, line) : "";
  if (lineText.length === 0 && editorDoc) {
    const lineDiv = editorDoc.body.querySelectorAll("div")[line];
    if (lineDiv) lineDiv.classList.add("vim-empty-line-cursor");
    selectRange(editorInfo, [line, 0], [line, 0]);
  } else {
    selectRange(editorInfo, [line, char], [line, char + 1]);
  }
  scrollLineIntoView(line);
};

const moveVisualCursor = (editorInfo, rep, line, char) => {
  visualCursor = [line, char];
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
    for (let i = topLine; i <= bottomLine; i++) {
      const text = getLineText(rep, i);
      replaceRange(editorInfo, [topLine, 0], [topLine, text.length], "");
    }
    moveCursor(editorInfo, topLine, 0);
    mode = "insert";
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
    mode = "insert";
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
  lastCommand = { key, count, param };
};

const registerMotion = (key, getEndPos) => {
  commands.normal[key] = (ctx) => {
    desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) moveBlockCursor(ctx.editorInfo, pos.line, pos.char);
  };
  commands["visual-char"][key] = (ctx) => {
    desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) moveVisualCursor(ctx.editorInfo, ctx.rep, pos.line, pos.char);
  };
  commands["visual-line"][key] = (ctx) => {
    desiredColumn = null;
    const pos = getEndPos(ctx);
    if (pos) moveVisualCursor(ctx.editorInfo, ctx.rep, pos.line, pos.char);
  };
  for (const op of OPERATORS) {
    commands.normal[op + key] = (ctx) => {
      desiredColumn = null;
      const pos = getEndPos(ctx);
      if (pos) {
        applyOperator(op, [ctx.line, ctx.char], [pos.line, pos.char], ctx);
        recordCommand(op + key, ctx.count);
      }
    };
  }
};

const parameterized = {};

const registerParamMotion = (key, getEndChar) => {
  commands.normal[key] = () => {
    pendingKey = key;
  };
  commands["visual-char"][key] = () => {
    pendingKey = key;
  };
  commands["visual-line"][key] = () => {
    pendingKey = key;
  };
  parameterized[key] = (argKey, ctx) => {
    lastCharSearch = { direction: key, target: argKey };
    const pos = getEndChar(argKey, ctx);
    if (pos !== null) {
      if (mode.startsWith("visual")) {
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
      pendingKey = combo;
    };
    parameterized[combo] = (argKey, ctx) => {
      lastCharSearch = { direction: key, target: argKey };
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
  if (!editorDoc) return { top: 0, bottom: totalLines - 1 };
  const lineDivs = editorDoc.body.querySelectorAll("div");
  const lineCount = Math.min(lineDivs.length, totalLines);
  const frameEl = editorDoc.defaultView.frameElement;
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

registerMotion("j", (ctx) => {
  if (desiredColumn === null) desiredColumn = ctx.char;
  const newLine = clampLine(ctx.line + ctx.count, ctx.rep);
  const newLineText = getLineText(ctx.rep, newLine);
  return { line: newLine, char: clampChar(desiredColumn, newLineText) };
});

registerMotion("k", (ctx) => {
  if (desiredColumn === null) desiredColumn = ctx.char;
  const newLine = clampLine(ctx.line - ctx.count, ctx.rep);
  const newLineText = getLineText(ctx.rep, newLine);
  return { line: newLine, char: clampChar(desiredColumn, newLineText) };
});

registerMotion("w", (ctx) => {
  let pos = ctx.char;
  for (let i = 0; i < ctx.count; i++) pos = wordForward(ctx.lineText, pos);
  return { line: ctx.line, char: clampChar(pos, ctx.lineText) };
});

registerMotion("b", (ctx) => {
  let pos = ctx.char;
  for (let i = 0; i < ctx.count; i++) pos = wordBackward(ctx.lineText, pos);
  return { line: ctx.line, char: pos };
});

registerMotion("e", (ctx) => {
  let pos = ctx.char;
  for (let i = 0; i < ctx.count; i++) pos = wordEnd(ctx.lineText, pos);
  return { line: ctx.line, char: clampChar(pos, ctx.lineText) };
});

registerMotion("0", (_ctx) => ({ line: _ctx.line, char: 0 }));

registerMotion("$", (ctx) => ({
  line: ctx.line,
  char: clampChar(ctx.lineText.length - 1, ctx.lineText),
}));

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

registerMotion("%", (ctx) => {
  const pos = matchingBracketPos(ctx.rep, ctx.line, ctx.char);
  return pos || { line: ctx.line, char: ctx.char };
});

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

commands.normal[";"] = (ctx) => {
  if (!lastCharSearch) return;
  const pos = charSearchPos(
    lastCharSearch.direction,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveBlockCursor(ctx.editorInfo, ctx.line, pos);
};

commands.normal[","] = (ctx) => {
  if (!lastCharSearch) return;
  const opposite = { f: "F", F: "f", t: "T", T: "t" };
  const dir = opposite[lastCharSearch.direction];
  const pos = charSearchPos(
    dir,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveBlockCursor(ctx.editorInfo, ctx.line, pos);
};

commands["visual-char"][";"] = (ctx) => {
  if (!lastCharSearch) return;
  const pos = charSearchPos(
    lastCharSearch.direction,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
};

commands["visual-char"][","] = (ctx) => {
  if (!lastCharSearch) return;
  const opposite = { f: "F", F: "f", t: "T", T: "t" };
  const dir = opposite[lastCharSearch.direction];
  const pos = charSearchPos(
    dir,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
};

commands["visual-line"][";"] = (ctx) => {
  if (!lastCharSearch) return;
  const pos = charSearchPos(
    lastCharSearch.direction,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
};

commands["visual-line"][","] = (ctx) => {
  if (!lastCharSearch) return;
  const opposite = { f: "F", F: "f", t: "T", T: "t" };
  const dir = opposite[lastCharSearch.direction];
  const pos = charSearchPos(
    dir,
    ctx.lineText,
    ctx.char,
    lastCharSearch.target,
    ctx.count,
  );
  if (pos !== -1) moveVisualCursor(ctx.editorInfo, ctx.rep, ctx.line, pos);
};

// --- Marks ---

commands.normal["m"] = () => {
  pendingKey = "m";
};
parameterized["m"] = (key, ctx) => {
  if (key >= "a" && key <= "z") marks[key] = [ctx.line, ctx.char];
};

commands.normal["'"] = () => {
  pendingKey = "'";
};
parameterized["'"] = (key, ctx) => {
  if (!marks[key]) return;
  const [markLine] = marks[key];
  const targetText = getLineText(ctx.rep, markLine);
  moveBlockCursor(ctx.editorInfo, markLine, firstNonBlank(targetText));
};

commands.normal["`"] = () => {
  pendingKey = "`";
};
parameterized["`"] = (key, ctx) => {
  if (!marks[key]) return;
  const [markLine, markChar] = marks[key];
  moveBlockCursor(ctx.editorInfo, markLine, markChar);
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
  visualAnchor = [line, char];
  visualCursor = [line, char];
  mode = "visual-char";
  updateVisualSelection(editorInfo, rep);
};

commands.normal["V"] = ({ editorInfo, rep, line }) => {
  visualAnchor = [line, 0];
  visualCursor = [line, 0];
  mode = "visual-line";
  updateVisualSelection(editorInfo, rep);
};

for (const op of OPERATORS) {
  commands["visual-line"][op] = (ctx) => {
    const topLine = Math.min(visualAnchor[0], visualCursor[0]);
    const bottomLine = Math.max(visualAnchor[0], visualCursor[0]);
    mode = "normal";
    applyLineOperator(op, topLine, bottomLine, ctx);
  };
}

for (const op of OPERATORS) {
  commands["visual-char"][op] = (ctx) => {
    const [start, end] = getVisualSelection(
      "char",
      visualAnchor,
      visualCursor,
      ctx.rep,
    );
    mode = "normal";
    applyOperator(op, start, end, ctx);
  };
}

commands["visual-char"]["~"] = (ctx) => {
  const [start, end] = getVisualSelection(
    "char",
    visualAnchor,
    visualCursor,
    ctx.rep,
  );
  const text = getTextInRange(ctx.rep, start, end);
  let toggled = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    toggled += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  replaceRange(ctx.editorInfo, start, end, toggled);
  mode = "normal";
  moveBlockCursor(ctx.editorInfo, start[0], start[1]);
};

commands["visual-line"]["~"] = (ctx) => {
  const [start, end] = getVisualSelection(
    "line",
    visualAnchor,
    visualCursor,
    ctx.rep,
  );
  const text = getTextInRange(ctx.rep, start, end);
  let toggled = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    toggled += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  replaceRange(ctx.editorInfo, start, end, toggled);
  mode = "normal";
  moveBlockCursor(ctx.editorInfo, start[0], start[1]);
};

// --- Miscellaneous ---

commands.normal["u"] = ({ editorInfo }) => {
  editorInfo.ace_doUndoRedo("undo");
};

commands.normal["."] = (ctx) => {
  if (!lastCommand) return;
  const { key, count, param } = lastCommand;
  if (param !== null && parameterized[key]) {
    parameterized[key](param, ctx);
  } else if (commands[mode] && commands[mode][key]) {
    const newCtx = { ...ctx, count };
    commands[mode][key](newCtx);
  }
};

// --- Mode transitions ---

commands.normal["i"] = ({ editorInfo, line, char }) => {
  moveCursor(editorInfo, line, char);
  mode = "insert";
};

commands.normal["a"] = ({ editorInfo, line, char, lineText }) => {
  moveCursor(editorInfo, line, Math.min(char + 1, lineText.length));
  mode = "insert";
};

commands.normal["A"] = ({ editorInfo, line, lineText }) => {
  moveCursor(editorInfo, line, lineText.length);
  mode = "insert";
};

commands.normal["I"] = ({ editorInfo, line, lineText }) => {
  moveCursor(editorInfo, line, firstNonBlank(lineText));
  mode = "insert";
};

commands["visual-char"]["i"] = () => {
  pendingKey = "i";
};

commands["visual-char"]["a"] = () => {
  pendingKey = "a";
};

commands.normal["o"] = ({ editorInfo, line, lineText }) => {
  replaceRange(
    editorInfo,
    [line, lineText.length],
    [line, lineText.length],
    "\n",
  );
  moveCursor(editorInfo, line + 1, 0);
  mode = "insert";
};

commands.normal["O"] = ({ editorInfo, line }) => {
  replaceRange(editorInfo, [line, 0], [line, 0], "\n");
  moveCursor(editorInfo, line, 0);
  mode = "insert";
};

// --- More normal mode commands ---

commands.normal["r"] = () => {
  pendingKey = "r";
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
  if (register !== null) {
    if (typeof register === "string") {
      const insertPos = Math.min(char + 1, lineText.length);
      const repeated = register.repeat(count);
      replaceRange(editorInfo, [line, insertPos], [line, insertPos], repeated);
      moveBlockCursor(editorInfo, line, insertPos);
    } else {
      const block = register.join("\n");
      const parts = [];
      for (let i = 0; i < count; i++) parts.push(block);
      const insertText = "\n" + parts.join("\n");
      replaceRange(
        editorInfo,
        [line, lineText.length],
        [line, lineText.length],
        insertText,
      );
      moveBlockCursor(editorInfo, line + 1, 0);
    }
    recordCommand("p", count);
  }
};

commands.normal["P"] = ({ editorInfo, line, char, count }) => {
  if (register !== null) {
    if (typeof register === "string") {
      const repeated = register.repeat(count);
      replaceRange(editorInfo, [line, char], [line, char], repeated);
      moveBlockCursor(editorInfo, line, char);
    } else {
      const block = register.join("\n");
      const parts = [];
      for (let i = 0; i < count; i++) parts.push(block);
      const insertText = parts.join("\n") + "\n";
      replaceRange(editorInfo, [line, 0], [line, 0], insertText);
      moveBlockCursor(editorInfo, line, 0);
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

commands.normal["D"] = ({ editorInfo, line, char, lineText }) => {
  setRegister(lineText.slice(char));
  replaceRange(editorInfo, [line, char], [line, lineText.length], "");
  moveBlockCursor(editorInfo, line, clampChar(char, ""));
  recordCommand("D", 1);
};

commands.normal["C"] = ({ editorInfo, line, char, lineText }) => {
  setRegister(lineText.slice(char));
  replaceRange(editorInfo, [line, char], [line, lineText.length], "");
  moveCursor(editorInfo, line, char);
  mode = "insert";
  recordCommand("C", 1);
};

commands.normal["s"] = ({ editorInfo, rep, line, char, lineText, count }) => {
  setRegister(lineText.slice(char, char + 1));
  replaceRange(
    editorInfo,
    [line, char],
    [line, Math.min(char + count, lineText.length)],
    "",
  );
  moveCursor(editorInfo, line, char);
  mode = "insert";
  recordCommand("s", count);
};

commands.normal["S"] = ({ editorInfo, line, lineText }) => {
  setRegister(lineText);
  replaceRange(editorInfo, [line, 0], [line, lineText.length], "");
  moveCursor(editorInfo, line, 0);
  mode = "insert";
  recordCommand("S", 1);
};

// --- Dispatch ---

const handleKey = (key, ctx) => {
  if (key >= "1" && key <= "9") {
    countBuffer += key;
    return true;
  }
  if (key === "0" && countBuffer !== "") {
    countBuffer += key;
    return true;
  }

  if (countBuffer !== "") {
    pendingCount = parseInt(countBuffer, 10);
    countBuffer = "";
  }
  ctx.count = pendingCount !== null ? pendingCount : 1;
  ctx.hasCount = pendingCount !== null;

  if (pendingKey !== null && parameterized[pendingKey]) {
    const handler = parameterized[pendingKey];
    pendingKey = null;
    handler(key, ctx);
    pendingCount = null;
    return true;
  }

  const map = commands[mode];
  const seq = pendingKey !== null ? pendingKey + key : key;

  if (map[seq]) {
    pendingKey = null;
    map[seq](ctx);
    if (pendingKey === null) pendingCount = null;
    return true;
  }

  const isPrefix = Object.keys(map).some(
    (k) => k.startsWith(seq) && k.length > seq.length,
  );
  if (isPrefix) {
    pendingKey = seq;
    return true;
  }

  if (
    pendingKey &&
    (key === "i" || key === "a") &&
    Object.keys(map).some((k) => k.startsWith(pendingKey + key))
  ) {
    pendingKey = pendingKey + key;
    return true;
  }

  if (mode === "visual-char" && (pendingKey === "i" || pendingKey === "a")) {
    const type = pendingKey;
    pendingKey = null;
    const range = resolveTextObject(
      key,
      type,
      ctx.line,
      ctx.lineText,
      ctx.char,
      ctx.rep,
    );
    if (range) {
      visualAnchor = [range.startLine, range.startChar];
      visualCursor = [range.endLine, range.endChar];
      updateVisualSelection(ctx.editorInfo, ctx.rep);
    }
    return true;
  }

  pendingKey = null;
  pendingCount = null;
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
};

exports.postAceInit = (_hookName, { ace }) => {
  if (!vimEnabled) return;
  ace.callWithAce((aceTop) => {
    const rep = aceTop.ace_getRep();
    if (rep && rep.selStart) {
      currentRep = rep;
      selectRange(aceTop, rep.selStart, [rep.selStart[0], rep.selStart[1] + 1]);
    }
  });
};

exports.aceKeyEvent = (_hookName, { evt, rep, editorInfo }) => {
  if (!vimEnabled) return false;
  if (evt.type !== "keydown") return false;

  const isBrowserShortcut =
    (evt.ctrlKey || evt.metaKey) &&
    (evt.key === "x" || evt.key === "c" || evt.key === "v" || evt.key === "r");
  if (isBrowserShortcut) return false;

  currentRep = rep;
  if (!editorDoc) editorDoc = evt.target.ownerDocument;

  if (evt.key === "Escape") {
    desiredColumn = null;
    if (mode === "visual-line") {
      const line = Math.min(visualAnchor[0], visualCursor[0]);
      mode = "normal";
      moveBlockCursor(editorInfo, line, 0);
    } else if (mode === "visual-char") {
      const [vLine, vChar] = visualCursor;
      mode = "normal";
      moveBlockCursor(editorInfo, vLine, vChar);
    } else if (mode === "insert") {
      mode = "normal";
      const [curLine, curChar] = rep.selStart;
      moveBlockCursor(editorInfo, curLine, Math.max(0, curChar - 1));
    } else {
      mode = "normal";
      const [curLine, curChar] = rep.selStart;
      moveBlockCursor(editorInfo, curLine, curChar);
    }
    pendingKey = null;
    pendingCount = null;
    countBuffer = "";
    evt.preventDefault();
    return true;
  }

  if (mode === "insert") return false;

  const [line, char] =
    mode === "visual-line" || mode === "visual-char"
      ? visualCursor
      : rep.selStart;
  const lineText = rep.lines.atIndex(line).text;
  const ctx = { rep, editorInfo, line, char, lineText };
  const handled = handleKey(evt.key, ctx);
  if (handled) evt.preventDefault();
  return handled;
};
