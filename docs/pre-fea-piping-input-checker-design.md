# Governed Pre-FEA Piping Input Checker — Engineering Decision Record

Status: approved foundation for implementation on this branch.

Scope: common governed input for Non-FEA and empirical piping calculations. LFEA and LAFEA remain outside this module.

## 1. Canonical calculation-position model

The canonical downstream calculation entity is a directed, non-zero-length POS record under `governed-topology-pos/v1`. A POS connects two governed topology nodes and preserves `posId`, branch ownership, branch order, global order, source identities, geometry, section-transition identity, component references and support attachments.

Nodes represent connectivity. POS records represent calculation intervals. Components and supports remain separate governed records attached to nodes or exact stations on a POS. Existing valid source POS identities and ordering are preserved. When source order is unavailable, generation is allowed only from explicit, unambiguous connectivity and branch direction. Parent branches precede children; POS records are ordered by directed branch station; stable source identities resolve permitted ties.

No snapping, bridging, merging or other topology repair is permitted. Duplicate identities, zero-length structural POS records, non-finite coordinates, ambiguous branch ownership, disconnected declared networks, overlapping active members without an explicit relationship, invalid component endpoints and ambiguous support attachment block sealing.

Canonical geometry units are metres. The contract retains source locators, source hashes and normalized semantic identities without mutating imported bytes.

Positive qualification: the governed 163-POS fixture preserves identities, ordering and schedule split across repeated imports. Negative qualification: duplicate POS identity, changed tee ownership or multiply attached support blocks Gate B.

## 2. Method field requirements

Requirements are controlled by `non-fea-method-requirement-registry/v1`. Readiness is independent for weight/gravity, sustained reactions, sustained member actions, sustained stress, thermal free displacement, restraint reactions, vertical contact, combined operating reaction and enriched staged-JSON export.

Canonical SI is used internally. Geometry and section dimensions are metres; density is kg/m3; mass is kg; force is N; pressure and elastic modulus are Pa; stiffness is N/m or N·m/rad; temperature is K; friction and strain are dimensionless.

Package-level requirements are source identity, units, axis and valid governed topology. Engineering-property deficiencies block only affected methods. Missing pressure may block pressure-dependent sustained stress while gravity remains ready. Missing thermal expansion blocks thermal methods. Missing support axis blocks directional restraint methods.

Required governed fields include pressure, installation and operating temperatures, corrosion allowance, branch-owned schedule, outside diameter, thickness, derived section properties, material identity and density, elastic modulus, thermal expansion, fluid phase/fill state/density, insulation presence/thickness/density, component mass and centre of gravity, support attachment/type/axis/stiffness/gap/preload/friction, pressure-boundary effective area, stress-code basis and load-case basis.

Schedule defaults are prohibited. Generic steel, water, pressure, temperature, stiffness, gap and friction defaults are prohibited. Explicit numerical zero is valid; missing values never become zero. Duplicate exact master rows remain ambiguous. Fuzzy and first-row matches cannot authorize a sealed value.

Positive qualification: source-complete gravity data resolves without defaults while absent pressure blocks pressure-dependent methods only. Negative qualification: a missing branch schedule blocks section-dependent methods and a configured schedule default is rejected outside scope.

## 3. Load-case and boundary semantics

Semantics are controlled by `governed-piping-load-case-basis/v1`.

Primitive inputs are gravity, installed geometry and stress-free temperature, case pressure and temperature, fluid identity/phase/fill state/density, permanent and case-specific masses, support axes/stiffness/gaps/preload/state, pressure-boundary closures/effective areas, and contact/friction definitions.

`EMPTY` is a declared physical state with no contents and no pressure unless separately stated. `W` is case-defined gravity from metal, contents, insulation, components and approved other mass. `P` contains pressure-dependent terms and physically present unbalanced pressure thrust. `W+P` is direct or a qualified linear presentation sum. `OPE` and `HYD` are direct complete states. Thermal-only cases contain imposed thermal strain relative to the declared stress-free temperature.

Pressure thrust exists only where a governed pressure-boundary graph identifies a physical unbalanced closure or qualified effective-area discontinuity. Closed ends are never inferred from geometry alone.

Guide and line-stop names do not define axes; the governed axis does. Bilateral restraints act in both signs. Unilateral restraints act only after gap closure. Friction acts only with compressive normal contact. Lift-off, recontact, gaps, changing support state and friction are nonlinear and prohibit unqualified superposition.

The global frame is right-handed. Forces are reported as forces applied to the pipe; support-structure loads are equal and opposite. POS local +x follows start to end, and moments follow the right-hand rule.

Positive qualification: linear bilateral no-gap results sharing one common-input hash may present qualified W+P superposition. Negative qualification: adding a unilateral gap or friction requires a direct operating-state calculation and makes an attempted sum `NOT_QUALIFIED`.

## 4. Engineering qualification

Qualification is controlled by `pre-fea-piping-qualification-profile/v1` and must bind the exact commit and fixture hashes.

Closed-form checks cover pipe area, pipe/fluid/insulation mass, gravity load, component load, equilibrium, simple beam reactions/actions, free thermal expansion, section transitions, closed-end pressure thrust and Euler screening.

Repository fixtures cover source-only resolution, exact-master resolution, missing and duplicate master rows, stale hashes, conflicts, mixed phase density, schedule ambiguity, branch section transitions, component mass, support-axis mapping, default scope/usage, partial readiness, stale propagation, deterministic ordering, export/reimport, source-byte preservation, 1885S regression and 163-POS regression.

Independent reference-tool comparison is required for indeterminate sustained reactions/actions, thermal restraint reactions, directional guides/line stops, vertical contact and any combined operating-reaction method.

Default tolerances are: geometry max(1e-8 m, 1e-10 relative); section dimensions max(1e-9 m, 1e-9 relative); area/properties 1e-9 relative; mass max(1e-9 kg, 1e-8 relative); force and moment equilibrium max(1e-5 absolute, 1e-8 of applied total); thermal movement max(1e-8 m, 1e-7 relative); same-algorithm reactions max(1e-4 N, 1e-6 relative); independent-tool actions 0.1% unless a tighter method limit is approved. Semantic hashes require exact equality.

Every guard requires a mutation test. Passing schema validation alone is not engineering qualification.

## 5. Sealing, lineage and staleness

Lineage is controlled by `common-piping-lineage-graph/v1`.

The parent graph binds imported source bytes, normalized shared-model semantics, Project Data revision/hash/evidence, master source and normalized snapshot hashes, field mappings, enrichment policy, accepted overrides, configured-default authority and usage, topology/POS, method-readiness policies, qualification profiles and the preflight receipt.

The sealed `common-enriched-piping-input/v1` is the only common downstream authority. Each calculation receipt binds its common-input hash, method/version, load case and numerical policy. Displayed results bind their receipt. A stale descendant may not be displayed as current even when the numerical value happens not to change.

A package may be `PARTIALLY_READY` only when source identity and topology are valid; all unresolved fields are explicit; at least one requested method is ready; no unresolved field affects a ready method; no missing value is replaced by zero or an undocumented default; and export retains every blocker, limitation and readiness state. Invalid source identity, topology, approval evidence or preflight receipt blocks the package.

Positive qualification: identical inputs produce identical preflight, common-input and export hashes. Negative qualification: changing a used default invalidates usage, common input, affected readiness, calculation receipts and displayed results; changing an unused default forces authority review/resealing without silently changing resolved numerical values.
