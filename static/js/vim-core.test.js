"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
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
} = require("./vim-core");

const makeRep = (lines) => ({
  lines: {
    length: () => lines.length,
    atIndex: (n) => ({ text: lines[n] }),
  },
});

describe("isWordChar", () => {
  it("returns true for letters", () => {
    assert.equal(isWordChar("a"), true);
    assert.equal(isWordChar("Z"), true);
  });

  it("returns true for digits", () => {
    assert.equal(isWordChar("0"), true);
    assert.equal(isWordChar("9"), true);
  });

  it("returns true for underscore", () => {
    assert.equal(isWordChar("_"), true);
  });

  it("returns false for punctuation and space", () => {
    assert.equal(isWordChar("."), false);
    assert.equal(isWordChar(" "), false);
    assert.equal(isWordChar("-"), false);
  });
});

describe("isWhitespace", () => {
  it("returns true for space and tab", () => {
    assert.equal(isWhitespace(" "), true);
    assert.equal(isWhitespace("\t"), true);
  });

  it("returns false for letters and punctuation", () => {
    assert.equal(isWhitespace("a"), false);
    assert.equal(isWhitespace("."), false);
  });
});

describe("clampLine", () => {
  const rep = makeRep(["a", "b", "c"]);

  it("clamps below zero to zero", () => {
    assert.equal(clampLine(-1, rep), 0);
    assert.equal(clampLine(-100, rep), 0);
  });

  it("clamps above max to last line", () => {
    assert.equal(clampLine(5, rep), 2);
    assert.equal(clampLine(3, rep), 2);
  });

  it("returns value when in range", () => {
    assert.equal(clampLine(0, rep), 0);
    assert.equal(clampLine(1, rep), 1);
    assert.equal(clampLine(2, rep), 2);
  });
});

describe("clampChar", () => {
  it("clamps below zero to zero", () => {
    assert.equal(clampChar(-1, "hello"), 0);
  });

  it("clamps above max to last char index", () => {
    assert.equal(clampChar(10, "hello"), 4);
  });

  it("returns value when in range", () => {
    assert.equal(clampChar(2, "hello"), 2);
  });

  it("clamps to zero for empty string", () => {
    assert.equal(clampChar(0, ""), 0);
  });
});

describe("getLineText", () => {
  it("returns the text of the given line", () => {
    const rep = makeRep(["first", "second", "third"]);
    assert.equal(getLineText(rep, 0), "first");
    assert.equal(getLineText(rep, 1), "second");
    assert.equal(getLineText(rep, 2), "third");
  });
});

describe("firstNonBlank", () => {
  it("returns 0 when no leading whitespace", () => {
    assert.equal(firstNonBlank("hello"), 0);
  });

  it("skips leading spaces", () => {
    assert.equal(firstNonBlank("   hello"), 3);
  });

  it("skips leading tabs", () => {
    assert.equal(firstNonBlank("\t\thello"), 2);
  });

  it("returns length for all-whitespace line", () => {
    assert.equal(firstNonBlank("   "), 3);
  });

  it("returns 0 for empty string", () => {
    assert.equal(firstNonBlank(""), 0);
  });
});

describe("findCharForward", () => {
  it("finds the first occurrence after startChar", () => {
    assert.equal(findCharForward("hello world", 0, "o", 1), 4);
  });

  it("finds the nth occurrence", () => {
    assert.equal(findCharForward("abacada", 0, "a", 1), 2);
    assert.equal(findCharForward("abacada", 0, "a", 2), 4);
    assert.equal(findCharForward("abacada", 0, "a", 3), 6);
  });

  it("returns -1 when not found", () => {
    assert.equal(findCharForward("hello", 0, "z", 1), -1);
  });

  it("returns -1 when count exceeds occurrences", () => {
    assert.equal(findCharForward("hello", 0, "l", 3), -1);
  });

  it("searches only after startChar", () => {
    assert.equal(findCharForward("aba", 1, "a", 1), 2);
  });
});

describe("findCharBackward", () => {
  it("finds the first occurrence before startChar", () => {
    assert.equal(findCharBackward("hello world", 7, "o", 1), 4);
  });

  it("finds the nth occurrence backward", () => {
    assert.equal(findCharBackward("abacada", 6, "a", 1), 4);
    assert.equal(findCharBackward("abacada", 6, "a", 2), 2);
  });

  it("returns -1 when not found", () => {
    assert.equal(findCharBackward("hello", 4, "z", 1), -1);
  });

  it("searches only before startChar", () => {
    assert.equal(findCharBackward("aba", 1, "a", 1), 0);
  });
});

