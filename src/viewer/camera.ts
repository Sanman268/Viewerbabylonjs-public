import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import "@babylonjs/core/Cameras/Inputs/freeCameraKeyboardMoveInput";
import "@babylonjs/core/Cameras/Inputs/freeCameraMouseInput";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import "@babylonjs/core/Animations/animatable";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import "@babylonjs/core/Collisions/collisionCoordinator";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Movement keys for walk mode, mapped to their per-frame direction. */
const WALK_KEYS: Record<string, "forward" | "back" | "left" | "right"> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

interface CameraHome {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

export type CameraMode = "orbit" | "walk";

/**
 * Wraps an ArcRotateCamera with model-aware framing, sensible zoom limits and a
 * smooth "reset view" that returns to the default framing.
 *
 * Panning is disabled so the model always stays centred on the orbit target,
 * which keeps rotation predictable as required by the brief.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  /** First-person "walk" camera: WASD / arrows to walk, mouse-drag to look. */
  readonly walkCamera: UniversalCamera;
  private home: CameraHome | null = null;
  private _mode: CameraMode = "orbit";
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;

  /** Invisible floor the walker stands on; sized in frameToBounds(). */
  private floor: Mesh | null = null;
  /** Eye height above the floor (model-relative), set in frameToBounds(). */
  private eyeHeight = 1.7;
  /** Floor level and model centre, used to spawn the walker, set in frameToBounds(). */
  private floorY = 0;
  private readonly modelCenter = Vector3.Zero();
  /** Currently-held movement keys, driven by the keyboard observable. */
  private readonly pressed = new Set<string>();

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;

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

    // Walk camera: a first-person controller. Created up front but left
    // detached until the user switches to walk mode. Movement is handled by a
    // custom horizontal walker (below) so looking up/down never lifts the player
    // off the ground; gravity + an ellipsoid collider keep it grounded.
    this.walkCamera = new UniversalCamera("walkCamera", new Vector3(0, 0, -10), scene);
    this.walkCamera.inputs.removeByType("FreeCameraKeyboardMoveInput"); // custom walker instead
    this.walkCamera.checkCollisions = true;
    this.walkCamera.applyGravity = true;
    this.walkCamera.inertia = 0.6; // a touch of glide, not floaty
    this.walkCamera.minZ = 0.05;

    scene.collisionsEnabled = true;

    // Custom WASD walker: move along the camera's *horizontal* facing only, so
    // pitch (looking up/down) never adds vertical motion — gravity owns Y.
    scene.onKeyboardObservable.add((info) => {
      const code = (info.event as KeyboardEvent).code;
      if (!(code in WALK_KEYS)) return;
      if (info.type === KeyboardEventTypes.KEYDOWN) this.pressed.add(code);
      else this.pressed.delete(code);
    });
    scene.onBeforeRenderObservable.add(() => this.stepWalk());

    // Game-style mouse look: while walking, capture the pointer so moving the
    // mouse turns the view continuously (no drag). Clicking the canvas re-locks
    // after the browser releases the cursor (e.g. when the user presses Esc).
    canvas.addEventListener("pointerdown", () => {
      if (this._mode === "walk" && document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock();
      }
    });

