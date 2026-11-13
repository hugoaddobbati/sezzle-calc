# Design decisions and tradeoffs

Each entry covers what was decided, why, the alternatives considered, and what the choice costs.

---

## 1. Structured input, one operation per request

**Decision:** the frontend sends `{number1, operation, number2}`, never an expression such as `"2+3*4"`. Each request contains exactly one operation.

**Why:** the backend needs no parser and no operator precedence, so every request is simple to validate and test. Nothing in the requirements asks for multi-operation expressions.

**Alternatives considered:** a free-form expression field (the backend parses text and applies precedence), or two input fields with an operation selector.

**Tradeoff:** chained input (`2 + 3 + 4`) becomes separate requests, and each result is carried into the next one, so the order of operations is left to right as on a phone calculator, with no precedence.

## 2. A phone-style keypad

**Decision:** a full keypad (digits, `.`, `±`, operators, `√`, `C`, `⌫`, `=`) plus physical keyboard support, instead of two input fields.

**Why:** it behaves like a real calculator, and it still maps directly onto the one-operation request.

**Alternatives considered:** two text fields with an operation in between, which is simpler to build and test.

**Negative numbers:** `±` flips the sign of the number being typed, and on an empty second number it starts one with `-` (`5 × ± 3` is `5 × -3`). Pressing `−` straight after another operator also starts a negative number, so `5 × − 3` and typing `5*-3` both mean `5 × -3`. `=` and `√` wait until a digit follows a lone `-`.

**Tradeoff:** more behaviour to define and test: chaining (`2 + 3 +` calculates `5` and continues), replacing an operator pressed by mistake, negative input, `√` applying immediately to the number on screen, and what happens after an error. Because `−` after an operator starts a negative number, a mis-tapped operator can't be corrected *into* minus (`2 + −` means "2 plus a negative number"); backspace undoes the operator instead. All of it lives in a pure reducer (`frontend/src/lib/keypad.ts`), so each key sequence is unit-tested.

## 3. Exact arithmetic with `math/big`

**Decision:** the backend parses numbers into `big.Rat` (exact fractions) instead of `float64`.

**Why:** `float64` keeps only about 15–17 significant digits and has binary rounding errors (`0.1 + 0.2 = 0.30000000000000004`). Multiplication and exponentiation quickly produce values beyond that.

**Alternatives considered:** `float64` with documented limits (simpler, and supports fractional exponents through `math.Pow`); `big.Float` (fixed precision, so huge products would still be rounded).

**Tradeoff:** fractional exponents (`2 ^ 0.5`) aren't supported, because `math/big` has no power function for non-whole exponents. They are rejected with `NON_INTEGER_EXPONENT`. Square root is computed exactly using whole-number arithmetic.

## 4. Numbers travel as JSON strings

**Decision:** request and response numbers are strings: `{"number1": "12"}`, `{"result": "3"}`.

**Why:** JavaScript numbers lose digits beyond about 15–17, so a JSON number would be corrupted the moment the browser parses it. The frontend never converts input to a JS number; it only checks the format, formats the display, and passes strings through.

**Alternatives considered:** JSON numbers, which would be natural for small values and silently wrong for large ones.

**Tradeoff:** clients must treat numbers as text. A JSON number in a request is rejected with `400 INVALID_REQUEST`, which keeps the contract strict.

## 5. Limits instead of unbounded maths

**Decision:** inputs of at most 1,000 digits, request bodies of at most 16 KB, and powers rejected **before computing** when the estimated result exceeds about 10,000 digits.

**Why:** arbitrary precision with no limits is a denial-of-service risk: one request like `9 ^ 999999999` would tie up the server. A product of two inputs has at most about 2,000 digits, so only exponentiation needs a size estimate.

**Alternatives considered:** capping only the inputs, which doesn't stop `2 ^ 1000000`, where the exponent drives the size; or a time limit per calculation, which is harder to make reliable.

**Tradeoff:** the estimate is deliberately rough (`2 ^ 10000` is accepted, `2 ^ 10001` is not). Bases whose powers never grow (`0`, `1`, `-1`) are answered directly, so `1 ^ 999999999` still works.

## 6. Rounding to 10 decimal places, chaining on the rounded value

