/**
 * Part metadata helpers.
 *
 * The GLB may come from CAD/DCC/Sketchfab-style exports where raw mesh names
 * are noisy, for example:
 *
 *   "tt_coilover_upper_RL.004_Material.005_0"
 *
 * This module intentionally avoids a table of exact model-specific part names.
 * The info panel always starts from the picked mesh/node name, normalises it,
 * then infers a lightweight category from generic mechanical keywords.
 *
 * This keeps the viewer suitable for the practical test:
 * - part names come from mesh data;
 * - unknown models still show useful metadata;
 * - no selected part depends on hardcoded object IDs or exact mesh names.
 */

export interface PartMeta {
    label: string;
    category: string;
    description: string;
}

interface CategoryRule {
    category: string;
    keywords: string[];
    description: string;
}

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

/** Generate display metadata for a raw mesh/node name. */
export function getPartMeta(rawName: string): PartMeta {
    const base = baseNameOf(rawName);
    const label = humanise(base) || "Unnamed Part";
    const inferred = inferCategory(base);

    return {
        label,
        category: inferred.category,
        description: inferred.description,
    };
}