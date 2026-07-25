# MASR-01 — Shell, Icon and Navigation Integrity

## Exact scope

MASR-01 recovers the common framework-neutral shell from planning baseline `7e12954f2923c2df574bf94cb0d94811c813d463`. It does not add Local FEA, Debug behavior, numerical-core capability, engineering formulas, a second store, or a second viewer.

PR #165 remains draft and unmerged during this shell-stabilization slice.

## New closed UI contracts

| Contract | Purpose |
| --- | --- |
| `application-tab-manifest/v1` | Canonical tab identity, label, icon, implementation, root and responsive priority. |
| `application-tab-runtime-state/v1` | Separates navigation availability, content readiness and action readiness. |
| `application-icon-registry/v1` | Closed inline-SVG path registry with deterministic fallback. |
| `application-empty-state/v1` | Canonical opened-tab empty, blocked, invalid and unavailable presentation. |
| `application-build-identity/v1` | Visible application name, version and build SHA. |
| `application-view-state/v10` | Navigation successor in which all implemented tabs are navigable even when evidence is missing. |

`workspace-consumer-registry/v9` remains unchanged. `application-view-state/v1` through `v9` remain closed and byte-semantically preserved.

## Authority map

| Concern | Sole authority |
| --- | --- |
| Engineering consumer meaning | `workspace-consumer-registry/v9` |
| Engineering evidence readiness | `workspace-consumer-readiness/v1` |
| Application tab identity and icons | `application-tab-manifest/v1` + `application-icon-registry/v1` |
| Active application tab | `ApplicationShellController` using `application-view-state/v10` |
| Active dataset | `WorkspaceState` |
| Production viewport | Existing single `[data-webgl-host]` |
| Global event requests/outcomes | `EventBus` |

No legacy React `TopNav`, Zustand app store, remote icon source, external font icon or image fallback is mounted.

## Navigation-state separation

```text
consumer implementation
→ navigationState

consumer readiness
→ contentState
→ actionState
```

An implemented tab remains clickable when its engineering actions are blocked. Example with no dataset:

```text
Load Calc
navigationState = AVAILABLE
contentState = EMPTY
engineering actions = BLOCKED
```

Only `Debug`, which remains `NOT_IMPLEMENTED`, is disabled.

## Capability-parity table

| Requirement | MASR-01 result |
| --- | --- |
| Recognizable icon and retained text label | Inline SVG icon plus text for every primary tab. |
| Clickable implemented tabs | All ten implemented tabs open without a dataset. |
| Clear empty/blocked/invalid presentation | Static per-view status root renders canonical state and evidence counts. |
| Visible action availability | Opened status panel reports `AVAILABLE`, `BLOCKED` or `UNAVAILABLE`. |
| Keyboard navigation | Arrow, Home and End behavior retained; disabled Debug is skipped. |
| Focus preservation | Primary button retains focus; overflow activation returns focus to the overflow trigger. |
| Responsive navigation | Secondary tabs move to a deterministic overflow menu below 940 px. |
| Static view roots | Every current tab, including QA and Debug, has a layout-time root. |
| Build/version identity | App name, version and short build SHA are visible in the shell. |
| Global error region | Failed view activation is reported in one `role=alert` region. |
| Single-viewer invariant | Exactly one production `data-webgl-host` remains. |
| Broken assets | No image or remote icon request is introduced. |

## Static root map

```text
HOME         home-consumer-root
WORKSPACE    workspace-view-root
LOAD_CALC    load-calc-consumer-root
PCF          pcf-consumer-root
SKETCHER     sketcher-consumer-root
THREE_D_CALC three-d-calc-consumer-root
PIPE_SOLVER  pipe-solver-consumer-root
REPORTS      reports-consumer-root
QA           qa-consumer-root
SETTINGS     settings-consumer-root
DEBUG        debug-consumer-root
```

QA no longer replaces placeholder markup during controller construction.

## Visual acceptance evidence

The blocking browser suite captures:

```text
test-results/masr-01/desktop-tab-traversal.png
test-results/masr-01/1024-overflow.png
test-results/masr-01/narrow-overflow-qa.png
```

Certified viewport scenarios:

```text
1366 × 768 — complete implemented-tab traversal
1440 × 900 — keyboard and focus acceptance
1024 × 768 — minimum responsive overflow acceptance
800 × 900  — narrow responsive overflow acceptance
```

The workflow retains screenshots and Playwright evidence as artifacts.

## Scope exclusions

MASR-01 does not:

- merge, rebase, close, retarget or continue PR #165;
- add Local FEA or LAFEA application integration;
- implement Debug;
- change engineering formulas, validators or contract keys;
- change PCF, Sketcher, Settings, Reports, QA or solver ownership;
- create a second Canvas/WebGL runtime;
- mount the legacy React application or Zustand store;
- use remote assets or CDN icons;
- modify `package-lock.json` or dependencies.

## Certification

Blocking mission command:

```text
npm run check:masr.01
```

Blocking workflow:

```text
MASR-01 Shell, Icon and Navigation Certification
```

Historical aggregate checks are advisory unless they reveal a genuine product regression. Production build and the dedicated contracts, properties, source boundaries and browser acceptance remain blocking.
