# AI prompts

The design decisions behind this project were worked out iteratively with an AI assistant (Claude Code). The prompts below gather those decisions into three paste-ready prompts. Paste them in order, into one conversation, and they rebuild this repository: same structure, behaviour, API contract and tradeoffs.

---

## Prompt 1: Go backend and the shared contract

```text
Build the backend of a full-stack calculator as a Go 1.24 REST API in a folder called backend/. Use only the standard library. Module name: calculator. Code must pass gofmt and go vet.

STRUCTURE (one program, separated by responsibility)
- backend/internal/calculator: all maths and every validation rule. It must know nothing about HTTP or JSON, so every rule can be tested with plain function calls. Split it into files by job:
  - calculator.go: package doc, constants, Operation, Result, Calculate, the list of operations
  - parse.go: the input rules (parseNumber)
  - power.go, sqrt.go: the two non-trivial operations
  - round.go: rounding the output (roundResult, digitCount)
  - errors.go: error codes, the Error type, field-name constants, and one constructor per error that holds its user-facing message, so all wording lives in one place
- backend/internal/api: everything HTTP-specific: routing, body size limit, JSON decoding, translating calculator error codes into HTTP status codes, JSON responses, and request logging.
- backend/cmd/server/main.go: main() only wires things together; the logic is in testable functions.
Use descriptive names in anything longer than a few lines (base, exponent, radicand, extraDigits; not a, b, k).

CALCULATOR PACKAGE
- Public API: Calculate(number1, operation, number2 string) (Result, error), where Result is struct { Value string; Rounded bool }.
- Operations (type Operation string): "add", "subtract", "multiply", "divide", "power", "sqrt"; export Operations []Operation in that order. For "sqrt", number2 is ignored entirely (not validated).
- Export field constants FieldNumber1 = "number1", FieldNumber2 = "number2", FieldOperation = "operation".
- Numbers are plain decimal strings matching ^-?[0-9]+(\.[0-9]+)?$. Reject "+5", "1e5", ".5", "5.", "1,000", "1/2" and surrounding spaces.
- Use math/big.Rat (exact fractions), never float64, so 0.1 + 0.2 is exactly 0.3 and large values keep every digit.
- Limits, as exported constants:
  - MaxDigits = 1000 digits per input (sign and decimal point don't count).
  - MaxResultDigits = 10000. Before computing a power, a powerTooLarge(base, absExponent) helper estimates the result size as |exponent| × max(digits of the base's numerator, digits of its denominator). Write it as two separate checks with comments: first reject if |exponent| > 10000 (every base has at least one digit, and this keeps the multiplication from overflowing), then compare the product. This stops 9 ^ 999999999 before any work is done.
  - DecimalPlaces = 10.
- Validation order: unknown operation, then number1, then (unless sqrt) number2, then the operation-specific rules.
- power(base, exponent): the exponent must be a whole number ("2.0" counts); negative exponents are allowed (2 ^ -3 = 0.125). Answer these directly, before the size estimate: exponent 0 → "1" (including 0 ^ 0); base 0 with a positive exponent → "0"; base 0 with a negative exponent → DIVISION_BY_ZERO (0 ^ -n = 1 / 0 ^ n); base ±1 (an isPlusOrMinusOne helper) → "1", or "-1" for an odd power of -1, so 1 ^ 999999999999 works. Compute numerator and denominator separately with big.Int.Exp, then invert for negative exponents.
- squareRoot(radicand): compute it exactly with whole-number arithmetic: floor(√x × 10^k) = isqrt(floor(x × 10^(2k))), with const extraDigits = DecimalPlaces + 1 and a pow10 helper, then round half up on the extra digit. Result.Rounded is true unless the rounded root squared equals the radicand exactly. Must be correct for 1000-digit inputs (√(10^998) = 10^499).
- roundResult(value): round to 10 decimal places with big.Rat.FloatString(10) (halves away from zero), remove trailing zeros and a trailing "."; whole numbers have no decimal point; "-0" becomes "0". Rounded = whether the rounded value differs from the exact value. Examples: 1/3 → "0.3333333333" rounded; 2/3 → "0.6666666667" rounded; 1/8 → "0.125"; √2 → "1.4142135624" rounded; √16 → "4"; 1 / 10^60 → "0" rounded; "0.3333333333" × 3 → "0.9999999999" not rounded.

ERRORS
type Code string; type Error struct { Code Code; Message string; Field string }; Error() returns Message. Field is empty when no single input is to blame. The backend owns the user-facing wording; use these messages exactly (labels "First number" and "Second number"):
- UNKNOWN_OPERATION (field operation): "Operation must be one of: add, subtract, multiply, divide, power, sqrt."
- INVALID_NUMBER: "<Label> is required." when empty; "<Label> must be a plain decimal number, like 12 or -3.5." when malformed
- NUMBER_TOO_LONG: "<Label> can have at most 1000 digits."
- DIVISION_BY_ZERO (field number2): "Division by zero is not permitted."
- NEGATIVE_SQUARE_ROOT (field number1): "Cannot take the square root of a negative number."
- NON_INTEGER_EXPONENT (field number2): "The exponent must be a whole number."
- RESULT_TOO_LARGE (no field): "The result would be too large (over 10000 digits)."

HTTP API (package api, func NewRouter(logger *slog.Logger) http.Handler, using Go 1.22+ ServeMux method patterns)
- POST /api/v1/calculate (versioned, so breaking changes can come later as /v2). Request: {"number1": "12", "operation": "divide", "number2": "4"}, with all numbers as JSON strings. Success: 200 {"result": "3", "rounded": false}; "rounded" is always present.
- GET /api/health → 200 {"status": "ok"} (unversioned: it describes the server, not the calculator contract). HEAD works too.
- Every error, including 404 and 405, is {"code": "...", "message": "...", "field": "..."}, with field omitted when empty. Replace ServeMux's plain-text defaults: register method-less patterns for "/api/v1/calculate" and "/api/health" that answer 405 METHOD_NOT_ALLOWED "Method <M> is not allowed here. Allowed: <list>." with an Allow header ("POST" and "GET, HEAD"), and a "/" catch-all that answers 404 NOT_FOUND "Endpoint not found.".
- Status mapping, kept in one map: 400 when the request breaks the API's rules (INVALID_NUMBER, NUMBER_TOO_LONG, UNKNOWN_OPERATION); 422 when the request is valid but the maths has no answer (DIVISION_BY_ZERO, NEGATIVE_SQUARE_ROOT, NON_INTEGER_EXPONENT, RESULT_TOO_LARGE).
- Represent HTTP-layer failures as type apiError struct { status int; body errorResponse }; decodeRequest(body) returns (calculateRequest, *apiError).
- The HTTP layer's own errors: body over 16 KB (http.MaxBytesReader) → 413 REQUEST_TOO_LARGE "Request body must be at most 16384 bytes."; malformed JSON, an empty body, a non-object, or trailing data after the object → 400 INVALID_REQUEST `Request body must be one JSON object like {"number1": "12", "operation": "divide", "number2": "4"}.`; a field with the wrong JSON type (a number instead of a string) → 400 INVALID_REQUEST "<field> must be a string." with field set. A missing number2 is not checked here: it reaches the calculator as "" and becomes INVALID_NUMBER, because only the calculator knows that sqrt doesn't need it.
- Any error that isn't a known calculator.Error → 500 INTERNAL_ERROR "Something went wrong. Please try again."; log the real error, never return it.
- Log one line per request with log/slog (text handler): method, path, status, duration. The status-recording ResponseWriter wrapper implements Unwrap() so http.ResponseController keeps working.
- API documentation: write an OpenAPI 3.1 description in internal/api/openapi.json (embedded with go:embed, served at GET /api/openapi.json) covering both endpoints, the request and response schemas (Number with the pattern above, the operation enum, number2 required except for sqrt), every error code in the Error schema's code enum, and every status (200, 400, 405, 413, 422, 500) with an example per error code, plus examples for 1 ÷ 3, a 20-digit product, 2 ^ 100 and √2; servers: [{url: "/"}] so "Try it out" goes through the same origin. Serve a Swagger UI page at GET /api/docs that loads swagger-ui-dist@5.17.14 from jsDelivr and points at /api/openapi.json. Both are unversioned and answer 405 in JSON for other methods. docs_test.go must check the description against the code: the operation enum equals calculator.Operations, the number pattern matches parse.go, the error-code enum equals exactly the codes the API can return, and every status in statusByCode is documented with an example of each of its codes.
- main.go: port() reads PORT (default 8080). run(ctx, logger, listener) serves with http.Server timeouts (ReadHeader 5s, Read 10s, Write 10s, Idle 60s), returns the error if serving fails, and shuts down gracefully when ctx is cancelled. main() cancels ctx on SIGINT/SIGTERM.

SHARED CONTRACT
Create contract/calculations.json at the repository root: { "description": ..., "cases": [ { "name", "request": {number1, operation, number2?}, "status", "response", "backendOnly"? } ] }. Include successes (add, 0.1 + 0.2, subtraction, a 20-digit × 20-digit product, exact and rounded divisions, 0.3333333333 × 3, powers including negative and "2.0" exponents and 0 ^ 0, square roots including rounded, number2 ignored and "-0"), and every error the frontend also checks (missing numbers, each malformed format, too long on both fields, division by zero including "0.000" and 0 ^ -1, negative square root, fractional exponent), plus UNKNOWN_OPERATION and RESULT_TOO_LARGE marked "backendOnly": true. The API tests (internal/api/contract_test.go) read ../../../contract/calculations.json, send every request through the router and compare status and response exactly. The frontend tests will read the same file.

TESTS (table-driven, 100% coverage of internal/calculator and internal/api)
- calculator: every operation, every error code with its field, the format rejections, the digit-limit boundary (exactly 1000 digits accepted, with or without sign or decimal point), 20-digit × 20-digit multiplication, rounding up and down, negative exponents, ±1 and 0 bases with huge exponents, 2 ^ 10000 computed in full (check it against 1 shifted left by 10000 bits), and Rounded on every case.
- api (httptest): the docs page and OpenAPI checks above, success shape, every status code and code value, 413, malformed and trailing JSON, a JSON number instead of a string, JSON 405 with Allow header and JSON 404, HEAD on health, every calculator code having a status, internal errors hidden but logged, the request log line, Unwrap working with http.ResponseController, and the contract test.
- cmd/server: port() with and without PORT; run() against a real listener on a random port (health check, then clean shutdown when ctx is cancelled) and with a closed listener (returns an error).

DOCKERFILE: two stages: golang:1.24-alpine builds with CGO_ENABLED=0; alpine:3.20 runs the binary as a non-root user (busybox wget is then available for health checks). A .dockerignore excludes tests.
```

