import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { landingStyles } from "./landingStyles";

const SCENE_COUNT = 5;
const TUTOR_PULSE_INTERVAL_MS = 6_500;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ambient particle field. Purely decorative: it never carries information and
 * is skipped entirely when the visitor asked for reduced motion.
 */
function useParticles(canvasRef: React.RefObject<HTMLCanvasElement | null>, enabled: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      width = canvas.width = canvas.offsetWidth * ratio;
      height = canvas.height = canvas.offsetHeight * ratio;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      depth: Math.random(),
      speed: Math.random() * 0.3 + 0.08,
      isTutorColour: Math.random() > 0.5,
    }));

    const draw = () => {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        particle.y -= particle.speed * (0.5 + particle.depth) * ratio;
        particle.x += Math.sin((particle.y + index * 37) / 340) * 0.18 * ratio;
        if (particle.y < -12) {
          particle.y = height + 12;
          particle.x = Math.random() * width;
        }
        context.beginPath();
        context.arc(particle.x, particle.y, (0.6 + particle.depth * 1.5) * ratio, 0, Math.PI * 2);
        context.fillStyle = particle.isTutorColour
          ? `rgba(34, 197, 94, ${0.1 + particle.depth * 0.4})`
          : `rgba(130, 170, 240, ${0.08 + particle.depth * 0.3})`;
        context.fill();
      });
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [canvasRef, enabled]);
}

