#!/usr/bin/env bash
# Week 3 route verification. Tests routing, auth-gating, validation, and CORS
# against a live server — all paths that execute BEFORE any DB query, so no
# Postgres is required. Run: bash scripts/verify-routes.sh [port]
set -u
BASE="http://localhost:${1:-4399}"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "[PASS] $label (got $actual)"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "── Auth gating (no token → 401) ──"
check "GET /api/auth/me"            401 "$(code $BASE/api/auth/me)"
check "GET /api/projects"           401 "$(code $BASE/api/projects)"
check "POST /api/projects"          401 "$(code -X POST -H 'content-type: application/json' -d '{}' $BASE/api/projects)"
check "GET /api/projects/abc"       401 "$(code $BASE/api/projects/abc)"
check "POST /api/projects/abc/members" 401 "$(code -X POST -H 'content-type: application/json' -d '{}' $BASE/api/projects/abc/members)"
check "DELETE /api/projects/abc/members/xyz" 401 "$(code -X DELETE $BASE/api/projects/abc/members/xyz)"
check "PATCH /api/bugs/abc"         401 "$(code -X PATCH -H 'content-type: application/json' -d '{}' $BASE/api/bugs/abc)"
check "POST /api/bugs/abc/comments" 401 "$(code -X POST -H 'content-type: application/json' -d '{}' $BASE/api/bugs/abc/comments)"
check "GET /api/bugs/abc/comments"  401 "$(code $BASE/api/bugs/abc/comments)"
check "GET /api/runs/abc/bugs"      401 "$(code $BASE/api/runs/abc/bugs)"

echo "── Input validation (no token needed; runs before DB) ──"
check "login empty body → 400"      400 "$(code -X POST -H 'content-type: application/json' -d '{}' $BASE/api/auth/login)"
check "signup bad email → 400"      400 "$(code -X POST -H 'content-type: application/json' -d '{\"email\":\"foo\",\"password\":\"longenough1\"}' $BASE/api/auth/signup)"
check "signup short password → 400" 400 "$(code -X POST -H 'content-type: application/json' -d '{\"email\":\"a@b.com\",\"password\":\"123\"}' $BASE/api/auth/signup)"
check "login invalid JSON → 400"    400 "$(code -X POST -H 'content-type: application/json' -d 'not json' $BASE/api/auth/login)"

echo "── CORS preflight ──"
check "OPTIONS /api/auth/login → 204" 204 "$(code -X OPTIONS $BASE/api/auth/login)"
CORS_METHODS=$(curl -s -D - -o /dev/null -X OPTIONS $BASE/api/auth/login | grep -i "access-control-allow-methods" | tr -d '\r')
echo "$CORS_METHODS" | grep -qi "PATCH" && { echo "[PASS] CORS allows PATCH"; PASS=$((PASS+1)); } || { echo "[FAIL] CORS missing PATCH"; FAIL=$((FAIL+1)); }
CORS_HEADERS=$(curl -s -D - -o /dev/null -X OPTIONS $BASE/api/auth/login | grep -i "access-control-allow-headers" | tr -d '\r')
echo "$CORS_HEADERS" | grep -qi "authorization" && { echo "[PASS] CORS allows authorization header"; PASS=$((PASS+1)); } || { echo "[FAIL] CORS missing authorization"; FAIL=$((FAIL+1)); }

echo "── Routing / regression ──"
check "unknown route → 404"         404 "$(code $BASE/api/does-not-exist)"
check "GET /health still 200"       200 "$(code $BASE/health)"
check "GET /api/runs still works"   200 "$(code $BASE/api/runs)"

echo ""
echo "── invalid bearer token → 401 ──"
check "GET /api/auth/me bad token"  401 "$(code -H 'authorization: Bearer garbage.token.here' $BASE/api/auth/me)"

echo ""
echo "$PASS passed, $FAIL failed"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
