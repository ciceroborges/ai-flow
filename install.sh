#!/usr/bin/env bash
# Instala o AI Squad globalmente em ~/.claude via symlinks
# (editar os arquivos neste repo atualiza a instalação na hora).
# Uso: ./install.sh            instala
#      ./install.sh --uninstall remove
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"

mkdir -p "$DEST/agents" "$DEST/skills"

link() {
  local from="$1" to="$2"
  if [ -e "$to" ] && [ ! -L "$to" ]; then
    echo "AVISO: $to existe e não é symlink — pulando"
    return
  fi
  ln -sfn "$from" "$to"
  echo "ok  $to -> $from"
}

unlink_if_ours() {
  local to="$1"
  if [ -L "$to" ] && [[ "$(readlink "$to")" == "$SRC"/* ]]; then
    rm "$to" && echo "rm  $to"
  fi
}

for f in "$SRC"/agents/*.md; do
  target="$DEST/agents/$(basename "$f")"
  if [ "${1:-}" = "--uninstall" ]; then unlink_if_ours "$target"; else link "$f" "$target"; fi
done

for d in "$SRC"/skills/*/; do
  d="${d%/}"
  target="$DEST/skills/$(basename "$d")"
  if [ "${1:-}" = "--uninstall" ]; then unlink_if_ours "$target"; else link "$d" "$target"; fi
done