describe("wordForward", () => {
  it("moves past a word to start of next word", () => {
    assert.equal(wordForward("hello world", 0), 6);
  });

  it("moves past punctuation to start of next token", () => {
    assert.equal(wordForward("foo.bar", 0), 3);
  });

  it("skips trailing whitespace", () => {
    assert.equal(wordForward("hello   world", 0), 8);
  });

  it("moves to end of line when no next word", () => {
    assert.equal(wordForward("hello", 0), 5);
  });

  it("moves from whitespace to next word", () => {
    assert.equal(wordForward("  hello", 0), 2);
  });
});

describe("wordBackward", () => {
  it("moves back to start of previous word", () => {
    assert.equal(wordBackward("hello world", 6), 0);
  });

  it("moves back past whitespace", () => {
    assert.equal(wordBackward("hello   world", 8), 0);
  });

  it("stops at start of line", () => {
    assert.equal(wordBackward("hello", 0), 0);
  });

  it("moves to start of current word from middle", () => {
    assert.equal(wordBackward("hello world", 8), 6);
  });
});

describe("wordEnd", () => {
  it("moves to end of current/next word", () => {
    assert.equal(wordEnd("hello world", 0), 4);
  });

  it("skips whitespace then finds end of next word", () => {
    assert.equal(wordEnd("hello world", 4), 10);
  });

  it("moves to end of punctuation run", () => {
    assert.equal(wordEnd("foo...bar", 0), 2);
  });
});

describe("charSearchPos", () => {
  const line = "hello world";

  it("f finds char forward", () => {
    assert.equal(charSearchPos("f", line, 0, "o", 1), 4);
  });

  it("F finds char backward", () => {
    assert.equal(charSearchPos("F", line, 7, "o", 1), 4);
  });

  it("t lands one before the found char", () => {
    assert.equal(charSearchPos("t", line, 0, "o", 1), 3);
  });

  it("T lands one after the found char", () => {
    assert.equal(charSearchPos("T", line, 7, "o", 1), 5);
  });

  it("returns -1 when char not found", () => {
    assert.equal(charSearchPos("f", line, 0, "z", 1), -1);
  });

  it("t returns -1 when char not found", () => {
    assert.equal(charSearchPos("t", line, 0, "z", 1), -1);
  });

  it("respects count for f", () => {
    assert.equal(charSearchPos("f", "ababa", 0, "b", 2), 3);
  });
});

describe("motionRange", () => {
  it("w computes word-forward range", () => {
    const range = motionRange("w", 0, "hello world", 1);
    assert.deepEqual(range, { start: 0, end: 6 });
  });

  it("e computes word-end range (inclusive)", () => {
    const range = motionRange("e", 0, "hello world", 1);
    assert.deepEqual(range, { start: 0, end: 5 });
  });

  it("b computes word-backward range", () => {
    const range = motionRange("b", 6, "hello world", 1);
    assert.deepEqual(range, { start: 0, end: 6 });
  });

  it("$ computes to end of line", () => {
    const range = motionRange("$", 3, "hello world", 1);
    assert.deepEqual(range, { start: 3, end: 11 });
  });

  it("0 computes to start of line", () => {
    const range = motionRange("0", 5, "hello world", 1);
    assert.deepEqual(range, { start: 0, end: 5 });
  });

  it("^ computes to first non-blank", () => {
    const range = motionRange("^", 6, "  hello", 1);
    assert.deepEqual(range, { start: 2, end: 6 });
  });

  it("^ when cursor is before first non-blank", () => {
    const range = motionRange("^", 0, "  hello", 1);
    assert.deepEqual(range, { start: 0, end: 2 });
  });

  it("h computes backward range", () => {
    const range = motionRange("h", 5, "hello world", 2);
    assert.deepEqual(range, { start: 3, end: 5 });
  });

  it("h clamps at start of line", () => {
    const range = motionRange("h", 1, "hello", 5);
    assert.deepEqual(range, { start: 0, end: 1 });
  });

  it("l computes forward range", () => {
    const range = motionRange("l", 3, "hello world", 2);
    assert.deepEqual(range, { start: 3, end: 5 });
  });

  it("l clamps at end of line", () => {
    const range = motionRange("l", 9, "hello world", 5);
    assert.deepEqual(range, { start: 9, end: 11 });
  });

  it("returns null for unknown motion key", () => {
    assert.equal(motionRange("z", 0, "hello", 1), null);
  });

  it("w with count moves multiple words", () => {
    const range = motionRange("w", 0, "one two three", 2);
    assert.deepEqual(range, { start: 0, end: 8 });
  });
});

