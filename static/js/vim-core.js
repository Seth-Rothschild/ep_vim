"use strict";

const isWordChar = (ch) => /\w/.test(ch);
const isWhitespace = (ch) => /\s/.test(ch);

const clampLine = (line, rep) =>
  Math.max(0, Math.min(line, rep.lines.length() - 1));

const clampChar = (char, lineText) =>
  Math.max(0, Math.min(char, lineText.length - 1));

const getLineText = (rep, line) => rep.lines.atIndex(line).text;

const firstNonBlank = (lineText) => {
  let i = 0;
  while (i < lineText.length && isWhitespace(lineText[i])) i++;
  return i;
};

const findCharForward = (lineText, startChar, targetChar, count) => {
  let found = 0;
  for (let i = startChar + 1; i < lineText.length; i++) {
    if (lineText[i] === targetChar) {
      found++;
      if (found === count) return i;
    }
  }
  return -1;
};

const findCharBackward = (lineText, startChar, targetChar, count) => {
  let found = 0;
  for (let i = startChar - 1; i >= 0; i--) {
    if (lineText[i] === targetChar) {
      found++;
      if (found === count) return i;
    }
  }
  return -1;
};

const wordForward = (lineText, startChar) => {
  let pos = startChar;
  if (pos < lineText.length && isWordChar(lineText[pos])) {
    while (pos < lineText.length && isWordChar(lineText[pos])) pos++;
  } else if (pos < lineText.length && !isWhitespace(lineText[pos])) {
    while (
      pos < lineText.length &&
      !isWordChar(lineText[pos]) &&
      !isWhitespace(lineText[pos])
    )
      pos++;
  }
  while (pos < lineText.length && isWhitespace(lineText[pos])) pos++;
  return pos;
};

const wordBackward = (lineText, startChar) => {
  let pos = startChar - 1;
  while (pos >= 0 && isWhitespace(lineText[pos])) pos--;
  if (pos >= 0 && isWordChar(lineText[pos])) {
    while (pos > 0 && isWordChar(lineText[pos - 1])) pos--;
  } else {
    while (
      pos > 0 &&
      !isWordChar(lineText[pos - 1]) &&
      !isWhitespace(lineText[pos - 1])
    )
      pos--;
  }
  return Math.max(0, pos);
};

const wordEnd = (lineText, startChar) => {
  let pos = startChar + 1;
  while (pos < lineText.length && isWhitespace(lineText[pos])) pos++;
  if (pos < lineText.length && isWordChar(lineText[pos])) {
    while (pos + 1 < lineText.length && isWordChar(lineText[pos + 1])) pos++;
  } else {
    while (
      pos + 1 < lineText.length &&
      !isWordChar(lineText[pos + 1]) &&
      !isWhitespace(lineText[pos + 1])
    )
      pos++;
  }
  return pos;
};

const charSearchPos = (direction, lineText, char, targetChar, count) => {
  let pos = -1;
  if (direction === "f") {
    pos = findCharForward(lineText, char, targetChar, count);
  } else if (direction === "F") {
    pos = findCharBackward(lineText, char, targetChar, count);
  } else if (direction === "t") {
    pos = findCharForward(lineText, char, targetChar, count);
    if (pos !== -1) pos = pos - 1;
  } else if (direction === "T") {
    pos = findCharBackward(lineText, char, targetChar, count);
    if (pos !== -1) pos = pos + 1;
  }
  return pos;
};

const motionRange = (key, char, lineText, count) => {
  let start = -1;
  let end = -1;

  if (key === "w") {
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordForward(lineText, pos);
    start = char;
    end = Math.min(pos, lineText.length);
  } else if (key === "e") {
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordEnd(lineText, pos);
    start = char;
    end = Math.min(pos + 1, lineText.length);
  } else if (key === "b") {
    let pos = char;
    for (let i = 0; i < count; i++) pos = wordBackward(lineText, pos);
    start = pos;
    end = char;
  } else if (key === "$") {
    start = char;
    end = lineText.length;
  } else if (key === "0") {
    start = 0;
    end = char;
  } else if (key === "^") {
    const fnb = firstNonBlank(lineText);
    start = Math.min(char, fnb);
    end = Math.max(char, fnb);
  } else if (key === "h") {
    start = Math.max(0, char - count);
    end = char;
  } else if (key === "l") {
    start = char;
    end = Math.min(char + count, lineText.length);
  }

  if (start === -1) return null;
  return { start, end };
};

const charMotionRange = (motion, char, pos) => {
  let start = char;
  let end = char;
  if (motion === "f") {
    start = char;
    end = pos + 1;
  } else if (motion === "t") {
    start = char;
    end = pos;
  } else if (motion === "F") {
    start = pos;
    end = char + 1;
  } else if (motion === "T") {
    start = pos + 1;
    end = char + 1;
  }
  if (end > start) return { start, end };
  return null;
};

const getVisualSelection = (visualMode, visualAnchor, visualCursor, rep) => {
  if (visualMode === "line") {
    const topLine = Math.min(visualAnchor[0], visualCursor[0]);
    const bottomLine = Math.max(visualAnchor[0], visualCursor[0]);
    const lineCount = rep.lines.length();
    const start = [topLine, 0];
    const end =
      bottomLine + 1 < lineCount
        ? [bottomLine + 1, 0]
        : [bottomLine, getLineText(rep, bottomLine).length];
    return [start, end];
  }
  if (
    visualAnchor[0] < visualCursor[0] ||
    (visualAnchor[0] === visualCursor[0] && visualAnchor[1] <= visualCursor[1])
  ) {
    return [visualAnchor, visualCursor];
  }
  return [visualCursor, visualAnchor];
};

const innerWordRange = (lineText, char) => {
  if (lineText.length === 0 || char >= lineText.length) return null;
  const ch = lineText[char];
  let start = char;
  let end = char;
  if (isWordChar(ch)) {
    while (start > 0 && isWordChar(lineText[start - 1])) start--;
    while (end + 1 < lineText.length && isWordChar(lineText[end + 1])) end++;
  } else if (isWhitespace(ch)) {
    while (start > 0 && isWhitespace(lineText[start - 1])) start--;
    while (end + 1 < lineText.length && isWhitespace(lineText[end + 1])) end++;
  } else {
    while (
      start > 0 &&
      !isWordChar(lineText[start - 1]) &&
      !isWhitespace(lineText[start - 1])
    )
      start--;
    while (
      end + 1 < lineText.length &&
      !isWordChar(lineText[end + 1]) &&
      !isWhitespace(lineText[end + 1])
    )
      end++;
  }
  return { start, end: end + 1 };
};

const getTextInRange = (rep, start, end) => {
  if (start[0] === end[0]) {
    return getLineText(rep, start[0]).slice(start[1], end[1]);
  }
  const parts = [];
  parts.push(getLineText(rep, start[0]).slice(start[1]));
  for (let i = start[0] + 1; i < end[0]; i++) {
    parts.push(getLineText(rep, i));
  }
  parts.push(getLineText(rep, end[0]).slice(0, end[1]));
  return parts.join("\n");
};

module.exports = {
  isWordChar,
  isWhitespace,
  clampLine,
  clampChar,
  getLineText,
  firstNonBlank,
  findCharForward,
  findCharBackward,
  wordForward,
  wordBackward,
  wordEnd,
  charSearchPos,
  motionRange,
  charMotionRange,
  innerWordRange,
  getVisualSelection,
  getTextInRange,
};
