// Local numeric aliases for RN codegen TS spec parsing.
//
// RN 0.79 and lower's codegen resolves any TSTypeAliasDeclaration found in the spec
// file back to its original RHS before the array-element handler runs — so a
// local `type Int32 = CodegenTypes.Int32` still presents as a TSQualifiedName
// inside ReadonlyArray<> and trips "Unknown prop type ... TSTypeReference".
// Imported identifiers are NOT tracked in the codegen's known-types map, so
// importing `Int32` / `Float` from here leaves a bare identifier that matches
// the primitive-type branch (`case 'Int32'` / `case 'Float'`).
//
// These are pure number aliases at runtime; RN codegen only cares about the
// identifier name.
export type Int32 = number;
export type Float = number;
