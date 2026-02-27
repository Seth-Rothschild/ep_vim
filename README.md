# ep_vim

[![npm](https://img.shields.io/npm/v/ep_vim)](https://www.npmjs.com/package/ep_vim)
[![GitHub](https://img.shields.io/badge/github-Seth--Rothschild%2Fep__vim-blue?logo=github)](https://github.com/Seth-Rothschild/ep_vim)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue)](https://www.gnu.org/licenses/gpl-3.0)

A vim-mode plugin for [Etherpad](https://etherpad.org/). Adds modal editing with normal, insert, and visual modes to the pad editor.  Mostly vibe coded with [Claude Code](https://claude.ai/claude-code).

## Features

- **Modal editing** — normal, insert, and visual (char + line) modes
- **Motions** — `h` `j` `k` `l`, `w` `b` `e`, `0` `$` `^`, `gg` `G`, `f`/`F`/`t`/`T` char search, `{` `}` paragraph forward/backward, `H` `M` `L` viewport (top/middle/bottom)
- **Char search** — `f`/`F`/`t`/`T` find, `;` repeat last search, `,` reverse direction
- **Bracket matching** — `%` jump to matching bracket
- **Text objects** — `iw`/`aw` (word), `i"`/`a"` and `i'`/`a'` (quotes), `i{`/`a{` etc. (brackets), `ip`/`ap` (paragraph), `is`/`as` (sentence)
- **Operators** — `d`, `c`, `y` with motion and text object combinations (`dw`, `ce`, `y$`, `ciw`, `da"`, `yi(`, etc.)
- **Line operations** — `dd`, `cc`, `yy`, `J` (join), `Y` (yank line)
- **Put** — `p` / `P` with linewise and characterwise register handling
- **Editing** — `x`, `r`, `s`, `S`, `C`, `o`, `O`, `~` (toggle case)
- **Marks** — `m{a-z}` to set, `'{a-z}` / `` `{a-z} `` to jump
- **Counts** — numeric prefixes work with motions and operators
- **Undo** — `u`
- **Toggle** — toolbar button to enable/disable vim mode, persisted in localStorage

## Installation

Clone or symlink into your Etherpad plugins directory, then install:

```
pnpm install ep_vim
```


## License

GPL-3.0