    // The arc camera is created first, so it stays the active camera by default.
    scene.activeCamera = this.camera;
  }

  /** Per-frame horizontal movement for walk mode (no-op in orbit mode). */
  private stepWalk(): void {
    if (this._mode !== "walk" || this.pressed.size === 0) return;

    // Forward/right flattened onto the ground plane.
    const forward = this.walkCamera.getDirection(Vector3.Forward());
    forward.y = 0;
    forward.normalize();
    const right = this.walkCamera.getDirection(Vector3.Right());
    right.y = 0;
    right.normalize();

    const move = Vector3.Zero();
    for (const code of this.pressed) {
      const dir = WALK_KEYS[code];
      if (dir === "forward") move.addInPlace(forward);
      else if (dir === "back") move.subtractInPlace(forward);
      else if (dir === "right") move.addInPlace(right);
      else if (dir === "left") move.subtractInPlace(right);
    }
    if (move.lengthSquared() === 0) return;

    // Feed the collision-aware movement integrator (same channel the built-in
    // keyboard input uses), scaled by the model-relative walk speed.
    move.normalize().scaleInPlace(this.walkCamera.speed);
    this.walkCamera.cameraDirection!.addInPlace(move);
  }

  get mode(): CameraMode {
    return this._mode;
  }

  /** Switch between orbit and walk cameras, handing off control cleanly. */
  setMode(mode: CameraMode): void {
    if (mode === this._mode) return;
    this._mode = mode;

    if (mode === "walk") {
      // Spawn standing on the floor at eye height, out where the orbit camera
      // was looking from (its x/z), facing the model horizontally — so it reads
      // like stepping into the scene rather than dropping from above.
      const from = this.camera.position;
      this.walkCamera.position.set(from.x, this.floorY + this.eyeHeight, from.z);
      this.walkCamera.setTarget(
        new Vector3(this.modelCenter.x, this.floorY + this.eyeHeight, this.modelCenter.z)
      );
      this.pressed.clear();
      this.camera.detachControl();
      this.scene.activeCamera = this.walkCamera;
      this.walkCamera.attachControl(this.canvas, true);
      // Keyboard movement is delivered via canvas key events, so the canvas must
      // hold focus for WASD to work before the user clicks to look around.
      if (this.canvas.tabIndex < 0) this.canvas.tabIndex = 0;
      this.canvas.focus();
      // Capture the cursor for game-style mouse look. Allowed here because the
      // mode switch originates from the toolbar button click (a user gesture).
      void this.canvas.requestPointerLock();
    } else {
      if (document.pointerLockElement) document.exitPointerLock(); // release cursor
      this.walkCamera.detachControl();
      this.scene.activeCamera = this.camera;
      this.camera.attachControl(this.canvas, true);
    }
  }

  /** Toggle orbit <-> walk and return the resulting mode. */
  toggleMode(): CameraMode {
    this.setMode(this._mode === "orbit" ? "walk" : "orbit");
    return this._mode;
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

    // --- Walk mode setup, scaled to the model -------------------------------
    const height = Math.max(max.y - min.y, diagonal * 0.1);
    const groundSpan = Math.max(max.x - min.x, max.z - min.z) || diagonal;

    // Eye height is tied to the overall model scale (diagonal), not the model's
    // short vertical extent — a wide, flat assembly would otherwise put the eye
    // almost on the floor. This stands the viewer up like a person beside it.
    this.eyeHeight = Math.max(height * 0.66, diagonal * 0.38);
    this.walkCamera.speed = diagonal * 0.012; // a measured walking pace
    this.walkCamera.maxZ = this.camera.maxZ;

    // Body collider: a capsule whose vertical radius is half the eye height, so
    // its base sits on the floor while the camera (its top) rests at eye level.
    // Collider base = camera.y - 2 * ellipsoid.y, so this rests at floor + eye.
    const bodyRadius = Math.max(groundSpan * 0.02, diagonal * 0.01);
    this.walkCamera.ellipsoid = new Vector3(bodyRadius, this.eyeHeight / 2, bodyRadius);

    // Gentle per-frame gravity, proportional to scale so the fall feels natural.
    this.scene.gravity = new Vector3(0, -height * 0.015, 0);

    // Invisible floor at the base of the model for the walker to stand on.
    if (!this.floor) {
      this.floor = CreateGround("walkFloor", { width: 1, height: 1 }, this.scene);
      this.floor.isVisible = false;
      this.floor.isPickable = false;
      this.floor.checkCollisions = true;
    }
    this.floor.scaling.set(groundSpan * 20, 1, groundSpan * 20);
    this.floor.position.set(center.x, min.y, center.z);
    this.floorY = min.y;
    this.modelCenter.copyFrom(center);

    this.home = {
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
      target: center.clone(),
    };
  }

  /** Animate back to the recorded home view, returning to orbit mode first. */
  reset(): void {
    this.setMode("orbit"); // reset is an orbit-view action
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

  /**
   * Zoom-to-fit a subset of meshes (e.g. a part chosen from search): animate the
   * orbit target onto the part and the radius so it fills the view. The current
   * viewing angle and the recorded "home" view are left untouched, so Reset
   * still returns to the full-model framing.
   */
  focusOnMeshes(meshes: AbstractMesh[]): void {
    this.setMode("orbit"); // zoom-to-fit animates the orbit camera
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
      if (mesh.getTotalVertices() === 0) continue;
      mesh.computeWorldMatrix(true);
      const bb = mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(bb.minimumWorld);
      max.maximizeInPlace(bb.maximumWorld);
    }
    if (!isFinite(min.x)) return; // nothing pickable to frame

    const center = min.add(max).scale(0.5);
    const diagonal = max.subtract(min).length() || 1;
    // 1.6× leaves margin around a single part; clamp to the configured zoom
    // limits so we never push through the near plane or past the far limit.
    const radius = clamp(
      diagonal * 1.6,
      this.camera.lowerRadiusLimit ?? 0,
      this.camera.upperRadiusLimit ?? Number.MAX_VALUE
    );

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    const fps = 60;
    const frames = 30;

    Animation.CreateAndStartAnimation(
      "focus_radius",
      this.camera,
      "radius",
      fps,
      frames,
      this.camera.radius,
      radius,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      ease
    );
    Animation.CreateAndStartAnimation(
      "focus_target",
      this.camera,
      "target",
      fps,
      frames,
      this.camera.target.clone(),
      center,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      ease
    );
  }
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}
