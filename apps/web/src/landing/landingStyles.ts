/**
 * Scoped styles for the public landing page.
 *
 * Everything is nested below `.lp` so the marketing page cannot leak styles
 * into the training UI. The colour values intentionally mirror the design
 * tokens in `styles.css` (`--tutor` for the tutor layer, `--accent` for the
 * simulated tooling) so the landing page and the app stay visually in sync.
 */
export const landingStyles = `
.lp {
  --lp-bg: #05090f;
  --lp-panel: rgba(24, 34, 51, 0.82);
  --lp-line: #2a3a56;
  --lp-line-2: #48607f;
  --lp-fg: #f8fafc;
  --lp-muted: #93a4bd;
  --lp-tutor: #22c55e;
  --lp-tool: #4c8df6;
  --lp-pop: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed;
  inset: 0;
  background: var(--lp-bg);
  color: var(--lp-fg);
  overflow: hidden;
}
.lp *,
.lp *::before,
.lp *::after { box-sizing: border-box; }
.lp h1, .lp h2 {
  margin: 0;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 0.98;
  font-size: clamp(34px, 6.2vw, 80px);
}
.lp p { margin: 0; }
.lp em { font-style: normal; color: var(--lp-tutor); }
.lp .lp-blue { color: var(--lp-tool); }

/* ---------- ambient background ---------- */
.lp-fx { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.lp-glow {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  transition: background 900ms ease;
  background: radial-gradient(58vw 52vh at 68% 50%, rgba(34, 197, 94, 0.13), transparent 66%);
}
.lp[data-scene="1"] .lp-glow {
  background: radial-gradient(58vw 52vh at 62% 58%, rgba(148, 180, 230, 0.12), transparent 66%);
}
.lp[data-scene="2"] .lp-glow {
  background: radial-gradient(58vw 52vh at 62% 48%, rgba(76, 141, 246, 0.2), transparent 64%);
}
.lp[data-scene="3"] .lp-glow {
  background: radial-gradient(62vw 56vh at 60% 48%, rgba(34, 197, 94, 0.26), transparent 62%);
}
.lp[data-scene="4"] .lp-glow {
  background: radial-gradient(70vw 60vh at 50% 50%, rgba(34, 197, 94, 0.18), transparent 60%);
}
.lp-flash {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(ellipse at 58% 50%, rgba(180, 255, 205, 0.5), transparent 55%);
}
.lp-flash.is-on { animation: lp-flash 700ms ease-out; }
@keyframes lp-flash {
  0% { opacity: 0; }
  12% { opacity: 1; }
  100% { opacity: 0; }
}

/* ---------- 3d rig ---------- */
.lp-rigwrap {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  pointer-events: none;
  perspective: 1600px;
  perspective-origin: 50% 46%;
}
.lp-camera {
  position: relative;
  width: min(560px, 78vw);
  height: 380px;
  transform-style: preserve-3d;
  transition: transform 1000ms var(--lp-pop);
  transform: translateY(0) scale(1);
  will-change: transform;
}
.lp-tilt { position: absolute; inset: 0; transform-style: preserve-3d; will-change: transform; }
.lp-rig {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  transition: transform 1000ms var(--lp-pop);
  transform: rotateX(30deg) rotateZ(-6deg);
  will-change: transform;
}

.lp-rings {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 620px;
  height: 620px;
  margin: -310px 0 0 -310px;
  transform-style: preserve-3d;
  transition: opacity 700ms ease;
}
.lp-ring { position: absolute; inset: 0; border-radius: 50%; border: 1px solid rgba(34, 197, 94, 0.3); }
.lp-ring::after {
  content: "";
  position: absolute;
  top: -3px;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--lp-tutor);
  box-shadow: 0 0 18px 4px var(--lp-tutor);
}
.lp-ring-1 { animation: lp-sp1 13s linear infinite; border-color: rgba(76, 141, 246, 0.34); }
.lp-ring-1::after { background: var(--lp-tool); box-shadow: 0 0 18px 4px var(--lp-tool); }
.lp-ring-2 { animation: lp-sp2 21s linear infinite; }
.lp-ring-3 {
  animation: lp-sp3 34s linear infinite;
  border-style: dashed;
  border-color: rgba(148, 163, 184, 0.16);
}
.lp-ring-3::after { display: none; }
@keyframes lp-sp1 {
  from { transform: rotateX(74deg) rotateZ(0) scale(0.6); }
  to { transform: rotateX(74deg) rotateZ(360deg) scale(0.6); }
}
@keyframes lp-sp2 {
  from { transform: rotateX(70deg) rotateZ(360deg) scale(0.86); }
  to { transform: rotateX(70deg) rotateZ(0) scale(0.86); }
}
@keyframes lp-sp3 {
  from { transform: rotateX(78deg) rotateZ(0) scale(1.06); }
  to { transform: rotateX(78deg) rotateZ(360deg) scale(1.06); }
}

.lp-layer {
  position: absolute;
  left: 0;
  right: 0;
  top: 108px;
  height: 164px;
  border-radius: 16px;
  border: 1px solid var(--lp-line-2);
  background: var(--lp-panel);
  backdrop-filter: blur(7px);
  padding: 13px 16px;
  transform-style: preserve-3d;
  box-shadow: 0 44px 90px -55px #000, inset 0 1px 0 rgba(255, 255, 255, 0.07);
  transition:
    transform 1000ms var(--lp-pop),
    opacity 700ms ease,
    filter 700ms ease,
    box-shadow 700ms ease,
    border-color 700ms ease;
  will-change: transform, opacity, filter;
}
.lp-layer-tutor {
  border-color: rgba(34, 197, 94, 0.8);
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.14), rgba(22, 32, 48, 0.9));
  box-shadow: 0 0 70px -16px rgba(34, 197, 94, 0.8);
}
.lp-glass {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  pointer-events: none;
  background: linear-gradient(118deg, rgba(255, 255, 255, 0.08), transparent 44%);
}
.lp-lh {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lp-muted);
}
.lp-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-line-2); }
.lp-dot-tutor { background: var(--lp-tutor); box-shadow: 0 0 10px var(--lp-tutor); }
.lp-code {
  margin-top: 11px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.8;
  color: #cbd5e1;
}
.lp-code .lp-n { color: #48607f; display: inline-block; width: 18px; }
.lp-code .lp-b { color: var(--lp-tool); }
.lp-caret {
  display: inline-block;
  width: 7px;
  height: 12px;
  background: var(--lp-tutor);
  vertical-align: -2px;
  animation: lp-blink 1s step-end infinite;
}
@keyframes lp-blink { 50% { opacity: 0; } }
.lp-pills { display: flex; gap: 7px; margin-top: 13px; flex-wrap: wrap; }
.lp-pill {
  font-family: var(--font-mono);
  font-size: 10.5px;
  border: 1px solid var(--lp-line-2);
  border-radius: 999px;
  padding: 3px 10px;
  color: var(--lp-muted);
}
.lp-pill-on { border-color: var(--lp-tool); color: var(--lp-tool); }
.lp-sugg {
  position: relative;
  margin-top: 11px;
  border: 1px dashed rgba(76, 141, 246, 0.8);
  border-radius: 10px;
  padding: 8px 11px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #9dc0fb;
}
.lp-reticle {
  position: absolute;
  inset: -5px;
  border: 1px solid var(--lp-tutor);
  border-radius: 13px;
  opacity: 0;
  box-shadow: 0 0 24px -4px var(--lp-tutor);
}
.lp-reticle.is-on { animation: lp-ret 1900ms var(--lp-pop); }
@keyframes lp-ret {
  0% { opacity: 0; transform: scale(1.14); }
  16% { opacity: 1; transform: scale(1); }
  74% { opacity: 1; }
  100% { opacity: 0; }
}
.lp-bubble { margin-top: 10px; display: flex; gap: 9px; }
.lp-avatar {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: rgba(34, 197, 94, 0.2);
  color: var(--lp-tutor);
  flex: none;
}
.lp-bubble p { font-size: 12px; color: #d8f8e4; line-height: 1.5; }
.lp-beam {
  position: absolute;
  left: 50%;
  width: 2px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--lp-tutor), transparent);
  box-shadow: 0 0 16px var(--lp-tutor);
  opacity: 0;
  transition: opacity 250ms;
}
.lp-spark {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #eaffef;
  box-shadow: 0 0 24px 6px var(--lp-tutor);
  opacity: 0;
}

/* ---------- scene poses ---------- */
.lp-layer[data-i="0"] { transform: translate3d(0, 60px, 0); }
.lp-layer[data-i="1"] { transform: translate3d(0, 20px, 24px); }
.lp-layer[data-i="2"] { transform: translate3d(0, -20px, 48px); }
.lp-layer[data-i="3"] { transform: translate3d(0, -60px, 72px); }

.lp[data-scene="1"] .lp-rig { transform: rotateX(58deg) rotateZ(-12deg) translateY(30px); }
.lp[data-scene="1"] .lp-layer[data-i="0"] {
  transform: translate3d(0, 96px, 90px) scale(1.06);
  border-color: var(--lp-tool);
  box-shadow: 0 0 60px -18px var(--lp-tool);
}
.lp[data-scene="1"] .lp-layer[data-i="1"] { transform: translate3d(0, 20px, 40px); }
.lp[data-scene="1"] .lp-layer[data-i="2"] {
  transform: translate3d(0, -70px, -20px);
  opacity: 0.35;
  filter: blur(1.4px);
}
.lp[data-scene="1"] .lp-layer[data-i="3"] {
  transform: translate3d(0, -160px, -70px);
  opacity: 0.28;
  filter: blur(2.6px);
}

.lp[data-scene="2"] .lp-camera { transform: translateY(-6px) scale(1.02); }
.lp[data-scene="2"] .lp-rig { transform: rotateX(22deg) rotateZ(9deg); }
.lp[data-scene="2"] .lp-layer[data-i="0"] {
  transform: translate3d(-40px, 150px, -110px) scale(0.9);
  opacity: 0.3;
  filter: blur(2.4px);
}
.lp[data-scene="2"] .lp-layer[data-i="1"] {
  transform: translate3d(-16px, 74px, -50px) scale(0.95);
  opacity: 0.4;
  filter: blur(1.4px);
}
.lp[data-scene="2"] .lp-layer[data-i="2"] {
  transform: translate3d(0, 0, 130px) scale(1.14);
  border-color: var(--lp-tool);
  box-shadow: 0 0 90px -18px var(--lp-tool);
}
.lp[data-scene="2"] .lp-layer[data-i="3"] {
  transform: translate3d(20px, -132px, -30px) scale(0.96);
  opacity: 0.45;
  filter: blur(1.2px);
}

.lp[data-scene="3"] .lp-camera { transform: translateY(4px) scale(1.04); }
.lp[data-scene="3"] .lp-rig { transform: rotateX(14deg) rotateZ(-4deg); }
.lp[data-scene="3"] .lp-layer[data-i="0"] {
  transform: translate3d(0, 210px, -190px) scale(0.84);
  opacity: 0.22;
  filter: blur(3.4px);
}
.lp[data-scene="3"] .lp-layer[data-i="1"] {
  transform: translate3d(0, 150px, -150px) scale(0.87);
  opacity: 0.24;
  filter: blur(2.8px);
}
.lp[data-scene="3"] .lp-layer[data-i="2"] {
  transform: translate3d(0, 86px, -100px) scale(0.9);
  opacity: 0.3;
  filter: blur(2px);
}
.lp[data-scene="3"] .lp-layer[data-i="3"] {
  transform: translate3d(0, -10px, 175px) scale(1.2);
  box-shadow: 0 0 130px -14px rgba(34, 197, 94, 0.95);
}

.lp[data-scene="4"] .lp-camera { transform: translateY(0) scale(0.96); }
.lp[data-scene="4"] .lp-rig { transform: rotateX(6deg) rotateZ(0deg); }
.lp[data-scene="4"] .lp-layer { opacity: 1; filter: none; }
.lp[data-scene="4"] .lp-layer[data-i="0"] { transform: translate3d(0, 26px, 0) scale(1); }
.lp[data-scene="4"] .lp-layer[data-i="1"] { transform: translate3d(0, 12px, 8px) scale(0.99); opacity: 0.9; }
.lp[data-scene="4"] .lp-layer[data-i="2"] { transform: translate3d(0, -2px, 16px) scale(0.985); opacity: 0.85; }
.lp[data-scene="4"] .lp-layer[data-i="3"] { transform: translate3d(0, -16px, 24px) scale(0.98); }
.lp[data-scene="4"] .lp-rings { opacity: 0.25; }

/* ---------- deck ---------- */
.lp-deck {
  position: relative;
  z-index: 5;
  height: 100%;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
}
.lp-deck::-webkit-scrollbar { display: none; }
.lp-scene {
  height: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  display: grid;
  align-items: center;
}
.lp-col {
  padding: 0 clamp(22px, 5vw, 70px);
  max-width: 620px;
  margin-left: max(24px, calc(50vw - 620px));
}
.lp-scene-final .lp-col { margin: 0 auto; text-align: center; max-width: 760px; }
.lp-kicker {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--lp-tutor);
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 500ms, transform 600ms var(--lp-pop);
}
.lp-scene.is-on .lp-kicker { opacity: 1; transform: none; }
.lp-mask { overflow: hidden; display: block; }
.lp-mask > span { display: block; transform: translateY(105%); transition: transform 850ms var(--lp-pop); }
.lp-scene.is-on .lp-mask > span { transform: none; }
.lp-mask:nth-of-type(2) > span { transition-delay: 70ms; }
.lp-mask:nth-of-type(3) > span { transition-delay: 140ms; }
.lp-body {
  margin-top: 22px;
  color: var(--lp-muted);
  font-size: clamp(15px, 1.5vw, 17.5px);
  font-weight: 300;
  line-height: 1.65;
  max-width: 440px;
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 600ms 300ms, transform 700ms 300ms var(--lp-pop);
}
.lp-scene-final .lp-body { max-width: 560px; margin-left: auto; margin-right: auto; }
.lp-scene.is-on .lp-body { opacity: 1; transform: none; }
.lp-meta {
  margin-top: 26px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  opacity: 0;
  transition: opacity 600ms 450ms;
}
.lp-scene.is-on .lp-meta { opacity: 1; }
.lp-tag {
  font-family: var(--font-mono);
  font-size: 11px;
  border: 1px solid var(--lp-line-2);
  border-radius: 999px;
  padding: 5px 12px;
  color: var(--lp-muted);
}
.lp-tag-green { border-color: rgba(34, 197, 94, 0.6); color: var(--lp-tutor); }
.lp-tag-blue { border-color: rgba(76, 141, 246, 0.6); color: var(--lp-tool); }

.lp-cta {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  margin-top: 34px;
  padding: 17px 32px;
  border-radius: 13px;
  background: var(--lp-tutor);
  color: #04240f;
  font-weight: 700;
  font-size: 16.5px;
  border: 0;
  position: relative;
  overflow: hidden;
  text-decoration: none;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 600ms 500ms, transform 700ms 500ms var(--lp-pop), box-shadow 300ms;
}
.lp-scene.is-on .lp-cta { opacity: 1; transform: none; }
.lp-cta:hover { box-shadow: 0 0 66px -10px rgba(34, 197, 94, 0.9); }
.lp-cta::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -60%;
  width: 42%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: lp-sweep 3600ms ease-in-out infinite;
}
@keyframes lp-sweep {
  0%, 66% { left: -60%; }
  92%, 100% { left: 130%; }
}

/* ---------- chrome ---------- */
.lp-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 20px 26px;
  font-size: 14px;
}
.lp-mark {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(76, 141, 246, 0.2);
  color: var(--lp-tool);
}
.lp-top b { font-weight: 600; }
.lp-signin {
  margin-left: auto;
  border: 1px solid rgba(34, 197, 94, 0.6);
  color: var(--lp-tutor);
  background: rgba(34, 197, 94, 0.1);
  border-radius: 9px;
  padding: 8px 15px;
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  transition: background 250ms, box-shadow 250ms;
}
.lp-signin:hover { background: rgba(34, 197, 94, 0.2); box-shadow: 0 0 26px -8px var(--lp-tutor); }
.lp-dots {
  position: absolute;
  right: 26px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lp-dots button {
  width: 8px;
  height: 8px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--lp-line-2);
  background: transparent;
  cursor: pointer;
  transition: all 300ms;
}
.lp-dots button.is-on {
  background: var(--lp-tutor);
  border-color: var(--lp-tutor);
  box-shadow: 0 0 14px var(--lp-tutor);
  transform: scale(1.3);
}
.lp-hint {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 20;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #64768f;
  text-align: center;
  transition: opacity 400ms;
}
.lp-hint i {
  display: block;
  width: 1px;
  height: 20px;
  margin: 7px auto 0;
  background: linear-gradient(180deg, var(--lp-tutor), transparent);
  animation: lp-drop 1800ms ease-in-out infinite;
}
@keyframes lp-drop {
  0%, 100% { opacity: 0.15; transform: scaleY(0.5); transform-origin: top; }
  45% { opacity: 1; transform: scaleY(1); transform-origin: top; }
}

@media (max-width: 900px) {
  .lp-rigwrap { align-items: flex-start; padding-top: 12vh; }
  .lp-camera { width: 84vw; height: 300px; }
  .lp-layer { height: 138px; top: 90px; padding: 11px 13px; }
  .lp-col { margin: 0 auto; max-width: 560px; align-self: end; padding-bottom: 9vh; }
  .lp-scene { align-items: end; }
  .lp h1, .lp h2 { font-size: clamp(30px, 8.6vw, 46px); }
  .lp-body { font-size: 14.5px; }
  .lp-dots { right: 12px; }
  .lp-rings { width: 460px; height: 460px; margin: -230px 0 0 -230px; }
}

@media (prefers-reduced-motion: reduce) {
  .lp-deck { scroll-snap-type: none; }
  .lp-camera,
  .lp-rig,
  .lp-layer,
  .lp-mask > span,
  .lp-body,
  .lp-kicker,
  .lp-cta { transition: none; }
  .lp-ring,
  .lp-caret,
  .lp-cta::after,
  .lp-hint i { animation: none; }
}
`;
