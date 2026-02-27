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
  motionRange,
  charMotionRange,
  textWordRange,
  textQuoteRange,
  textBracketRange,
  getVisualSelection,
  paragraphForward,
  paragraphBackward,
  getTextInRange,
  matchingBracketPos,
  paragraphTextRange,
  sentenceTextRange,
} = require("./vim-core");

// --- State variables ---

let vimEnabled = localStorage.getItem("ep_vimEnabled") === "true";
let insertMode = false;
let visualMode = null;
let visualAnchor = null;
let visualCursor = null;
let pendingKey = null;
let pendingOperator = null;
let pendingCount = null;
let countBuffer = "";
let register = null;
let marks = {};
let editorDoc = null;
let currentRep = null;
let desiredColumn = null;
let lastCharSearch = null;

const QUOTE_CHARS = new Set(['"', "'"]);
const BRACKET_CHARS = new Set(["(", ")", "{", "}", "[", "]"]);

const textObjectRange = (key, lineText, char, type) => {
  if (key === "w") return textWordRange(lineText, char, type);
  if (QUOTE_CHARS.has(key)) return textQuoteRange(lineText, char, key, type);
  if (BRACKET_CHARS.has(key))
    return textBracketRange(lineText, char, key, type);
};

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
  const r = textObjectRange(key, lineText, char, type);
  if (!r) return null;
  return { startLine: line, startChar: r.start, endLine: line, endChar: r.end };
};

