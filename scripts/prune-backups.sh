#!/usr/bin/env bash
# ============================================================
#  Prune old server backups in /srv/sf-backups/
#  ------------------------------------------------------------
#  docs/DEPLOY.md, "Deploy order", step 1: run as the site user, and
#  only after the new dist backup has been written. Backups are kept
#  short-lived on purpose: a database dump holds contact-form leads
#  (names, phone numbers, email addresses).
#
#  Rules, top level of the folder only:
#    dist.bak-*/        keep the newest 5, delete the rest
#    .env.bak*          delete anything older than 30 days, but always
#    db-backup-*.sql    keep the newest one of each kind, however old,
#    sf-schema-*.sql    so there is always a rollback point
#
#  A backup's date is the one in its name (20261013-1200, or 2026-10-13)
#  and only a name without one falls back to the modification time,
#  because `cp -a` stamps the copy with the source's time. Symbolic
#  links are never followed or deleted, and anything that is not one of
#  the four kinds (uploaded media included) is left alone. Every
#  decision is printed.
#
#  Refuses, deleting nothing, unless the folder is /srv/sf-backups
#  itself; a test folder needs --test-dir and must be outside /srv.
#
#  Usage:  bash scripts/prune-backups.sh [--dry-run] /srv/sf-backups
#          bash scripts/prune-backups.sh [--dry-run] --test-dir <folder>
#  Exit:   0 done, 1 a deletion failed, 2 refused and nothing deleted
# ============================================================
set -uo pipefail

readonly BACKUP_DIR=/srv/sf-backups
readonly KEEP_DIST=5
readonly MAX_AGE_DAYS=30

refuse() {
  printf 'prune-backups: %s. Nothing deleted.\n' "$1" >&2
  exit 2
}

dry_run=0
test_dir=0
target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --test-dir) test_dir=1 ;;
    -h | --help)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    -*) refuse "unknown option $1" ;;
    *)
      [ -z "$target" ] || refuse "give one folder, not several"
      target=$1
      ;;
  esac
  shift
done

# --- the folder --------------------------------------------------------
[ -n "$target" ] || refuse "no folder given (usage: prune-backups.sh [--dry-run] $BACKUP_DIR)"
# A trailing slash would make the symlink test look through the link.
while [ "$target" != / ] && [ "${target%/}" != "$target" ]; do target=${target%/}; done
[ -L "$target" ] && refuse "$target is a symbolic link"
[ -d "$target" ] || refuse "$target does not exist or is not a folder"
dir=$(realpath -e -- "$target") || refuse "cannot resolve $target"
if [ "$test_dir" -eq 1 ]; then
  case "$dir/" in
    /srv/* | //) refuse "--test-dir takes a folder outside /srv, and $dir is not" ;;
  esac
else
  [ "$dir" = "$BACKUP_DIR" ] || refuse "$target is not $BACKUP_DIR (a test folder needs --test-dir)"
fi

now=$(date +%s)
max_age=$((MAX_AGE_DAYS * 86400))

if [ "$dry_run" -eq 1 ]; then
  printf 'prune-backups: %s (DRY RUN, nothing will be deleted)\n' "$dir"
else
  printf 'prune-backups: %s\n' "$dir"
fi

# --- what is there -----------------------------------------------------
dist=() env=() dump=() schema=()
skipped=0
others=0
date_re='([0-9]{4})-?([0-9]{2})-?([0-9]{2})([-_T]([0-9]{2})([0-9]{2})([0-9]{2})?)?'

while IFS= read -r -d '' path; do
  name=${path##*/}
  case "$name" in
    dist.bak-*) kind=dist want=d ;;
    .env.bak*) kind=env want=f ;;
    db-backup-*.sql) kind=dump want=f ;;
    sf-schema-*.sql) kind=schema want=f ;;
    *)
      others=$((others + 1))
      continue
      ;;
  esac
  why=""
  if [ -L "$path" ]; then
    why="symbolic link, never followed or deleted"
  elif [ "$want" = d ] && [ ! -d "$path" ]; then
    why="not a folder"
  elif [ "$want" = f ] && [ ! -f "$path" ]; then
    why="not a regular file"
  elif [[ $name == *$'\t'* || $name == *$'\n'* ]]; then
    why="tab or newline in the name"
  fi
  if [ -n "$why" ]; then
    printf '  skip    %s  (%s)\n' "$name" "$why"
    skipped=$((skipped + 1))
    continue
  fi
  stamp="" source=""
  if [[ $name =~ $date_re ]]; then
    m=("${BASH_REMATCH[@]}")
    stamp=$(date -d "${m[1]}-${m[2]}-${m[3]} ${m[5]:-00}:${m[6]:-00}:${m[7]:-00}" +%s 2>/dev/null) && source=name
  fi
  if [ -z "$source" ]; then
    stamp=$(stat -c %Y -- "$path") && source=mtime || {
      printf '  skip    %s  (cannot read its date)\n' "$name"
      skipped=$((skipped + 1))
      continue
    }
  fi
  entry=$(printf '%s\t%s\t%s' "$stamp" "$source" "$name")
  case "$kind" in
    dist) dist+=("$entry") ;;
    env) env+=("$entry") ;;
    dump) dump+=("$entry") ;;
    schema) schema+=("$entry") ;;
  esac
