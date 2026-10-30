"use client";

// STYLIZED 3D BATTING PROTOTYPE (experimental, hidden route /prototype-3d).
// Not wired into the main game — a feasibility demo of real-time 3D gameplay on
// the web stack (raw three.js, low-poly, brand palette). Mechanic: a ball is
// bowled down the pitch; tap / click / Space to time the shot. Good timing =
// SIX or FOUR; mistime it and you're bowled. Endless net practice.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Hud = { runs: number; balls: number; wkts: number; last: string; lastKind: string };

const CONTACT_Z = 2.0; // where the bat meets the ball
const CONTACT_TOL = 1.0; // timing tolerance around CONTACT_Z
const TRAVEL_MS = 1500; // bowler release -> reaching the bat
const STUMP_X = 0.5; // half-width of the stumps (for "bowled")

export default function Prototype3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<Hud>({ runs: 0, balls: 0, wkts: 0, last: "Tap or press Space to bat", lastKind: "idle" });
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b10);
    scene.fog = new THREE.Fog(0x070b10, 14, 34);

    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 3.1, 6.2);
    camera.lookAt(0, 1, -6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    // --- Lights: ambient + a floodlight + teal/gold brand glow ---
    scene.add(new THREE.AmbientLight(0x6a7a8a, 0.9));
    const flood = new THREE.DirectionalLight(0xffffff, 1.4);
    flood.position.set(4, 12, 6);
    scene.add(flood);
    const teal = new THREE.PointLight(0x22e6a8, 0.8, 40);
    teal.position.set(-6, 5, 2);
    scene.add(teal);
    const gold = new THREE.PointLight(0xe8b34c, 0.5, 40);
    gold.position.set(6, 4, -6);
    scene.add(gold);

    // --- Ground + pitch strip ---
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 80),
      new THREE.MeshStandardMaterial({ color: 0x0c3a22, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -14;
    scene.add(ground);

    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 26),
      new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.9 })
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0.01, -8);
    scene.add(pitch);

    // --- Stumps behind the batter (z = CONTACT_Z + 0.8) ---
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.6 });
    const stumps = new THREE.Group();
    for (let i = -1; i <= 1; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), stumpMat);
      s.position.set(i * 0.22, 0.5, 0);
      stumps.add(s);
    }
    stumps.position.set(0, 0, CONTACT_Z + 0.8);
    scene.add(stumps);

    // --- Bat (a box) at the batting crease ---
    const bat = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.0, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xe8b34c, roughness: 0.5, metalness: 0.1 })
    );
    const batPivot = new THREE.Group();
    batPivot.position.set(0.55, 0.9, CONTACT_Z);
    bat.position.set(0, -0.35, 0);
    batPivot.add(bat);
    batPivot.rotation.z = 0.5;
    scene.add(batPivot);

    // --- Ball ---
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xd8443a, roughness: 0.4 })
    );
    scene.add(ball);

    // --- Game state (kept in closure refs, not React state, for per-frame) ---
    let runs = 0, balls = 0, wkts = 0;
    type Phase = "incoming" | "flying" | "resolved";
    let phase: Phase = "incoming";
    let deliveryStart = performance.now();
    let laneX = (Math.random() - 0.5) * 0.7; // slight line variation
    let swung = false;
    const vel = new THREE.Vector3();
    let resolveAt = 0;

    function pushHud(last: string, lastKind: string) {
      setHud({ runs, balls, wkts, last, lastKind });
    }

    function newDelivery() {
      phase = "incoming";
      swung = false;
      laneX = (Math.random() - 0.5) * 0.7;
      deliveryStart = performance.now();
      batPivot.rotation.z = 0.5;
    }

    function resolve(last: string, kind: string, delay = 1100) {
      phase = "resolved";
      balls += 1;
      pushHud(last, kind);
      resolveAt = performance.now() + delay;
    }

    function swing() {
      if (phase !== "incoming" || swung) return;
      swung = true;
      batPivot.rotation.z = -0.7; // swing the bat through
      const z = ball.position.z;
      const q = 1 - Math.abs(z - CONTACT_Z) / CONTACT_TOL; // 1 = perfect
      if (q <= 0) {
        // mistimed air-swing; ball carries on — stumps check happens on pass
        return;
      }
      phase = "flying";
      if (q > 0.72) {
        runs += 6;
        vel.set((Math.random() - 0.5) * 3, 9, -14);
        resolve("SIX! 🎯", "six");
      } else if (q > 0.4) {
        runs += 4;
        vel.set((Math.random() - 0.5) * 5, 3.5, -12);
        resolve("FOUR 🏏", "four");
      } else {
        runs += 1;
        vel.set((Math.random() - 0.5) * 6, 2, 4);
        resolve("Edged — 1 run", "one");
      }
    }

    const onPointer = () => swing();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); swing(); }
    };
    renderer.domElement.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let prev = performance.now();
    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      if (phase === "incoming") {
        const p = (now - deliveryStart) / TRAVEL_MS;
        if (p >= 1.25) {
          // ball passed the bat without a scoring shot
          if (Math.abs(laneX) < STUMP_X) { wkts += 1; resolve("BOWLED! OUT", "out"); }
          else { resolve(swung ? "Missed" : "Left it", "dot"); }
        } else {
          ball.position.z = THREE.MathUtils.lerp(-18, CONTACT_Z + 1.2, p);
          ball.position.x = laneX;
          // gentle bounce ~ mid-pitch
          ball.position.y = 0.9 - 0.7 * Math.sin(Math.min(p, 1) * Math.PI) + 0.1;
          if (ball.position.y < 0.16) ball.position.y = 0.16;
        }
      } else if (phase === "flying") {
        vel.y -= 16 * dt; // gravity
        ball.position.addScaledVector(vel, dt);
        if (ball.position.y < 0.16) ball.position.y = 0.16;
      }

      if (phase === "resolved" && now >= resolveAt) {
        ball.position.set(laneX, 1.2, -18);
        newDelivery();
      }

      // ease the bat back to ready
      batPivot.rotation.z += (0.5 - batPivot.rotation.z) * 0.12;
      renderer.render(scene, camera);
    }
    ball.position.set(laneX, 1.2, -18);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
    };
  }, [started]);

  const kindColor: Record<string, string> = {
    six: "text-accent", four: "text-accent", one: "text-gold",
    out: "text-danger", dot: "text-foreground-muted", idle: "text-foreground-muted",
  };

  return (
    <main className="flex-1 flex flex-col">
      <div className="px-4 pt-4 pb-2 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Experimental · 3D Prototype</p>
        <div className="mt-2 flex items-center justify-center gap-5 text-sm">
          <span className="font-mono"><b className="text-accent text-lg">{hud.runs}</b> runs</span>
          <span className="font-mono text-foreground-muted">{hud.balls} balls</span>
          <span className="font-mono"><b className="text-danger">{hud.wkts}</b> out</span>
        </div>
        <p className={`mt-1 text-lg font-black italic ${kindColor[hud.lastKind] ?? "text-foreground"}`}>{hud.last}</p>
      </div>

      <div className="relative mx-auto w-full max-w-2xl flex-1 min-h-[60vh]">
        <div ref={mountRef} className="absolute inset-0 rounded-2xl overflow-hidden border border-border" />
        {!started && (
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/50 backdrop-blur-sm"
          >
            <span className="text-2xl font-black italic text-accent">Tap to Bat 🏏</span>
            <span className="text-sm text-foreground-muted">Time your shot — tap or press Space as the ball arrives</span>
          </button>
        )}
      </div>

      <p className="px-4 py-3 text-center text-xs text-foreground-muted">
        Prototype only — not part of the main game. Tap / click / Space to swing.
      </p>
    </main>
  );
}