---

## Prompt 2: React frontend

```text
Now build the frontend in frontend/: React 18 + TypeScript (strict) with Vite 5, tested with Vitest, React Testing Library and user-event, with v8 coverage. No state-management library. Add ESLint 9 (flat config: @eslint/js recommended, typescript-eslint recommended, eslint-plugin-react-hooks recommended rules, eslint-config-prettier last) and Prettier (singleQuote, printWidth 110), with scripts lint, format and format:check. Everything must pass lint, format check, type-check and tests at 100% statement, branch, function and line coverage.

PRINCIPLES
- Separate by responsibility: plain TypeScript modules in src/lib hold all logic and are tested without rendering; components in src/components only render and wire things together.
- The frontend never does arithmetic and never turns input into JavaScript numbers (they lose precision past ~15–17 digits). Numbers stay strings end to end; all maths happens in the Go API.
- The browser calls only the relative path /api/v1/calculate. In development, Vite proxies /api to process.env.API_PROXY_TARGET (default http://localhost:8080). Dev server on port 3000.

MODULES (src/lib)
- operations.ts: type Operation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt'; BinaryOperation = everything except sqrt; OPERATION_SYMBOLS (+, −, ×, ÷, ^, √); OPERATION_NAMES (Add, Subtract, Multiply, Divide, Power, Square root); isOperation().
- api.ts: interface CalcError { code; message; field? }. calculate(number1, operation, number2?, signal?) POSTs JSON (number2 left out for sqrt), passes the AbortSignal to fetch, and never throws. It returns { ok: true, result, rounded } or { ok: false, error }. A failed fetch, or a non-JSON response with status >= 500 (the proxy saying the backend is down), gives NETWORK_ERROR "Can't reach the server. Please try again.". Anything else outside the contract (success without a string result and boolean rounded, an error without code and message, non-JSON 4xx) gives UNEXPECTED_RESPONSE "Something went wrong. Please try again.". Backend error messages are shown as-is.
- validation.ts: a TypeScript copy of the backend's input rules with the same codes and messages word for word, in the same order: number format, 1000-digit limit (MAX_DIGITS; export digitCount, which counts digits only), division by zero (any zero like "0.000"), 0 ^ negative → DIVISION_BY_ZERO, fractional exponent, negative square root ("-0" is not negative). Do NOT copy the power result-size estimate; it stays backend-only. validate(number1, operation, number2) returns CalcError | null.
- calculation.ts: runCalculation(request, signal?) validates locally and returns the local error without touching the network, otherwise calls calculate(). toHistoryEntry(request, result, rounded, timestamp = Date.now()).
- history.ts: HistoryEntry is a union: square-root entries have only number1; other operations require number2; both have result, rounded?, timestamp. Stored as structured parts (not display strings), so display changes also apply to old entries. addEntry(list, entry) puts the newest first and keeps the latest 20. loadHistory()/saveHistory() use localStorage key "calculator.history" in try/catch; corrupt data (including a two-number entry without number2) or blocked storage is dropped and never breaks the app. Only successful calculations are saved.
- keypad.ts: the keypad's rules as a pure reducer, used with useReducer. Types: Entry = 'number1' | 'number2'; CalculationRequest = { operation: 'sqrt', number1, replaces: Entry } | { operation: BinaryOperation, number1, number2, chainedOperation: BinaryOperation | null }. KeypadState (document each field): number1 (never empty; '0' before typing), operation, number2 ('' until typing starts), showingResult (the number on screen is a result, so the next digit replaces it), roundedEntry (which entry holds a rounded backend result), error, request. Actions: digit, decimal, toggleSign, backspace, clear, operator, equals, sqrt, calculationSucceeded {result, rounded}, calculationFailed {message}.
  Structure it for readability: keypadReducer handles clear and the two backend answers, ignores input while a request is pending, and passes user input to handleInput(state.error ? initialState : state, action) without reassigning its argument. Name each repeated idea once: shownEntry (the second number once typing it has started, otherwise the first), editedEntry (where the next digit goes), typedSoFar, setEditedEntry(state, value, { keepRounded }), pressOperator, backspace, applyResult. No nested ternaries.
  The reducer never calls the backend: it sets `request` and ignores input until the Calculator reports back. Behaviour:
  - Digits replace a leading "0"; at most 1000 digits; one decimal point; ± flips the sign (a rounded result stays marked rounded).
  - Negative numbers: ± on an empty second number starts it as "-" (5 × ± 3 → 5 × -3), and pressing ± again removes it. Subtract pressed straight after another operator, with no second number yet, also starts a negative number (5 × − 3 and the keyboard's 5*-3 → 5 × -3). A lone "-" isn't a number: = and √ wait for a digit; "." turns it into "-0."; backspace removes it. Use a hasDigits(value) helper for these checks.
  - Operator with no second number: start the operation, or replace one just chosen (2 + × → 2 ×), dropping a lone "-".
  - Operator with a second number: chain. 2 + 3 + requests 2 + 3, then continues as "5 +".
  - Equals with a complete expression (a second number with at least one digit) requests it; otherwise it does nothing.
  - √ applies immediately to the number on screen: the second number if one is being typed (the result replaces it), otherwise the first (keeping any chosen operator).
  - Backspace: on an empty second number it removes the operator; results aren't edited digit by digit; an emptied first number becomes "0", an emptied second number goes back to "".
  - Normalise entries before sending ("5." → "5", "-" → "0").
  - After an error, the next key press starts over. Clear resets everything and a late answer is ignored.
  - Chaining continues from the rounded value the backend returned (1 ÷ 3 × 3 = 0.9999999999, intentional).
  - Exported helpers: displayValue, displayIsRounded (true only while the rounded result is on screen), highlightedOperation (the chosen operator until the second number is typed), expression(state, format) for the small line ("12 ÷"), normalize, keyToAction (digits; . and , → decimal; + - * x / ^; r → sqrt; Enter and = → equals; Backspace; Escape and Delete → clear).
- format.ts (display only): formatNumber adds comma separators to the whole-number part only ("23570226.0699571569" → "23,570,226.0699571569"); decimals are never grouped; anything else is returned unchanged; build the groups in chunks, not with a look-ahead regex, so it stays fast on 10,000-digit strings. Always a comma and a point, whatever the locale, to match the keypad's "." key and the API. describeLength("…") gives "3,011 digits". Separators never reach the API, the keypad state or history storage.

COMPONENTS
- App: header, Calculator and HistoryList. It holds the history in state (initialised with loadHistory), saves it in an effect whenever it changes, and passes a stable onCalculated callback (useCallback with a functional state update).
- Header: a small inline SVG mark plus the title "Calculator" (no company logo).
- Calculator: useReducer(keypadReducer). One effect runs when state.request changes: it creates an AbortController, calls runCalculation(request, signal), ignores the outcome if aborted, dispatches the outcome, and reports toHistoryEntry(...) on success. Its cleanup aborts the request, so clearing or replacing it cancels the network call. The effect depends on [state.request, onCalculated]; document that onCalculated must be stable. A second effect adds a window keydown listener (ignore Ctrl/Meta/Alt; preventDefault on handled keys, e.g. so "/" doesn't open quick find). Pass highlightedOperation(state) to the keypad; no logic in JSX.
- Display: the expression line, the value, and notes. The <output aria-live="polite"> stays mounted, so screen readers announce every change; only an inner <span key={text}> is re-keyed to replay a short fade-in. The value is always one line: pass the formatted length as a CSS variable --chars and size the font with a container query: font-size: clamp(1rem, calc(100cqi / (var(--chars) * 0.62)), 2.25rem), white-space: nowrap, overflow-x: auto. When even 1rem doesn't fit it scrolls: results open scrolled to the start, numbers being typed stay scrolled to the end. Notes: "Rounded to 10 decimal places" when rounded, and the digit count for results over 20 digits, joined with " · ". Errors replace the value (role="alert"). aria-busy while loading.
- Keypad: buttons on a 4-column grid, row by row: C, ⌫, √, ^ / 7 8 9 ÷ / 4 5 6 × / 1 2 3 − / ± 0 . + / then = across the full last row (keep the key list laid out in rows with // prettier-ignore). Operator keys carry an `operation` field; every button has an aria-label; operator buttons have aria-pressed.
- HistoryList: "Recent calculations" heading, "No calculations yet." when empty, an ordered list, newest first. Rows read "12 ÷ 4 = 3", "√16 = 4", or "1 ÷ 3 ≈ 0.3333333333" when rounded, with separators, on one line cut with an ellipsis, the full text in a title attribute, plus the time.

STYLING (plain CSS, styles.css): CSS variables for colours with a dark theme under prefers-color-scheme; a centred column (max-width 420px, 16px side padding); rounded card and keys; key-press scale and history slide-in animations; all motion disabled under prefers-reduced-motion. Fully usable at 320px width.

TESTS: a test file per module (keypad sequences including chaining, negative numbers via ± and via − after an operator for every operation, √ on either number, the rounded mark, errors, clear during a request and the digit cap; api with a stubbed fetch including network failure, a non-JSON 502, malformed responses and the abort signal; calculation; history including blocked storage and corrupt data; format including a 10,000-digit string; validation boundaries). src/contract.test.ts reads ../../contract/calculations.json (resolve it with __dirname and node:path; import.meta.url is not a file URL under jsdom) and checks that validate() returns exactly the expected error, or null for successes and backendOnly cases, and that calculate() turns every contract response into the right outcome. App tests click real buttons and use the keyboard: a calculation reaching history and localStorage, division by zero caught without calling fetch, a backend-only error, the network error, chaining and √, the rounded note and ≈, separators on screen but plain strings sent, history loaded on start, 5*-3 typed on the keyboard sending number2 "-3", clearing during a request (the fetch signal is aborted and a late answer ignored), and Ctrl/Alt shortcuts ignored. Query history rows by their text, not CSS classes.
```