const getVisibleLineRange = (rep) => {
  const totalLines = rep.lines.length();
  if (!editorDoc) return { top: 0, bottom: totalLines - 1 };
  const lineDivs = editorDoc.body.querySelectorAll("div");
  const lineCount = Math.min(lineDivs.length, totalLines);

  // The iframe doesn't scroll — the outer page does. getBoundingClientRect()
  // inside the iframe is relative to the iframe document top (not the outer
  // viewport). We need the iframe's own position in the outer viewport to
  // know which lines are actually visible.
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

  // Lines can wrap, so find the middle by pixel position rather than index.
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

// --- Count helpers ---

const consumeCount = () => {
  if (countBuffer !== "") {
    pendingCount = parseInt(countBuffer, 10);
    countBuffer = "";
  } else if (pendingKey === null && pendingOperator === null) {
    pendingCount = null;
  }
};

const getCount = () => pendingCount || 1;

// --- Side-effectful helpers ---

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

const clearEmptyLineCursor = () => {
  if (!editorDoc) return;
  const old = editorDoc.querySelector(".vim-empty-line-cursor");
  if (old) old.classList.remove("vim-empty-line-cursor");
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
};

const selectRange = (editorInfo, start, end) => {
  editorInfo.ace_inCallStackIfNecessary("vim-select", () => {
    editorInfo.ace_performSelectionChange(start, end, false);
    editorInfo.ace_updateBrowserSelectionFromRep();
  });
};

const replaceRange = (editorInfo, start, end, text) => {
  editorInfo.ace_inCallStackIfNecessary("vim-edit", () => {
    editorInfo.ace_performDocumentReplaceRange(start, end, text);
  });
};

const undo = (editorInfo) => {
  editorInfo.ace_doUndoRedo("undo");
};

// --- Mode management ---

const setInsertMode = (value) => {
  insertMode = value;
  if (value) clearEmptyLineCursor();
  if (editorDoc) {
    editorDoc.body.classList.toggle("vim-insert-mode", value);
  }
};

const setVisualMode = (value) => {
  visualMode = value;
  if (editorDoc) {
    editorDoc.body.classList.toggle("vim-visual-line-mode", value === "line");
    editorDoc.body.classList.toggle("vim-visual-char-mode", value === "char");
  }
};

const updateVisualSelection = (editorInfo, rep) => {
  const [start, end] = getVisualSelection(
    visualMode,
    visualAnchor,
    visualCursor,
    rep,
  );
  selectRange(editorInfo, start, end);
};

// --- Motion resolution (shared between normal and visual) ---

const resolveMotion = (key, line, char, lineText, rep, count) => {
  if (
    pendingKey === "f" ||
    pendingKey === "F" ||
    pendingKey === "t" ||
    pendingKey === "T"
  ) {
    const direction = pendingKey;
    pendingKey = null;
    lastCharSearch = { direction, target: key };
    const pos = charSearchPos(direction, lineText, char, key, count);
    if (pos !== -1) {
      desiredColumn = null;
      return { line, char: pos };
    }
    return { line, char };
  }

  if (pendingKey === "'" || pendingKey === "`") {
    const jumpType = pendingKey;
    pendingKey = null;
    if (key >= "a" && key <= "z" && marks[key]) {
      const [markLine, markChar] = marks[key];
      desiredColumn = null;
      if (jumpType === "'") {
        const targetLineText = getLineText(rep, markLine);
        return { line: markLine, char: firstNonBlank(targetLineText) };
      }
      return { line: markLine, char: markChar };
    }
    return { line, char };
  }

  if (pendingKey === "g") {
    pendingKey = null;
    if (key === "g") {
      desiredColumn = null;
      if (pendingCount !== null) {
        return { line: clampLine(pendingCount - 1, rep), char: 0 };
      }
      return { line: 0, char: 0 };
    }
  }

  if (key === "h") {
    desiredColumn = null;
    return { line, char: Math.max(0, char - count) };
  }

  if (key === "l") {
    desiredColumn = null;
    return { line, char: clampChar(char + count, lineText) };
  }

  if (key === "j") {
    if (desiredColumn === null) desiredColumn = char;
    const newLine = clampLine(line + count, rep);
    const newLineText = getLineText(rep, newLine);
    return { line: newLine, char: clampChar(desiredColumn, newLineText) };
  }

  if (key === "k") {
    if (desiredColumn === null) desiredColumn = char;
    const newLine = clampLine(line - count, rep);
    const newLineText = getLineText(rep, newLine);
    return { line: newLine, char: clampChar(desiredColumn, newLineText) };
  }

  if (key === "w") {
    desiredColumn = null;
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordForward(lineText, pos);
    return { line, char: clampChar(pos, lineText) };
  }

  if (key === "b") {
    desiredColumn = null;
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordBackward(lineText, pos);
    return { line, char: pos };
  }

  if (key === "e") {
    desiredColumn = null;
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordEnd(lineText, pos);
    return { line, char: clampChar(pos, lineText) };
  }

  if (key === "0") {
    desiredColumn = null;
    return { line, char: 0 };
  }

  if (key === "$") {
    desiredColumn = null;
    return { line, char: clampChar(lineText.length - 1, lineText) };
  }

  if (key === "^") {
    desiredColumn = null;
    return { line, char: firstNonBlank(lineText) };
  }

  if (key === "}") {
    desiredColumn = null;
    return { line: paragraphForward(rep, line, count), char: 0 };
  }

  if (key === "{") {
    desiredColumn = null;
    return { line: paragraphBackward(rep, line, count), char: 0 };
  }

  if (key === "G") {
    desiredColumn = null;
    if (pendingCount !== null) {
      return { line: clampLine(pendingCount - 1, rep), char: 0 };
    }
    return { line: rep.lines.length() - 1, char: 0 };
  }

  if (key === ";") {
    if (lastCharSearch) {
      const pos = charSearchPos(
        lastCharSearch.direction,
        lineText,
        char,
        lastCharSearch.target,
        count,
      );
      if (pos !== -1) {
        desiredColumn = null;
        return { line, char: pos };
      }
    }
    return { line, char };
  }

  if (key === ",") {
    if (lastCharSearch) {
      const opposite = { f: "F", F: "f", t: "T", T: "t" };
      const reverseDir = opposite[lastCharSearch.direction];
      const pos = charSearchPos(
        reverseDir,
        lineText,
        char,
        lastCharSearch.target,
        count,
      );
      if (pos !== -1) {
        desiredColumn = null;
        return { line, char: pos };
      }
    }
    return { line, char };
  }

  if (key === "f" || key === "F" || key === "t" || key === "T") {
    pendingKey = key;
    return "pending";
  }

  if (key === "'" || key === "`") {
    pendingKey = key;
    return "pending";
  }

  if (key === "g") {
    pendingKey = "g";
    return "pending";
  }

  if (key === "%") {
    const pos = matchingBracketPos(rep, line, char);
    if (pos) {
      desiredColumn = null;
      return { line: pos.line, char: pos.char };
    }
    return { line, char };
  }

  if (key === "H") {
    desiredColumn = null;
    const { top } = getVisibleLineRange(rep);
    const targetLine = clampLine(top + count - 1, rep);
    const targetText = getLineText(rep, targetLine);
    return { line: targetLine, char: firstNonBlank(targetText) };
  }

  if (key === "M") {
    desiredColumn = null;
    const { mid } = getVisibleLineRange(rep);
    const targetText = getLineText(rep, mid);
    return { line: mid, char: firstNonBlank(targetText) };
  }

  if (key === "L") {
    desiredColumn = null;
    const { bottom } = getVisibleLineRange(rep);
    const targetLine = clampLine(bottom - count + 1, rep);
    const targetText = getLineText(rep, targetLine);
    return { line: targetLine, char: firstNonBlank(targetText) };
  }

  return null;
};

// --- Apply motion (mode-aware cursor placement) ---

const applyMotion = (editorInfo, rep, newLine, newChar) => {
  if (visualMode !== null) {
    visualCursor = [newLine, newChar];
    updateVisualSelection(editorInfo, rep);
  } else {
    moveBlockCursor(editorInfo, newLine, newChar);
  }

  if (editorDoc) {
    const lineDiv = editorDoc.body.querySelectorAll("div")[newLine];
    if (lineDiv) lineDiv.scrollIntoView({ block: "nearest" });
  }
};

// --- Line deletion helper ---

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

// --- Operator application ---

const applyCharOperator = (operator, start, end, editorInfo, rep) => {
  if (start[0] === end[0]) {
    const lineText = getLineText(rep, start[0]);
    setRegister(lineText.slice(start[1], end[1]));
  } else {
    setRegister(getTextInRange(rep, start, end));
  }
  if (operator === "y") {
    moveBlockCursor(editorInfo, start[0], start[1]);
    return;
  }
  replaceRange(editorInfo, start, end, "");
  if (operator === "c") {
    moveCursor(editorInfo, start[0], start[1]);
    setInsertMode(true);
  } else {
    const newLineText = getLineText(rep, start[0]);
    moveBlockCursor(editorInfo, start[0], clampChar(start[1], newLineText));
  }
};

const applyLineOperator = (
  operator,
  topLine,
  bottomLine,
  editorInfo,
  rep,
  char,
) => {
  const lines = [];
  for (let i = topLine; i <= bottomLine; i++) {
    lines.push(getLineText(rep, i));
  }
  setRegister(lines);
  if (operator === "y") {
    moveBlockCursor(editorInfo, topLine, 0);
    return;
  }
  if (operator === "c") {
    for (let i = topLine; i <= bottomLine; i++) {
      const text = getLineText(rep, i);
      replaceRange(editorInfo, [topLine, 0], [topLine, text.length], "");
    }
    moveCursor(editorInfo, topLine, 0);
    setInsertMode(true);
    return;
  }
  const cursorLine = deleteLines(editorInfo, rep, topLine, bottomLine);
  const newLineText = getLineText(rep, cursorLine);
  moveBlockCursor(editorInfo, cursorLine, clampChar(char, newLineText));
};

// --- Unified key handler ---

const handleKey = (rep, editorInfo, key) => {
  const inVisual = visualMode !== null;
  const line = inVisual ? visualCursor[0] : rep.selStart[0];
  const char = inVisual ? visualCursor[1] : rep.selStart[1];
  const lineText = getLineText(rep, line);

  if (key >= "1" && key <= "9") {
    countBuffer += key;
    return true;
  }
  if (key === "0" && countBuffer !== "") {
    countBuffer += key;
    return true;
  }

  consumeCount();
  const count = getCount();

  // --- Normal-only pending states: r + char, m + letter ---

  if (pendingKey === "r") {
    pendingKey = null;
    if (lineText.length > 0) {
      replaceRange(editorInfo, [line, char], [line, char + 1], key);
      moveBlockCursor(editorInfo, line, char);
    }
    return true;
  }

  if (pendingKey === "m") {
    pendingKey = null;
    if (key >= "a" && key <= "z") {
      marks[key] = [line, char];
    }
    return true;
  }

  // --- Operator-pending: resolve target ---

  if (pendingOperator !== null) {
    const op = pendingOperator;

    if (key === op) {
      pendingOperator = null;
      const lineCount = rep.lines.length();
      const opCount = Math.min(count, lineCount - line);
      const lastLine = line + opCount - 1;
      applyLineOperator(op, line, lastLine, editorInfo, rep, char);
      return true;
    }

    if (pendingKey === "i" || pendingKey === "a") {
      const type = pendingKey;
      pendingKey = null;
      pendingOperator = null;
      const range = resolveTextObject(key, type, line, lineText, char, rep);
      if (range) {
        applyCharOperator(
          op,
          [range.startLine, range.startChar],
          [range.endLine, range.endChar],
          editorInfo,
          rep,
        );
      }
      return true;
    }

    if (
      pendingKey === "f" ||
      pendingKey === "F" ||
      pendingKey === "t" ||
      pendingKey === "T"
    ) {
      const direction = pendingKey;
      pendingKey = null;
      pendingOperator = null;
      lastCharSearch = { direction, target: key };
      const pos = charSearchPos(direction, lineText, char, key, count);
      if (pos !== -1) {
        const range = charMotionRange(direction, char, pos);
        if (range) {
          applyCharOperator(
            op,
            [line, range.start],
            [line, range.end],
            editorInfo,
            rep,
          );
        }
      }
      return true;
    }

    if (key === "i" || key === "a") {
      pendingKey = key;
      return true;
    }

    if (key === "f" || key === "F" || key === "t" || key === "T") {
      pendingKey = key;
      return true;
    }

    if (key === "%") {
      pendingOperator = null;
      const matchPos = matchingBracketPos(rep, line, char);
      if (matchPos) {
        let start, end;
        if (
          matchPos.line > line ||
          (matchPos.line === line && matchPos.char > char)
        ) {
          start = [line, char];
          end = [matchPos.line, matchPos.char + 1];
        } else {
          start = [matchPos.line, matchPos.char];
          end = [line, char + 1];
        }
        applyCharOperator(op, start, end, editorInfo, rep);
      }
      return true;
    }

    pendingOperator = null;
    const range = motionRange(key, char, lineText, count);
    if (range && range.end > range.start) {
      applyCharOperator(
        op,
        [line, range.start],
        [line, range.end],
        editorInfo,
        rep,
      );
    }
    return true;
  }

  // --- Text object in visual mode (i/a + object key) ---

  if (inVisual && (pendingKey === "i" || pendingKey === "a")) {
    const type = pendingKey;
    pendingKey = null;
    const range = resolveTextObject(key, type, line, lineText, char, rep);
    if (range) {
      visualAnchor = [range.startLine, range.startChar];
      visualCursor = [range.endLine, range.endChar];
      setVisualMode("char");
      updateVisualSelection(editorInfo, rep);
    }
    return true;
  }

  // --- Motions (shared between normal and visual) ---

  const motion = resolveMotion(key, line, char, lineText, rep, count);
  if (motion === "pending") return true;
  if (motion) {
    applyMotion(editorInfo, rep, motion.line, motion.char);
    return true;
  }

  // --- Operators (d/c/y) ---

  if (key === "d" || key === "c" || key === "y") {
    if (inVisual) {
      if (visualMode === "char") {
        const [start, end] = getVisualSelection(
          visualMode,
          visualAnchor,
          visualCursor,
          rep,
        );
        setVisualMode(null);
        applyCharOperator(key, start, end, editorInfo, rep);
      } else {
        const topLine = Math.min(visualAnchor[0], visualCursor[0]);
        const bottomLine = Math.max(visualAnchor[0], visualCursor[0]);
        setVisualMode(null);
        applyLineOperator(key, topLine, bottomLine, editorInfo, rep, 0);
      }
      return true;
    }
    pendingOperator = key;
    return true;
  }

  // --- Visual-mode specific ---

  if (inVisual) {
    if (key === "i" || key === "a") {
      pendingKey = key;
      return true;
    }

    if (key === "~") {
      const [start, end] = getVisualSelection(
        visualMode,
        visualAnchor,
        visualCursor,
        rep,
      );
      const text = getTextInRange(rep, start, end);
      let toggled = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        toggled +=
          ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
      }
      replaceRange(editorInfo, start, end, toggled);
      setVisualMode(null);
      moveBlockCursor(editorInfo, start[0], start[1]);
      return true;
    }

    pendingKey = null;
    return false;
  }

  // --- Normal-mode only commands ---

  if (key === "Y") {
    setRegister([lineText]);
    return true;
  }

  if (key === "r") {
    if (lineText.length > 0) pendingKey = "r";
    return true;
  }

  if (key === "m") {
    pendingKey = "m";
    return true;
  }

  if (key === "x") {
    if (lineText.length > 0) {
      const deleteCount = Math.min(count, lineText.length - char);
      replaceRange(editorInfo, [line, char], [line, char + deleteCount], "");
      const newLineText = getLineText(rep, line);
      moveBlockCursor(editorInfo, line, clampChar(char, newLineText));
    }
    return true;
  }

  if (key === "o") {
    replaceRange(
      editorInfo,
      [line, lineText.length],
      [line, lineText.length],
      "\n",
    );
    moveCursor(editorInfo, line + 1, 0);
    setInsertMode(true);
    return true;
  }

  if (key === "O") {
    replaceRange(editorInfo, [line, 0], [line, 0], "\n");
    moveCursor(editorInfo, line, 0);
    setInsertMode(true);
    return true;
  }

  if (key === "u") {
    undo(editorInfo);
    return true;
  }

  if (key === "p") {
    if (register !== null) {
      if (typeof register === "string") {
        const insertPos = Math.min(char + 1, lineText.length);
        const repeated = register.repeat(count);
        replaceRange(
          editorInfo,
          [line, insertPos],
          [line, insertPos],
          repeated,
        );
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
    }
    return true;
  }

  if (key === "P") {
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
    }
    return true;
  }

  if (key === "J") {
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
    return true;
  }

  if (key === "~") {
    if (lineText.length > 0) {
      const toggleCount = Math.min(count, lineText.length - char);
      const slice = lineText.slice(char, char + toggleCount);
      let toggled = "";
      for (let i = 0; i < slice.length; i++) {
        const ch = slice[i];
        toggled +=
          ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
      }
      replaceRange(
        editorInfo,
        [line, char],
        [line, char + toggleCount],
        toggled,
      );
      const newChar = Math.min(char + toggleCount, lineText.length - 1);
      moveBlockCursor(editorInfo, line, newChar);
    }
    return true;
  }

  if (key === "D") {
    setRegister(lineText.slice(char));
    replaceRange(editorInfo, [line, char], [line, lineText.length], "");
    const newLineText = getLineText(rep, line);
    moveBlockCursor(editorInfo, line, clampChar(char, newLineText));
    return true;
  }

  if (key === "C") {
    setRegister(lineText.slice(char));
    replaceRange(editorInfo, [line, char], [line, lineText.length], "");
    moveCursor(editorInfo, line, char);
    setInsertMode(true);
    return true;
  }

  if (key === "s") {
    setRegister(lineText.slice(char, char + 1));
    replaceRange(
      editorInfo,
      [line, char],
      [line, Math.min(char + count, lineText.length)],
      "",
    );
    moveCursor(editorInfo, line, char);
    setInsertMode(true);
    return true;
  }

  if (key === "S") {
    setRegister(lineText);
    replaceRange(editorInfo, [line, 0], [line, lineText.length], "");
    moveCursor(editorInfo, line, 0);
    setInsertMode(true);
    return true;
  }

  pendingKey = null;
  return false;
};

