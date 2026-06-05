import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import "@babylonjs/core/Animations/animatable"; // enables scene.beginAnimation used by reset
import type { Scene } from "@babylonjs/core/scene";

interface CameraHome {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

/**
 * Wraps an ArcRotateCamera with model-aware framing, sensible zoom limits and a
 * smooth "reset view" that returns to the default framing.
 *
 * Panning is disabled so the model always stays centred on the orbit target,
 * which keeps rotation predictable as required by the brief.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  private home: CameraHome | null = null;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    // A 3/4 starting view tends to read well for a mechanical assembly.
    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 3,
      Math.PI / 2.6,
      10,
      Vector3.Zero(),
      scene
    );

    this.camera.attachControl(canvas, true);
    this.camera.panningSensibility = 0; // keep the model centred
    this.camera.wheelDeltaPercentage = 0.01; // smooth, distance-relative zoom
    this.camera.pinchDeltaPercentage = 0.01; // smooth pinch zoom on touch
    this.camera.useNaturalPinchZoom = true;
    this.camera.inertia = 0.9;
    this.camera.angularSensibilityX = 800;
    this.camera.angularSensibilityY = 800;
  }

  /**
   * Frame the camera to a world-space bounding box and record it as the
   * default "home" view for reset.
   */
  frameToBounds(min: Vector3, max: Vector3): void {
    const center = min.add(max).scale(0.5);
    const diagonal = max.subtract(min).length() || 1;

    this.camera.setTarget(center);
    this.camera.radius = diagonal * 1.1;
    this.camera.lowerRadiusLimit = diagonal * 0.25;
    this.camera.upperRadiusLimit = diagonal * 3;
    this.camera.minZ = Math.max(0.01, diagonal * 0.005);
    this.camera.maxZ = diagonal * 20;

    this.home = {
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
      target: center.clone(),
    };
  }

  /** Animate back to the recorded home view. */
  reset(): void {
    if (!this.home) return;

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    const fps = 60;
    const frames = 30;

    const animate = (prop: string, to: number) =>
      Animation.CreateAndStartAnimation(
        `reset_${prop}`,
        this.camera,
        prop,
        fps,
        frames,
        (this.camera as unknown as Record<string, number>)[prop],
        to,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
        ease
      );

    animate("alpha", this.home.alpha);
    animate("beta", this.home.beta);
    animate("radius", this.home.radius);
    Animation.CreateAndStartAnimation(
      "reset_target",
      this.camera,
      "target",
      fps,
      frames,
      this.camera.target.clone(),
      this.home.target.clone(),
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      ease
    );
  }
}