---

## Prompt 3: Docker Compose and nginx

```text
Add Docker support so the whole app runs with one command, without CORS.

- frontend/Dockerfile: node:22-alpine runs npm ci and npm run build (which type-checks first); then nginxinc/nginx-unprivileged:1.27-alpine (nginx as a non-root user) serves dist/ on port 8080.
- frontend/nginx.conf: listen 8080; serve the static files; fall back to /index.html for unknown paths; proxy /api/ to http://backend:8080 (the Compose service name). The browser only ever talks to one origin, so the backend needs no CORS configuration and its address lives only in server config (nginx here, vite.config.ts locally), never in frontend code.
- docker-compose.yml: backend (built from ./backend, no published port, so it's reachable only through the proxy; health check with wget on http://localhost:8080/api/health every 5s) and frontend (built from ./frontend, port "${FRONTEND_PORT:-3000}:8080", health check with wget on http://127.0.0.1:8080/ (not localhost, which resolves to IPv6 inside the container while nginx listens on IPv4), and it starts only once the backend is healthy). Logs can be followed together or per service with docker compose logs -f backend.
- docker-compose.dev.yml for development: backend = golang:1.24-alpine with ./backend mounted at /src, running Air so every Go change rebuilds and restarts the server: go run github.com/air-verse/air@v1.61.1 --build.cmd "go build -o /tmp/air/server ./cmd/server" --build.bin "/tmp/air/server" --tmp_dir "../tmp/air" (Air resolves tmp_dir relative to /src, so "../tmp/air" keeps its files out of the mounted folder), with volumes for the Go build and module caches. Frontend = node:22-alpine running `npm ci && npm run dev -- --host 0.0.0.0` with ./frontend mounted, node_modules in a named volume, API_PROXY_TARGET=http://backend:8080, and port "${FRONTEND_PORT:-3000}:3000".
- Root .gitignore: node_modules/, dist/, coverage/, *.out. frontend/.dockerignore: Dockerfile, .dockerignore, node_modules, dist, coverage.
```