done < <(find "$dir" -mindepth 1 -maxdepth 1 -print0)

# --- deciding and deleting ---------------------------------------------
deleted=0
kept=0
failed=0

newest_first() { [ $# -eq 0 ] || printf '%s\n' "$@" | sort -t $'\t' -k1,1nr -k3,3r; }

# act KEEP|DELETE <name> <stamp> <source> <reason>
act() {
  local verb=$1 name=$2 stamp=$3 source=$4 reason=$5 when path
  when=$(date -d "@$stamp" '+%Y-%m-%d %H:%M')
  path="$dir/$name"
  if [ "$verb" = KEEP ]; then
    printf '  keep    %-34s %s (%s)  %s\n' "$name" "$when" "$source" "$reason"
    kept=$((kept + 1))
  elif [ "$dry_run" -eq 1 ]; then
    printf '  WOULD DELETE  %-28s %s (%s)  %s\n' "$name" "$when" "$source" "$reason"
    deleted=$((deleted + 1))
  elif [ -L "$path" ]; then
    printf '  skip    %s  (became a symbolic link; not deleted)\n' "$name"
    skipped=$((skipped + 1))
  elif rm -rf --one-file-system -- "$path"; then
    printf '  DELETED %-34s %s (%s)  %s\n' "$name" "$when" "$source" "$reason"
    deleted=$((deleted + 1))
  else
    printf '  FAILED  %-34s could not be deleted\n' "$name"
    failed=$((failed + 1))
  fi
}

prune_dist() {
  local i=0 stamp source name
  printf '\ndist.bak-*: keep the newest %d (%d found)\n' "$KEEP_DIST" $#
  while IFS=$'\t' read -r stamp source name; do
    i=$((i + 1))
    if [ "$i" -le "$KEEP_DIST" ]; then
      act KEEP "$name" "$stamp" "$source" "newest $i of $KEEP_DIST"
    else
      act DELETE "$name" "$stamp" "$source" "not among the newest $KEEP_DIST"
    fi
  done < <(newest_first "$@")
}

prune_aged() {
  local label=$1 i=0 stamp source name age days
  shift
  printf '\n%s: delete older than %d days, always keep the newest (%d found)\n' "$label" "$MAX_AGE_DAYS" $#
  while IFS=$'\t' read -r stamp source name; do
    i=$((i + 1))
    age=$((now - stamp))
    days="$((age / 86400)) days"
    [ "$days" = "1 days" ] && days="1 day"
    if [ "$i" -eq 1 ] && [ "$age" -gt "$max_age" ]; then
      act KEEP "$name" "$stamp" "$source" "$days old, kept anyway: the newest of its kind"
    elif [ "$i" -eq 1 ]; then
      act KEEP "$name" "$stamp" "$source" "newest, $days old"
    elif [ "$age" -gt "$max_age" ]; then
      act DELETE "$name" "$stamp" "$source" "$days old"
    else
      act KEEP "$name" "$stamp" "$source" "$days old"
    fi
  done < <(newest_first "$@")
}

prune_dist "${dist[@]}"
prune_aged ".env.bak*" "${env[@]}"
prune_aged "db-backup-*.sql" "${dump[@]}"
prune_aged "sf-schema-*.sql" "${schema[@]}"

printf '\n'
if [ "$dry_run" -eq 1 ]; then
  printf 'Dry run: would delete %d, keep %d.' "$deleted" "$kept"
else
  printf 'Deleted %d, kept %d.' "$deleted" "$kept"
fi
printf ' Skipped %d. Left alone %d other entries.\n' "$skipped" "$others"
if [ "$failed" -gt 0 ]; then
  printf '%d deletion(s) FAILED.\n' "$failed" >&2
  exit 1
fi
exit 0