**Decision:** every result is rounded to 10 decimal places by the backend, and the response says whether rounding happened: `{"result": "0.3333333333", "rounded": true}`. The UI shows "Rounded to 10 decimal places" and uses `≈` in history.

**Why:** 50 decimal places (the first version) were accurate but unreadable. Rounding on the backend keeps the frontend string-only.

**Alternatives considered:** keep full precision in the API and shorten only what's displayed (the calculator would chain on the full value); or send both a full and a rounded value.

**Tradeoff:** chained calculations continue from the rounded value, so `1 ÷ 3 × 3 = 0.9999999999`. This is intentional and accepted.

## 7. Validation on both sides, wording owned by the backend

**Decision:** the backend validates every request and is the authority. The frontend repeats the same rules (`frontend/src/lib/validation.ts`) for instant feedback, with the **same codes and messages word for word**, and shows backend messages as-is.

**Why:** anyone can call the API directly (with `curl`, say), so the UI can't be trusted to send only valid input. Keeping the wording in one authority means the user sees the same text whichever side catches the problem.

**Alternatives considered:** the frontend maps error codes to its own text (the frontend owns the wording); or backend-only validation (one round trip per mistake).

**How they stay in sync:** [`contract/calculations.json`](contract/calculations.json) lists requests with the exact status and response the API must return. The Go tests check every case against the real handler; the frontend tests check that `validate()` returns the same error, word for word, for every case not marked `backendOnly`. A rule or message changed on one side only makes a test fail.

**Tradeoff:** the rules are still written in two languages, so a change means editing both (the contract catches anything missed). The Go calculator package contains user-facing text; all of it lives in `errors.go`, so the wording can be reviewed in one place. The power size estimate is backend-only, to avoid duplicating it.

## 8. Error contract: 400 vs 422

**Decision:** every error is `{code, message, field?}`, including unknown paths and wrong methods. **400** means the request breaks the API's rules (bad number format, too many digits, unknown operation, malformed JSON); **422** means the request is valid but the maths has no answer (division by zero, negative square root, fractional exponent, result too large); **413** means the body is too large; **404** and **405** (with an `Allow` header) replace Go's plain-text defaults; **500** means an unexpected failure, logged in full but never returned.

**Why:** the status code tells a client which side is at fault; `code` gives a stable, machine-readable reason; `field` lets the UI point at the right input.

**Alternatives considered:** a single 400 for everything; repeating `status` and `error: true` inside the body (dropped, because the HTTP status already carries both).

**Tradeoff:** some cases are judgement calls. "Too many digits" is 400 because it breaks a published input rule, even though the maths could be done.

## 9. Calculator logic separated from HTTP and UI

**Decision:** in Go, `internal/calculator` holds every rule and knows nothing about HTTP, split into files by job (`parse.go`, `power.go`, `sqrt.go`, `round.go`, `errors.go`); `internal/api` decodes requests and translates error codes into statuses. In React, the keypad is a pure reducer, `lib/calculation.ts` runs validation and then the API call, and validation, history and formatting are plain modules; components only render and wire them together.

**Why:** every rule can be tested with plain function calls, without a server or a browser, and a change touches one place.

**Alternatives considered:** handlers that validate and calculate inline; components that contain `fetch` and `localStorage` code.

**Tradeoff:** a few more files and a little indirection.

## 10. One versioned endpoint

**Decision:** `POST /api/v1/calculate`, with the operation in the body; `GET /api/health` stays unversioned.

**Why:** adding an operation means one new case, not a new route. The `/v1` prefix allows breaking changes later (`/v2`) without breaking existing clients. Health describes the server, not the calculator contract, so infrastructure checks never need to change.

**Alternatives considered:** one endpoint per operation (`/api/add`, `/api/divide`), which allows a request shape per operation.

**Tradeoff:** one request shape must fit every operation, so `sqrt` ignores `number2`.

## 11. Same-origin proxy instead of CORS

**Decision:** the browser calls relative `/api/...` paths. nginx (in Docker) or Vite (in development) forwards them to the backend. In Docker, the backend's port isn't published at all, so the proxy is the only way in.

**Why:** the backend's address lives only in server configuration, never in frontend code, so the same frontend build works everywhere. The backend needs no CORS setup or per-environment list of allowed origins. Requests can't be silently blocked by the browser, which with CORS shows up only as a console error with nothing in the backend logs.

**Alternatives considered:** the browser calls the backend directly, with CORS headers on the Go side.

