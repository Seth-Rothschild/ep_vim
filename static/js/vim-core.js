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

const paragraphForward = (rep, startLine, count) => {
  const totalLines = rep.lines.length();
  let line = startLine;
  let found = 0;
  while (found < count && line < totalLines - 1) {
    line++;
    if (getLineText(rep, line).length === 0) found++;
  }
  if (found < count) line = totalLines - 1;
  return line;
};

const paragraphBackward = (rep, startLine, count) => {
  let line = startLine;
  let found = 0;
  while (found < count && line > 0) {
    line--;
    if (getLineText(rep, line).length === 0) found++;
  }
  if (found < count) line = 0;
  return line;
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
    end = pos + 1;
  } else if (motion === "F") {
    start = pos;
    end = char + 1;
  } else if (motion === "T") {
    start = pos;
    end = char;
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

const textWordRange = (lineText, char, type) => {
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
  if (type === "i") {
    return { start, end: end + 1 };
  } else {
    if (isWhitespace(ch)) {
      while (start > 0 && isWhitespace(lineText[start - 1])) start--;
      while (end + 1 < lineText.length && isWhitespace(lineText[end + 1]))
        end++;
    }
    return { start, end: end + 1 };
  }
};

const BRACKET_PAIRS = {
  "(": ")",
  ")": "(",
  "{": "}",
  "}": "{",
  "[": "]",
  "]": "[",
};
const OPEN_BRACKETS = new Set(["(", "{", "["]);

const textQuoteRange = (lineText, char, quote, type) => {
  const first = lineText.indexOf(quote);
  if (first === -1) return null;
  const second = lineText.indexOf(quote, first + 1);
  if (second === -1) return null;
  if (char < first || char > second) return null;
  if (type === "i") {
    return { start: first + 1, end: second };
  } else {
    return { start: first, end: second + 1 };
  }
};

const textBracketRange = (lineText, char, bracket, type) => {
  const open = OPEN_BRACKETS.has(bracket) ? bracket : BRACKET_PAIRS[bracket];
  const close = BRACKET_PAIRS[open];
  let depth = 0;
  let openPos = -1;
  for (let i = char; i >= 0; i--) {
    if (lineText[i] === close && i !== char) depth++;
    if (lineText[i] === open) {
      if (depth === 0) {
        openPos = i;
        break;
      }
      depth--;
    }
  }
  if (openPos === -1) return null;
  depth = 0;
  for (let i = openPos + 1; i < lineText.length; i++) {
    if (lineText[i] === open) depth++;
    if (lineText[i] === close) {
      if (depth === 0) {
        if (type === "i") {
          return { start: openPos + 1, end: i };
        } else {
          return { start: openPos, end: i + 1 };
        }
      }
      depth--;
    }
  }
  return null;
};

const getFullText = (rep) => {
  const lines = [];
  for (let i = 0; i < rep.lines.length(); i++) {
    lines.push(getLineText(rep, i));
  }
  return lines.join("\n");
};

const posToAbsolute = (rep, line, char) => {
  let pos = 0;
  for (let i = 0; i < line; i++) {
    pos += getLineText(rep, i).length + 1;
  }
  return pos + char;
};

const absoluteToPos = (rep, absPos) => {
  let pos = 0;
  const totalLines = rep.lines.length();
  for (let i = 0; i < totalLines; i++) {
    const lineLen = getLineText(rep, i).length;
    if (pos + lineLen + 1 > absPos) {
      return [i, absPos - pos];
    }
    pos += lineLen + 1;
  }
  return [totalLines - 1, getLineText(rep, totalLines - 1).length];
};

const searchForward = (rep, fromLine, fromChar, pattern, count = 1) => {
  if (!pattern || pattern.length === 0) return null;
  const text = getFullText(rep);
  let currentPos = posToAbsolute(rep, fromLine, fromChar);
  let matchPos = -1;
  for (let i = 0; i < count; i++) {
    matchPos = text.indexOf(pattern, currentPos);
    if (matchPos !== -1) {
      currentPos = matchPos + pattern.length;
    } else {
      matchPos = text.indexOf(pattern);
      if (matchPos !== -1) {
        currentPos = matchPos + pattern.length;
      } else {
        return null;
      }
    }
  }
  return absoluteToPos(rep, matchPos);
};

const searchBackward = (rep, fromLine, fromChar, pattern, count = 1) => {
  if (!pattern || pattern.length === 0) return null;
  const text = getFullText(rep);
  let currentPos = posToAbsolute(rep, fromLine, fromChar);
  let matchPos = -1;
  for (let i = 0; i < count; i++) {
    if (currentPos > 0) {
      matchPos = text.lastIndexOf(pattern, currentPos - 1);
      if (matchPos !== -1) {
        currentPos = matchPos;
        continue;
      }
    }
    matchPos = text.lastIndexOf(pattern);
    if (matchPos !== -1) {
      currentPos = matchPos;
    } else {
      return null;
    }
  }
  return absoluteToPos(rep, matchPos);
};

const offsetToPos = (rep, offset) => {
  const totalLines = rep.lines.length();
  for (let i = 0; i < totalLines; i++) {
    const lineStart = rep.lines.offsetOfIndex(i);
    const lineLen = getLineText(rep, i).length;
    if (offset >= lineStart && offset < lineStart + lineLen) {
      return { line: i, char: offset - lineStart };
    }
  }
  return null;
};

const matchingBracketPos = (rep, line, char) => {
  const lineText = getLineText(rep, line);
  let bracketChar = -1;
  let bracket = null;
  for (let i = char; i < lineText.length; i++) {
    if (lineText[i] in BRACKET_PAIRS) {
      bracketChar = i;
      bracket = lineText[i];
      break;
    }
  }
  if (bracketChar === -1) return null;
  const isOpen = OPEN_BRACKETS.has(bracket);
  const match = BRACKET_PAIRS[bracket];
  const startOffset = rep.lines.offsetOfIndex(line) + bracketChar;
  const alltext = rep.alltext;
  let depth = 0;
  if (isOpen) {
    for (let i = startOffset; i < alltext.length; i++) {
      if (alltext[i] === bracket) depth++;
      else if (alltext[i] === match) {
        depth--;
        if (depth === 0) return offsetToPos(rep, i);
      }
    }
  } else {
    for (let i = startOffset; i >= 0; i--) {
      if (alltext[i] === bracket) depth++;
      else if (alltext[i] === match) {
        depth--;
        if (depth === 0) return offsetToPos(rep, i);
      }
    }
  }
  return null;
};

const paragraphTextRange = (rep, line, type) => {
  const totalLines = rep.lines.length();
  const lineIsBlank = (l) => getLineText(rep, l).length === 0;
  const onBlank = lineIsBlank(line);
  let start = line;
  while (start > 0 && lineIsBlank(start - 1) === onBlank) start--;
  let end = line;
  while (end < totalLines - 1 && lineIsBlank(end + 1) === onBlank) end++;
  if (type === "i") {
    return {
      startLine: start,
      startChar: 0,
      endLine: end,
      endChar: getLineText(rep, end).length,
    };
  }
  if (!onBlank) {
    let trailingEnd = end;
    while (trailingEnd < totalLines - 1 && lineIsBlank(trailingEnd + 1))
      trailingEnd++;
    if (trailingEnd > end) {
      return {
        startLine: start,
        startChar: 0,
        endLine: trailingEnd,
        endChar: getLineText(rep, trailingEnd).length,
      };
    }
    let leadingStart = start;
    while (leadingStart > 0 && lineIsBlank(leadingStart - 1)) leadingStart--;
    return {
      startLine: leadingStart,
      startChar: 0,
      endLine: end,
      endChar: getLineText(rep, end).length,
    };
  }
  let paraEnd = end;
  while (paraEnd < totalLines - 1 && !lineIsBlank(paraEnd + 1)) paraEnd++;
  return {
    startLine: start,
    startChar: 0,
    endLine: paraEnd,
    endChar: getLineText(rep, paraEnd).length,
  };
};

const sentenceTextRange = (lineText, char, type) => {
  const isTerminator = (ch) => ch === "." || ch === "!" || ch === "?";
  let start = 0;
  for (let i = char - 1; i >= 0; i--) {
    if (isTerminator(lineText[i])) {
      let j = i + 1;
      while (j < lineText.length && lineText[j] === " ") j++;
      start = j;
      break;
    }
  }
  let end = lineText.length;
  for (let i = char; i < lineText.length; i++) {
    if (isTerminator(lineText[i])) {
      end = i + 1;
      break;
    }
  }
  if (type === "i") {
    let s = start;
    let e = end;
    while (s < e && lineText[s] === " ") s++;
    while (e > s && lineText[e - 1] === " ") e--;
    return { start: s, end: e };
  }
  let e = end;
  while (e < lineText.length && lineText[e] === " ") e++;
  return { start, end: e };
};

const getTextInRange = (rep, start, end, type) => {
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
  getFullText,
  posToAbsolute,
  absoluteToPos,
  searchForward,
  searchBackward,
};