export function LandingPage() {
  const [activeScene, setActiveScene] = useState(0);

  const deckRef = useRef<HTMLDivElement | null>(null);
  const sceneRefs = useRef<Array<HTMLElement | null>>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<HTMLDivElement | null>(null);
  const beamRef = useRef<HTMLSpanElement | null>(null);
  const sparkRef = useRef<HTMLSpanElement | null>(null);
  const reticleRef = useRef<HTMLSpanElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);

  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  useParticles(canvasRef, !reduced);

  /** Sends a light pulse from the tutor layer down to the suggestion it refers to. */
  const pulse = useCallback(() => {
    const rig = rigRef.current;
    const beam = beamRef.current;
    const spark = sparkRef.current;
    const reticle = reticleRef.current;
    if (!rig || !beam || !spark || !reticle) return;

    const tutorLayer = rig.querySelector('[data-i="3"]');
    const targetLayer = rig.querySelector('[data-i="2"]');
    if (!tutorLayer || !targetLayer) return;

    const rigBox = rig.getBoundingClientRect();
    const tutorBox = tutorLayer.getBoundingClientRect();
    const targetBox = targetLayer.getBoundingClientRect();
    const top = tutorBox.bottom - rigBox.top;
    const height = Math.max(30, targetBox.top + 30 - tutorBox.bottom);

    beam.style.top = `${top}px`;
    beam.style.height = `${height}px`;
    beam.style.opacity = "0.95";
    spark.style.opacity = "1";
    spark.style.left = "calc(50% - 4.5px)";

    const started = performance.now();
    const travel = (now: number) => {
      const progress = Math.min(1, (now - started) / 520);
      spark.style.top = `${top + height * progress - 4.5}px`;
      if (progress < 1) {
        window.requestAnimationFrame(travel);
        return;
      }
      spark.style.opacity = "0";
      beam.style.opacity = "0";
      reticle.classList.remove("is-on");
      void reticle.offsetWidth;
      reticle.classList.add("is-on");
    };
    window.requestAnimationFrame(travel);
  }, []);

  /* One scroll gesture equals one scene: the observer only reports the snapped scene. */
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.5) return;
          const index = sceneRefs.current.indexOf(entry.target as HTMLElement);
          if (index >= 0) setActiveScene(index);
        });
      },
      { root: deck, threshold: [0.5, 0.75] },
    );

    sceneRefs.current.forEach((scene) => {
      if (scene) observer.observe(scene);
    });
    return () => observer.disconnect();
  }, []);

  /* Scene side effects: the tutor pulse and the closing flash. */
  useEffect(() => {
    if (reduced) return;

    if (activeScene === 3) {
      const timer = window.setTimeout(pulse, 620);
      return () => window.clearTimeout(timer);
    }

    if (activeScene === 4) {
      const flash = flashRef.current;
      const timer = window.setTimeout(() => {
        if (!flash) return;
        flash.classList.remove("is-on");
        void flash.offsetWidth;
        flash.classList.add("is-on");
      }, 520);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [activeScene, pulse, reduced]);

  /* While the visitor stays on the opening scene the animation keeps running by itself. */
  useEffect(() => {
    if (reduced || activeScene !== 0) return;
    const interval = window.setInterval(pulse, TUTOR_PULSE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [activeScene, pulse, reduced]);

  /* Pointer parallax on the whole rig. */
  useEffect(() => {
    if (reduced || typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    };
    const loop = () => {
      currentX += (targetX - currentX) * 0.07;
      currentY += (targetY - currentY) * 0.07;
      if (tiltRef.current) {
        tiltRef.current.style.transform = `rotateY(${currentX * 14}deg) rotateX(${-currentY * 8}deg)`;
      }
      frame = window.requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove);
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const goToScene = useCallback(
    (index: number) => {
      sceneRefs.current[index]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    },
    [reduced],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        setActiveScene((current) => {
          goToScene(Math.min(SCENE_COUNT - 1, current + 1));
          return current;
        });
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        setActiveScene((current) => {
          goToScene(Math.max(0, current - 1));
          return current;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToScene]);

  const registerScene = (index: number) => (element: HTMLElement | null) => {
    sceneRefs.current[index] = element;
  };

  const sceneClass = (index: number) =>
    `lp-scene${activeScene === index ? " is-on" : ""}${index === 4 ? " lp-scene-final" : ""}`;

  return (
    <div className="lp" data-scene={activeScene}>
      <style>{landingStyles}</style>

      <div className="lp-glow" />
      <canvas className="lp-fx" ref={canvasRef} aria-hidden="true" />
      <div className="lp-flash" ref={flashRef} aria-hidden="true" />

      <div className="lp-rigwrap" aria-hidden="true">
        <div className="lp-camera">
          <div className="lp-tilt" ref={tiltRef}>
            <div className="lp-rings">
              <div className="lp-ring lp-ring-1" />
              <div className="lp-ring lp-ring-2" />
              <div className="lp-ring lp-ring-3" />
            </div>

            <div className="lp-rig" ref={rigRef}>
              <span className="lp-beam" ref={beamRef} />
              <span className="lp-spark" ref={sparkRef} />

              <div className="lp-layer" data-i="0">
                <span className="lp-glass" />
                <p className="lp-lh">
                  <span className="lp-dot" /> notizen.md
                </p>
                <p className="lp-code">
                  <span className="lp-n">1</span>
                  <span className="lp-b"># Recherche: KI im Kundenservice</span>
                  <br />
                  <span className="lp-n">2</span>Erste Quellen gesammelt …
                  <br />
                  <span className="lp-n">3</span>
                  <span className="lp-caret" />
                </p>
              </div>

              <div className="lp-layer" data-i="1">
                <span className="lp-glass" />
                <p className="lp-lh">
                  <span className="lp-dot" /> Explorer · Branch
                </p>
                <p className="lp-pills">
                  <span className="lp-pill lp-pill-on">notizen.md</span>
                  <span className="lp-pill">projekt/</span>
                  <span className="lp-pill">feature/recherche</span>
                </p>
              </div>

              <div className="lp-layer" data-i="2">
                <span className="lp-glass" />
                <p className="lp-lh">
                  <span className="lp-dot" /> Copilot
                </p>
                <p className="lp-sugg">
                  <span className="lp-reticle" ref={reticleRef} />+ ## Quellen &nbsp; + ## Offene
                  Fragen
                </p>
              </div>

              <div className="lp-layer lp-layer-tutor" data-i="3">
                <span className="lp-glass" />
                <p className="lp-lh" style={{ color: "#22c55e" }}>
                  <span className="lp-dot lp-dot-tutor" /> KI-Tutor
                </p>
                <div className="lp-bubble">
                  <span className="lp-avatar">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <p>Der Vorschlag darunter kommt von Copilot — prüf ihn, bevor du Tab drückst.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-top">
        <span className="lp-mark">
          <GraduationCap className="h-4 w-4" />
        </span>
        <b>AI Training Lab</b>
        <Link
          className="lp-signin"
          to="/anmelden"
          search={{ mode: "registrieren" }}
          style={{
            marginLeft: "auto",
            marginRight: "8px",
            borderColor: "var(--lp-tutor)",
            background: "var(--lp-tutor)",
            color: "#04240f",
          }}
        >
          Registrieren
        </Link>
        <Link className="lp-signin" to="/anmelden" style={{ marginLeft: 0 }}>
          Anmelden
        </Link>
      </div>

      <nav className="lp-dots" aria-label="Abschnitte">
        {Array.from({ length: SCENE_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            className={activeScene === index ? "is-on" : undefined}
            aria-label={`Abschnitt ${index + 1} von ${SCENE_COUNT}`}
            aria-current={activeScene === index ? "true" : undefined}
            onClick={() => goToScene(index)}
          />
        ))}
      </nav>

      <p className="lp-hint" style={{ opacity: activeScene === 0 ? 1 : 0 }} aria-hidden="true">
        Scrollen
        <i />
      </p>

      <div className="lp-deck" ref={deckRef}>
        <section className={sceneClass(0)} ref={registerScene(0)}>
          <div className="lp-col">
            <p className="lp-kicker">Interaktive KI-Schulung</p>
            <div className="lp-mask">
              <span>
                <h1>Über KI reden</h1>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h1>können viele.</h1>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h1>
                  <em>Bedienen</em> wenige.
                </h1>
              </span>
            </div>
            <p className="lp-body">
              Hier arbeitest du in echten Nachbauten von VS&nbsp;Code, GitHub und Copilot — mit
              einem Tutor, der mitliest. Vier Ebenen, eine Übung.
            </p>
            <p className="lp-meta">
              <span className="lp-tag">Keine Installation</span>
              <span className="lp-tag">Keine echten Firmendaten</span>
              <span className="lp-tag lp-tag-green">Tutor auf Deutsch</span>
            </p>
          </div>
        </section>

        <section className={sceneClass(1)} ref={registerScene(1)}>
          <div className="lp-col">
            <p className="lp-kicker">Ebene 1 – 2</p>
            <div className="lp-mask">
              <span>
                <h2>Unten liegt</h2>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h2 className="lp-blue">das Werkzeug.</h2>
              </span>
            </div>
            <p className="lp-body">
              Editor, Dateien, Branches — der Teil, den du selbst bedienst. Im Browser nachgebaut,
              ohne Verbindung zu euren echten Systemen. Ein Fehlklick ist folgenlos und deshalb
              erlaubt.
            </p>
            <p className="lp-meta">
              <span className="lp-tag lp-tag-blue">VS Code</span>
              <span className="lp-tag lp-tag-blue">GitHub</span>
              <span className="lp-tag">3 Härtegrade</span>
            </p>
          </div>
        </section>

        <section className={sceneClass(2)} ref={registerScene(2)}>
          <div className="lp-col">
            <p className="lp-kicker">Ebene 3</p>
            <div className="lp-mask">
              <span>
                <h2>Darüber schlägt</h2>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h2 className="lp-blue">die KI vor.</h2>
              </span>
            </div>
            <p className="lp-body">
              Blau und gestrichelt heißt: vorläufig. Copilot liefert, aber nichts davon ist
              automatisch richtig. Prüfen vor Übernehmen ist bei uns ein eigenes Trainingsmodul.
            </p>
            <p className="lp-meta">
              <span className="lp-tag lp-tag-blue">Copilot</span>
              <span className="lp-tag">Quellen prüfen</span>
            </p>
          </div>
        </section>

        <section className={sceneClass(3)} ref={registerScene(3)}>
          <div className="lp-col">
            <p className="lp-kicker">Ebene 4</p>
            <div className="lp-mask">
              <span>
                <h2>Ganz oben steht</h2>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h2>
                  <em>der Tutor.</em>
                </h2>
              </span>
            </div>
            <p className="lp-body">
              Er kennt deinen Schritt und deinen Zustand, antwortet auf Deutsch und fragt nie, warum
              du das nicht weißt. Grün heißt in der ganzen Plattform: Das kommt von deiner
              Begleitung.
            </p>
            <p className="lp-meta">
              <span className="lp-tag lp-tag-green">Kennt deinen Schritt</span>
              <span className="lp-tag lp-tag-green">Fragt nicht nach</span>
            </p>
          </div>
        </section>

        <section className={sceneClass(4)} ref={registerScene(4)}>
          <div className="lp-col">
            <p className="lp-kicker">Zusammen ergibt das eine Übung</p>
            <div className="lp-mask">
              <span>
                <h2>Und dann</h2>
              </span>
            </div>
            <div className="lp-mask">
              <span>
                <h2>
                  <em>kommst du.</em>
                </h2>
              </span>
            </div>
            <p className="lp-body">
              Zehn Minuten bis zum ersten eigenen Ergebnis. Ohne Installation, ohne Vorwissen, ohne
              dass jemand zusieht.
            </p>
            <Link className="lp-cta" to="/anmelden">
              Erste Übung starten
              <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
