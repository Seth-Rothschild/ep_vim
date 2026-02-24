# ep_vim

A vim-mode plugin for [Etherpad](https://etherpad.org/). Adds modal editing with normal, insert, and visual modes to the pad editor.  Mostly vibe coded with [Claude Code](https://claude.ai/claude-code).

## Features

- **Modal editing** — normal, insert, and visual (char + line) modes
- **Motions** — `h` `j` `k` `l`, `w` `b` `e`, `0` `$` `^`, `gg` `G`, `f`/`F`/`t`/`T` char search
- **Operators** — `d`, `c`, `y` with motion combinations (`dw`, `ce`, `y$`, etc.) and text objects (`ciw`, `diw`)
- **Line operations** — `dd`, `cc`, `yy`, `J` (join), `Y` (yank line)
- **Put** — `p` / `P` with linewise and characterwise register handling
- **Editing** — `x`, `r`, `s`, `S`, `C`, `o`, `O`
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
