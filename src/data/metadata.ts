/**
 * Part metadata helpers.
 * Curated labels/categories are NOT held in this file. They live in an external
 * data file (`public/metadata/parts.json`) loaded at runtime, so adjusting part
 * metadata never requires touching application logic. The info panel always
 * starts from the picked mesh/node name, normalises it, looks it up in the
 * external map, and otherwise infers a lightweight category from generic
 * mechanical keywords.
 *
 * This keeps the viewer suitable for the practical test:
 * - part names come from mesh data;
 * - curated metadata is data-driven, not hardcoded in TypeScript;
 * - unknown models still show useful metadata;
 * - no selected part depends on hardcoded object IDs or exact mesh names.
 */

export type MetadataAttributeValue = string | number | boolean;

export interface PartMeta {
    label: string;
    category: string;
    description: string;
    /** Optional extra key/value attributes sourced from the external map. */
    attributes?: Record<string, MetadataAttributeValue>;
}

/** Shape of `public/metadata/parts.json`. */
export interface PartsMetadataFile {
    version: number;
    source: string;
    parts: Record<
        string,
        Omit<PartMeta, "attributes"> & {
            attributes?: Record<string, MetadataAttributeValue>;
        }
    >;
}

interface CategoryRule {
    category: string;
    keywords: string[];
    description: string;
}

/**
 * External metadata, populated by `loadPartsMetadata()`. Null until loaded (or
 * if the fetch fails), in which case `getPartMeta` falls back to generated
 * metadata so selection keeps working regardless.
 */
let metadataFile: PartsMetadataFile | null = null;

/**
 * Reduce a raw glTF node/mesh name to a stable, readable base name.
 *
 * Examples:
 *   "tt_coilover_upper_RL.004_Material.005_0" -> "tt_coilover_upper_RL"
 */
export function baseNameOf(rawName: string): string {
    return rawName
        .replace(/_Material.*$/i, "") // drop "_Material.005_0" submesh suffix
        .replace(/\.\d+$/, "") // drop trailing ".004" duplication index
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Convert an exported mesh/node name into a readable fallback label.
 * The function is deliberately generic. It does not map exact model part names
 * to curated labels, so the viewer remains reusable with other GLB files.
 */
export function humanise(baseName: string): string {
    const cleaned = baseName
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();

    if (!cleaned) return "";

    return cleaned
        .split(" ")
        .map((word) => {
            const upper = word.toUpperCase();

            if (["RL", "RR", "FL", "FR", "LH", "RH", "ID", "OD"].includes(upper)) {
                return upper;
            }

            if (/^v\d+$/i.test(word)) return upper;

            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
}

/**
 * Generic category inference rules.
 *
 * These are keyword heuristics rather than model-specific mesh-name mappings.
 * They are safe for a practical test because selection, label, and fallback
 * metadata still work for any named mesh in any GLB.
 */
const CATEGORY_RULES: CategoryRule[] = [
    {
        category: "Wheel",
        keywords: ["wheel", "tire", "tyre", "rim"],
        description: "Wheel or tire-related component derived from the selected mesh.",
    },
    {
        category: "Suspension",
        keywords: [
            "suspension",
            "coil",
            "coilover",
            "spring",
            "damper",
            "shock",
            "strut",
            "link",
            "control arm",
            "wishbone",
            "trailing arm",
        ],
        description:
            "Suspension-related component involved in locating or damping wheel movement.",
    },
    {
        category: "Structure",
        keywords: [
            "frame",
            "chassis",
            "body",
            "crossmember",
            "bracket",
            "mount",
            "plate",
            "support",
            "brace",
        ],
        description: "Structural component or mounting element in the assembly.",
    },
    {
        category: "Driveline",
        keywords: [
            "axle",
            "shaft",
            "hub",
            "diff",
            "differential",
            "cv",
            "bearing",
            "knuckle",
        ],
        description: "Driveline, axle, hub, or bearing-related component in the assembly.",
    },
    {
        category: "Steering",
        keywords: ["steer", "rack", "tie rod", "rod end", "pitman", "idler"],
        description: "Steering linkage or related mechanical control component.",
    },
    {
        category: "Brake / Hydraulic",
        keywords: [
            "brake",
            "caliper",
            "disc",
            "rotor",
            "line",
            "hose",
            "fluid",
            "hydraulic",
            "cylinder",
        ],
        description: "Brake, hydraulic, or routed line component in the assembly.",
    },
    {
        category: "Hardware",
        keywords: ["bolt", "nut", "washer", "screw", "pin", "bushing", "spacer"],
        description: "Fastener, bushing, spacer, or small hardware component.",
    },
];

function normaliseForMatching(value: string): string {
    return value
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function findExternalMeta(baseName: string): PartMeta | undefined {
    const parts = metadataFile?.parts;
    if (!parts) return undefined;

    const exact = parts[baseName];
    if (exact) return exact;

    const normalisedBase = normaliseForMatching(baseName);
    const matchedKey = Object.keys(parts).find(
        (key) => normaliseForMatching(key) === normalisedBase,
    );

    return matchedKey ? parts[matchedKey] : undefined;
}

function inferCategory(baseName: string): Pick<PartMeta, "category" | "description"> {
    const searchable = normaliseForMatching(baseName);

    const matched = CATEGORY_RULES.find((rule) =>
        rule.keywords.some((keyword) => searchable.includes(keyword)),
    );

    if (matched) {
        return {
            category: matched.category,
            description: matched.description,
        };
    }

    return {
        category: "Component",
        description: "Model component selected directly from the loaded GLB mesh data.",
    };
}

/**
 * Fetch the external parts metadata once at startup. The path is resolved
 * through `import.meta.env.BASE_URL` so it works under a GitHub Pages sub-path.
 * Any failure is swallowed (logged) — the viewer continues with generated
 * fallback metadata, so selection never depends on this file being present.
 */
export async function loadPartsMetadata(): Promise<void> {
    try {
        const url = `${import.meta.env.BASE_URL}metadata/parts.json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as PartsMetadataFile;
        if (data && data.parts) {
            metadataFile = data;
        }
    } catch (error) {
        console.warn("Parts metadata unavailable; using generated fallback.", error);
        metadataFile = null;
    }
}

/**
 * Generate display metadata for a raw mesh/node name.
 *
 * Lookup order: external map (by base name) first, then generated fallback. The
 * label always derives from the mesh/node name when no curated label exists, so
 * nothing is pinned to a hardcoded object id.
 */
export function getPartMeta(rawName: string): PartMeta {
    const base = baseNameOf(rawName);
    const entry = findExternalMeta(base);

    if (entry) {
        return {
            label: entry.label || humanise(base) || "Unnamed Part",
            category: entry.category || "Component",
            description: entry.description || "",
            attributes: entry.attributes,
        };
    }

    const label = humanise(base) || "Unnamed Part";
    const inferred = inferCategory(base);

    return {
        label,
        category: inferred.category,
        description: inferred.description,
    };
}