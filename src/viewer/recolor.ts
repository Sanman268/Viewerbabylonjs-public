import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Re-skin the assembly with proper "design-tool" material models.
 *
 * The source GLB ships near-black greyscale materials (every baseColorFactor is
 * ~0.0–0.13), so the model reads as dark gunmetal no matter how it is lit. We
 * override the glTF PBR materials by name with a curated set of realistic
 * finishes rather than flat colours:
 *
 *   - "paint": a matte pigment base under a glossy clear-coat layer, like the
 *     powder-coated frame and the painted springs / sway bars. The clear-coat
 *     adds crisp reflections and depth on top of the colour without washing it
 *     out (the base stays low so it never clips to flat white).
 *   - "metal": metallic with controlled roughness for polished chrome / rims.
 *   - "rubber": matte dielectric with a faint sheen, for the tyres.
 *
 * Mapping is keyed on the glTF material name because, for this model, the iconic
 * parts map one-to-one to a material (Material.005 = the only metallic material,
 * used solely by the coilover = the coil spring; Material.008 = matte = tyres;
 * Material.010 = the only pre-coloured material = the bar/link = yellow).
 */
type FinishKind = "paint" | "metal" | "rubber";

interface Finish {
  kind: FinishKind;
  color: string; // sRGB hex
  roughness: number;
  /** Clear-coat strength for "paint" (0–1). Lower on whites to avoid hot spots. */
  clearCoat?: number;
  /** Anisotropy strength for "metal" (0–1) — stretches the highlight = brushed. */
  anisotropy?: number;
}

const PALETTE: Record<string, Finish> = {
  // Coil spring — glossy blue powder-coat.
  "Material.005": { kind: "paint", color: "#0b46c8", roughness: 0.55, clearCoat: 1.0 },
  // Sway bar / links — glossy yellow powder-coat.
  "Material.010": { kind: "paint", color: "#f0b000", roughness: 0.5, clearCoat: 1.0 },
  // Main structure (frame + control links) — satin white powder-coat. Light-grey
  // base + gentle clear-coat so shading stays readable and it never blows out.
  "Material.003": { kind: "paint", color: "#cfd3d8", roughness: 0.6, clearCoat: 0.5 },
  // Secondary structure / knuckle — slightly darker satin white.
  "Material.001": { kind: "paint", color: "#c3c7cc", roughness: 0.6, clearCoat: 0.45 },
  // Light painted hardware.
  "Material.007": { kind: "paint", color: "#d0d4d9", roughness: 0.55, clearCoat: 0.5 },
  // Shock body — brushed aluminium (anisotropic stretched highlight).
  "Material.006": { kind: "metal", color: "#c3c7cd", roughness: 0.38, anisotropy: 0.85 },
  // Wheel rims / hubs — polished metal.
  "Material.009": { kind: "metal", color: "#cbced3", roughness: 0.26 },
  // Brushed metal fittings.
  "Material.004": { kind: "metal", color: "#a6acb4", roughness: 0.34 },
  // Upper control link hardware — brushed steel. Was near-black gunmetal, which
  // made the links disappear in shadow; lifted so every part stays readable.
  Material: { kind: "metal", color: "#8d929a", roughness: 0.42, anisotropy: 0.5 },
  // Axle housing — slightly darker brushed steel, still clearly visible.
  "Material.002": { kind: "metal", color: "#7f848c", roughness: 0.45 },
  // Tyres — matte rubber with a faint sheen.
  "Material.008": { kind: "rubber", color: "#141416", roughness: 0.82 },
};

/** Apply the studio material set to the loaded model's materials. */
export function recolorVectary(scene: Scene): void {
  for (const mat of scene.materials) {
    const finish = PALETTE[mat.name];
    if (!finish || !(mat instanceof PBRMaterial)) continue;

    mat.albedoColor = Color3.FromHexString(finish.color);
    mat.albedoTexture = null; // drop any baked factor texture so the colour reads cleanly
    mat.roughness = finish.roughness;

    switch (finish.kind) {
      case "paint":
        mat.metallic = 0;
        // Glossy clear-coat over the matte pigment — the automotive-paint look.
        mat.clearCoat.isEnabled = true;
        mat.clearCoat.intensity = finish.clearCoat ?? 0.8;
        mat.clearCoat.roughness = 0.08; // sharp clear layer
        break;
      case "metal":
        mat.metallic = 1;
        if (finish.anisotropy) {
          // Stretch the specular highlight to fake brush/lathe marks. Direction
          // defaults to the U tangent, which follows the part's surface flow.
          mat.anisotropy.isEnabled = true;
          mat.anisotropy.intensity = finish.anisotropy;
        }
        break;
      case "rubber":
        mat.metallic = 0;
        // A whisper of clear-coat gives tyres the faint sheen real rubber has.
        mat.clearCoat.isEnabled = true;
        mat.clearCoat.intensity = 0.15;
        mat.clearCoat.roughness = 0.6;
        break;
    }
  }
}
