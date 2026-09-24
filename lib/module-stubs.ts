export interface ModuleStub {
  title: string;
  description: string;
  specSection: string;
  planned: string[];
}

// All build-spec modules now have real pages — nothing left to stub. Kept as
// a typed lookup (and /modules/[slug] as a fallback for an unrecognized URL)
// in case a future module is scaffolded as a stub before being built out.
export const MODULE_STUBS: Record<string, ModuleStub> = {};