// --- Exports ---

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
  if (!editorDoc) {
    editorDoc = evt.target.ownerDocument;
    setInsertMode(insertMode);
  }

  if (evt.key === "Escape") {
    if (insertMode) {
      setInsertMode(false);
      const [line, char] = rep.selStart;
      moveBlockCursor(editorInfo, line, Math.max(0, char - 1));
    }
    if (visualMode !== null) {
      const [vLine, vChar] = visualCursor;
      setVisualMode(null);
      moveBlockCursor(editorInfo, vLine, vChar);
    }
    countBuffer = "";
    pendingKey = null;
    pendingOperator = null;
    pendingCount = null;
    desiredColumn = null;
    evt.preventDefault();
    return true;
  }

  if (insertMode) return false;

  if (pendingKey !== null || pendingOperator !== null) {
    const handled = handleKey(rep, editorInfo, evt.key);
    evt.preventDefault();
    return handled || true;
  }

  if (visualMode === null) {
    if (evt.key === "i") {
      const [line, char] = rep.selStart;
      desiredColumn = null;
      moveCursor(editorInfo, line, char);
      setInsertMode(true);
      evt.preventDefault();
      return true;
    }

    if (evt.key === "a") {
      const [line, char] = rep.selStart;
      const lineText = getLineText(rep, line);
      desiredColumn = null;
      moveCursor(editorInfo, line, Math.min(char + 1, lineText.length));
      setInsertMode(true);
      evt.preventDefault();
      return true;
    }

    if (evt.key === "A") {
      const [line] = rep.selStart;
      const lineText = getLineText(rep, line);
      desiredColumn = null;
      moveCursor(editorInfo, line, lineText.length);
      setInsertMode(true);
      evt.preventDefault();
      return true;
    }

    if (evt.key === "I") {
      const [line] = rep.selStart;
      const lineText = getLineText(rep, line);
      desiredColumn = null;
      moveCursor(editorInfo, line, firstNonBlank(lineText));
      setInsertMode(true);
      evt.preventDefault();
      return true;
    }

    if (evt.key === "V") {
      const [line] = rep.selStart;
      visualAnchor = [line, 0];
      visualCursor = [line, 0];
      setVisualMode("line");
      updateVisualSelection(editorInfo, rep);
      evt.preventDefault();
      return true;
    }

    if (evt.key === "v") {
      const [line, char] = rep.selStart;
      visualAnchor = [line, char];
      visualCursor = [line, char];
      setVisualMode("char");
      updateVisualSelection(editorInfo, rep);
      evt.preventDefault();
      return true;
    }
  }

  const handled = handleKey(rep, editorInfo, evt.key);
  evt.preventDefault();
  return handled || true;
};