describe("charMotionRange", () => {
  it("f includes the found char", () => {
    const range = charMotionRange("f", 2, 5);
    assert.deepEqual(range, { start: 2, end: 6 });
  });

  it("t excludes the found char", () => {
    const range = charMotionRange("t", 2, 5);
    assert.deepEqual(range, { start: 2, end: 5 });
  });

  it("F includes cursor char going backward", () => {
    const range = charMotionRange("F", 5, 2);
    assert.deepEqual(range, { start: 2, end: 6 });
  });

  it("T excludes found char going backward", () => {
    const range = charMotionRange("T", 5, 2);
    assert.deepEqual(range, { start: 3, end: 6 });
  });

  it("returns null when end would not exceed start", () => {
    const range = charMotionRange("t", 2, 2);
    assert.equal(range, null);
  });
});

describe("innerWordRange", () => {
  it("selects the whole word when cursor is in the middle", () => {
    assert.deepEqual(innerWordRange("hello world", 2), { start: 0, end: 5 });
  });

  it("selects the whole word when cursor is at the start", () => {
    assert.deepEqual(innerWordRange("hello world", 0), { start: 0, end: 5 });
  });

  it("selects the whole word when cursor is at the end", () => {
    assert.deepEqual(innerWordRange("hello world", 4), { start: 0, end: 5 });
  });

  it("selects a word in the middle of a line", () => {
    assert.deepEqual(innerWordRange("hello world foo", 6), {
      start: 6,
      end: 11,
    });
  });

  it("selects whitespace when cursor is on whitespace", () => {
    assert.deepEqual(innerWordRange("hello   world", 6), { start: 5, end: 8 });
  });

  it("selects a run of punctuation", () => {
    assert.deepEqual(innerWordRange("foo...bar", 3), { start: 3, end: 6 });
  });

  it("returns null for empty string", () => {
    assert.equal(innerWordRange("", 0), null);
  });

  it("returns null when char is out of bounds", () => {
    assert.equal(innerWordRange("hello", 10), null);
  });
});

describe("getVisualSelection", () => {
  const rep = makeRep(["hello", "world", "foo"]);

  it("char mode with anchor before cursor returns [anchor, cursor]", () => {
    const result = getVisualSelection("char", [0, 1], [0, 4], rep);
    assert.deepEqual(result, [
      [0, 1],
      [0, 4],
    ]);
  });

  it("char mode with anchor after cursor returns [cursor, anchor]", () => {
    const result = getVisualSelection("char", [0, 4], [0, 1], rep);
    assert.deepEqual(result, [
      [0, 1],
      [0, 4],
    ]);
  });

  it("char mode across lines orders by line", () => {
    const result = getVisualSelection("char", [1, 2], [0, 3], rep);
    assert.deepEqual(result, [
      [0, 3],
      [1, 2],
    ]);
  });

  it("line mode selects full lines", () => {
    const result = getVisualSelection("line", [0, 0], [1, 0], rep);
    assert.deepEqual(result, [
      [0, 0],
      [2, 0],
    ]);
  });

  it("line mode on last line uses end of line", () => {
    const result = getVisualSelection("line", [2, 0], [2, 0], rep);
    assert.deepEqual(result, [
      [2, 0],
      [2, 3],
    ]);
  });

  it("line mode with reversed anchor/cursor", () => {
    const result = getVisualSelection("line", [1, 0], [0, 0], rep);
    assert.deepEqual(result, [
      [0, 0],
      [2, 0],
    ]);
  });
});

describe("getTextInRange", () => {
  const rep = makeRep(["hello", "world", "foo bar"]);

  it("extracts text within a single line", () => {
    assert.equal(getTextInRange(rep, [0, 1], [0, 4]), "ell");
  });

  it("extracts text across two lines", () => {
    assert.equal(getTextInRange(rep, [0, 3], [1, 3]), "lo\nwor");
  });

  it("extracts text across three lines", () => {
    assert.equal(getTextInRange(rep, [0, 3], [2, 3]), "lo\nworld\nfoo");
  });

  it("extracts full line when range covers it", () => {
    assert.equal(getTextInRange(rep, [1, 0], [1, 5]), "world");
  });
});
