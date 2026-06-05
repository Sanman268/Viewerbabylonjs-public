/**
 * Part metadata mapping.
 *
 * The GLB is a Sketchfab export, so the raw mesh names are noisy
 * (e.g. "tt_coilover_upper_RL.004_Material.005_0"). We never key off those
 * directly. Instead each picked mesh is reduced to a stable *base name* by
 * stripping the trailing duplication index and material suffix, and that base
 * name is looked up here. Anything not found falls back to a humanised label,
 * so the info panel always has content and the part name is always taken from
 * the mesh data — never hardcoded per object.
 */

export interface PartMeta {
  /** Human-friendly display name. */
  label: string;
  /** Functional category, shown as a badge. */
  category: string;
  /** One-line description for the info panel. */
  description: string;
}

/**
 * Reduce a raw glTF node/mesh name to a stable lookup key.
 *
 *   "tt_coilover_upper_RL.004_Material.005_0" -> "tt_coilover_upper_RL"
 *   "wheel and tire combined.002"             -> "wheel and tire combined"
 */
export function baseNameOf(rawName: string): string {
  return rawName
    .replace(/_Material.*$/i, "") // drop "_Material.005_0" submesh suffix
    .replace(/\.\d+$/, "") // drop trailing ".004" duplication index
    .trim();
}

/** Title-case a base name as a readable fallback label. */
export function humanise(baseName: string): string {
  return baseName
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Curated metadata keyed by base name. Values are best-effort interpretations
 * of an auto-exported model; the point is that they are a *mapping*, decoupled
 * from the runtime mesh names.
 */
const METADATA: Record<string, PartMeta> = {
  tt_coilover_upper_RL: {
    label: "Coilover Damper",
    category: "Suspension",
    description:
      "Combined coil spring and shock absorber controlling wheel travel and ride damping.",
  },
  hopper_frame_crawler: {
    label: "Chassis Frame",
    category: "Structure",
    description: "Main structural frame the suspension and axles mount to.",
  },
  hopper_axle_fr_upper_link_crawler: {
    label: "Upper Control Link",
    category: "Suspension",
    description: "Upper locating link that constrains axle movement through travel.",
  },
  "wheel and tire combined": {
    label: "Wheel & Tire",
    category: "Wheel",
    description: "Road wheel and tire assembly mounted to the hub.",
  },
  Rear_axle_v3_v2: {
    label: "Axle Housing",
    category: "Driveline",
    description: "Rigid axle housing carrying the differential and hub ends.",
  },
  "1G 1000 RevA": {
    label: "Spring Mount",
    category: "Suspension",
    description: "Mounting bracket interfacing the spring assembly to the frame.",
  },
  NurbsPath: {
    label: "Brake / Fluid Line",
    category: "Hydraulics",
    description: "Routed line following the suspension geometry.",
  },
  Cylinder: {
    label: "Hydraulic Cylinder",
    category: "Hydraulics",
    description: "Cylindrical actuator / bushing element.",
  },
  Cube: {
    label: "Mounting Bracket",
    category: "Hardware",
    description: "Bracket securing components to the frame.",
  },
  mesh99: {
    label: "Hub Assembly",
    category: "Driveline",
    description: "Hub and bearing assembly at the wheel end of the axle.",
  },
  obj1: {
    label: "Axle Sub-assembly",
    category: "Driveline",
    description: "Sub-assembly attached to the axle housing.",
  },
};

/** Look up metadata for a raw mesh name, with a humanised fallback. */
export function getPartMeta(rawName: string): PartMeta {
  const base = baseNameOf(rawName);
  const found = METADATA[base];
  if (found) return found;
  return {
    label: humanise(base) || "Unnamed Part",
    category: "Component",
    description: "No additional metadata available for this part.",
  };
}