**Tradeoff:** nginx and Vite each need a few lines of proxy configuration.

## 12. No separate API gateway

**Decision:** nginx is the only router in front of the backend.

**Why:** nginx already routes by path; a future service would be one more `location` rule. A dedicated gateway would add a container, a network hop and forwarding code for services that don't exist yet.

**Alternatives considered:** a general-purpose Go "api-service" in front of the calculator service.

**Tradeoff:** shared concerns such as authentication or rate limiting would go into nginx, or a gateway would be introduced once there are more services.

## 13. History in localStorage

**Decision:** the latest 20 successful calculations are saved in the browser as structured entries (numbers, operation, result, rounded, timestamp), not as display text.

**Why:** persistence wasn't required, so no database or server state. Structured entries mean display changes (separators, `≈`) also apply to old entries.

**Alternatives considered:** server-side history (needs storage and user identity); saving formatted strings.

**Tradeoff:** history is per browser and per device. Blocked or corrupt storage is tolerated: the app works, without history.

## 14. One-line display with screen-only separators

**Decision:** the result always stays on one line. The font shrinks to fit the calculator's width (from 2.25rem down to 1rem); beyond that the number scrolls sideways, opening at the start for results and at the end while typing. Comma separators are added on screen only. Results longer than 20 digits show their digit count.

**Why:** the first version wrapped long numbers in the middle of their digits, which made them unreadable.

**Alternatives considered:** wrapping between digit groups; locale-specific separators (`23.570.226,07`), which would conflict with the keypad's `.` key and the API.

**Tradeoff:** very long results need horizontal scrolling. The separator style is fixed (comma and point) regardless of the user's locale.

## 15. Docker Compose: two setups

**Decision:** `docker-compose.yml` builds production-style images: nginx (the unprivileged image, running as a non-root user) serving the built app, and the Go binary on a small Alpine image, also non-root. Both have health checks, and the frontend starts only once the backend is healthy. `docker-compose.dev.yml` mounts the source folders: Vite reloads frontend changes, and Air rebuilds and restarts the Go server on every change.

**Why:** a reviewer needs one command that runs the finished app; development needs instant reloads. Logs can be followed for both services together or one at a time.

**Tradeoff:** two files to maintain, and the dev setup downloads Air and runs `npm ci` on first start.

## 16. Automated checks for style and correctness

**Decision:** Go code is formatted with `gofmt` and checked with `go vet`; frontend code is formatted with Prettier and linted with ESLint, including the React Hooks rules. TypeScript runs in strict mode. Both sides have tests at 100% coverage of the logic, plus the shared contract tests.

**Why:** style is enforced by tools rather than by review, and the React Hooks rules catch mistakes such as missing effect dependencies.

**Tradeoff:** a few more config files (`eslint.config.js`, `.prettierrc`) and dev dependencies.

## 17. Interactive API documentation

**Decision:** the backend serves an OpenAPI 3.1 description at `/api/openapi.json` (embedded in the binary with `go:embed`) and a Swagger UI page at `/api/docs`, which loads Swagger UI from jsDelivr, pinned to one version. Both are unversioned, like the health check, and reachable through the same `/api` proxy.

**Why:** reviewers and client developers can see every endpoint, input, output and error code with examples, and try requests against the real API without curl. A test compares the description with the code (operations, number pattern, every error code, and each status with its codes), so the docs can't silently go stale.

**Alternatives considered:** generating the description from code annotations (a third-party tool, plus comments that are easy to get wrong); bundling Swagger UI's files into the repository (about 1.5 MB of third-party assets).

**Tradeoff:** the description is written by hand, kept honest by the test rather than generated. The docs page needs internet access to load Swagger UI; the API itself doesn't.

---

## Assumptions

- One operation per request; no operator precedence.
- Percentage was optional and left out: "percent" is ambiguous (`x% of y`, or modulo).
- `0 ^ 0 = 1`, the usual convention; `0 ^ -n` is division by zero.
- `.` is the decimal point everywhere, regardless of locale.
- Keyboard: digits; `.` or `,` for the decimal point; `+ - * / ^` (`x` also multiplies); `r` for √; `Enter` or `=` for equals; `Backspace`; `Esc` or `Delete` to clear. `-` straight after another operator starts a negative number (`5*-3`).
